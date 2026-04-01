const mysql = require('mysql2/promise');
require('dotenv').config();

async function createUsers() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await connection.beginTransaction();

        const users = [
            {
                id: 'eb68297b-8911-477d-8e4e-4f085188f801',
                email: 'ejecutivo@total.pe',
                hash: '$2b$10$hrDpk2k37nzRnz/Jcgnpe.JnCjn5F/s1sYno/Uvj/9oBPv7Uv6fcG',
                name: 'Ejecutivo Cobranzas',
                role: 'ejecutivo_cobranzas'
            },
            {
                id: 'eb68297b-8911-477d-8e4e-4f085188f802',
                email: 'admin.cobranzas@total.pe',
                hash: '$2b$10$yLDnG.W0krK9ttvYmOfmouEZfUn44BRUZMCqvFEVAfOQ5QPOADoW2',
                name: 'Admin Cobranzas',
                role: 'admin_cobranzas'
            }
        ];

        for (const u of users) {
            console.log(`Creando usuario: ${u.email}`);
            
            // Insertar en auth_users
            await connection.execute(
                'INSERT INTO auth_users (id, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
                [u.id, u.email, u.hash]
            );

            // Insertar en usuarios
            await connection.execute(
                'INSERT INTO usuarios (id, name, role) VALUES (?, ?, ?)',
                [u.id, u.name, u.role]
            );
        }

        await connection.commit();
        console.log('Usuarios creados exitosamente.');
    } catch (error) {
        await connection.rollback();
        console.error('Error al crear usuarios:', error);
    } finally {
        await connection.end();
    }
}

createUsers();
