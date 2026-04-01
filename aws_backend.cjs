// BACKEND PUENTE PARA AWS RDS MYSQL (Estructura Sugerida)
// Instalar: npm install express mysql2 cors dotenv

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt'); // Para verificar contraseñas hash
const jwt = require('jsonwebtoken'); // Para sesiones
require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');

// Configuración del cliente S3
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logger para diagnosticar rutas
app.use((req, res, next) => {
    console.log(`[BACKEND LOG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Helper para procesar fechas (Excel serial o strings)
function parseExcelDate(val) {
    if (!val) return null;
    try {
        let date;
        if (typeof val === 'number') {
            // Excel serial number (days since 1900-01-01)
            date = new Date((val - 25569) * 86400 * 1000);
        } else {
            date = new Date(val);
        }

        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

// Configuración de la conexión a AWS RDS
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 20000,
    acquireTimeout: 20000,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- AUTENTICACIÓN ---

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[AUTH] Intento de login para: ${email}`);

        if (!password) {
            return res.status(400).json({ error: 'La contraseña es requerida' });
        }

        // 1. Buscar en auth_users y unir con usuarios para obtener el rol
        const [rows] = await pool.execute(
            `SELECT au.id, au.password_hash, u.name, u.role 
             FROM auth_users au 
             JOIN usuarios u ON au.id = u.id 
             WHERE au.email = ? AND au.is_active = 1`,
            [email]
        );

        if (rows.length === 0) {
            console.warn(`[AUTH] Usuario no encontrado o inactivo: ${email}`);
            return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
        }

        const user = rows[0];
        console.log(`[AUTH] Usuario encontrado: ${user.name} (${user.role})`);
        console.log(`[AUTH] Hash en BD: ${user.password_hash}`);

        // 2. Verificar contraseña
        console.log(`[AUTH] Verificando contraseña de longitud: ${password.length}`);
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            console.warn(`[AUTH] Contraseña incorrecta para: ${email}`);
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        // 3. Generar Token
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_temporal');
        console.log(`[AUTH] Login exitoso: ${email}`);

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, role: user.role }
        });

    } catch (error) {
        console.error(`[AUTH] Error crítico en login:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- INFORMES ---

app.get('/api/informes', async (req, res) => {
    try {
        const { role, userId } = req.query;
        let sql = 'SELECT * FROM informe_visita';
        let params = [];

        if (role === 'comercial') {
            sql += ' WHERE comercial_id = ?';
            params.push(userId);
        }

        sql += ' ORDER BY created_at DESC';

        const [rows] = await pool.execute(sql, params);

        // Parsear fotos para cada informe
        const processed = rows.map(r => ({
            ...r,
            fotografias: r.fotografias ? (typeof r.fotografias === 'string' ? JSON.parse(r.fotografias) : r.fotografias) : []
        }));

        res.json(processed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const fs = require('fs');

// Proxy SUNAT -> Microservicio Python (Playwright)
app.get('/api/sunat/:ruc', async (req, res) => {
    const { ruc } = req.params;
    console.log(`[SUNAT PROXY] Redirigiendo consulta RUC ${ruc} al microservicio Python...`);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout (Playwright tarda)

        // Usamos 127.0.0.1 en vez de localhost para evitar problemas de resolución IPv6 vs IPv4 en Node 18+
        const response = await fetch(`http://127.0.0.1:8000/consulta-ruc/${ruc}`, {
            signal: controller.signal
        }).finally(() => clearTimeout(timeout));

        const data = await response.json();
        console.log(`[SUNAT PROXY] Respuesta recibida del microservicio Python.`);

        if (data.resultados && data.resultados.length > 0) {
            const r = data.resultados[0];
            if (r.error) {
                return res.json({ success: false, error: r.error });
            }
            res.json({
                success: true,
                data: {
                    ruc: data.ruc || ruc,
                    ...r,
                    metodo: "Playwright Microservice"
                }
            });
        } else {
            res.json({ success: false, error: "No se encontraron datos para el RUC." });
        }
    } catch (error) {
        console.error("[SUNAT PROXY] Error de conexión:", error.message);
        if (error.name === 'AbortError') {
            return res.status(504).json({ error: "Timeout: El microservicio Python tardó demasiado en responder." });
        }
        res.status(500).json({
            error: "No se pudo conectar al microservicio SUNAT. Verifica que esté ejecutándose en el puerto 8080."
        });
    }
});

app.post('/api/upload-photo', async (req, res) => {
    try {
        const { fileName, fileData, mimeType } = req.body;
        console.log(`[S3 UPLOAD] Iniciando subida de: ${fileName} (${mimeType})`);
        
        if (!fileName || !fileData) {
            return res.status(400).json({ error: 'Se requieren fileName y fileData.' });
        }

        const bucketAlias = "frontaccess-qa-qou7588hobi3qitwenzzhr4j1ef54use1a-s3alias";
        const base64Data = fileData.replace(/^data:image\/\w+;base64,/, "");
        const fileBuffer = Buffer.from(base64Data, 'base64');
        
        const ext = fileName.split('.').pop().toLowerCase();
        let finalMimeType = mimeType;
        if (!finalMimeType) {
            if (ext === 'png') finalMimeType = 'image/png';
            else if (ext === 'webp') finalMimeType = 'image/webp';
            else finalMimeType = 'image/jpeg';
        }

        const bucketArn = process.env.AWS_S3_BUCKET_NAME;

        const command = new PutObjectCommand({
            Bucket: bucketArn, 
            Key: fileName,
            Body: fileBuffer,
            ContentType: finalMimeType
        });

        await s3Client.send(command);

        // Formato estándar para el alias de Access Point
        // Usamos el alias como si fuera el bucket name directo
        const publicUrl = `https://${bucketAlias}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;

        console.log(`[S3 SUCCESS] Archivo subido: ${fileName}`);
        console.log(`[S3 SUCCESS] URL generada: ${publicUrl}`);

        res.json({ success: true, url: publicUrl });
    } catch (error) {
        console.error("[S3 UPLOAD ERROR] No se pudo subir la imagen:", error);
        res.status(500).json({ error: "Fallo al subir a S3", details: error.message });
    }
});

app.get('/api/proxy-photo', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) return res.status(400).send('Falta el parámetro key');

        console.log(`[S3 PROXY] Solicitando imagen: ${key}`);
        
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key
        });

        const response = await s3Client.send(command);
        
        // Configurar el tipo de contenido (MIME type)
        res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
        
        // Stream the response body directly to the client
        response.Body.pipe(res);
    } catch (error) {
        console.error("[S3 PROXY ERROR] No se pudo obtener la imagen:", error);
        res.status(404).send('Imagen no encontrada');
    }
});

app.post('/api/informes', async (req, res) => {
    const connection = await pool.getConnection();
    const v = (val) => val === undefined ? null : val;

    try {
        await connection.beginTransaction();
        const d = req.body;
        const c = d.comercial_data || {};
        const p = d.patrimonial_data || {};

        const logEntry = `\n[${new Date().toISOString()}] RECIBIENDO INFORME: ${v(d.id)}\n` +
            `Comercial Data: ${JSON.stringify(c).substring(0, 100)}...\n` +
            `Patrimonial Data: ${JSON.stringify(p).substring(0, 100)}...\n`;
        fs.appendFileSync('server_debug.log', logEntry);

        // 1. INFORME VISITA (Original)
        const sqlVisita = `INSERT INTO informe_visita (
            id, comercial_id, estado, ruc, razon_social, fecha_visitada, 
            lugar_visita, departamento, provincia, distrito, referencia_direccion, 
            google_maps_url, tipo_visita, lugar_visita_cat, local_visita, 
            validacion_negativa, servicios_adicionales, historia, ciclo_negocio, 
            activos_empresa, fotografias,
            entrevistado1_nombres, entrevistado1_apellidos, entrevistado1_cargo, entrevistado1_contacto,
            entrevistado2_nombres, entrevistado2_apellidos, entrevistado2_cargo, entrevistado2_contacto,
            entrevistado3_nombres, entrevistado3_apellidos, entrevistado3_cargo, entrevistado3_contacto,
            ejecutivo1_nombre, ejecutivo1_cargo, ejecutivo2_nombre, ejecutivo2_cargo, ejecutivo3_nombre, ejecutivo3_cargo
        ) VALUES (${Array(39).fill('?').join(',')})
        ON DUPLICATE KEY UPDATE 
            estado = VALUES(estado), ruc = VALUES(ruc), razon_social = VALUES(razon_social), 
            fecha_visitada = VALUES(fecha_visitada), lugar_visita = VALUES(lugar_visita),
            departamento = VALUES(departamento), provincia = VALUES(provincia), distrito = VALUES(distrito),
            referencia_direccion = VALUES(referencia_direccion), google_maps_url = VALUES(google_maps_url),
            tipo_visita = VALUES(tipo_visita), lugar_visita_cat = VALUES(lugar_visita_cat), local_visita = VALUES(local_visita),
            validacion_negativa = VALUES(validacion_negativa), servicios_adicionales = VALUES(servicios_adicionales),
            historia = VALUES(historia), ciclo_negocio = VALUES(ciclo_negocio), activos_empresa = VALUES(activos_empresa),
            fotografias = VALUES(fotografias),
            entrevistado1_nombres = VALUES(entrevistado1_nombres), entrevistado1_apellidos = VALUES(entrevistado1_apellidos), 
            entrevistado1_cargo = VALUES(entrevistado1_cargo), entrevistado1_contacto = VALUES(entrevistado1_contacto),
            entrevistado2_nombres = VALUES(entrevistado2_nombres), entrevistado2_apellidos = VALUES(entrevistado2_apellidos), 
            entrevistado2_cargo = VALUES(entrevistado2_cargo), entrevistado2_contacto = VALUES(entrevistado2_contacto),
            entrevistado3_nombres = VALUES(entrevistado3_nombres), entrevistado3_apellidos = VALUES(entrevistado3_apellidos), 
            entrevistado3_cargo = VALUES(entrevistado3_cargo), entrevistado3_contacto = VALUES(entrevistado3_contacto),
            ejecutivo1_nombre = VALUES(ejecutivo1_nombre), ejecutivo1_cargo = VALUES(ejecutivo1_cargo),
            ejecutivo2_nombre = VALUES(ejecutivo2_nombre), ejecutivo2_cargo = VALUES(ejecutivo2_cargo),
            ejecutivo3_nombre = VALUES(ejecutivo3_nombre), ejecutivo3_cargo = VALUES(ejecutivo3_cargo)`;

        const paramsVisita = [
            v(d.id), v(d.comercial_id), v(d.estado), v(d.ruc), v(d.razon_social), v(d.fecha_visitada),
            v(d.lugar_visita), v(d.departamento), v(d.provincia), v(d.distrito), v(d.referencia_direccion),
            v(d.google_maps_url), v(d.tipo_visita), v(d.lugar_visita_cat), v(d.local_visita),
            v(d.validacion_negativa), v(d.servicios_adicionales), v(d.historia), v(d.ciclo_negocio),
            v(d.activos_empresa), JSON.stringify(d.fotografias || []),
            v(d.entrevistado1_nombres), v(d.entrevistado1_apellidos), v(d.entrevistado1_cargo), v(d.entrevistado1_contacto),
            v(d.entrevistado2_nombres), v(d.entrevistado2_apellidos), v(d.entrevistado2_cargo), v(d.entrevistado2_contacto),
            v(d.entrevistado3_nombres), v(d.entrevistado3_apellidos), v(d.entrevistado3_cargo), v(d.entrevistado3_contacto),
            v(d.ejecutivo1_nombre), v(d.ejecutivo1_cargo), v(d.ejecutivo2_nombre), v(d.ejecutivo2_cargo), v(d.ejecutivo3_nombre), v(d.ejecutivo3_cargo)
        ];

        await connection.execute(sqlVisita, paramsVisita);

        // 2. INFORME COMERCIAL
        const sqlComercial = `INSERT INTO informe_comercial (
            id, comercial_id, ruc, doi_numero, tipo_persona, tipo_doi, estado_civil, razon_social,
            apellido_paterno, apellido_materno, nombres, domicilio, departamento, provincia, distrito,
            contactos, proveedor_estado, proveedor_registro, motivo_financiamiento, representantes,
            conyuge, socios, creditos, inicio_operaciones, grupo_economico, sector_economico,
            actividad_principal, actividades_complementarias, porcentaje_participacion, moneda,
            capital_social_patrimonio, numero_trabajadores, ventas_anuales, origen_fondos,
            origen_otros, proveedores, clientes, bienes, autoriza_datos, autoriza_transferencia, firma_comercial
        ) VALUES (${Array(41).fill('?').join(',')})
        ON DUPLICATE KEY UPDATE 
            ruc=VALUES(ruc), doi_numero=VALUES(doi_numero), tipo_persona=VALUES(tipo_persona), tipo_doi=VALUES(tipo_doi),
            estado_civil=VALUES(estado_civil), razon_social=VALUES(razon_social), apellido_paterno=VALUES(apellido_paterno),
            apellido_materno=VALUES(apellido_materno), nombres=VALUES(nombres), domicilio=VALUES(domicilio),
            departamento=VALUES(departamento), provincia=VALUES(provincia), distrito=VALUES(distrito),
            contactos=VALUES(contactos), proveedor_estado=VALUES(proveedor_estado), proveedor_registro=VALUES(proveedor_registro),
            motivo_financiamiento=VALUES(motivo_financiamiento), representantes=VALUES(representantes), conyuge=VALUES(conyuge),
            socios=VALUES(socios), creditos=VALUES(creditos), inicio_operaciones=VALUES(inicio_operaciones),
            grupo_economico=VALUES(grupo_economico), sector_economico=VALUES(sector_economico), actividad_principal=VALUES(actividad_principal),
            actividades_complementarias=VALUES(actividades_complementarias), porcentaje_participacion=VALUES(porcentaje_participacion),
            moneda=VALUES(moneda), capital_social_patrimonio=VALUES(capital_social_patrimonio), numero_trabajadores=VALUES(numero_trabajadores),
            ventas_anuales=VALUES(ventas_anuales), origen_fondos=VALUES(origen_fondos), origen_otros=VALUES(origen_otros),
            proveedores=VALUES(proveedores), clientes=VALUES(clientes), bienes=VALUES(bienes),
            autoriza_datos=VALUES(autoriza_datos), autoriza_transferencia=VALUES(autoriza_transferencia), firma_comercial=VALUES(firma_comercial)`;

        const paramsComercial = [
            v(d.id), v(d.comercial_id), v(c.ruc), v(c.doi_numero), v(c.tipo_persona), v(c.tipo_doi), v(c.estado_civil), v(c.razon_social),
            v(c.apellido_paterno), v(c.apellido_materno), v(c.nombres), v(c.domicilio), v(c.departamento), v(c.provincia), v(c.distrito),
            JSON.stringify(c.contactos || []), v(c.proveedor_estado), v(c.proveedor_registro), v(c.motivo_financiamiento), JSON.stringify(c.representantes || []),
            JSON.stringify(c.conyuge || []), JSON.stringify(c.socios || []), JSON.stringify(c.creditos || []),
            c.inicio_operaciones || null, v(c.grupo_economico), v(c.sector_economico),
            v(c.actividad_principal), v(c.actividades_complementarias), v(c.porcentaje_participacion), v(c.moneda),
            v(c.capital_social_patrimonio), v(c.numero_trabajadores), v(c.ventas_anuales), JSON.stringify(c.origen_fondos || []),
            v(c.origen_otros), JSON.stringify(c.proveedores || []), JSON.stringify(c.clientes || []), JSON.stringify(c.bienes || []),
            c.autoriza_datos ? 1 : 0, c.autoriza_transferencia ? 1 : 0, v(c.firma_comercial)
        ];

        await connection.execute(sqlComercial, paramsComercial);

        // 3. DECLARACION PATRIMONIAL
        const sqlPatrimonial = `INSERT INTO declaracion_patrimonial (
            id, comercial_id, nombre_completo, doi_numero, estado_civil, conyuge_nombre, conyuge_dni,
            direccion_domicilio, activos_inmuebles, activos_vehiculos, activos_otros, firma_patrimonial
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            nombre_completo=VALUES(nombre_completo), doi_numero=VALUES(doi_numero), estado_civil=VALUES(estado_civil),
            conyuge_nombre=VALUES(conyuge_nombre), conyuge_dni=VALUES(conyuge_dni), direccion_domicilio=VALUES(direccion_domicilio),
            activos_inmuebles=VALUES(activos_inmuebles), activos_vehiculos=VALUES(activos_vehiculos), 
            activos_otros=VALUES(activos_otros), firma_patrimonial=VALUES(firma_patrimonial)`;

        const paramsPatrimonial = [
            v(d.id), v(d.comercial_id), v(p.nombre_completo), v(p.doi_numero), v(p.estado_civil), v(p.conyuge_nombre), v(p.conyuge_dni),
            v(p.direccion_domicilio), JSON.stringify(p.activos_inmuebles || []), JSON.stringify(p.activos_vehiculos || []),
            JSON.stringify(p.activos_otros || []), v(p.firma_patrimonial)
        ];

        await connection.execute(sqlPatrimonial, paramsPatrimonial);

        await connection.commit();
        console.log(`[DB] Informe (3 tablas) guardado exitosamente ID: ${d.id}`);
        fs.appendFileSync('server_debug.log', `[${new Date().toISOString()}] OK: Guardado exitoso ${d.id}\n`);
        res.json({ success: true, id: d.id });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error al guardar informe en 3 tablas:", error);
        fs.appendFileSync('server_debug.log', `[${new Date().toISOString()}] ERROR: ${error.message}\n${error.stack}\n`);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/informes/:id', async (req, res) => {
    try {
        console.log(`[DB] Consultando informe completo ID: ${req.params.id}`);

        // Consultas paralelas para mayor eficiencia
        const [visitaRows] = await pool.execute('SELECT * FROM informe_visita WHERE id = ?', [req.params.id]);
        const [comercialRows] = await pool.execute('SELECT * FROM informe_comercial WHERE id = ?', [req.params.id]);
        const [patrimonialRows] = await pool.execute('SELECT * FROM declaracion_patrimonial WHERE id = ?', [req.params.id]);

        if (visitaRows.length === 0) {
            console.warn(`[DB] Informe no encontrado: ${req.params.id}`);
            return res.status(404).json({ error: 'Informe no encontrado' });
        }

        const visita = visitaRows[0];
        const comercial = comercialRows[0] || {};
        const patrimonial = patrimonialRows[0] || {};

        // Helper para parsear JSON de forma segura
        const safeParse = (val) => {
            if (!val) return [];
            return typeof val === 'string' ? JSON.parse(val) : val;
        };

        // Procesar Visita
        visita.fotografias = safeParse(visita.fotografias);

        // Procesar Comercial
        const processedComercial = {
            ...comercial,
            contactos: safeParse(comercial.contactos),
            representantes: safeParse(comercial.representantes),
            conyuge: safeParse(comercial.conyuge),
            socios: safeParse(comercial.socios),
            creditos: safeParse(comercial.creditos),
            origen_fondos: safeParse(comercial.origen_fondos),
            proveedores: safeParse(comercial.proveedores),
            clientes: safeParse(comercial.clientes),
            bienes: safeParse(comercial.bienes),
            autoriza_datos: comercial.autoriza_datos === 1,
            autoriza_transferencia: comercial.autoriza_transferencia === 1
        };

        // Procesar Patrimonial
        const processedPatrimonial = {
            ...patrimonial,
            activos_inmuebles: safeParse(patrimonial.activos_inmuebles),
            activos_vehiculos: safeParse(patrimonial.activos_vehiculos),
            activos_otros: safeParse(patrimonial.activos_otros)
        };

        res.json({
            ...visita,
            comercial_data: processedComercial,
            patrimonial_data: processedPatrimonial
        });
    } catch (error) {
        console.error("[DB] Error en consolidación de datos:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- COBRANZAS ---

app.post('/api/cobranzas/sync-payments', async (req, res) => {
    console.log("[SYNC] Ejecutando script de sincronización de pagos ERP...");
    
    // Ejecutamos el script standalone usando child_process
    exec('node sync_payments_standalone.cjs', (error, stdout, stderr) => {
        if (error) {
            console.error(`[SYNC ERROR] Fallo al ejecutar script: ${error.message}`);
            return res.status(500).json({ 
                success: false, 
                error: "Error interno al ejecutar la sincronización.",
                details: stderr || error.message 
            });
        }
        
        if (stderr) {
            console.warn(`[SYNC WARNING] stderr: ${stderr}`);
        }

        console.log(`[SYNC SUCCESS] Script terminado correctamente.`);
        console.log(stdout);

        // Intentar extraer el número de registros del stdout para dar mejor feedback
        const match = stdout.match(/Insertados (\d+) registros/);
        const count = match ? match[1] : null;

        res.json({ 
            success: true, 
            message: "Sincronización con el ERP completada exitosamente.",
            records: count,
            output: stdout 
        });
    });
});

app.get('/api/cobranzas/base', async (req, res) => {
    try {
        const { gestor, search } = req.query;
        let sql = 'SELECT * FROM base_cobranzas';
        let params = [];
        let conditions = [];

        if (gestor && gestor !== 'todos') {
            conditions.push('gestor = ?');
            params.push(gestor);
        }

        if (search) {
            conditions.push('(cliente LIKE ? OR ruc LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        // Mostrar solo activos por defecto
        conditions.push('is_active = 1');

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY importe_total_consolidado DESC';

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/cobranzas/gestores', async (req, res) => {
    try {
        console.log("[DB] Consultando lista de gestores únicos...");
        const [rows] = await pool.execute(`
            SELECT DISTINCT gestor 
            FROM base_cobranzas 
            WHERE gestor IS NOT NULL AND gestor != "" 
            UNION 
            SELECT DISTINCT gestor 
            FROM detalle_cuotas_cobranzas
            WHERE gestor IS NOT NULL AND gestor != ""
            ORDER BY gestor ASC
        `);
        const gestores = rows.map(r => r.gestor).filter(Boolean);
        console.log(`[DB] Gestores encontrados: ${gestores.length}`);
        res.json(gestores);
    } catch (error) {
        console.error("[DB] Error en /api/cobranzas/gestores:", error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener cuotas detalladas de un RUC
app.get('/api/cobranzas/base/:ruc/cuotas', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM detalle_cuotas_cobranzas WHERE ruc = ? ORDER BY vencimiento ASC',
            [req.params.ruc]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/cobranzas/base', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const rows = req.body;
        if (!Array.isArray(rows)) return res.status(400).json({ error: 'Array required' });

        await connection.beginTransaction();

        // Si es el primer lote de la subida, marcamos todo como inactivo para "limpiar"
        // (Podríamos usar un flag 'isFirstBatch' desde el front si fuera necesario, 
        // pero por ahora el front manda chunks y el backend asume que un upload masivo resetea).
        // NOTA: Para ser más precisos, el front enviará un header o query param si es el reset.
        const shouldReset = req.query.reset === 'true';
        if (shouldReset) {
            console.log("[DB] Marcando base como inactiva y limpiando cuotas para refresco total...");
            await connection.query('UPDATE base_cobranzas SET is_active = 0, importe_total_consolidado = 0');
            await connection.query('DELETE FROM detalle_cuotas_cobranzas');
        }

        // 1. Agrupar por RUC para el Maestro (Base)
        const mastersMap = new Map();
        rows.forEach(r => {
            if (!r.ruc) return;
            const rucStr = String(r.ruc).trim();
            if (!mastersMap.has(rucStr)) {
                mastersMap.set(rucStr, {
                    ruc: rucStr,
                    nro_cliente: r.nro_cl || r['#CL'] || "",
                    cliente: r.cliente || "",
                    gestor: r.gestor || r['GESTOR'] || "",
                    oficial: r.oficial || "",
                    telefono: r.telefono || r['Nº TELEFONO'] || "",
                    correo1: r.correo1 || r['CORREO 1'] || "",
                    correo2: r.correo2 || r['CORREO 2'] || "",
                    vencimiento: null,
                    importe_total: 0,
                    moneda: r.moneda || 'USD'
                });
            }
            const master = mastersMap.get(rucStr);
            master.importe_total += parseFloat(r.importe) || 0;

            // Lógica para la fecha más antigua
            const currentVenc = parseExcelDate(r.vencimiento);
            if (currentVenc) {
                if (!master.vencimiento || new Date(currentVenc) < new Date(master.vencimiento)) {
                    master.vencimiento = currentVenc;
                }
            }
        });

        // 2. Upsert en Maestros (base_cobranzas)
        const masterSql = `
            INSERT INTO base_cobranzas (
                ruc, nro_cliente, cliente, gestor, oficial, telefono, correo1, correo2, 
                importe_total_consolidado, moneda_consolidada, vencimiento, is_active
            ) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE 
                nro_cliente = VALUES(nro_cliente),
                cliente = VALUES(cliente),
                gestor = VALUES(gestor),
                oficial = VALUES(oficial),
                telefono = VALUES(telefono),
                correo1 = VALUES(correo1),
                correo2 = VALUES(correo2),
                vencimiento = VALUES(vencimiento),
                importe_total_consolidado = base_cobranzas.importe_total_consolidado + VALUES(importe_total_consolidado),
                moneda_consolidada = VALUES(moneda_consolidada),
                is_active = 1
        `;
        const masterValues = Array.from(mastersMap.values()).map(m => [
            m.ruc, m.nro_cliente, m.cliente, m.gestor, m.oficial, m.telefono, m.correo1, m.correo2,
            m.importe_total, m.moneda, m.vencimiento, 1
        ]);

        if (masterValues.length > 0) {
            await connection.query(masterSql, [masterValues]);
        }

        // 3. Insertar Detalle (detalle_cuotas_cobranzas - 31 Columnas)
        console.log(`[DB] Insertando ${rows.length} filas en detalle_cuotas_cobranzas...`);
        const detailSql = `
            INSERT INTO detalle_cuotas_cobranzas (
                ruc, nro_cl, cliente, cliente_cross, tramo_actual, tramo_segmentado, 
                departamento, contrato, cuota, vencimiento, mes, detalle_mes, 
                moneda, importe, importe_usd, capital, capital_usd, saldo_k_usd, 
                dias_atraso, mora, fecha_pago, det_pago, indicador, cxc, 
                cxc_castigadas, excedente, gestor, oficial, telefono, correo1, correo2
            ) VALUES ?
        `;
        const detailValues = rows.filter(r => r.ruc).map(r => [
            String(r.ruc).trim(),
            r.nro_cl || r['#CL'] || "",
            r.cliente || "",
            r.cliente_cross || r['CLIENTE CROSS'] || "",
            r.tramo_actual || r['TRAMO ACTUAL'] || "",
            r.tramo_segmentado || r['TRAMO SEGMENTADO'] || "",
            r.departamento || r['DEPARTAMENTO'] || "",
            r.contrato || r['CONTRATO'] || "",
            r.cuota || r['CUOTA'] || "",
            parseExcelDate(r.vencimiento),
            r.mes || r['MES'] || "",
            r.detalle_mes || r['DETALLE MES'] || "",
            r.moneda || r['MONEDA'] || "USD",
            parseFloat(r.importe) || 0,
            parseFloat(r.importe_usd || r['IMPORTE $']) || 0,
            parseFloat(r.capital || r['CAPITAL']) || 0,
            parseFloat(r.capital_usd || r['CAPITAL $']) || 0,
            parseFloat(r.saldo_k_usd || r['SALDO K ($)']) || 0,
            parseInt(r.dias_atraso || r['DÍAS DE ATRASO']) || 0,
            parseFloat(r.mora || r['MORA']) || 0,
            parseExcelDate(r.fecha_pago || r['FECHA PAGO']),
            r.det_pago || r['DET PAGO'] || "",
            r.indicador || r['INDICADOR'] || "",
            parseFloat(r.cxc || r['CXC']) || 0,
            parseFloat(r.cxc_castigadas || r['CXC CASTIGADAS']) || 0,
            parseFloat(r.excedente || r['EXCEDENTE']) || 0,
            r.gestor || r['GESTOR'] || "",
            r.oficial || r['OFICIAL'] || "",
            r.telefono || r['Nº TELEFONO'] || "",
            r.correo1 || r['CORREO 1'] || "",
            r.correo2 || r['CORREO 2'] || ""
        ]);

        if (detailValues.length > 0) {
            await connection.query(detailSql, [detailValues]);
        }

        await connection.commit();
        res.json({ success: true, clients: mastersMap.size, totalRows: rows.length });

    } catch (error) {
        await connection.rollback();
        console.error("Error en bulk upload Master-Detail:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/cobranzas/gestion/:ruc', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM gestiones_cobranzas WHERE ruc = ? ORDER BY fecha_gestion DESC',
            [req.params.ruc]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/cobranzas/gestion', async (req, res) => {
    try {
        console.log("[DB] Recibiendo nueva gestión:", JSON.stringify(req.body, null, 2));
        const {
            ruc, accion, resultado, nota, gestor_nombre,
            contratos_relacionados, cuota_pendiente, monto_adeudado_total,
            moneda, estado_contacto, modo_contacto, resultado_gestion,
            fecha_compromiso, motivo_no_pago, empresa_frente_trabajo, ruc_empresa_proyecto
        } = req.body;

        const sql = `INSERT INTO gestiones_cobranzas (
            ruc, accion, resultado, nota, gestor_nombre,
            contratos_relacionados, cuota_pendiente, monto_adeudado_total,
            moneda, estado_contacto, modo_contacto, resultado_gestion,
            fecha_compromiso, motivo_no_pago, empresa_frente_trabajo, ruc_empresa_proyecto
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const [result] = await pool.execute(sql, [
            ruc,
            accion || 'Llamada',
            resultado || 'Pendiente',
            nota || '',
            gestor_nombre || 'Sist.',
            contratos_relacionados || '',
            cuota_pendiente || '',
            parseFloat(monto_adeudado_total) || 0,
            moneda || 'USD',
            estado_contacto || '',
            modo_contacto || (accion || 'Llamada'),
            resultado_gestion || (resultado || 'Pendiente'),
            fecha_compromiso || null,
            motivo_no_pago || '',
            empresa_frente_trabajo || '',
            ruc_empresa_proyecto || ''
        ]);

        console.log("[DB] Gestión guardada con ID:", result.insertId);
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error("Error al guardar gestión:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- GESTIÓN DE USUARIOS (ADMIN) ---

app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT u.id, u.name, u.role, au.email, au.password_hash, au.is_active, au.created_at, au.last_login
            FROM usuarios u
            JOIN auth_users au ON u.id = au.id
            ORDER BY u.name ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/users', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        await connection.beginTransaction();
        const id = require('crypto').randomUUID();
        const hash = await bcrypt.hash(password, 10);

        // 1. auth_users
        await connection.execute(
            'INSERT INTO auth_users (id, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
            [id, email, hash]
        );

        // 2. usuarios
        await connection.execute(
            'INSERT INTO usuarios (id, name, role) VALUES (?, ?, ?)',
            [id, name, role]
        );

        await connection.commit();
        res.json({ success: true, id });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.put('/api/admin/users/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { name, email, role, is_active, password } = req.body;

        await connection.beginTransaction();

        // Actualizar usuarios
        await connection.execute(
            'UPDATE usuarios SET name = ?, role = ? WHERE id = ?',
            [name, role, id]
        );

        // Actualizar auth_users (email e is_active)
        let authSql = 'UPDATE auth_users SET email = ?, is_active = ?';
        let authParams = [email, is_active ? 1 : 0];

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            authSql += ', password_hash = ?';
            authParams.push(hash);
        }

        authSql += ' WHERE id = ?';
        authParams.push(id);

        await connection.execute(authSql, authParams);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor AWS Bridge corriendo en puerto ${PORT}`);
    console.log("Presiona Ctrl+C para detener");
});
