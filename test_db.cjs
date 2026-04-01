
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkConnection() {
    console.log("--- Diagnóstico de Conexión AWS RDS ---");
    console.log("Host:", process.env.DB_HOST);
    console.log("User:", process.env.DB_USER);
    console.log("DB:", process.env.DB_NAME);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        console.log("✅ Conexión exitosa a MySQL.");

        const [tables] = await connection.execute("SHOW TABLES");
        console.log("Tablas encontradas:", tables.map(t => Object.values(t)[0]));

        if (tables.some(t => Object.values(t)[0] === 'auth_users')) {
            const [users] = await connection.execute("SELECT id, email FROM auth_users");
            console.log("Usuarios en auth_users:", users);
        } else {
            console.log("❌ La tabla 'auth_users' no existe.");
        }

        if (tables.some(t => Object.values(t)[0] === 'usuarios')) {
            const [profiles] = await connection.execute("SELECT id, name, role FROM usuarios");
            console.log("Perfiles en usuarios:", profiles);
        } else {
            console.log("❌ La tabla 'usuarios' no existe.");
        }

        await connection.end();
    } catch (error) {
        console.error("❌ Error de conexión:", error.message);
    }
}

checkConnection();
