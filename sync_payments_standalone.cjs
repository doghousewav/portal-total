const sql = require('mssql');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración SQL Server (Origen)
const configSql = {
    user: 'aldo_tsf_db',
    password: '021DiYWo+P%7oV{J',
    server: 'SRV-SQL-TSF',
    database: 'Premium_Leasing',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        instanceName: 'TOTALSF_BD'
    }
};

// Helper para normalizar nombres de columnas (Espacios -> Guiones bajos, Minúsculas)
function normalizeName(name) {
    return name.toLowerCase()
        .replace(/ /g, '_')
        .replace(/[\[\]]/g, '')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar tildes
}

async function runMigration() {
    console.log(`[${new Date().toLocaleString()}] === INICIANDO MIGRACIÓN DINÁMICA ===`);
    
    // Calcular Mes Actual y Mes Anterior
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const prevDate = new Date();
    prevDate.setMonth(now.getMonth() - 1);
    const prevMonth = prevDate.getMonth() + 1;
    const prevYear = prevDate.getFullYear();

    console.log(`Filtrando pagos: ${prevMonth}/${prevYear} y ${curMonth}/${curYear}`);

    let poolSql;
    let connMysql;

    try {
        console.log('Conectando a SQL Server (SRV-SQL-TSF)...');
        poolSql = await sql.connect(configSql);
        
        const query = `
            SELECT * FROM [Contratos Cuotas] 
            WHERE (
                (year([Fecha de Cancelacion]) = ${curYear} AND month([Fecha de Cancelacion]) = ${curMonth})
                OR 
                (year([Fecha de Cancelacion]) = ${prevYear} AND month([Fecha de Cancelacion]) = ${prevMonth})
            )
            AND estado = 'C'
        `;
        console.log('Ejecutando consulta dinámica en SQL Server...');
        const result = await poolSql.request().query(query);
        const data = result.recordset;
        console.log(`Se recuperaron ${data.length} registros de SQL Server.`);

        if (data.length === 0) {
            console.log('No hay nuevos pagos para migrar. Fin del proceso.');
            return;
        }

        console.log('Conectando a MySQL (AWS RDS)...');
        connMysql = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: { rejectUnauthorized: false }
        });

        // 1. Mapear y normalizar columnas
        const originalCols = Object.keys(data[0]);
        const normalizedCols = originalCols.map(normalizeName);
        
        const columnsSql = originalCols.map((c, i) => {
            const val = data[0][c];
            const norm = normalizedCols[i];
            if (typeof val === 'number') {
                if (Number.isInteger(val)) return `\`${norm}\` INT`;
                return `\`${norm}\` DECIMAL(18,4)`;
            }
            if (val instanceof Date) return `\`${norm}\` DATETIME`;
            return `\`${norm}\` TEXT`;
        }).join(', ');

        // 2. Reiniciar tabla
        console.log('Reiniciando tabla pagos_cobranzas para asegurar coincidencia de columnas...');
        await connMysql.query('DROP TABLE IF EXISTS pagos_cobranzas');
        await connMysql.query(`CREATE TABLE pagos_cobranzas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ${columnsSql},
            migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 3. Insertar datos normalizados
        const insertSql = `INSERT INTO pagos_cobranzas (${normalizedCols.map(c => `\`${c}\``).join(', ')}) VALUES ?`;
        const values = data.map(row => originalCols.map(c => row[c]));
        
        const [insertRes] = await connMysql.query(insertSql, [values]);
        console.log(`✓ Insertados ${insertRes.affectedRows} registros en pagos_cobranzas.`);

        // 4. Sincronizar fechas con detalle_cuotas_cobranzas
        console.log('Sincronizando fechas con detalle_cuotas_cobranzas...');
        const syncSql = `
            UPDATE detalle_cuotas_cobranzas d
            JOIN pagos_cobranzas p ON d.contrato = p.contrato AND CAST(d.cuota AS UNSIGNED) = p.cuota
            SET d.det_pago = DATE_FORMAT(p.fecha_de_cancelacion, '%Y-%m-%d')
            WHERE d.det_pago IS NULL OR d.det_pago = ''
        `;
        const [syncRes] = await connMysql.query(syncSql);
        console.log(`✓ Sincronización exitosa: ${syncRes.affectedRows} cuotas actualizadas.`);

        // 5. Actualizar estado del cliente (Completado vs Pendiente)
        console.log('Actualizando estados de clientes en base_cobranzas...');
        
        // Clientes con todas las cuotas pagadas -> Completado
        const completeSql = `
            UPDATE base_cobranzas b
            SET b.estado = 'Completado'
            WHERE b.is_active = 1 AND b.ruc IN (
                SELECT ruc FROM detalle_cuotas_cobranzas
                GROUP BY ruc
                HAVING SUM(CASE WHEN det_pago IS NULL OR det_pago = '' THEN 1 ELSE 0 END) = 0
            )
        `;
        const [compRes] = await connMysql.query(completeSql);
        console.log(`✓ Clientes marcados como Completado: ${compRes.affectedRows}`);

        // Clientes con al menos una cuota pendiente -> Pendiente (por si acaso)
        const pendingSql = `
            UPDATE base_cobranzas b
            SET b.estado = 'Pendiente'
            WHERE b.is_active = 1 AND b.ruc IN (
                SELECT ruc FROM detalle_cuotas_cobranzas
                GROUP BY ruc
                HAVING SUM(CASE WHEN det_pago IS NULL OR det_pago = '' THEN 1 ELSE 0 END) > 0
            )
        `;
        const [pendRes] = await connMysql.query(pendingSql);
        // console.log(`✓ Clientes mantenidos/marcados como Pendiente: ${pendRes.affectedRows}`);

    } catch (err) {
        console.error('✗ ERROR CRÍTICO:', err.message);
    } finally {
        if (poolSql) await poolSql.close();
        if (connMysql) await connMysql.end();
        console.log(`[${new Date().toLocaleString()}] === FIN DEL PROCESO ===\n`);
    }
}

runMigration();
