// ============================================================
// MIDDLEWARE: Autenticación JWT y Control de Acceso por Rol v2
// ============================================================
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'jn31_secret_default';

// ============================================================
// MATRIZ DE PERMISOS v2
// Cambios desde v1:
//   - "Gerente de Operaciones" → "Gerente de Área"
//   - Personal Designado: NO ve stats de inicio (solo sus solicitudes)
//   - Proveedores: Gerente Proyectos y Especialista Compra pueden agregar
//   - Solicitudes: nueva acción "aprobar" para flujo de revisión
// ============================================================
const ACCESS = {
    inicio: {
        'SuperUsuario':                    { access: true, actions: ['ver_stats'] },
        'Gerente de Proyectos':            { access: true, actions: ['ver_stats'] },
        'Director Regional / Presidente':  { access: true, actions: ['ver_stats'] },
        'Gerente de Área':                 { access: true, actions: ['ver_stats'] },
        'Especialista de Compra':          { access: true, actions: ['ver_stats'] },
        'Personal Designado':              { access: true, actions: [] }, // sin ver_stats
    },
    usuarios: {
        'SuperUsuario': { access: true, actions: ['listar','agregar','ver','editar','eliminar'] },
    },
    solicitudes: {
        'SuperUsuario':                    { access: true, actions: ['listar','agregar','ver','editar','eliminar','aprobar','rechazar'] },
        'Gerente de Proyectos':            { access: true, actions: ['listar','agregar','ver','editar','eliminar','aprobar','rechazar'] },
        'Director Regional / Presidente':  { access: true, actions: ['agregar'] },
        'Gerente de Área':                 { access: true, actions: ['listar','agregar','ver','editar','eliminar','aprobar','rechazar'] },
        'Especialista de Compra':          { access: true, actions: ['listar','agregar','ver','editar','eliminar','aprobar','rechazar'] },
        'Personal Designado':              { access: true, actions: ['agregar','ver_propias'] },
    },
    cotizacion: {
        'SuperUsuario':                    { access: true, actions: ['listar','ver','aprobar'] },
        'Gerente de Proyectos':            { access: true, actions: ['listar','elaborar','ver','aprobar'] },
        'Especialista de Compra':          { access: true, actions: ['listar','elaborar','ver','aprobar'] },
    },
    recursos: {
        'Director Regional / Presidente':  { access: true, actions: ['listar','ver','aprobar','rechazar'] },
    },
    proveedores: {
        'SuperUsuario':                    { access: true, actions: ['listar','ver'] },
        'Gerente de Proyectos':            { access: true, actions: ['listar','ver','agregar','editar'] },
        'Especialista de Compra':          { access: true, actions: ['listar','ver','agregar','editar'] },
    },
};

function hasAccess(rol, modulo) {
    return !!(ACCESS[modulo] && ACCESS[modulo][rol] && ACCESS[modulo][rol].access);
}

function canDo(rol, modulo, action) {
    const m = ACCESS[modulo] && ACCESS[modulo][rol];
    if (!m || !m.access) return false;
    if (!m.actions) return true;
    return m.actions.includes(action);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token de acceso requerido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
        req.user = user;
        next();
    });
}

function requireModule(modulo) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (!hasAccess(req.user.rol, modulo)) {
            return res.status(403).json({ error: `Acceso denegado al módulo: ${modulo}`, rol: req.user.rol });
        }
        next();
    };
}

function requireAction(modulo, action) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (!canDo(req.user.rol, modulo, action)) {
            return res.status(403).json({ error: `Su rol no tiene permiso para: ${action} en ${modulo}`, rol: req.user.rol });
        }
        next();
    };
}

function generateToken(user) {
    return jwt.sign(
        { cedula: user.cedula, usuario: user.usuario, rol: user.rol, nombre: user.nombre, nombreCompleto: user.nombre_completo },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRATION || '8h' }
    );
}

module.exports = { ACCESS, hasAccess, canDo, authenticateToken, requireModule, requireAction, generateToken };
