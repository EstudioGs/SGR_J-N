// ============================================================
// Script: Reemplaza los hashes placeholder del SQL con hashes reales de bcrypt
// Ejecutar: npm run init-passwords
// ============================================================

const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

async function seedPasswords() {
    try {
        console.log('→ Generando hashes bcrypt para la contraseña por defecto "1234"...');
        const hash = await bcrypt.hash('1234', 10);

        console.log('→ Actualizando contraseñas de usuarios con placeholders...');
        const [result] = await pool.query(
            "UPDATE usuarios SET password_hash = ? WHERE password_hash = 'PLACEHOLDER'",
            [hash]
        );

        console.log(`✓ ${result.affectedRows} usuarios actualizados con contraseña "1234".`);
        console.log('');
        console.log('Usuarios disponibles para login:');
        console.log('─'.repeat(60));
        const [users] = await pool.query(`
            SELECT u.usuario, r.nombre AS rol, u.estado
            FROM usuarios u 
            INNER JOIN roles r ON u.id_rol = r.id_rol
            ORDER BY r.id_rol
        `);
        users.forEach(u => {
            console.log(`  ${u.usuario.padEnd(30)} [${u.rol}] ${u.estado}`);
        });
        console.log('─'.repeat(60));
        console.log('Contraseña para todos: 1234');
        process.exit(0);
    } catch (err) {
        console.error('✗ Error:', err.message);
        process.exit(1);
    }
}

seedPasswords();
