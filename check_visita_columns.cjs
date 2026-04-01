
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkColumns() {
    console.log("--- Consultando esquema de informe_visita ---");
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const table = 'informe_visita';
        console.log(`\nEsquema de la tabla: ${table}`);
        const [columns] = await connection.execute(`DESCRIBE ${table}`);
        console.table(columns.map(c => ({
            Field: c.Field,
            Type: c.Type,
            Null: c.Null,
            Key: c.Key
        })));

        await connection.end();
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

checkColumns();
