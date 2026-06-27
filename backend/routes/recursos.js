// ============================================================
// RUTAS: Recursos (Aprobación por Director Regional / Presidente)
// VERSIÓN 2.2 - Filtro de estado para que el Presidente solo vea cotizaciones
//               en estados elegibles ('En Aprobación', 'Aprobada', 'Rechazada')
// ============================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken, requireModule, requireAction } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireModule('recursos')); // solo Presidente

// Estados de cotización que el Presidente DEBE poder ver en el módulo de Recursos
// - 'En Aprobación': cotización ya pre-aprobada por el Gerente/Especialista — esperando decisión final
// - 'Aprobada': histórico de aprobadas por el Presidente
// - 'Rechazada': histórico de rechazadas por el Presidente
// Excluidas: 'En Espera' y 'Pendiente' (aún no se ha hecho cotización por Gerente/Especialista),
//            'En Proceso' (cotización en curso por Gerente/Especialista),
//            'Finalizada' (ya cerrado).
const ESTADOS_VISIBLES_PRESIDENTE = ['En Aprobación', 'Aprobada', 'Rechazada'];

// GET /api/recursos - Listar cotizaciones que están en proceso de aprobación de recursos
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.id_cotizacion, c.codigo, c.descripcion, c.total_usd, c.memo_justificativo, c.estado,
                   c.fecha_cotizacion,
                   s.codigo AS codigo_solicitud, s.descripcion AS desc_solicitud,
                   s.memo_justificativo AS memo_solicitud,
                   u.nombre AS solicitante,
                   r.nombre AS rol_solicitante,
                   p.nombre AS proveedor_seleccionado
            FROM cotizaciones c
            INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            INNER JOIN usuarios u ON s.cedula_solicitante = u.cedula
            INNER JOIN roles r ON u.id_rol = r.id_rol
            LEFT JOIN proveedores p ON c.id_proveedor_seleccionado = p.id_proveedor
            WHERE c.estado IN (?, ?, ?)
            ORDER BY 
                CASE c.estado
                    WHEN 'En Aprobación' THEN 1
                    WHEN 'Aprobada'      THEN 2
                    WHEN 'Rechazada'     THEN 3
                    ELSE 4
                END,
                c.fecha_cotizacion DESC
        `, ESTADOS_VISIBLES_PRESIDENTE);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al listar recursos' });
    }
});

// GET /api/recursos/stats — solo cuenta las que el Presidente ve
router.get('/stats', async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                SUM(CASE WHEN c.estado='En Aprobación' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN c.estado='En Aprobación' THEN 1 ELSE 0 END) AS en_proceso,
                SUM(CASE WHEN c.estado='Aprobada'      THEN 1 ELSE 0 END) AS aprobados,
                SUM(CASE WHEN c.estado='Rechazada'     THEN 1 ELSE 0 END) AS rechazados,
                COUNT(*) AS total
            FROM cotizaciones c
            WHERE c.estado IN (?, ?, ?)
        `, ESTADOS_VISIBLES_PRESIDENTE);
        res.json(stats[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// POST /api/recursos/:id/aprobar - Aprobar recursos
router.post('/:id/aprobar', requireAction('recursos', 'aprobar'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        const { observaciones } = req.body;
        
        const [cotRows] = await conn.query('SELECT * FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [req.params.id, req.params.id]);
        if (cotRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        const cot = cotRows[0];

        // Validación extra: la cotización debe estar en estado 'En Aprobación'
        if (cot.estado !== 'En Aprobación') {
            await conn.rollback();
            return res.status(400).json({
                error: `Solo se pueden aprobar cotizaciones en estado "En Aprobación". Estado actual: "${cot.estado}"`
            });
        }

        await conn.query('UPDATE cotizaciones SET estado = ? WHERE id_cotizacion = ?', ['Aprobada', cot.id_cotizacion]);
        await conn.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', ['Aprobado', cot.id_solicitud]);

        await conn.query(`
            INSERT INTO aprobaciones_recursos (id_cotizacion, cedula_aprobador, decision, observaciones)
            VALUES (?, ?, 'Aprobada', ?)
        `, [cot.id_cotizacion, req.user.cedula, observaciones || '']);

        // Notificar al solicitante original
        const [solRows] = await conn.query('SELECT cedula_solicitante FROM solicitudes WHERE id_solicitud = ?', [cot.id_solicitud]);
        if (solRows.length > 0) {
            await conn.query(`
                INSERT INTO notificaciones (cedula_destinatario, tipo, mensaje)
                VALUES (?, 'success', ?)
            `, [solRows[0].cedula_solicitante, `Su solicitud fue aprobada por el Presidente`]);
        }

        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'APROBAR_RECURSO', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, cot.codigo, `Aprobó recursos para cotización`, req.ip]);

        await conn.commit();
        res.json({ message: 'Recurso aprobado correctamente' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error al aprobar recurso' });
    } finally {
        conn.release();
    }
});

// POST /api/recursos/:id/rechazar - Rechazar recursos
router.post('/:id/rechazar', requireAction('recursos', 'rechazar'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        const { observaciones } = req.body;
        
        const [cotRows] = await conn.query('SELECT * FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [req.params.id, req.params.id]);
        if (cotRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        const cot = cotRows[0];

        // Validación extra: la cotización debe estar en estado 'En Aprobación'
        if (cot.estado !== 'En Aprobación') {
            await conn.rollback();
            return res.status(400).json({
                error: `Solo se pueden rechazar cotizaciones en estado "En Aprobación". Estado actual: "${cot.estado}"`
            });
        }

        await conn.query('UPDATE cotizaciones SET estado = ? WHERE id_cotizacion = ?', ['Rechazada', cot.id_cotizacion]);
        await conn.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', ['Rechazado', cot.id_solicitud]);

        await conn.query(`
            INSERT INTO aprobaciones_recursos (id_cotizacion, cedula_aprobador, decision, observaciones)
            VALUES (?, ?, 'Rechazada', ?)
        `, [cot.id_cotizacion, req.user.cedula, observaciones || '']);

        // Notificar al solicitante
        const [solRows] = await conn.query('SELECT cedula_solicitante FROM solicitudes WHERE id_solicitud = ?', [cot.id_solicitud]);
        if (solRows.length > 0) {
            await conn.query(`
                INSERT INTO notificaciones (cedula_destinatario, tipo, mensaje)
                VALUES (?, 'danger', ?)
            `, [solRows[0].cedula_solicitante, `Su solicitud fue rechazada por el Presidente`]);
        }

        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'RECHAZAR_RECURSO', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, cot.codigo, `Rechazó recursos para cotización`, req.ip]);

        await conn.commit();
        res.json({ message: 'Recurso rechazado' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error al rechazar recurso' });
    } finally {
        conn.release();
    }
});

module.exports = router;
