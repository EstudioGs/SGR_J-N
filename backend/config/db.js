// ============================================================
// CONFIGURACIÓN DE CONEXIÓN A MYSQL
// Usa un pool de conexiones para eficiencia
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jn31_importaciones',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Función de prueba de conexión
async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('✓ Conexión a MySQL establecida:', process.env.DB_NAME);
        conn.release();
        return true;
    } catch (error) {
        console.error('✗ Error al conectar con MySQL:', error.message);
        console.error('  Verifique que XAMPP/MySQL esté corriendo y que las credenciales en .env sean correctas.');
        return false;
    }
}

module.exports = { pool, testConnection };
