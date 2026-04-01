const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('Conectado a AWS RDS. Insertando datos de prueba Master-Detail...');

    try {
        // 1. Limpiar datos previos de prueba (Opcional, pero recomendado para consistencia)
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('TRUNCATE TABLE detalle_cuotas_cobranzas');
        await connection.query('TRUNCATE TABLE gestiones_cobranzas');
        await connection.query('TRUNCATE TABLE base_cobranzas');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        // 2. Insertar Maestro (Cliente)
        const [master] = await connection.execute(
            'INSERT INTO base_cobranzas (ruc, cliente, importe_total, gestor, estado) VALUES (?, ?, ?, ?, ?)',
            ['20112233445', 'Inversiones Master SAC', 15000.00, 'Carlos Mendez', 'En proceso']
        );

        // 3. Insertar Detalles (Cuotas)
        const cuotas = [
            ['20112233445', 'Factura F001-101', '2026-03-15', 5000.00, JSON.stringify({ linea: "Leasing Vehicular" })],
            ['20112233445', 'Factura F001-102', '2026-04-15', 5000.00, JSON.stringify({ linea: "Leasing Vehicular" })],
            ['20112233445', 'Factura F001-103', '2026-05-15', 5000.00, JSON.stringify({ linea: "Leasing Vehicular" })]
        ];

        await connection.query(
            'INSERT INTO detalle_cuotas_cobranzas (ruc, nro_cuota, vencimiento, importe, datos_completos) VALUES ?',
            [cuotas]
        );

        // 4. Insertar una Gestión
        await connection.execute(
            'INSERT INTO gestiones_cobranzas (ruc, accion, resultado, nota, gestor_nombre) VALUES (?, ?, ?, ?, ?)',
            ['20112233445', 'Llamada', 'Compromiso de Pago', 'Cliente pagará la primera cuota este viernes.', 'Carlos Mendez']
        );

        console.log('✅ Datos de prueba insertados con éxito.');
        console.log('Cliente: Inversiones Master SAC (3 cuotas de 5000 c/u)');
    } catch (error) {
        console.error('❌ Error enviando datos:', error);
    } finally {
        await connection.end();
    }
}

seedData();
