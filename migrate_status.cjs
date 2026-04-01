const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateStatus() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Migrando registros de "En proceso" a "Pendiente"...');
        const [result] = await connection.query(
            "UPDATE base_cobranzas SET estado = 'Pendiente' WHERE estado = 'En proceso'"
        );
        console.log(`✓ Registros actualizados: ${result.affectedRows}`);
    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        await connection.end();
    }
}

migrateStatus();
