// ============================================================
// RUTAS: Solicitudes v2.1 - con flujo de aprobación + observaciones Presidente
// ============================================================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken, requireAction, canDo } = require('../middleware/auth');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'solicitudes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `sol-${unique}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
        const allowed = /pdf|jpe?g|png|doc|docx|xls|xlsx/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase());
        cb(ok ? null : new Error('Tipo de archivo no permitido'), ok);
    }
});

router.use(authenticateToken);

async function getNextCode() {
    const [rows] = await pool.query('SELECT MAX(CAST(codigo AS UNSIGNED)) AS max FROM solicitudes');
    const next = (rows[0].max || 230) + 1;
    return String(next).padStart(5, '0');
}

function deletePhysicalFile(relativePath) {
    if (!relativePath) return;
    const fullPath = path.join(__dirname, '..', relativePath);
    if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (err) { console.error('No se pudo borrar archivo:', err); }
    }
}

// ============================================================
// Query base con datos de aprobación del Presidente
// ============================================================
const QUERY_BASE = `
    SELECT v.*,
           c.codigo AS codigo_cotizacion,
           c.estado AS estado_cotizacion,
           ar.decision AS decision_presidente,
           ar.observaciones AS observaciones_presidente,
           ar.fecha_decision AS fecha_decision_presidente,
           ua.nombre AS aprobador_presidente_nombre
    FROM vw_solicitudes_detalle v
    LEFT JOIN cotizaciones c ON c.id_solicitud = v.id_solicitud
    LEFT JOIN (
        SELECT ar1.* FROM aprobaciones_recursos ar1
        INNER JOIN (
            SELECT id_cotizacion, MAX(id_aprobacion) AS max_id
            FROM aprobaciones_recursos
            GROUP BY id_cotizacion
        ) ar2 ON ar1.id_aprobacion = ar2.max_id
    ) ar ON ar.id_cotizacion = c.id_cotizacion
    LEFT JOIN usuarios ua ON ar.cedula_aprobador = ua.cedula
`;

// GET /api/solicitudes
router.get('/', async (req, res) => {
    try {
        let query = QUERY_BASE;
        let params = [];
        if (req.user.rol === 'Personal Designado' || req.user.rol === 'Director Regional / Presidente') {
            query += ' WHERE v.cedula_solicitante = ?';
            params = [req.user.cedula];
        }
        query += ' ORDER BY v.fecha_solicitud DESC, v.id_solicitud DESC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al listar solicitudes' });
    }
});

// GET /api/solicitudes/stats
router.get('/stats', async (req, res) => {
    try {
        let where = '';
        let params = [];
        if (req.user.rol === 'Personal Designado' || req.user.rol === 'Director Regional / Presidente') {
            where = ' WHERE cedula_solicitante = ?';
            params = [req.user.cedula];
        }
        const [stats] = await pool.query(`
            SELECT 
                SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN estado='En Revisión' THEN 1 ELSE 0 END) AS en_revision,
                SUM(CASE WHEN estado='En Cotización' THEN 1 ELSE 0 END) AS en_cotizacion,
                SUM(CASE WHEN estado='En Aprobación' THEN 1 ELSE 0 END) AS en_aprobacion,
                SUM(CASE WHEN estado='Aprobado' THEN 1 ELSE 0 END) AS aprobados,
                SUM(CASE WHEN estado='Rechazado' THEN 1 ELSE 0 END) AS rechazados,
                COUNT(*) AS total
            FROM solicitudes ${where}
        `, params);
        res.json(stats[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// GET /api/solicitudes/:id
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(QUERY_BASE + ' WHERE v.codigo = ? OR v.id_solicitud = ?', [req.params.id, req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (req.user.rol === 'Personal Designado' && rows[0].cedula_solicitante !== req.user.cedula) {
            return res.status(403).json({ error: 'No tiene permiso para ver esta solicitud' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener solicitud' });
    }
});

// POST /api/solicitudes
router.post('/', requireAction('solicitudes', 'agregar'), upload.single('archivo'), async (req, res) => {
    try {
        const { descripcion, memo_justificativo } = req.body;
        if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });

        const codigo = await getNextCode();
        const archivo = req.file ? `uploads/solicitudes/${req.file.filename}` : null;

        const [result] = await pool.query(`
            INSERT INTO solicitudes (codigo, descripcion, memo_justificativo, cedula_solicitante, estado, archivo_adjunto)
            VALUES (?, ?, ?, ?, 'Pendiente', ?)
        `, [codigo, descripcion, memo_justificativo || '', req.user.cedula, archivo]);

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'CREAR', 'solicitudes', ?, ?, ?)
        `, [req.user.cedula, codigo, `Creó solicitud ${descripcion}`, req.ip]);

        await pool.query(`
            INSERT INTO notificaciones (id_rol_destinatario, tipo, mensaje)
            SELECT id_rol, 'info', ? FROM roles WHERE nombre IN ('SuperUsuario','Gerente de Proyectos','Gerente de Área','Especialista de Compra')
        `, [`Nueva solicitud #${codigo} pendiente de revisión: ${descripcion}`]);

        const [nueva] = await pool.query('SELECT * FROM vw_solicitudes_detalle WHERE id_solicitud = ?', [result.insertId]);
        res.status(201).json(nueva[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear solicitud' });
    }
});

// PUT /api/solicitudes/:id
router.put('/:id', requireAction('solicitudes', 'editar'), upload.single('archivo'), async (req, res) => {
    try {
        const { descripcion, memo_justificativo, estado } = req.body;
        let archivoSql = '', archivoParam = [];
        if (req.file) {
            const [old] = await pool.query('SELECT archivo_adjunto FROM solicitudes WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);
            if (old.length > 0 && old[0].archivo_adjunto) deletePhysicalFile(old[0].archivo_adjunto);
            archivoSql = ', archivo_adjunto = ?';
            archivoParam = [`uploads/solicitudes/${req.file.filename}`];
        }

        const [result] = await pool.query(`
            UPDATE solicitudes SET descripcion=?, memo_justificativo=?, estado=?${archivoSql}
            WHERE codigo=? OR id_solicitud=?
        `, [descripcion, memo_justificativo, estado, ...archivoParam, req.params.id, req.params.id]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'EDITAR', 'solicitudes', ?, ?, ?)
        `, [req.user.cedula, req.params.id, `Editó solicitud`, req.ip]);

        const [upd] = await pool.query('SELECT * FROM vw_solicitudes_detalle WHERE codigo = ? OR id_solicitud = ?', [req.params.id, req.params.id]);
        res.json(upd[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar solicitud' });
    }
});

// DELETE /api/solicitudes/:id/archivo
router.delete('/:id/archivo', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT archivo_adjunto FROM solicitudes WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!rows[0].archivo_adjunto) return res.status(400).json({ error: 'La solicitud no tiene archivo adjunto' });

        deletePhysicalFile(rows[0].archivo_adjunto);
        await pool.query('UPDATE solicitudes SET archivo_adjunto=NULL WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELIMINAR_ARCHIVO', 'solicitudes', ?, 'Eliminó archivo adjunto', ?)
        `, [req.user.cedula, req.params.id, req.ip]);

        res.json({ message: 'Archivo eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar archivo' });
    }
});

// DELETE /api/solicitudes/:id
router.delete('/:id', requireAction('solicitudes', 'eliminar'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT archivo_adjunto FROM solicitudes WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);
        if (rows.length > 0 && rows[0].archivo_adjunto) deletePhysicalFile(rows[0].archivo_adjunto);

        const [result] = await pool.query('DELETE FROM solicitudes WHERE codigo = ? OR id_solicitud = ?', [req.params.id, req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELIMINAR', 'solicitudes', ?, ?, ?)
        `, [req.user.cedula, req.params.id, `Eliminó solicitud`, req.ip]);

        res.json({ message: 'Solicitud eliminada correctamente' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar solicitud' });
    }
});

// POST /api/solicitudes/:id/aprobar
router.post('/:id/aprobar', requireAction('solicitudes', 'aprobar'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { observaciones } = req.body;

        const [rows] = await conn.query('SELECT * FROM solicitudes WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }
        const sol = rows[0];

        if (sol.estado !== 'Pendiente') {
            await conn.rollback();
            return res.status(400).json({ error: `Solo se pueden aprobar solicitudes en estado "Pendiente". Estado actual: ${sol.estado}` });
        }

        await conn.query(`
            UPDATE solicitudes 
            SET estado='En Revisión', aprobado_por=?, fecha_aprobacion=NOW(), observaciones_aprobacion=?
            WHERE id_solicitud=?
        `, [req.user.cedula, observaciones || '', sol.id_solicitud]);

        const codigoCot = `COT-E${String(sol.id_solicitud).padStart(4,'0')}-${Date.now().toString().slice(-4)}`;
        await conn.query(`
            INSERT INTO cotizaciones (codigo, id_solicitud, descripcion, estado, fecha_cotizacion)
            VALUES (?, ?, ?, 'En Espera', CURRENT_DATE)
        `, [codigoCot, sol.id_solicitud, sol.descripcion]);

        await conn.query(`
            INSERT INTO notificaciones (id_rol_destinatario, tipo, mensaje)
            SELECT id_rol, 'warning', ? FROM roles WHERE nombre IN ('Gerente de Proyectos','Especialista de Compra')
        `, [`Solicitud #${sol.codigo} aprobada. Pendiente de elaborar cotización.`]);

        await conn.query(`
            INSERT INTO notificaciones (cedula_destinatario, tipo, mensaje)
            VALUES (?, 'success', ?)
        `, [sol.cedula_solicitante, `Su solicitud #${sol.codigo} fue aprobada y enviada a cotización.`]);

        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'APROBAR_SOLICITUD', 'solicitudes', ?, ?, ?)
        `, [req.user.cedula, sol.codigo, `Aprobó solicitud para cotización`, req.ip]);

        await conn.commit();
        res.json({ message: 'Solicitud aprobada. Enviada al módulo de Cotización.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error al aprobar solicitud' });
    } finally {
        conn.release();
    }
});

// POST /api/solicitudes/:id/rechazar
router.post('/:id/rechazar', requireAction('solicitudes', 'rechazar'), async (req, res) => {
    try {
        const { observaciones } = req.body;
        const [rows] = await pool.query('SELECT * FROM solicitudes WHERE codigo=? OR id_solicitud=?', [req.params.id, req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
        const sol = rows[0];

        await pool.query(`
            UPDATE solicitudes 
            SET estado='Rechazado', aprobado_por=?, fecha_aprobacion=NOW(), observaciones_aprobacion=?
            WHERE id_solicitud=?
        `, [req.user.cedula, observaciones || '', sol.id_solicitud]);

        await pool.query(`
            INSERT INTO notificaciones (cedula_destinatario, tipo, mensaje)
            VALUES (?, 'danger', ?)
        `, [sol.cedula_solicitante, `Su solicitud #${sol.codigo} fue rechazada.${observaciones ? ' Motivo: ' + observaciones : ''}`]);

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'RECHAZAR_SOLICITUD', 'solicitudes', ?, ?, ?)
        `, [req.user.cedula, sol.codigo, `Rechazó solicitud`, req.ip]);

        res.json({ message: 'Solicitud rechazada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al rechazar solicitud' });
    }
});

module.exports = router;
