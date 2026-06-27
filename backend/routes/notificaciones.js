// ============================================================
// RUTAS: Notificaciones
// VERSIÓN 1.1 - Agregado endpoint PUT /leer-todas para marcar todas
//               las notificaciones del usuario como leídas en una sola operación
// ============================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/notificaciones — Lista notificaciones del usuario (por cédula y/o rol)
router.get('/', async (req, res) => {
    try {
        const cedula = req.user.cedula;
        const id_rol = req.user.id_rol;

        const [rows] = await pool.query(`
            SELECT id_notificacion, cedula_destinatario, id_rol_destinatario,
                   tipo, mensaje, leida, fecha_creacion
            FROM notificaciones
            WHERE cedula_destinatario = ?
               OR id_rol_destinatario = ?
            ORDER BY fecha_creacion DESC
            LIMIT 100
        `, [cedula, id_rol]);

        res.json(rows);
    } catch (err) {
        console.error('Error listar notificaciones:', err);
        res.status(500).json({ error: 'Error al listar notificaciones' });
    }
});

// PUT /api/notificaciones/leer-todas — Marca TODAS las notificaciones del usuario como leídas
// IMPORTANTE: esta ruta DEBE ir antes de PUT /:id/leida para que Express no la confunda con un :id
router.put('/leer-todas', async (req, res) => {
    try {
        const cedula = req.user.cedula;
        const id_rol = req.user.id_rol;

        const [result] = await pool.query(`
            UPDATE notificaciones
            SET leida = 1
            WHERE (cedula_destinatario = ? OR id_rol_destinatario = ?)
              AND leida = 0
        `, [cedula, id_rol]);

        res.json({
            message: 'Todas las notificaciones marcadas como leídas',
            affectedRows: result.affectedRows
        });
    } catch (err) {
        console.error('Error marcar todas leídas:', err);
        res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas' });
    }
});

// PUT /api/notificaciones/:id/leida — Marca UNA notificación como leída
router.put('/:id/leida', async (req, res) => {
    try {
        const cedula = req.user.cedula;
        const id_rol = req.user.id_rol;
        const id = req.params.id;

        const [result] = await pool.query(`
            UPDATE notificaciones
            SET leida = 1
            WHERE id_notificacion = ?
              AND (cedula_destinatario = ? OR id_rol_destinatario = ?)
        `, [id, cedula, id_rol]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Notificación no encontrada o sin permiso' });
        }

        res.json({ message: 'Notificación marcada como leída' });
    } catch (err) {
        console.error('Error marcar leída:', err);
        res.status(500).json({ error: 'Error al marcar como leída' });
    }
});

// DELETE /api/notificaciones/:id — (Opcional) eliminar una notificación
router.delete('/:id', async (req, res) => {
    try {
        const cedula = req.user.cedula;
        const id_rol = req.user.id_rol;
        const id = req.params.id;

        const [result] = await pool.query(`
            DELETE FROM notificaciones
            WHERE id_notificacion = ?
              AND (cedula_destinatario = ? OR id_rol_destinatario = ?)
        `, [id, cedula, id_rol]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Notificación no encontrada o sin permiso' });
        }

        res.json({ message: 'Notificación eliminada' });
    } catch (err) {
        console.error('Error eliminar notificación:', err);
        res.status(500).json({ error: 'Error al eliminar notificación' });
    }
});

module.exports = router;
