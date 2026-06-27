// ============================================================
// RUTAS: Cotizaciones v2.4
// - Pre-aprobación correcta + observaciones del Presidente en GETs
// ============================================================

const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken, requireAction } = require('../middleware/auth');

router.use(authenticateToken);

async function getNextCode() {
    const [rows] = await pool.query(`
        SELECT MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)) AS max 
        FROM cotizaciones 
        WHERE codigo LIKE 'COT-%' AND codigo NOT LIKE 'COT-E%' AND codigo NOT LIKE 'COT-T%'
    `);
    const next = (rows[0].max || 30) + 1;
    return 'COT-' + String(next).padStart(5, '0');
}

const SUBQUERY_APROBACION = `
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

async function elaborarCotizacion(req, res, idCotizacionParam = null) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { id_solicitud, descripcion, memo_justificativo, detalles } = req.body;
        if (!Array.isArray(detalles) || detalles.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Debe incluir los detalles del análisis comparativo' });
        }
        const seleccionado = detalles.find(d => d.seleccionado);
        if (!seleccionado) {
            await conn.rollback();
            return res.status(400).json({ error: 'Debe seleccionar un proveedor ganador' });
        }

        let cotExistente = null;
        if (idCotizacionParam) {
            const [rows] = await conn.query('SELECT * FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [idCotizacionParam, idCotizacionParam]);
            if (rows.length === 0) {
                await conn.rollback();
                return res.status(404).json({ error: 'Cotización no encontrada' });
            }
            cotExistente = rows[0];
        } else if (id_solicitud) {
            const [rows] = await conn.query(`SELECT * FROM cotizaciones WHERE id_solicitud = ? AND estado = 'En Espera' LIMIT 1`, [id_solicitud]);
            if (rows.length > 0) cotExistente = rows[0];
        }

        let id_cotizacion, codigo, id_solicitud_final;
        if (cotExistente) {
            codigo = cotExistente.codigo;
            id_solicitud_final = cotExistente.id_solicitud;
            if (codigo && (codigo.startsWith('COT-E') || codigo.startsWith('COT-T') || codigo.startsWith('TMP-'))) {
                codigo = await getNextCode();
            }
            await conn.query(`
                UPDATE cotizaciones 
                SET codigo = ?, descripcion = ?, id_proveedor_seleccionado = ?, 
                    total_usd = ?, memo_justificativo = ?, estado = 'Pendiente', cedula_elaborador = ?
                WHERE id_cotizacion = ?
            `, [codigo, descripcion || cotExistente.descripcion, seleccionado.id_proveedor, 
                seleccionado.precio_usd, memo_justificativo, req.user.cedula, cotExistente.id_cotizacion]);
            id_cotizacion = cotExistente.id_cotizacion;
            await conn.query('DELETE FROM cotizacion_detalles WHERE id_cotizacion = ?', [id_cotizacion]);
        } else {
            if (!id_solicitud || !descripcion) {
                await conn.rollback();
                return res.status(400).json({ error: 'Datos incompletos' });
            }
            codigo = await getNextCode();
            id_solicitud_final = id_solicitud;
            const [result] = await conn.query(`
                INSERT INTO cotizaciones (codigo, id_solicitud, descripcion, id_proveedor_seleccionado, total_usd, memo_justificativo, estado, cedula_elaborador)
                VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)
            `, [codigo, id_solicitud, descripcion, seleccionado.id_proveedor, seleccionado.precio_usd, memo_justificativo, req.user.cedula]);
            id_cotizacion = result.insertId;
        }

        for (const d of detalles) {
            await conn.query(`
                INSERT INTO cotizacion_detalles (id_cotizacion, id_proveedor, producto, precio_usd, tiempo_entrega, seleccionado)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id_cotizacion, d.id_proveedor, d.producto, d.precio_usd, d.tiempo_entrega, !!d.seleccionado]);
        }

        await conn.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', ['En Cotización', id_solicitud_final]);
        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELABORAR', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, codigo, `Elaboró cotización ${descripcion || ''}`, req.ip]);

        await conn.commit();
        const [nueva] = await pool.query(`SELECT c.*, s.codigo AS codigo_solicitud FROM cotizaciones c INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud WHERE c.codigo = ?`, [codigo]);
        res.status(200).json({ message: 'Cotización elaborada correctamente', codigo: codigo, cotizacion: nueva[0] });
    } catch (err) {
        await conn.rollback();
        console.error('Error al elaborar cotización:', err);
        res.status(500).json({ error: 'Error al elaborar cotización: ' + err.message });
    } finally {
        conn.release();
    }
}

router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*,
                   s.codigo AS codigo_solicitud,
                   p.codigo AS codigo_proveedor,
                   p.nombre AS nombre_proveedor,
                   u.nombre AS elaborador,
                   ar.decision AS decision_presidente,
                   ar.observaciones AS observaciones_presidente,
                   ar.fecha_decision AS fecha_decision_presidente,
                   ua.nombre AS aprobador_presidente_nombre
            FROM cotizaciones c
            INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            LEFT JOIN proveedores p ON c.id_proveedor_seleccionado = p.id_proveedor
            LEFT JOIN usuarios u ON c.cedula_elaborador = u.cedula
            ${SUBQUERY_APROBACION}
            ORDER BY c.fecha_cotizacion DESC, c.id_cotizacion DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al listar cotizaciones' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                SUM(CASE WHEN estado='En Espera' THEN 1 ELSE 0 END) AS en_espera,
                SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN estado='En Aprobación' THEN 1 ELSE 0 END) AS en_aprobacion,
                SUM(CASE WHEN estado='Aprobada' THEN 1 ELSE 0 END) AS aprobados,
                SUM(CASE WHEN estado='Rechazada' THEN 1 ELSE 0 END) AS rechazadas,
                COUNT(*) AS total
            FROM cotizaciones
        `);
        res.json(stats[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const [cotRows] = await pool.query(`
            SELECT c.*, s.codigo AS codigo_solicitud, s.descripcion AS desc_solicitud,
                   p.codigo AS codigo_proveedor, p.nombre AS nombre_proveedor,
                   u.nombre AS elaborador,
                   ar.decision AS decision_presidente,
                   ar.observaciones AS observaciones_presidente,
                   ar.fecha_decision AS fecha_decision_presidente,
                   ua.nombre AS aprobador_presidente_nombre
            FROM cotizaciones c
            INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            LEFT JOIN proveedores p ON c.id_proveedor_seleccionado = p.id_proveedor
            LEFT JOIN usuarios u ON c.cedula_elaborador = u.cedula
            ${SUBQUERY_APROBACION}
            WHERE c.codigo = ? OR c.id_cotizacion = ?
        `, [req.params.id, req.params.id]);
        
        if (cotRows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        const cot = cotRows[0];
        const [detalles] = await pool.query(`
            SELECT cd.*, p.codigo AS codigo_proveedor, p.nombre AS nombre_proveedor
            FROM cotizacion_detalles cd
            INNER JOIN proveedores p ON cd.id_proveedor = p.id_proveedor
            WHERE cd.id_cotizacion = ?
            ORDER BY cd.id_detalle
        `, [cot.id_cotizacion]);
        cot.detalles = detalles;
        res.json(cot);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener cotización' });
    }
});

router.post('/', requireAction('cotizacion', 'elaborar'), async (req, res) => {
    return elaborarCotizacion(req, res, null);
});
router.post('/:id/elaborar', requireAction('cotizacion', 'elaborar'), async (req, res) => {
    return elaborarCotizacion(req, res, req.params.id);
});
router.put('/:id/elaborar', requireAction('cotizacion', 'elaborar'), async (req, res) => {
    return elaborarCotizacion(req, res, req.params.id);
});

// POST /api/cotizaciones/:id/aprobar - PRE-APROBACIÓN
router.post('/:id/aprobar', requireAction('cotizacion', 'aprobar'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [cotRows] = await conn.query('SELECT * FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [req.params.id, req.params.id]);
        if (cotRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }
        const cot = cotRows[0];
        if (cot.estado !== 'Pendiente') {
            await conn.rollback();
            return res.status(400).json({ error: `No se puede pre-aprobar una cotización en estado "${cot.estado}".` });
        }
        await conn.query('UPDATE cotizaciones SET estado = ? WHERE id_cotizacion = ?', ['En Aprobación', cot.id_cotizacion]);
        await conn.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', ['En Aprobación', cot.id_solicitud]);
        await conn.query(`
            INSERT INTO notificaciones (id_rol_destinatario, tipo, mensaje)
            SELECT id_rol, 'warning', ? FROM roles WHERE nombre = 'Director Regional / Presidente'
        `, [`Cotización ${cot.codigo} requiere su aprobación final en el módulo de Recursos`]);
        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'PRE-APROBAR', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, cot.codigo, `Pre-aprobó cotización y la envió al Presidente`, req.ip]);
        await conn.commit();
        res.json({ message: 'Cotización pre-aprobada. Enviada al Presidente para aprobación final.', estado: 'En Aprobación' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error al pre-aprobar cotización' });
    } finally {
        conn.release();
    }
});

router.post('/:id/rechazar', requireAction('cotizacion', 'aprobar'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { motivo } = req.body;
        const [cotRows] = await conn.query('SELECT * FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [req.params.id, req.params.id]);
        if (cotRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }
        const cot = cotRows[0];
        await conn.query('UPDATE cotizaciones SET estado = ? WHERE id_cotizacion = ?', ['Rechazada', cot.id_cotizacion]);
        await conn.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', ['Rechazado', cot.id_solicitud]);
        await conn.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'RECHAZAR', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, cot.codigo, `Rechazó cotización: ${motivo || 'sin motivo'}`, req.ip]);
        await conn.commit();
        res.json({ message: 'Cotización rechazada' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error al rechazar cotización' });
    } finally {
        conn.release();
    }
});

router.get('/:id/pdf', async (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');

        const [cotRows] = await pool.query(`
            SELECT c.*, s.codigo AS codigo_solicitud, p.nombre AS nombre_proveedor, u.nombre AS elaborador
            FROM cotizaciones c
            INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            LEFT JOIN proveedores p ON c.id_proveedor_seleccionado = p.id_proveedor
            LEFT JOIN usuarios u ON c.cedula_elaborador = u.cedula
            WHERE c.codigo = ? OR c.id_cotizacion = ?
        `, [req.params.id, req.params.id]);
        if (cotRows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        const cot = cotRows[0];
        const [detalles] = await pool.query(`
            SELECT cd.*, p.nombre AS nombre_proveedor FROM cotizacion_detalles cd
            INNER JOIN proveedores p ON cd.id_proveedor = p.id_proveedor WHERE cd.id_cotizacion = ?
        `, [cot.id_cotizacion]);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${cot.codigo}.pdf"`);
        doc.pipe(res);

        // ENCABEZADO con LOGO en esquina superior izquierda
        const headerTop = 50;
        const logoWidth = 95;
        const logoHeight = 50;
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 50, headerTop, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
            } catch (e) {
                console.error('Error cargando logo:', e.message);
            }
        }

        // Texto del encabezado a la derecha del logo
        const textLeft = 50 + logoWidth + 15;
        const textWidth = 595 - 50 - textLeft;
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d47a1');
        doc.text('J&N31 A1 IMPORTACIONES, C.A.', textLeft, headerTop + 4, { width: textWidth, align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#666');
        doc.text('Maturín, Estado Monagas', textLeft, headerTop + 28, { width: textWidth, align: 'center' });
        doc.fontSize(9).fillColor('#888');
        doc.text('RIF: J-40479746-7', textLeft, headerTop + 42, { width: textWidth, align: 'center' });

        // Línea separadora bajo encabezado
        doc.moveTo(50, headerTop + logoHeight + 12).lineTo(545, headerTop + logoHeight + 12).strokeColor('#0d47a1').lineWidth(1.5).stroke();

        // Título principal
        doc.y = headerTop + logoHeight + 22;
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('COTIZACIÓN DE COMPRA', 50, doc.y, { width: 495, align: 'center' });
        doc.moveDown(1.2);

        // INFORMACIÓN GENERAL (2 columnas)
        doc.fontSize(11).fillColor('#000');
        const leftCol = 50, rightCol = 320;
        let y = doc.y;
        doc.font('Helvetica-Bold').text('Código:', leftCol, y).font('Helvetica').text(cot.codigo, leftCol + 80, y);
        doc.font('Helvetica-Bold').text('Fecha:', rightCol, y).font('Helvetica').text(new Date(cot.fecha_cotizacion).toLocaleDateString('es-VE'), rightCol + 80, y);
        y += 18;
        doc.font('Helvetica-Bold').text('Solicitud:', leftCol, y).font('Helvetica').text('#' + cot.codigo_solicitud, leftCol + 80, y);
        doc.font('Helvetica-Bold').text('Estado:', rightCol, y).font('Helvetica').text(cot.estado, rightCol + 80, y);
        y += 18;
        doc.font('Helvetica-Bold').text('Descripción:', leftCol, y);
        doc.font('Helvetica').text(cot.descripcion, leftCol + 80, y, { width: 420 });
        y = doc.y + 4;
        doc.font('Helvetica-Bold').text('Elaborado por:', leftCol, y).font('Helvetica').text(cot.elaborador || '—', leftCol + 80, y);
        y += 25;
        doc.y = y;

        // TÍTULO TABLA
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#0d47a1').text('ANÁLISIS COMPARATIVO DE PROVEEDORES', 50, doc.y, { underline: true });
        doc.moveDown(0.5);

        // TABLA - columnas redistribuidas (total 500px)
        // prov:130 | prod:170 | prec:75 | ent:60 | sel:65
        const tableLeft = 50;
        const tableWidth = 500;
        const cols = {
            prov:  { x: tableLeft + 5,             w: 120 },
            prod:  { x: tableLeft + 5 + 130,       w: 160 },
            prec:  { x: tableLeft + 5 + 130 + 170, w: 65  },
            ent:   { x: tableLeft + 5 + 130 + 170 + 75, w: 50 },
            sel:   { x: tableLeft + 5 + 130 + 170 + 75 + 60, w: 55 }
        };

        // ENCABEZADO TABLA
        const headerHeight = 24;
        let tableTop = doc.y;
        doc.rect(tableLeft, tableTop, tableWidth, headerHeight).fill('#0d47a1');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
        doc.text('Proveedor', cols.prov.x, tableTop + 8, { width: cols.prov.w });
        doc.text('Producto', cols.prod.x, tableTop + 8, { width: cols.prod.w });
        doc.text('Precio (USD)', cols.prec.x, tableTop + 8, { width: cols.prec.w });
        doc.text('Entrega', cols.ent.x, tableTop + 8, { width: cols.ent.w });
        doc.text('Selec.', cols.sel.x, tableTop + 8, { width: cols.sel.w });

        // FILAS - altura dinámica según el texto más largo
        let rowY = tableTop + headerHeight;
        doc.fontSize(10).font('Helvetica').fillColor('#000');

        detalles.forEach((d, i) => {
            // Calcular altura necesaria midiendo cada campo
            const provH = doc.heightOfString(d.nombre_proveedor || '', { width: cols.prov.w });
            const prodH = doc.heightOfString(d.producto || '', { width: cols.prod.w });
            const maxTextH = Math.max(provH, prodH, 12);
            const rowHeight = maxTextH + 12; // padding vertical

            const bg = d.seleccionado ? '#d1fae5' : (i % 2 === 0 ? '#f9fafb' : '#fff');
            doc.rect(tableLeft, rowY, tableWidth, rowHeight).fill(bg);

            doc.fillColor('#000').font('Helvetica');
            doc.text(d.nombre_proveedor || '', cols.prov.x, rowY + 6, { width: cols.prov.w });
            doc.text(d.producto || '', cols.prod.x, rowY + 6, { width: cols.prod.w });
            doc.text('$' + parseFloat(d.precio_usd).toFixed(2), cols.prec.x, rowY + 6, { width: cols.prec.w });
            doc.text(String(d.tiempo_entrega || ''), cols.ent.x, rowY + 6, { width: cols.ent.w });
            if (d.seleccionado) {
                doc.fillColor('#10b981').font('Helvetica-Bold').text('SI', cols.sel.x + 15, rowY + 6);
            }
            rowY += rowHeight;
        });

        // Borde general de la tabla
        doc.rect(tableLeft, tableTop, tableWidth, rowY - tableTop).stroke('#d1d5db');

        // TOTAL SELECCIONADO
        doc.y = rowY + 15;
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#0d47a1');
        doc.text(`TOTAL SELECCIONADO: $${parseFloat(cot.total_usd).toFixed(2)} USD`, tableLeft, doc.y, { width: tableWidth, align: 'right' });

        doc.moveDown(1.5);

        // MEMO JUSTIFICATIVO
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000');
        doc.text('MEMO JUSTIFICATIVO:', tableLeft, doc.y, { width: tableWidth });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#333');
        doc.text(cot.memo_justificativo || 'Sin observaciones.', tableLeft, doc.y, { width: tableWidth, align: 'justify' });

        // PIE
        doc.fontSize(8).font('Helvetica').fillColor('#999').text(
            `Documento generado el ${new Date().toLocaleString('es-VE')} por el Sistema de Gestión J&N31 A1 Importaciones, C.A.`,
            50, doc.page.height - 60, { align: 'center', width: 500 }
        );

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al generar PDF' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM cotizaciones WHERE codigo = ? OR id_cotizacion = ?', [req.params.id, req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELIMINAR', 'cotizaciones', ?, ?, ?)
        `, [req.user.cedula, req.params.id, `Eliminó cotización`, req.ip]);
        res.json({ message: 'Cotización eliminada' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar cotización' });
    }
});

module.exports = router;
