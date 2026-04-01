
require('dotenv').config();
const mysql = require('mysql2/promise');

async function updateSchema() {
    console.log("--- Actualizando esquema de informe_visita (Retry) ---");
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const columns = [
        { name: 'ejecutivo1_nombre', type: 'VARCHAR(255)', after: 'entrevistado3_contacto' },
        { name: 'ejecutivo1_cargo', type: 'VARCHAR(255)', after: 'ejecutivo1_nombre' },
        { name: 'ejecutivo2_nombre', type: 'VARCHAR(255)', after: 'ejecutivo1_cargo' },
        { name: 'ejecutivo2_cargo', type: 'VARCHAR(255)', after: 'ejecutivo2_nombre' },
        { name: 'ejecutivo3_nombre', type: 'VARCHAR(255)', after: 'ejecutivo2_cargo' },
        { name: 'ejecutivo3_cargo', type: 'VARCHAR(255)', after: 'ejecutivo3_nombre' }
    ];

    try {
        for (const col of columns) {
            const sql = `ALTER TABLE informe_visita ADD COLUMN ${col.name} ${col.type} AFTER ${col.after}`;
            console.log(`Ejecutando: ${sql}`);
            try {
                await connection.execute(sql);
                console.log("✅ Éxito");
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log(`ℹ️  La columna ${col.name} ya existe.`);
                } else {
                    console.log(`❌ Error: ${e.message}`);
                }
            }
        }
        console.log("\n--- Finalizado ---");
    } finally {
        await connection.end();
    }
}

updateSchema();
