// ============================================================
// SERVIDOR PRINCIPAL - Sistema J&N31 A1 Importaciones, C.A.
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { verifyEmailConnection } = require('./config/email');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// MIDDLEWARES GLOBALES
// ============================================================

// CORS configurable
const corsOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        // Permitir llamadas sin origen (Postman, curl) y orígenes en la lista
        if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
            return cb(null, true);
        }
        // Permisivo en desarrollo
        if (process.env.NODE_ENV !== 'production') return cb(null, true);
        cb(new Error('CORS no permitido para ' + origin));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Carpeta estática para archivos subidos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Servir frontend estático si está en ../frontend
const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
}

// Log de peticiones
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// RUTAS API
// ============================================================
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/usuarios',       require('./routes/usuarios'));
app.use('/api/solicitudes',    require('./routes/solicitudes'));
app.use('/api/cotizaciones',   require('./routes/cotizaciones'));
app.use('/api/recursos',       require('./routes/recursos'));
app.use('/api/proveedores',    require('./routes/proveedores'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/password',       require('./routes/password'));   // ← NUEVO Entrega 3

// Ruta raíz de health check
app.get('/api', (req, res) => {
    res.json({
        nombre: 'API J&N31 A1 Importaciones, C.A.',
        version: '1.1.0',
        descripcion: 'Sistema de Gestión de Recursos Materiales',
        endpoints: [
            'POST   /api/auth/login',
            'POST   /api/auth/logout',
            'GET    /api/auth/me',
            'GET    /api/usuarios',
            'POST   /api/usuarios',
            'PUT    /api/usuarios/:cedula',
            'DELETE /api/usuarios/:cedula',
            'GET    /api/solicitudes',
            'POST   /api/solicitudes',
            'PUT    /api/solicitudes/:id',
            'DELETE /api/solicitudes/:id',
            'GET    /api/cotizaciones',
            'POST   /api/cotizaciones',
            'POST   /api/cotizaciones/:id/aprobar',
            'GET    /api/cotizaciones/:id/pdf',
            'GET    /api/recursos',
            'POST   /api/recursos/:id/aprobar',
            'POST   /api/recursos/:id/rechazar',
            'GET    /api/proveedores',
            'POST   /api/proveedores',
            'PUT    /api/proveedores/:id',
            'GET    /api/notificaciones',
            'POST   /api/password/cambiar-primer-login',
            'POST   /api/password/solicitar-recuperacion',
            'POST   /api/password/verificar-codigo',
            'POST   /api/password/cambiar-con-codigo'
        ]
    });
});

// Ruta para servir el frontend (SPA fallback)
app.get('*', (req, res) => {
    const indexPath = path.join(frontendDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Recurso no encontrado' });
    }
});

// Manejador de errores global
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Archivo demasiado grande' });
    }
    res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
(async () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SISTEMA DE GESTIÓN DE RECURSOS MATERIALES');
    console.log('  J&N31 A1 IMPORTACIONES, C.A. - Maturín, Estado Monagas');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    const ok = await testConnection();
    if (!ok) {
        console.error('✗ No se pudo conectar a MySQL. Revisa el archivo .env y que XAMPP esté activo.');
        process.exit(1);
    }

    app.listen(PORT, async () => {
        console.log(`✓ Servidor API corriendo en: http://localhost:${PORT}`);
        console.log(`✓ Documentación básica en:   http://localhost:${PORT}/api`);
        console.log(`✓ Frontend (si existe) en:   http://localhost:${PORT}/`);
        // Verificar conexión Gmail SMTP
        await verifyEmailConnection();
        console.log('');
        console.log('Presiona Ctrl+C para detener el servidor.');
        console.log('');
    });
})();
