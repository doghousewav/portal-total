const bcrypt = require('bcrypt');

async function generateHashes() {
    const saltRounds = 10;
    const users = [
        { name: 'Ejecutivo Cobranzas', email: 'ejecutivo@total.pe', pass: 'cobranzas2024', role: 'ejecutivo_cobranzas' },
        { name: 'Admin Cobranzas', email: 'admin.cobranzas@total.pe', pass: 'admin.cobranzas.2024', role: 'admin_cobranzas' }
    ];
    
    console.log('--- NUEVOS USUARIOS ---');
    for (const u of users) {
        const hash = await bcrypt.hash(u.pass, saltRounds);
        console.log(`Nombre: ${u.name}`);
        console.log(`Email: ${u.email}`);
        console.log(`Password: ${u.pass}`);
        console.log(`Role: ${u.role}`);
        console.log(`Hash: ${hash}`);
        console.log('-------------------------');
    }
}

generateHashes();
