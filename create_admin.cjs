const mysql = require('mysql2/promise');
require('dotenv').config();

async function createAdmin() {
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

        const u = {
            id: '550e8400-e29b-41d4-a716-446655440003',
            email: 'admin@total.pe',
            hash: '$2b$10$yLDnG.W0krK9ttvYmOfmouEZfUn44BRUZMCqvFEVAfOQ5QPOADoW2', // admin.cobranzas.2024 -> use same pass for simplicity
            name: 'Administrador Sistema',
            role: 'admin'
        };

        console.log(`Creando admin: ${u.email}`);
        
        await connection.execute(
            'INSERT INTO auth_users (id, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
            [u.id, u.email, u.hash]
        );

        await connection.execute(
            'INSERT INTO usuarios (id, name, role) VALUES (?, ?, ?)',
            [u.id, u.name, u.role]
        );

        await connection.commit();
        console.log('Admin creado exitosamente.');
    } catch (error) {
        await connection.rollback();
        console.error('Error al crear admin:', error);
    } finally {
        await connection.end();
    }
}

createAdmin();
