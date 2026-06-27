// ============================================================
// RUTAS: Password — Entrega 3
// - Cambio de contraseña en primer login (obligatorio)
// - Flujo "¿Olvidó su contraseña?" con código de verificación
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const {
    enviarCodigoRecuperacion,
    enviarConfirmacionCambio,
    generarCodigoVerificacion,
    validarPasswordFuerte
} = require('../config/email');

const CODIGO_VALIDEZ_MIN = 15;   // minutos
const MAX_INTENTOS_CODIGO = 3;

// ============================================================
// ENDPOINT 1: Cambio de contraseña forzado en primer login
// Requiere token (el usuario ya hizo login con su password temporal)
// ============================================================
router.post('/cambiar-primer-login', authenticateToken, async (req, res) => {
    try {
        const { password_actual, password_nueva } = req.body;
        const cedula = req.user.cedula;

        if (!password_actual || !password_nueva) {
            return res.status(400).json({ error: 'Debe proporcionar la contraseña actual y la nueva' });
        }

        // Validar fuerza de la nueva contraseña
        const v = validarPasswordFuerte(password_nueva);
        if (!v.ok) return res.status(400).json({ error: v.error });

        // Recuperar el usuario
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE cedula = ?', [cedula]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        const usuario = rows[0];

        // Verificar contraseña actual
        const passwordOk = await bcrypt.compare(password_actual, usuario.password_hash);
        if (!passwordOk) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

        // No permitir usar la misma contraseña
        if (password_actual === password_nueva) {
            return res.status(400).json({ error: 'La nueva contraseña no puede ser igual a la anterior' });
        }

        // Hashear y actualizar
        const nuevoHash = await bcrypt.hash(password_nueva, 10);
        await pool.query(
            'UPDATE usuarios SET password_hash = ?, requiere_cambio_password = 0 WHERE cedula = ?',
            [nuevoHash, cedula]
        );

        // Auditoría
        await pool.query(
            `INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
             VALUES (?, 'CAMBIO_PASSWORD_PRIMER_LOGIN', 'usuarios', ?, ?, ?)`,
            [cedula, cedula, 'Usuario cambió su contraseña en el primer inicio de sesión', req.ip]
        );

        // Enviar correo de confirmación
        enviarConfirmacionCambio({ destinatario: usuario.usuario, nombre: usuario.nombre })
            .catch(err => console.error('Error enviando confirmación:', err.message));

        res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (err) {
        console.error('Error cambiar-primer-login:', err);
        res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
});

// ============================================================
// ENDPOINT 2: Solicitar código de recuperación
// No requiere autenticación — solo recibe el email
// ============================================================
router.post('/solicitar-recuperacion', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Debe proporcionar un correo' });

        // Buscar usuario por email
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE usuario = ? AND estado = ?', [email, 'Activo']);

        // POR SEGURIDAD: respondemos OK siempre, incluso si el email no existe
        // (así no se filtra qué correos están registrados)
        const respuestaOk = {
            message: 'Si el correo existe en nuestro sistema, recibirá un código de recuperación en unos minutos',
            validez_minutos: CODIGO_VALIDEZ_MIN
        };

        if (rows.length === 0) {
            // Pequeño delay para que el atacante no pueda inferir si existe
            await new Promise(r => setTimeout(r, 800));
            return res.json(respuestaOk);
        }

        const usuario = rows[0];
        const codigo = generarCodigoVerificacion();
        const expiraAt = new Date(Date.now() + CODIGO_VALIDEZ_MIN * 60 * 1000);

        // Invalidar códigos anteriores no usados
        await pool.query(
            'UPDATE password_resets SET usado = 1 WHERE cedula_usuario = ? AND usado = 0',
            [usuario.cedula]
        );

        // Crear nuevo código
        await pool.query(
            `INSERT INTO password_resets (cedula_usuario, codigo, expira_at)
             VALUES (?, ?, ?)`,
            [usuario.cedula, codigo, expiraAt]
        );

        // Enviar correo (asincrónico — no bloquear respuesta)
        enviarCodigoRecuperacion({
            destinatario: usuario.usuario,
            nombre: usuario.nombre,
            codigo,
            minutosValido: CODIGO_VALIDEZ_MIN
        }).catch(err => console.error('Error enviando código:', err.message));

        // Auditoría
        await pool.query(
            `INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
             VALUES (?, 'SOLICITAR_RECUPERACION', 'password_resets', ?, ?, ?)`,
            [usuario.cedula, usuario.cedula, `Solicitud de recuperación enviada a ${email}`, req.ip]
        );

        res.json(respuestaOk);
    } catch (err) {
        console.error('Error solicitar-recuperacion:', err);
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// ============================================================
// ENDPOINT 3: Verificar código (paso intermedio)
// El frontend lo usa para validar el código antes de pedir la nueva contraseña
// ============================================================
router.post('/verificar-codigo', async (req, res) => {
    try {
        const { email, codigo } = req.body;
        if (!email || !codigo) return res.status(400).json({ error: 'Faltan datos' });

        const [userRows] = await pool.query('SELECT cedula FROM usuarios WHERE usuario = ?', [email]);
        if (userRows.length === 0) return res.status(400).json({ error: 'Código inválido o expirado' });
        const cedula = userRows[0].cedula;

        const [resetRows] = await pool.query(
            `SELECT * FROM password_resets
             WHERE cedula_usuario = ? AND usado = 0
             ORDER BY id_reset DESC LIMIT 1`,
            [cedula]
        );
        if (resetRows.length === 0) return res.status(400).json({ error: 'Código inválido o expirado' });

        const reset = resetRows[0];

        // Vencido
        if (new Date(reset.expira_at) < new Date()) {
            return res.status(400).json({ error: 'El código ha expirado. Solicite uno nuevo.' });
        }

        // Demasiados intentos
        if (reset.intentos >= MAX_INTENTOS_CODIGO) {
            await pool.query('UPDATE password_resets SET usado = 1 WHERE id_reset = ?', [reset.id_reset]);
            return res.status(429).json({ error: 'Demasiados intentos fallidos. Solicite un código nuevo.' });
        }

        // Código no coincide
        if (reset.codigo !== String(codigo).trim()) {
            await pool.query('UPDATE password_resets SET intentos = intentos + 1 WHERE id_reset = ?', [reset.id_reset]);
            const intentosRestantes = MAX_INTENTOS_CODIGO - (reset.intentos + 1);
            return res.status(400).json({
                error: `Código incorrecto. ${intentosRestantes} intento${intentosRestantes !== 1 ? 's' : ''} restante${intentosRestantes !== 1 ? 's' : ''}.`
            });
        }

        // ÉXITO: código válido — no lo marcamos como usado todavía (eso pasa al cambiar password)
        res.json({ message: 'Código verificado correctamente', ok: true });
    } catch (err) {
        console.error('Error verificar-codigo:', err);
        res.status(500).json({ error: 'Error al verificar el código' });
    }
});

// ============================================================
// ENDPOINT 4: Cambiar contraseña con código (paso final)
// ============================================================
router.post('/cambiar-con-codigo', async (req, res) => {
    try {
        const { email, codigo, password_nueva } = req.body;
        if (!email || !codigo || !password_nueva) return res.status(400).json({ error: 'Faltan datos' });

        // Validar fuerza de la nueva contraseña
        const v = validarPasswordFuerte(password_nueva);
        if (!v.ok) return res.status(400).json({ error: v.error });

        // Buscar usuario
        const [userRows] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [email]);
        if (userRows.length === 0) return res.status(400).json({ error: 'Código inválido o expirado' });
        const usuario = userRows[0];

        // Validar código (último no usado)
        const [resetRows] = await pool.query(
            `SELECT * FROM password_resets
             WHERE cedula_usuario = ? AND usado = 0
             ORDER BY id_reset DESC LIMIT 1`,
            [usuario.cedula]
        );
        if (resetRows.length === 0) return res.status(400).json({ error: 'Código inválido o expirado' });
        const reset = resetRows[0];

        if (new Date(reset.expira_at) < new Date()) {
            return res.status(400).json({ error: 'El código ha expirado. Solicite uno nuevo.' });
        }
        if (reset.codigo !== String(codigo).trim()) {
            return res.status(400).json({ error: 'Código incorrecto.' });
        }

        // Cambiar contraseña
        const nuevoHash = await bcrypt.hash(password_nueva, 10);
        await pool.query(
            'UPDATE usuarios SET password_hash = ?, requiere_cambio_password = 0 WHERE cedula = ?',
            [nuevoHash, usuario.cedula]
        );

        // Marcar código como usado
        await pool.query('UPDATE password_resets SET usado = 1 WHERE id_reset = ?', [reset.id_reset]);

        // Auditoría
        await pool.query(
            `INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
             VALUES (?, 'RECUPERAR_PASSWORD', 'usuarios', ?, ?, ?)`,
            [usuario.cedula, usuario.cedula, 'Contraseña restablecida con código de verificación', req.ip]
        );

        // Confirmación por email
        enviarConfirmacionCambio({ destinatario: usuario.usuario, nombre: usuario.nombre })
            .catch(err => console.error('Error enviando confirmación:', err.message));

        res.json({ message: 'Contraseña actualizada correctamente. Ya puede iniciar sesión.' });
    } catch (err) {
        console.error('Error cambiar-con-codigo:', err);
        res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
});

module.exports = router;
