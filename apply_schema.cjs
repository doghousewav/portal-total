const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applySchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    console.log('Conectado a AWS RDS. Aplicando esquema...');

    try {
        const schemaPath = path.join(__dirname, 'cobranzas_schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        
        await connection.query(sql);
        console.log('✅ Esquema aplicado correctamente.');
    } catch (error) {
        console.error('❌ Error al aplicar el esquema:', error);
    } finally {
        await connection.end();
    }
}

applySchema();
