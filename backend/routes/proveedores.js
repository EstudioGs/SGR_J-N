// ============================================================
// RUTAS: Proveedores v2 - con campos extendidos
// ============================================================
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken, requireModule, requireAction } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireModule('proveedores'));

// Generar siguiente código de proveedor
async function getNextCode() {
    const [rows] = await pool.query('SELECT MAX(CAST(codigo AS UNSIGNED)) AS max FROM proveedores');
    const next = (rows[0].max || 64) + 1;
    return String(next).padStart(4, '0');
}

// GET /api/proveedores
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM proveedores WHERE activo = TRUE ORDER BY codigo');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al listar proveedores' });
    }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM proveedores WHERE codigo = ? OR id_proveedor = ?', [req.params.id, req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener proveedor' });
    }
});

// POST /api/proveedores
router.post('/', requireAction('proveedores', 'agregar'), async (req, res) => {
    try {
        const { nombre, rif, contacto_principal, telefono, email, direccion, categoria, notas } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

        // Generar código automáticamente si no se proporciona
        const codigo = req.body.codigo || await getNextCode();

        const [result] = await pool.query(`
            INSERT INTO proveedores (codigo, nombre, rif, contacto_principal, telefono, email, direccion, categoria, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [codigo, nombre, rif || null, contacto_principal || null, telefono || null, email || null, direccion || null, categoria || null, notas || null]);

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'CREAR', 'proveedores', ?, ?, ?)
        `, [req.user.cedula, codigo, `Agregó proveedor ${nombre}`, req.ip]);

        const [nuevo] = await pool.query('SELECT * FROM proveedores WHERE id_proveedor = ?', [result.insertId]);
        res.status(201).json(nuevo[0]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El código de proveedor ya existe' });
        console.error(err);
        res.status(500).json({ error: 'Error al crear proveedor' });
    }
});

// PUT /api/proveedores/:id
router.put('/:id', requireAction('proveedores', 'editar'), async (req, res) => {
    try {
        const { nombre, rif, contacto_principal, telefono, email, direccion, categoria, notas } = req.body;
        const [result] = await pool.query(`
            UPDATE proveedores SET nombre=?, rif=?, contacto_principal=?, telefono=?, email=?, direccion=?, categoria=?, notas=?
            WHERE codigo=? OR id_proveedor=?
        `, [nombre, rif, contacto_principal, telefono, email, direccion, categoria, notas, req.params.id, req.params.id]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'EDITAR', 'proveedores', ?, ?, ?)
        `, [req.user.cedula, req.params.id, `Editó proveedor`, req.ip]);

        const [upd] = await pool.query('SELECT * FROM proveedores WHERE codigo = ? OR id_proveedor = ?', [req.params.id, req.params.id]);
        res.json(upd[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar proveedor' });
    }
});

// DELETE /api/proveedores/:id (borrado lógico)
router.delete('/:id', requireAction('proveedores', 'editar'), async (req, res) => {
    try {
        const [result] = await pool.query('UPDATE proveedores SET activo = FALSE WHERE codigo = ? OR id_proveedor = ?', [req.params.id, req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

        await pool.query(`
            INSERT INTO auditoria (cedula_usuario, accion, tabla_afectada, id_registro, detalles, ip_origen)
            VALUES (?, 'ELIMINAR', 'proveedores', ?, ?, ?)
        `, [req.user.cedula, req.params.id, `Desactivó proveedor`, req.ip]);

        res.json({ message: 'Proveedor desactivado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar proveedor' });
    }
});

module.exports = router;
