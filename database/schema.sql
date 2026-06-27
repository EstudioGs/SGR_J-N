-- ============================================================
-- SISTEMA DE INFORMACIÓN PARA LA GESTIÓN DE RECURSOS MATERIALES
-- J&N31 A1 IMPORTACIONES, C.A. - MATURÍN, ESTADO MONAGAS
-- ============================================================
-- Base de datos: MySQL 5.7+ / 8.0+
-- Motor: InnoDB (soporta transacciones y claves foráneas)
-- Codificación: UTF-8
-- ============================================================

DROP DATABASE IF EXISTS jn31_importaciones;
CREATE DATABASE jn31_importaciones CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jn31_importaciones;

-- ============================================================
-- TABLA: roles
-- ============================================================
CREATE TABLE roles (
    id_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: usuarios
-- ============================================================
CREATE TABLE usuarios (
    cedula VARCHAR(15) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    usuario VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    id_rol INT NOT NULL,
    estado ENUM('Activo','Inactivo') DEFAULT 'Activo',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON UPDATE CASCADE,
    INDEX idx_usuario (usuario),
    INDEX idx_estado (estado)
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: proveedores
-- ============================================================
CREATE TABLE proveedores (
    id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    contacto_principal VARCHAR(100),
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion VARCHAR(255),
    fecha_registro DATE DEFAULT (CURRENT_DATE),
    activo BOOLEAN DEFAULT TRUE,
    INDEX idx_nombre (nombre)
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: solicitudes
-- ============================================================
CREATE TABLE solicitudes (
    id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NOT NULL,
    memo_justificativo TEXT,
    cedula_solicitante VARCHAR(15) NOT NULL,
    estado ENUM('Pendiente','En Cotización','En Aprobación','Aprobado','Rechazado') DEFAULT 'Pendiente',
    archivo_adjunto VARCHAR(255),
    fecha_solicitud DATE NOT NULL DEFAULT (CURRENT_DATE),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cedula_solicitante) REFERENCES usuarios(cedula) ON UPDATE CASCADE,
    INDEX idx_estado (estado),
    INDEX idx_fecha (fecha_solicitud)
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: cotizaciones
-- ============================================================
CREATE TABLE cotizaciones (
    id_cotizacion INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(15) NOT NULL UNIQUE,
    id_solicitud INT NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    id_proveedor_seleccionado INT,
    total_usd DECIMAL(12,2) DEFAULT 0.00,
    memo_justificativo TEXT,
    archivo_adjunto VARCHAR(255),
    estado ENUM('Pendiente','En Proceso','Aprobada','Rechazada') DEFAULT 'Pendiente',
    cedula_elaborador VARCHAR(15),
    fecha_cotizacion DATE NOT NULL DEFAULT (CURRENT_DATE),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_solicitud) REFERENCES solicitudes(id_solicitud) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (id_proveedor_seleccionado) REFERENCES proveedores(id_proveedor) ON UPDATE CASCADE,
    FOREIGN KEY (cedula_elaborador) REFERENCES usuarios(cedula) ON UPDATE CASCADE,
    INDEX idx_estado (estado)
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: cotizacion_detalles
-- ============================================================
CREATE TABLE cotizacion_detalles (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_cotizacion INT NOT NULL,
    id_proveedor INT NOT NULL,
    producto VARCHAR(150) NOT NULL,
    precio_usd DECIMAL(12,2) NOT NULL,
    tiempo_entrega VARCHAR(50),
    seleccionado BOOLEAN DEFAULT FALSE,
    observaciones VARCHAR(255),
    FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones(id_cotizacion) ON DELETE CASCADE,
    FOREIGN KEY (id_proveedor) REFERENCES proveedores(id_proveedor) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: aprobaciones_recursos
-- ============================================================
CREATE TABLE aprobaciones_recursos (
    id_aprobacion INT AUTO_INCREMENT PRIMARY KEY,
    id_cotizacion INT NOT NULL,
    cedula_aprobador VARCHAR(15) NOT NULL,
    decision ENUM('Aprobada','Rechazada') NOT NULL,
    observaciones TEXT,
    fecha_decision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones(id_cotizacion) ON UPDATE CASCADE,
    FOREIGN KEY (cedula_aprobador) REFERENCES usuarios(cedula) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: notificaciones
-- ============================================================
CREATE TABLE notificaciones (
    id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
    cedula_destinatario VARCHAR(15),
    id_rol_destinatario INT,
    tipo ENUM('info','success','warning','danger') DEFAULT 'info',
    mensaje VARCHAR(500) NOT NULL,
    leida BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cedula_destinatario) REFERENCES usuarios(cedula) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (id_rol_destinatario) REFERENCES roles(id_rol) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLA: auditoria
-- ============================================================
CREATE TABLE auditoria (
    id_log INT AUTO_INCREMENT PRIMARY KEY,
    cedula_usuario VARCHAR(15),
    accion VARCHAR(50) NOT NULL,
    tabla_afectada VARCHAR(50),
    id_registro VARCHAR(50),
    detalles TEXT,
    ip_origen VARCHAR(45),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cedula_usuario) REFERENCES usuarios(cedula) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB;

-- ============================================================
-- DATOS INICIALES: ROLES
-- ============================================================
INSERT INTO roles (nombre, descripcion) VALUES
('SuperUsuario',                    'Administrador con acceso a todos los módulos excepto Aprobación de Recursos y Elaborar Cotización'),
('Gerente de Proyectos',            'Acceso a Solicitudes, Cotización y Proveedores'),
('Director Regional / Presidente',  'Acceso exclusivo a Aprobación de Recursos y elaborar solicitudes'),
('Gerente de Operaciones',          'Acceso completo al módulo de Solicitudes'),
('Especialista de Compra',          'Similar a Gerente de Proyectos'),
('Personal Designado',              'Solo elaborar solicitudes');

-- ============================================================
-- DATOS INICIALES: USUARIOS
-- Contraseña para todos: "1234"
-- El backend genera hashes bcrypt reales al primer arranque
-- ============================================================
INSERT INTO usuarios (cedula, nombre, nombre_completo, usuario, password_hash, telefono, id_rol, estado) VALUES
('15238946', 'Nailet Rodriguez',  'Nailet Alejandra Rodriguez Pérez',  'nairodriguez@gmail.com', 'PLACEHOLDER',  '04122135389', 2, 'Activo'),
('16389467', 'Ana López',         'Ana María López García',            'alopez12@gmail.com',     'PLACEHOLDER',  '04141234567', 5, 'Activo'),
('20543274', 'José Pérez',        'José Antonio Pérez Rojas',          'perezjose@gmail.com',    'PLACEHOLDER',  '04129876543', 4, 'Activo'),
('22648953', 'Alejandro Gómez',   'Alejandro Rafael Gómez Silva',      'agomez@gmail.com',       'PLACEHOLDER',  '04247654321', 1, 'Activo'),
('13746395', 'Armando Hernández', 'Armando José Hernández Castro',     'armandohz@gmail.com',    'PLACEHOLDER',  '04141112233', 3, 'Activo'),
('19737548', 'Anabel Rondón',     'Anabel Carolina Rondón Martínez',   'ana.rondon@gmail.com',   'PLACEHOLDER',  '04125556677', 6, 'Activo');

-- ============================================================
-- DATOS INICIALES: PROVEEDORES
-- ============================================================
INSERT INTO proveedores (codigo, nombre, contacto_principal, telefono, email, fecha_registro) VALUES
('0065', 'TecnoCom',        'Alberto García', '04128943559', 'contacto@tecnocom.com',        '2026-04-09'),
('0066', 'FerreMundo',      'Juan Pérez',     '04128474480', 'ventas@ferremundo.com',        '2026-04-07'),
('0067', 'MultiService GVA','Manuel Gómez',   '04142694754', 'info@multiservicegva.com',     '2026-04-02'),
('0068', 'PetroService',    'Maria Gúzman',   '04224568793', 'petroservice@correo.com',      '2026-03-24');

-- ============================================================
-- DATOS INICIALES: SOLICITUDES
-- ============================================================
INSERT INTO solicitudes (codigo, descripcion, memo_justificativo, cedula_solicitante, estado, fecha_solicitud) VALUES
('00231', 'Impresora',        'Se requiere la compra de la impresora láser para la área administrativa. Esto permite mejorar la eficiencia y productividad del equipo de trabajo.', '15238946', 'Pendiente',     '2026-04-09'),
('00232', 'Proyector',        'Proyector para sala de reuniones, necesario para presentaciones con clientes.',                                                                    '16389467', 'Pendiente',     '2026-04-07'),
('00233', 'Gasoil',           'Combustible para la flota operativa de la empresa, suministro mensual.',                                                                          '20543274', 'En Cotización', '2026-04-02'),
('00234', 'Nitrógeno',        'Nitrógeno líquido para operaciones de laboratorio y mantenimiento.',                                                                              '20543274', 'En Cotización', '2026-03-24'),
('00235', 'Bomba de agua',    'Reemplazo de bomba de agua en planta, equipo actual presenta fallas.',                                                                            '13746395', 'En Aprobación', '2026-03-17'),
('00236', 'Planta eléctrica', 'Planta eléctrica de respaldo para garantizar continuidad operativa.',                                                                             '19737548', 'Aprobado',      '2026-02-14');

-- ============================================================
-- DATOS INICIALES: COTIZACIONES
-- ============================================================
INSERT INTO cotizaciones (codigo, id_solicitud, descripcion, id_proveedor_seleccionado, total_usd, memo_justificativo, estado, cedula_elaborador, fecha_cotizacion) VALUES
('COT-00031', 1, 'Impresoras Láser',     2, 450.00,   'Se selecciona el proveedor por mejor relación costo-beneficio y cumplimiento de tiempos.', 'Pendiente', '15238946', '2026-04-09'),
('COT-00032', 2, 'Proyector Oficina',    1, 220.00,   'Se selecciona por mejor precio manteniendo calidad.',                                       'Pendiente', '15238946', '2026-04-07'),
('COT-00033', 3, 'Gasoil',               1, 10000.00, 'Se selecciona por mejor precio y entrega inmediata.',                                       'En Proceso','15238946', '2026-04-02'),
('COT-00034', 4, 'Nitrógeno Líquido',    3, 7200.00,  'Se selecciona por mejor precio y menor tiempo de entrega.',                                 'En Proceso','16389467', '2026-03-24'),
('COT-00035', 5, 'Bomba de agua',        2, 310.00,   'Se selecciona por menor costo y rápida entrega.',                                           'Aprobada',  '16389467', '2026-03-17'),
('COT-00036', 6, 'Planta eléctrica',     1, 1225.00,  'Se selecciona por precio competitivo con garantía extendida.',                              'Aprobada',  '15238946', '2026-02-14');

-- ============================================================
-- DATOS INICIALES: DETALLES DE COTIZACIÓN
-- ============================================================
INSERT INTO cotizacion_detalles (id_cotizacion, id_proveedor, producto, precio_usd, tiempo_entrega, seleccionado) VALUES
(1, 1, 'Impresora Láser', 470.00, '3 días', FALSE),
(1, 2, 'Impresora Láser', 450.00, '2 días', TRUE),
(1, 3, 'Impresora Láser', 550.00, '5 días', FALSE),
(2, 1, 'Proyector Oficina', 220.00, '4 días', TRUE),
(2, 2, 'Proyector Oficina', 250.00, '3 días', FALSE),
(2, 3, 'Proyector Oficina', 280.00, '5 días', FALSE),
(3, 1, 'Gasoil 5000L', 10000.00, '1 día', TRUE),
(3, 2, 'Gasoil 5000L', 10500.00, '2 días', FALSE),
(3, 3, 'Gasoil 5000L', 11000.00, '1 día', FALSE),
(4, 1, 'N2 Líquido', 7500.00, '5 días', FALSE),
(4, 2, 'N2 Líquido', 7400.00, '4 días', FALSE),
(4, 3, 'N2 Líquido', 7200.00, '3 días', TRUE),
(5, 1, 'Bomba 2HP', 340.00, '3 días', FALSE),
(5, 2, 'Bomba 2HP', 310.00, '2 días', TRUE),
(5, 3, 'Bomba 2HP', 360.00, '4 días', FALSE),
(6, 1, 'Planta 15KW', 1225.00, '7 días', TRUE),
(6, 2, 'Planta 15KW', 1300.00, '5 días', FALSE),
(6, 3, 'Planta 15KW', 1400.00, '6 días', FALSE);

-- ============================================================
-- VISTAS: consultas frecuentes
-- ============================================================
CREATE OR REPLACE VIEW vw_solicitudes_detalle AS
SELECT 
    s.id_solicitud, s.codigo, s.descripcion, s.memo_justificativo,
    s.estado, s.fecha_solicitud, s.archivo_adjunto,
    u.cedula AS cedula_solicitante,
    u.nombre AS solicitante,
    u.nombre_completo AS solicitante_completo,
    r.nombre AS rol_solicitante
FROM solicitudes s
INNER JOIN usuarios u ON s.cedula_solicitante = u.cedula
INNER JOIN roles r ON u.id_rol = r.id_rol;

CREATE OR REPLACE VIEW vw_cotizaciones_detalle AS
SELECT 
    c.id_cotizacion, c.codigo, c.descripcion, c.total_usd,
    c.memo_justificativo, c.estado, c.fecha_cotizacion, c.archivo_adjunto,
    s.codigo AS codigo_solicitud,
    s.descripcion AS desc_solicitud,
    p.codigo AS codigo_proveedor,
    p.nombre AS proveedor_seleccionado,
    u.nombre AS elaborador
FROM cotizaciones c
INNER JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
LEFT JOIN proveedores p ON c.id_proveedor_seleccionado = p.id_proveedor
LEFT JOIN usuarios u ON c.cedula_elaborador = u.cedula;

CREATE OR REPLACE VIEW vw_usuarios_detalle AS
SELECT 
    u.cedula, u.nombre, u.nombre_completo, u.usuario,
    u.telefono, u.estado, r.id_rol, r.nombre AS rol, u.fecha_creacion
FROM usuarios u
INNER JOIN roles r ON u.id_rol = r.id_rol;

SELECT '✓ Base de datos jn31_importaciones creada exitosamente' AS mensaje;
