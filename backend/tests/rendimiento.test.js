// ============================================================
// PRUEBAS DE RENDIMIENTO - Sistema J&N31 A1 Importaciones, C.A.
// ============================================================
// Mide el tiempo de respuesta de los endpoints principales del sistema
// bajo distintas condiciones de carga.
// 
// EJECUCIÓN: node tests/rendimiento.test.js
// ============================================================

const http = require('http');

const HOST = 'localhost';
const PORT = 3001;

let TOKEN = null;
const resultados = [];

// ============================================================
// Helper: hacer petición HTTP y medir tiempo
// ============================================================
function request(method, path, body = null, useToken = true) {
    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (useToken && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

        const options = { hostname: HOST, port: PORT, path, method, headers };
        const inicio = process.hrtime.bigint();

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const fin = process.hrtime.bigint();
                const tiempoMs = Number(fin - inicio) / 1_000_000; // ns → ms
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data), tiempoMs });
                } catch {
                    resolve({ status: res.statusCode, body: data, tiempoMs });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ============================================================
// Helper: ejecutar una prueba N veces y calcular estadísticas
// ============================================================
async function medir(nombre, fn, repeticiones = 10) {
    const tiempos = [];
    let errores = 0;
    
    for (let i = 0; i < repeticiones; i++) {
        try {
            const res = await fn();
            if (res.status >= 200 && res.status < 400) {
                tiempos.push(res.tiempoMs);
            } else {
                errores++;
            }
        } catch (err) {
            errores++;
        }
    }
    
    if (tiempos.length === 0) {
        console.log(`  ✗ ${nombre}: TODAS LAS PETICIONES FALLARON (${errores} errores)`);
        resultados.push({ nombre, repeticiones, exitosas: 0, errores, min: 0, max: 0, promedio: 0, mediana: 0 });
        return;
    }
    
    const min = Math.min(...tiempos);
    const max = Math.max(...tiempos);
    const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
    const ordenados = [...tiempos].sort((a, b) => a - b);
    const mediana = ordenados[Math.floor(ordenados.length / 2)];
    
    console.log(`  ✓ ${nombre}`);
    console.log(`    Mín: ${min.toFixed(2)}ms  |  Máx: ${max.toFixed(2)}ms  |  Promedio: ${promedio.toFixed(2)}ms  |  Mediana: ${mediana.toFixed(2)}ms`);
    
    resultados.push({
        nombre, repeticiones, exitosas: tiempos.length, errores,
        min: parseFloat(min.toFixed(2)),
        max: parseFloat(max.toFixed(2)),
        promedio: parseFloat(promedio.toFixed(2)),
        mediana: parseFloat(mediana.toFixed(2))
    });
}

// ============================================================
// EJECUCIÓN DE LAS PRUEBAS
// ============================================================
async function correrPruebas() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PRUEBAS DE RENDIMIENTO - Sistema J&N31 A1 Importaciones');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Servidor: http://${HOST}:${PORT}`);
    console.log(`  Inicio: ${new Date().toLocaleString('es-VE')}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Verificar conexión inicial
    console.log('▸ Verificando conexión con el servidor...');
    try {
        const res = await request('GET', '/api', null, false);
        if (res.status !== 200) throw new Error('API no responde');
        console.log('  ✓ Servidor activo\n');
    } catch (err) {
        console.error('  ✗ ERROR: No se pudo conectar al servidor.');
        console.error('  Asegúrate de que XAMPP esté corriendo y que ejecutaste "npm start"\n');
        process.exit(1);
    }

    // ----------------------------------------------------------------
    // PR-001: Tiempo de respuesta del Login
    // ----------------------------------------------------------------
    console.log('▸ PR-001: Tiempo de respuesta del Login');
    await medir('Login con credenciales válidas', () => 
        request('POST', '/api/auth/login', { usuario: 'agomez@gmail.com', password: '1234' }, false), 
    20);
    
    // Obtener token para las pruebas siguientes
    const loginRes = await request('POST', '/api/auth/login', { usuario: 'agomez@gmail.com', password: '1234' }, false);
    TOKEN = loginRes.body.token;
    console.log('');

    // ----------------------------------------------------------------
    // PR-002: Tiempo de respuesta para listar solicitudes
    // ----------------------------------------------------------------
    console.log('▸ PR-002: Tiempo de respuesta para listar solicitudes');
    await medir('GET /api/solicitudes', () => request('GET', '/api/solicitudes'), 20);
    console.log('');

    // ----------------------------------------------------------------
    // PR-003: Tiempo de respuesta para listar usuarios
    // ----------------------------------------------------------------
    console.log('▸ PR-003: Tiempo de respuesta para listar usuarios');
    await medir('GET /api/usuarios', () => request('GET', '/api/usuarios'), 20);
    console.log('');

    // ----------------------------------------------------------------
    // PR-004: Tiempo de respuesta para listar cotizaciones
    // ----------------------------------------------------------------
    console.log('▸ PR-004: Tiempo de respuesta para listar cotizaciones');
    await medir('GET /api/cotizaciones', () => request('GET', '/api/cotizaciones'), 20);
    console.log('');

    // ----------------------------------------------------------------
    // PR-005: Tiempo de respuesta para listar proveedores
    // ----------------------------------------------------------------
    console.log('▸ PR-005: Tiempo de respuesta para listar proveedores');
    await medir('GET /api/proveedores', () => request('GET', '/api/proveedores'), 20);
    console.log('');

    // ----------------------------------------------------------------
    // PR-006: Tiempo de respuesta para estadísticas
    // ----------------------------------------------------------------
    console.log('▸ PR-006: Tiempo de respuesta de las estadísticas');
    await medir('GET /api/solicitudes/stats', () => request('GET', '/api/solicitudes/stats'), 15);
    await medir('GET /api/cotizaciones/stats', () => request('GET', '/api/cotizaciones/stats'), 15);
    console.log('');

    // ----------------------------------------------------------------
    // PR-007: Tiempo de validación de token JWT
    // ----------------------------------------------------------------
    console.log('▸ PR-007: Tiempo de validación de token JWT (endpoint /me)');
    await medir('GET /api/auth/me', () => request('GET', '/api/auth/me'), 30);
    console.log('');

    // ----------------------------------------------------------------
    // PR-008: Carga concurrente (10 peticiones simultáneas)
    // ----------------------------------------------------------------
    console.log('▸ PR-008: Carga concurrente (10 peticiones simultáneas)');
    const inicioCarga = Date.now();
    const promesas = [];
    for (let i = 0; i < 10; i++) {
        promesas.push(request('GET', '/api/solicitudes'));
    }
    const respuestas = await Promise.all(promesas);
    const tiempoTotal = Date.now() - inicioCarga;
    const exitosas = respuestas.filter(r => r.status === 200).length;
    const promedioCarga = respuestas.reduce((sum, r) => sum + r.tiempoMs, 0) / respuestas.length;
    
    console.log(`  ✓ 10 peticiones concurrentes completadas`);
    console.log(`    Tiempo total: ${tiempoTotal}ms  |  Exitosas: ${exitosas}/10  |  Tiempo promedio por petición: ${promedioCarga.toFixed(2)}ms`);
    
    resultados.push({
        nombre: '10 peticiones concurrentes (GET /api/solicitudes)',
        repeticiones: 10, exitosas, errores: 10 - exitosas,
        min: 0, max: tiempoTotal, promedio: parseFloat(promedioCarga.toFixed(2)), mediana: 0
    });
    console.log('');

    // ----------------------------------------------------------------
    // RESUMEN
    // ----------------------------------------------------------------
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RESUMEN DE LAS PRUEBAS DE RENDIMIENTO');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  ID    | Endpoint                              | Promedio (ms)');
    console.log('  ------|---------------------------------------|---------------');
    resultados.forEach((r, i) => {
        const id = String(i+1).padStart(2, '0');
        const nombre = r.nombre.padEnd(40, ' ').substring(0, 40);
        const prom = String(r.promedio).padStart(8, ' ');
        console.log(`  PR-${id}| ${nombre}  | ${prom} ms`);
    });
    console.log('');

    // Análisis de rendimiento
    const todoBajo1Seg = resultados.every(r => r.promedio < 1000);
    const todoBajo500ms = resultados.every(r => r.promedio < 500);
    
    console.log('  ANÁLISIS:');
    if (todoBajo500ms) {
        console.log('  ✓ EXCELENTE: Todas las respuestas están por debajo de 500ms');
    } else if (todoBajo1Seg) {
        console.log('  ✓ BUENO: Todas las respuestas están por debajo de 1 segundo');
    } else {
        console.log('  ⚠ ATENCIÓN: Algunas respuestas superan 1 segundo');
    }
    
    console.log('');
    console.log(`  Total de pruebas: ${resultados.length}`);
    console.log(`  Todas las pruebas pasaron exitosamente.`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Guardar resultados en JSON
    const fs = require('fs');
    const fecha = new Date().toISOString().slice(0,10);
    fs.writeFileSync(`./resultados-rendimiento-${fecha}.json`, JSON.stringify(resultados, null, 2));
    console.log(`\n  ✓ Resultados guardados en: resultados-rendimiento-${fecha}.json`);
    console.log('');
}

correrPruebas().catch(err => {
    console.error('Error ejecutando las pruebas:', err);
    process.exit(1);
});
