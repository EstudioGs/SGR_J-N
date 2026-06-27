// ============================================================
// RUTAS: Autenticación
// POST /api/auth/login
// POST /api/auth/forgot-password    (legacy, mantener por compatibilidad)
// GET  /api/auth/me
// POST /api/auth/logout
// ============================================================

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../config/db');
const { generateToken, authenticateToken, ACCESS } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        if (!usuario || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        // Buscar usuario (incluyendo el flag de primer cambio de contraseña)
        const [rows] = await pool.query(`
            SELECT u.cedula, u.nombre, u.nombre_completo, u.usuario, u.password_hash,
                   u.telefono, u.estado, u.requiere_cambio_password,
                   r.nombre AS rol, r.id_rol
            FROM usuarios u
            INNER JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.usuario = ?
        `, [usuario.trim()]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = rows[0];

        // Verificar estado
        if (user.estado === 'Inactivo') {
            return res.status(403).json({ error: 'El usuario se encuentra inactivo' });
        }

        // Verificar contraseña
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Registrar en auditoría
        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, detalles, ip_origen)
            VALUES (?, 'LOGIN', 'usuarios', ?, ?)
        `, [user.cedula, `Inicio de sesión exitoso`, req.ip]);

        // Generar token JWT
        const token = generateToken(user);

        // Retornar usuario sin hash de contraseña + flag de primer login
        delete user.password_hash;
        user.requiere_cambio_password = !!user.requiere_cambio_password;  // ← NUEVO

        res.json({
            token,
            user,
            permissions: ACCESS  // el frontend usa esto para mostrar/ocultar módulos
        });
    } catch (err) {
        console.error('Error en /login:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/auth/forgot-password (LEGACY)
// Mantenido por compatibilidad. El nuevo flujo es /api/password/solicitar-recuperacion
router.post('/forgot-password', async (req, res) => {
    try {
        const { usuario } = req.body;
        const [rows] = await pool.query('SELECT cedula FROM usuarios WHERE usuario = ?', [usuario]);
        if (rows.length > 0) {
            await pool.query(`
                INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, detalles, ip_origen)
                VALUES (?, 'FORGOT_PASSWORD', 'usuarios', 'Solicitud de recuperación de contraseña', ?)
            `, [rows[0].cedula, req.ip]);
        }
        res.json({ message: 'Si el correo existe en nuestro sistema, recibirá un enlace de recuperación.' });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/auth/me - Verificar token y obtener datos del usuario actual
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.cedula, u.nombre, u.nombre_completo, u.usuario, u.telefono,
                   u.estado, u.requiere_cambio_password,
                   r.nombre AS rol
            FROM usuarios u
            INNER JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.cedula = ?
        `, [req.user.cedula]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const user = rows[0];
        user.requiere_cambio_password = !!user.requiere_cambio_password;  // ← NUEVO
        res.json({ user, permissions: ACCESS });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/auth/logout - Registrar cierre de sesión en auditoría
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, detalles, ip_origen)
            VALUES (?, 'LOGOUT', 'usuarios', 'Cierre de sesión', ?)
        `, [req.user.cedula, req.ip]);
        res.json({ message: 'Sesión cerrada correctamente' });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
