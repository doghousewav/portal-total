const mysql = require('mysql2/promise');
require('dotenv').config();

async function describeTables() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    console.log('--- TABLE: auth_users ---');
    const [authFields] = await connection.query('DESCRIBE auth_users');
    console.table(authFields);

    console.log('--- TABLE: usuarios ---');
    const [userFields] = await connection.query('DESCRIBE usuarios');
    console.table(userFields);

    await connection.end();
}

describeTables().catch(console.error);
