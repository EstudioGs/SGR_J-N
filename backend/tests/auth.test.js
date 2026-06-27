// ============================================================
// PRUEBAS UNITARIAS: Autenticación y seguridad
// Verifica que las contraseñas se encriptan correctamente con bcrypt
// y que los tokens JWT funcionan como se espera
// ============================================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Secreto de prueba (no usar el de producción)
const JWT_SECRET = 'jn31_test_secret';

describe('Pruebas Unitarias - Autenticación y Seguridad', () => {

    // ----------------------------------------------------------------
    // GRUPO 1: Encriptación de contraseñas con bcrypt
    // ----------------------------------------------------------------
    describe('PRU-001: Encriptación de contraseñas', () => {

        test('PRU-001.1 - La contraseña debe encriptarse y NO guardarse en texto plano', async () => {
            // ARRANGE - preparar
            const passwordOriginal = '1234';
            
            // ACT - actuar
            const hash = await bcrypt.hash(passwordOriginal, 10);
            
            // ASSERT - verificar
            expect(hash).not.toBe(passwordOriginal);          // No debe ser igual al original
            expect(hash.length).toBeGreaterThan(50);          // Los hashes bcrypt son largos
            expect(hash).toMatch(/^\$2[aby]\$/);              // Debe comenzar con prefijo bcrypt
        });

        test('PRU-001.2 - La contraseña correcta debe validarse exitosamente', async () => {
            // ARRANGE
            const passwordOriginal = 'miContrasena123';
            const hash = await bcrypt.hash(passwordOriginal, 10);
            
            // ACT
            const esValida = await bcrypt.compare(passwordOriginal, hash);
            
            // ASSERT
            expect(esValida).toBe(true);
        });

        test('PRU-001.3 - La contraseña incorrecta debe rechazarse', async () => {
            // ARRANGE
            const passwordOriginal = '1234';
            const passwordIncorrecta = 'incorrecta';
            const hash = await bcrypt.hash(passwordOriginal, 10);
            
            // ACT
            const esValida = await bcrypt.compare(passwordIncorrecta, hash);
            
            // ASSERT
            expect(esValida).toBe(false);
        });

        test('PRU-001.4 - El mismo password debe generar hashes DIFERENTES (salt aleatorio)', async () => {
            // ARRANGE
            const password = '1234';
            
            // ACT
            const hash1 = await bcrypt.hash(password, 10);
            const hash2 = await bcrypt.hash(password, 10);
            
            // ASSERT - Los hashes deben ser diferentes pero ambos válidos
            expect(hash1).not.toBe(hash2);
            expect(await bcrypt.compare(password, hash1)).toBe(true);
            expect(await bcrypt.compare(password, hash2)).toBe(true);
        });
    });

    // ----------------------------------------------------------------
    // GRUPO 2: Tokens JWT
    // ----------------------------------------------------------------
    describe('PRU-002: Generación y validación de tokens JWT', () => {

        test('PRU-002.1 - Debe generar un token JWT válido', () => {
            // ARRANGE
            const userData = { 
                cedula: '22648953', 
                usuario: 'agomez@gmail.com', 
                rol: 'SuperUsuario' 
            };
            
            // ACT
            const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
            
            // ASSERT
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT tiene 3 partes separadas por puntos
        });

        test('PRU-002.2 - Token válido debe poder decodificarse correctamente', () => {
            // ARRANGE
            const userData = { 
                cedula: '15238946', 
                usuario: 'nairodriguez@gmail.com', 
                rol: 'Gerente de Proyectos' 
            };
            const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
            
            // ACT
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // ASSERT
            expect(decoded.cedula).toBe(userData.cedula);
            expect(decoded.usuario).toBe(userData.usuario);
            expect(decoded.rol).toBe(userData.rol);
        });

        test('PRU-002.3 - Token con secreto incorrecto debe rechazarse', () => {
            // ARRANGE
            const token = jwt.sign({ cedula: '12345678' }, JWT_SECRET);
            
            // ACT & ASSERT - debe lanzar error
            expect(() => {
                jwt.verify(token, 'secreto_incorrecto');
            }).toThrow();
        });

        test('PRU-002.4 - Token expirado debe rechazarse', () => {
            // ARRANGE - token que expira inmediatamente
            const token = jwt.sign({ cedula: '12345678' }, JWT_SECRET, { expiresIn: '-1s' });
            
            // ACT & ASSERT
            expect(() => {
                jwt.verify(token, JWT_SECRET);
            }).toThrow(/expired/);
        });
    });
});
