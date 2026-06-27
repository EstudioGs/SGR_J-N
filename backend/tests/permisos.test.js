// ============================================================
// PRUEBAS UNITARIAS: Control de Acceso por Rol (RBAC)
// Verifica que la matriz de permisos funcione correctamente
// para cada uno de los 6 roles del sistema
// ============================================================

const { hasAccess, canDo } = require('../middleware/auth');

describe('Pruebas Unitarias - Control de Acceso por Rol (RBAC)', () => {

    // ----------------------------------------------------------------
    // GRUPO 1: Acceso al módulo de Aprobación de Recursos
    // (Solo el Director Regional / Presidente debe tener acceso)
    // ----------------------------------------------------------------
    describe('PRU-003: Módulo de Aprobación de Recursos (exclusivo del Presidente)', () => {

        test('PRU-003.1 - El Presidente SÍ tiene acceso al módulo Recursos', () => {
            expect(hasAccess('Director Regional / Presidente', 'recursos')).toBe(true);
        });

        test('PRU-003.2 - SuperUsuario NO tiene acceso al módulo Recursos', () => {
            expect(hasAccess('SuperUsuario', 'recursos')).toBe(false);
        });

        test('PRU-003.3 - Gerente de Proyectos NO tiene acceso al módulo Recursos', () => {
            expect(hasAccess('Gerente de Proyectos', 'recursos')).toBe(false);
        });

        test('PRU-003.4 - Personal Designado NO tiene acceso al módulo Recursos', () => {
            expect(hasAccess('Personal Designado', 'recursos')).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 2: Aprobación de solicitudes (flujo nuevo v2)
    // ----------------------------------------------------------------
    describe('PRU-004: Permiso para aprobar solicitudes', () => {

        test('PRU-004.1 - SuperUsuario PUEDE aprobar solicitudes', () => {
            expect(canDo('SuperUsuario', 'solicitudes', 'aprobar')).toBe(true);
        });

        test('PRU-004.2 - Gerente de Proyectos PUEDE aprobar solicitudes', () => {
            expect(canDo('Gerente de Proyectos', 'solicitudes', 'aprobar')).toBe(true);
        });

        test('PRU-004.3 - Gerente de Área PUEDE aprobar solicitudes', () => {
            expect(canDo('Gerente de Área', 'solicitudes', 'aprobar')).toBe(true);
        });

        test('PRU-004.4 - Especialista de Compra PUEDE aprobar solicitudes', () => {
            expect(canDo('Especialista de Compra', 'solicitudes', 'aprobar')).toBe(true);
        });

        test('PRU-004.5 - Personal Designado NO puede aprobar solicitudes', () => {
            expect(canDo('Personal Designado', 'solicitudes', 'aprobar')).toBe(false);
        });

        test('PRU-004.6 - Director Regional / Presidente NO puede aprobar solicitudes', () => {
            // El Presidente solo aprueba RECURSOS, no solicitudes
            expect(canDo('Director Regional / Presidente', 'solicitudes', 'aprobar')).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 3: Gestión de Usuarios (solo SuperUsuario)
    // ----------------------------------------------------------------
    describe('PRU-005: Gestión exclusiva de Usuarios por SuperUsuario', () => {

        test('PRU-005.1 - SuperUsuario PUEDE gestionar usuarios', () => {
            expect(hasAccess('SuperUsuario', 'usuarios')).toBe(true);
        });

        test('PRU-005.2 - Gerente de Proyectos NO puede gestionar usuarios', () => {
            expect(hasAccess('Gerente de Proyectos', 'usuarios')).toBe(false);
        });

        test('PRU-005.3 - Personal Designado NO puede gestionar usuarios', () => {
            expect(hasAccess('Personal Designado', 'usuarios')).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 4: Agregar nuevos proveedores
    // ----------------------------------------------------------------
    describe('PRU-006: Permiso para agregar proveedores', () => {

        test('PRU-006.1 - Gerente de Proyectos PUEDE agregar proveedores', () => {
            expect(canDo('Gerente de Proyectos', 'proveedores', 'agregar')).toBe(true);
        });

        test('PRU-006.2 - Especialista de Compra PUEDE agregar proveedores', () => {
            expect(canDo('Especialista de Compra', 'proveedores', 'agregar')).toBe(true);
        });

        test('PRU-006.3 - SuperUsuario NO puede agregar proveedores (solo ver)', () => {
            // El SuperUsuario administra el sistema pero no opera el negocio
            expect(canDo('SuperUsuario', 'proveedores', 'agregar')).toBe(false);
        });

        test('PRU-006.4 - Personal Designado NO puede agregar proveedores', () => {
            expect(canDo('Personal Designado', 'proveedores', 'agregar')).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 5: Vista del Inicio (stats vs. mis solicitudes)
    // ----------------------------------------------------------------
    describe('PRU-007: Vista de estadísticas en el Inicio', () => {

        test('PRU-007.1 - SuperUsuario puede ver estadísticas en el inicio', () => {
            expect(canDo('SuperUsuario', 'inicio', 'ver_stats')).toBe(true);
        });

        test('PRU-007.2 - Gerente de Área puede ver estadísticas', () => {
            expect(canDo('Gerente de Área', 'inicio', 'ver_stats')).toBe(true);
        });

        test('PRU-007.3 - Personal Designado NO puede ver estadísticas (solo sus propias solicitudes)', () => {
            expect(canDo('Personal Designado', 'inicio', 'ver_stats')).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 6: Elaborar Cotizaciones
    // ----------------------------------------------------------------
    describe('PRU-008: Permiso para elaborar cotizaciones', () => {

        test('PRU-008.1 - Gerente de Proyectos PUEDE elaborar cotizaciones', () => {
            expect(canDo('Gerente de Proyectos', 'cotizacion', 'elaborar')).toBe(true);
        });

        test('PRU-008.2 - Especialista de Compra PUEDE elaborar cotizaciones', () => {
            expect(canDo('Especialista de Compra', 'cotizacion', 'elaborar')).toBe(true);
        });

        test('PRU-008.3 - SuperUsuario NO puede elaborar cotizaciones (separación de funciones)', () => {
            expect(canDo('SuperUsuario', 'cotizacion', 'elaborar')).toBe(false);
        });

        test('PRU-008.4 - Personal Designado NO puede elaborar cotizaciones', () => {
            expect(canDo('Personal Designado', 'cotizacion', 'elaborar')).toBe(false);
        });
    });
});
