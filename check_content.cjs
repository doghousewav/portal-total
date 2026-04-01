
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkContent() {
    console.log("--- Consultando contenido de nuevas tablas ---");
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const tablesToChecked = ['informe_visita', 'informe_comercial', 'declaracion_patrimonial'];
        
        for (const table of tablesToChecked) {
            console.log(`\nContenido de la tabla: ${table}`);
            try {
                const [rows] = await connection.execute(`SELECT id, comercial_id, created_at FROM ${table} ORDER BY created_at DESC LIMIT 5`);
                console.table(rows);
            } catch (e) {
                console.log(`❌ Error al consultar la tabla ${table}: ${e.message}`);
            }
        }

        await connection.end();
    } catch (error) {
        console.error("❌ Error de conexión:", error.message);
    }
}

checkContent();
