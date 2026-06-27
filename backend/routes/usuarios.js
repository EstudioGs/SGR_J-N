// ============================================================
// RUTAS: Usuarios (CRUD completo - solo SuperUsuario)
// Entrega 3: al crear usuario, generar password automática y enviar por email
// Hotfix: protecciones contra sobreescritura accidental + último SuperUsuario
// ============================================================

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken, requireAction } = require('../middleware/auth');
const { enviarBienvenida, generarPasswordTemporal } = require('../config/email');

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// ============================================================
// HELPERS
// ============================================================

// Validar que la cédula sea solo dígitos y no exceda 8 caracteres
function validarCedula(cedula) {
    if (!cedula) return 'La cédula es obligatoria';
    const s = String(cedula).trim();
    if (!/^\d+$/.test(s)) return 'La cédula debe contener solo números';
    if (s.length > 8) return 'La cédula no puede tener más de 8 dígitos';
    if (s.length < 6) return 'La cédula debe tener al menos 6 dígitos';
    return null;
}

// Validar email básico
function validarEmail(email) {
    if (!email) return 'El correo es obligatorio';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'El correo no es válido';
    return null;
}

// Contar SuperUsuarios activos (para no dejar al sistema huérfano)
async function contarSuperUsuariosActivos() {
    const [rows] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE r.nombre = 'SuperUsuario' AND u.estado = 'Activo'
    `);
    return rows[0].total;
}

// Verificar si una cédula corresponde a un SuperUsuario activo
async function esSuperUsuarioActivo(cedula) {
    const [rows] = await pool.query(`
        SELECT 1
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE u.cedula = ? AND r.nombre = 'SuperUsuario' AND u.estado = 'Activo'
        LIMIT 1
    `, [cedula]);
    return rows.length > 0;
}

// Obtener nombre del rol por ID
async function getNombreRol(idRol) {
    const [rows] = await pool.query('SELECT nombre FROM roles WHERE id_rol = ?', [idRol]);
    return rows.length > 0 ? rows[0].nombre : null;
}

// ============================================================
// ENDPOINTS
// ============================================================

// GET /api/usuarios - Listar todos los usuarios
router.get('/', requireAction('usuarios', 'listar'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM vw_usuarios_detalle ORDER BY fecha_creacion DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al listar usuarios' });
    }
});

// GET /api/usuarios/roles - Listar todos los roles
router.get('/roles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM roles ORDER BY id_rol');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al listar roles' });
    }
});

// GET /api/usuarios/stats - Estadísticas (activos, admins, total)
router.get('/stats', requireAction('usuarios', 'listar'), async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios WHERE estado='Activo') AS activos,
                (SELECT COUNT(*) FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE r.nombre='SuperUsuario') AS administradores,
                (SELECT COUNT(*) FROM usuarios) AS total
        `);
        res.json(stats[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// GET /api/usuarios/:cedula - Obtener un usuario específico
router.get('/:cedula', requireAction('usuarios', 'ver'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM vw_usuarios_detalle WHERE cedula = ?', [req.params.cedula]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ============================================================
// POST /api/usuarios - Crear usuario
// HOTFIX: bloqueo estricto si la cédula o el email ya existen
// ============================================================
router.post('/', requireAction('usuarios', 'agregar'), async (req, res) => {
    try {
        const { cedula, nombre, nombre_completo, usuario, telefono, id_rol, estado } = req.body;
        
        const nombreFinal = nombre || nombre_completo;
        const nombreCompletoFinal = nombre_completo || nombre;
        
        // Validaciones de campos
        if (!cedula || !nombreCompletoFinal || !usuario || !id_rol) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (cédula, nombre, email, rol)' });
        }

        const errCedula = validarCedula(cedula);
        if (errCedula) return res.status(400).json({ error: errCedula });

        const errEmail = validarEmail(usuario);
        if (errEmail) return res.status(400).json({ error: errEmail });

        // HOTFIX: verificación EXPLÍCITA de cédula y email por separado (mensajes claros)
        const cedulaLimpia = String(cedula).trim();
        const usuarioLimpio = String(usuario).trim().toLowerCase();

        const [existsCedula] = await pool.query('SELECT cedula, nombre FROM usuarios WHERE cedula = ?', [cedulaLimpia]);
        if (existsCedula.length > 0) {
            return res.status(409).json({
                error: `La cédula ${cedulaLimpia} ya pertenece a otro usuario (${existsCedula[0].nombre}). Si desea modificarlo, use la opción Editar.`
            });
        }

        const [existsEmail] = await pool.query('SELECT cedula, nombre FROM usuarios WHERE LOWER(usuario) = ?', [usuarioLimpio]);
        if (existsEmail.length > 0) {
            return res.status(409).json({
                error: `El correo ${usuario} ya está registrado en el sistema (usuario: ${existsEmail[0].nombre}).`
            });
        }

        // Validar que el rol exista
        const nombreRol = await getNombreRol(id_rol);
        if (!nombreRol) return res.status(400).json({ error: 'El rol especificado no es válido' });

        // Generar contraseña temporal aleatoria
        const passwordTemporal = generarPasswordTemporal(10);
        const hash = await bcrypt.hash(passwordTemporal, 10);

        // Insertar
        await pool.query(`
            INSERT INTO usuarios (cedula, nombre, nombre_completo, usuario, password_hash, requiere_cambio_password, telefono, id_rol, estado)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [cedulaLimpia, nombreFinal, nombreCompletoFinal, usuarioLimpio, hash, telefono || '', id_rol, estado || 'Activo']);

        // Auditoría
        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'CREAR', 'usuarios', ?, ?, ?)
        `, [req.user.cedula, cedulaLimpia, `Creó usuario ${nombreFinal} (${usuarioLimpio}) con rol ${nombreRol}`, req.ip]);

        // Enviar bienvenida (no bloqueante)
        enviarBienvenida({
            destinatario: usuarioLimpio,
            nombre: nombreCompletoFinal,
            email: usuarioLimpio,
            passwordTemporal
        }).then(() => console.log(`✓ Correo de bienvenida enviado a ${usuarioLimpio}`))
          .catch(err => console.error(`✗ Error enviando bienvenida a ${usuarioLimpio}:`, err.message));

        const [nuevo] = await pool.query('SELECT * FROM vw_usuarios_detalle WHERE cedula = ?', [cedulaLimpia]);
        res.status(201).json({
            ...nuevo[0],
            _info: 'Se envió un correo con las credenciales de acceso al usuario'
        });
    } catch (err) {
        console.error(err);
        // Catch específico para duplicate key (cinturón + tirantes)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'La cédula o el correo ya existen en el sistema' });
        }
        res.status(500).json({ error: 'Error al crear usuario: ' + err.message });
    }
});

// ============================================================
// PUT /api/usuarios/:cedula - Actualizar usuario
// HOTFIX: 
//  - La cédula NO se puede cambiar (es ID único)
//  - El email nuevo no puede duplicar el de otro usuario
//  - No se puede dejar al sistema sin SuperUsuarios activos
// ============================================================
router.put('/:cedula', requireAction('usuarios', 'editar'), async (req, res) => {
    try {
        const cedulaTarget = String(req.params.cedula).trim();
        const { nombre, nombre_completo, usuario, password, telefono, id_rol, estado, cedula: cedulaBody } = req.body;
        const nombreFinal = nombre || nombre_completo;
        const nombreCompletoFinal = nombre_completo || nombre;

        // 1) Verificar que el usuario a editar existe
        const [existing] = await pool.query(`
            SELECT u.cedula, u.usuario, u.id_rol, u.estado, r.nombre AS rol_actual
            FROM usuarios u
            INNER JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.cedula = ?
        `, [cedulaTarget]);

        if (existing.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        const usuarioActual = existing[0];

        // 2) Bloquear intento de cambiar la cédula
        if (cedulaBody && String(cedulaBody).trim() !== cedulaTarget) {
            return res.status(400).json({
                error: 'No se puede cambiar la cédula de un usuario. Si necesita corregirla, elimine el usuario y créelo de nuevo.'
            });
        }

        // 3) Validaciones de campos
        if (!nombreCompletoFinal || !usuario || !id_rol) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, email, rol)' });
        }
        const errEmail = validarEmail(usuario);
        if (errEmail) return res.status(400).json({ error: errEmail });

        // 4) Si el email cambió, verificar que no pertenezca a OTRO usuario
        const usuarioLimpio = String(usuario).trim().toLowerCase();
        if (usuarioLimpio !== String(usuarioActual.usuario).toLowerCase()) {
            const [emailDup] = await pool.query(
                'SELECT cedula, nombre FROM usuarios WHERE LOWER(usuario) = ? AND cedula <> ?',
                [usuarioLimpio, cedulaTarget]
            );
            if (emailDup.length > 0) {
                return res.status(409).json({
                    error: `El correo ${usuario} ya está registrado por otro usuario (${emailDup[0].nombre}).`
                });
            }
        }

        // 5) Validar rol
        const nombreRolNuevo = await getNombreRol(id_rol);
        if (!nombreRolNuevo) return res.status(400).json({ error: 'El rol especificado no es válido' });

        // 6) HOTFIX: proteger al sistema de quedarse sin SuperUsuarios activos
        const eraSuperActivo = (usuarioActual.rol_actual === 'SuperUsuario' && usuarioActual.estado === 'Activo');
        const seraSuperActivo = (nombreRolNuevo === 'SuperUsuario' && (estado || 'Activo') === 'Activo');
        if (eraSuperActivo && !seraSuperActivo) {
            const totalSuper = await contarSuperUsuariosActivos();
            if (totalSuper <= 1) {
                return res.status(400).json({
                    error: 'No se puede modificar este usuario porque es el último SuperUsuario activo del sistema. Cree o active otro administrador antes de cambiar este.'
                });
            }
        }

        // 7) HOTFIX: no permitir que un admin se desactive a sí mismo
        if (cedulaTarget === req.user.cedula && (estado || 'Activo') === 'Inactivo') {
            return res.status(400).json({
                error: 'No puede desactivar su propio usuario mientras está en sesión.'
            });
        }
        if (cedulaTarget === req.user.cedula && eraSuperActivo && nombreRolNuevo !== 'SuperUsuario') {
            return res.status(400).json({
                error: 'No puede cambiar su propio rol de SuperUsuario mientras está en sesión.'
            });
        }

        // 8) UPDATE
        let sql, params;
        if (password && password.length > 0) {
            const hash = await bcrypt.hash(password, 10);
            sql = `UPDATE usuarios SET nombre=?, nombre_completo=?, usuario=?, password_hash=?, telefono=?, id_rol=?, estado=? WHERE cedula=?`;
            params = [nombreFinal, nombreCompletoFinal, usuarioLimpio, hash, telefono || '', id_rol, estado || 'Activo', cedulaTarget];
        } else {
            sql = `UPDATE usuarios SET nombre=?, nombre_completo=?, usuario=?, telefono=?, id_rol=?, estado=? WHERE cedula=?`;
            params = [nombreFinal, nombreCompletoFinal, usuarioLimpio, telefono || '', id_rol, estado || 'Activo', cedulaTarget];
        }

        const [result] = await pool.query(sql, params);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'EDITAR', 'usuarios', ?, ?, ?)
        `, [req.user.cedula, cedulaTarget, `Editó usuario ${nombreFinal} (${usuarioLimpio}) — rol: ${nombreRolNuevo}, estado: ${estado || 'Activo'}`, req.ip]);

        const [updated] = await pool.query('SELECT * FROM vw_usuarios_detalle WHERE cedula = ?', [cedulaTarget]);
        res.json(updated[0]);
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El correo ya está registrado por otro usuario' });
        }
        res.status(500).json({ error: 'Error al actualizar usuario: ' + err.message });
    }
});

// ============================================================
// DELETE /api/usuarios/:cedula - Eliminar usuario
// HOTFIX: bloquear si es el último SuperUsuario activo
// ============================================================
router.delete('/:cedula', requireAction('usuarios', 'eliminar'), async (req, res) => {
    try {
        const cedulaTarget = String(req.params.cedula).trim();

        // No permitir auto-eliminación
        if (cedulaTarget === req.user.cedula) {
            return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
        }

        // HOTFIX: no permitir eliminar al último SuperUsuario activo
        if (await esSuperUsuarioActivo(cedulaTarget)) {
            const totalSuper = await contarSuperUsuariosActivos();
            if (totalSuper <= 1) {
                return res.status(400).json({
                    error: 'No se puede eliminar este usuario porque es el último SuperUsuario activo del sistema.'
                });
            }
        }

        const [result] = await pool.query('DELETE FROM usuarios WHERE cedula = ?', [cedulaTarget]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELIMINAR', 'usuarios', ?, ?, ?)
        `, [req.user.cedula, cedulaTarget, `Eliminó usuario`, req.ip]);

        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ error: 'No se puede eliminar: el usuario tiene registros vinculados (solicitudes, cotizaciones, etc.). Considere desactivarlo en su lugar.' });
        }
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

module.exports = router;
