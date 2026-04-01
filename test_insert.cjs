
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testInsert() {
    console.log("--- Test de Inserción Directa ---");
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const testId = 'test-' + Date.now();
    
    try {
        console.log(`Intentando insertar registro de prueba con ID: ${testId}`);
        
        // 1. Informe Comercial
        const sqlComercial = `INSERT INTO informe_comercial (id, comercial_id, razon_social) VALUES (?, ?, ?)`;
        await connection.execute(sqlComercial, [testId, 'test-user', 'EMPRESA TEST']);
        console.log("✅ Registro insertado en informe_comercial");

        // 2. Declaración Patrimonial
        const sqlPatrimonial = `INSERT INTO declaracion_patrimonial (id, comercial_id, nombre_completo) VALUES (?, ?, ?)`;
        await connection.execute(sqlPatrimonial, [testId, 'test-user', 'Nombres de Prueba']);
        console.log("✅ Registro insertado en declaracion_patrimonial");

        const [rows] = await connection.execute("SELECT id FROM informe_comercial WHERE id = ?", [testId]);
        if (rows.length > 0) {
            console.log("✅ Confirmado: El registro existe en la base de datos.");
        }

    } catch (e) {
        console.error("❌ Error durante el test:", e.message);
    } finally {
        await connection.end();
    }
}

testInsert();
