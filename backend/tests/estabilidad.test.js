// ============================================================
// PRUEBAS DE ESTABILIDAD - Sistema J&N31 A1 Importaciones, C.A.
// ============================================================
// Verifica que el sistema mantenga su funcionamiento correcto
// bajo uso continuo y operaciones masivas.
//
// EJECUCIÓN: node tests/estabilidad.test.js
// ============================================================

const http = require('http');

const HOST = 'localhost';
const PORT = 3001;

let TOKEN = null;
const resultados = [];

function request(method, path, body = null, useToken = true) {
    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (useToken && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
        const options = { hostname: HOST, port: PORT, path, method, headers };
        const inicio = Date.now();
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const tiempoMs = Date.now() - inicio;
                try { resolve({ status: res.statusCode, body: JSON.parse(data), tiempoMs }); }
                catch { resolve({ status: res.statusCode, body: data, tiempoMs }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function correrPruebas() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PRUEBAS DE ESTABILIDAD - Sistema J&N31 A1 Importaciones');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Servidor: http://${HOST}:${PORT}`);
    console.log(`  Inicio: ${new Date().toLocaleString('es-VE')}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Verificar conexión
    try {
        await request('GET', '/api', null, false);
    } catch {
        console.error('✗ ERROR: Servidor no responde. Asegúrate de tener "npm start" corriendo.\n');
        process.exit(1);
    }

    // Login
    const loginRes = await request('POST', '/api/auth/login', { usuario: 'agomez@gmail.com', password: '1234' }, false);
    TOKEN = loginRes.body.token;
    if (!TOKEN) {
        console.error('✗ No se pudo obtener token. Verifica las credenciales.\n');
        process.exit(1);
    }
    console.log('▸ Sesión iniciada correctamente\n');

    // ================================================================
    // PE-001: Estabilidad bajo peticiones repetidas (100 peticiones)
    // ================================================================
    console.log('▸ PE-001: Estabilidad bajo 100 peticiones consecutivas');
    let exitosas = 0, errores = 0, tiempoTotal = 0;
    const inicio001 = Date.now();
    
    for (let i = 1; i <= 100; i++) {
        try {
            const res = await request('GET', '/api/solicitudes');
            tiempoTotal += res.tiempoMs;
            if (res.status === 200) exitosas++;
            else errores++;
        } catch (err) {
            errores++;
        }
        if (i % 20 === 0) process.stdout.write(`  ${i}/100... `);
    }
    
    const duracion001 = Date.now() - inicio001;
    const promedio001 = tiempoTotal / 100;
    
    console.log(`\n  ✓ Completado en ${(duracion001/1000).toFixed(2)}s`);
    console.log(`    Exitosas: ${exitosas}/100  |  Errores: ${errores}  |  Tiempo promedio: ${promedio001.toFixed(2)}ms`);
    console.log(`    Estabilidad: ${(exitosas/100*100).toFixed(1)}%`);
    
    resultados.push({
        prueba: 'PE-001',
        descripcion: '100 peticiones consecutivas a /api/solicitudes',
        operaciones: 100, exitosas, errores,
        duracionSegundos: parseFloat((duracion001/1000).toFixed(2)),
        tiempoPromedioMs: parseFloat(promedio001.toFixed(2)),
        estabilidad: parseFloat((exitosas/100*100).toFixed(1))
    });
    console.log('');

    // ================================================================
    // PE-002: Múltiples sesiones simultáneas (5 logins concurrentes)
    // ================================================================
    console.log('▸ PE-002: Múltiples sesiones simultáneas (5 logins en paralelo)');
    const usuarios = [
        { usuario: 'agomez@gmail.com', password: '1234' },
        { usuario: 'nairodriguez@gmail.com', password: '1234' },
        { usuario: 'armandohz@gmail.com', password: '1234' },
        { usuario: 'perezjose@gmail.com', password: '1234' },
        { usuario: 'alopez12@gmail.com', password: '1234' }
    ];
    const inicio002 = Date.now();
    const respuestasLogin = await Promise.all(
        usuarios.map(u => request('POST', '/api/auth/login', u, false))
    );
    const duracion002 = Date.now() - inicio002;
    const exitosas002 = respuestasLogin.filter(r => r.status === 200).length;
    
    console.log(`  ✓ 5 logins concurrentes completados en ${duracion002}ms`);
    console.log(`    Exitosos: ${exitosas002}/5`);
    console.log(`    Tokens generados correctamente: ${exitosas002}`);
    
    resultados.push({
        prueba: 'PE-002',
        descripcion: '5 logins concurrentes con usuarios diferentes',
        operaciones: 5, exitosas: exitosas002, errores: 5 - exitosas002,
        duracionSegundos: parseFloat((duracion002/1000).toFixed(2)),
        tiempoPromedioMs: 0,
        estabilidad: parseFloat((exitosas002/5*100).toFixed(1))
    });
    console.log('');

    // ================================================================
    // PE-003: Validación intensiva de tokens JWT (200 validaciones)
    // ================================================================
    console.log('▸ PE-003: Validación intensiva de tokens JWT (200 validaciones)');
    let exitosas003 = 0;
    const inicio003 = Date.now();
    
    for (let i = 1; i <= 200; i++) {
        const res = await request('GET', '/api/auth/me');
        if (res.status === 200) exitosas003++;
        if (i % 50 === 0) process.stdout.write(`  ${i}/200... `);
    }
    
    const duracion003 = Date.now() - inicio003;
    console.log(`\n  ✓ Completado en ${(duracion003/1000).toFixed(2)}s`);
    console.log(`    Validaciones exitosas: ${exitosas003}/200`);
    console.log(`    Estabilidad: ${(exitosas003/200*100).toFixed(1)}%`);
    
    resultados.push({
        prueba: 'PE-003',
        descripcion: '200 validaciones consecutivas de token JWT',
        operaciones: 200, exitosas: exitosas003, errores: 200 - exitosas003,
        duracionSegundos: parseFloat((duracion003/1000).toFixed(2)),
        tiempoPromedioMs: parseFloat((duracion003/200).toFixed(2)),
        estabilidad: parseFloat((exitosas003/200*100).toFixed(1))
    });
    console.log('');

    // ================================================================
    // PE-004: Carga combinada de operaciones (50 operaciones mixtas)
    // ================================================================
    console.log('▸ PE-004: Carga combinada de 50 operaciones mixtas');
    const operaciones = [
        () => request('GET', '/api/solicitudes'),
        () => request('GET', '/api/cotizaciones'),
        () => request('GET', '/api/usuarios'),
        () => request('GET', '/api/proveedores'),
        () => request('GET', '/api/solicitudes/stats'),
        () => request('GET', '/api/cotizaciones/stats'),
    ];
    let exitosas004 = 0;
    const inicio004 = Date.now();
    
    for (let i = 1; i <= 50; i++) {
        const op = operaciones[i % operaciones.length];
        try {
            const res = await op();
            if (res.status >= 200 && res.status < 400) exitosas004++;
        } catch {}
        if (i % 10 === 0) process.stdout.write(`  ${i}/50... `);
    }
    
    const duracion004 = Date.now() - inicio004;
    console.log(`\n  ✓ Completado en ${(duracion004/1000).toFixed(2)}s`);
    console.log(`    Operaciones exitosas: ${exitosas004}/50`);
    console.log(`    Estabilidad: ${(exitosas004/50*100).toFixed(1)}%`);
    
    resultados.push({
        prueba: 'PE-004',
        descripcion: '50 operaciones mixtas combinadas',
        operaciones: 50, exitosas: exitosas004, errores: 50 - exitosas004,
        duracionSegundos: parseFloat((duracion004/1000).toFixed(2)),
        tiempoPromedioMs: parseFloat((duracion004/50).toFixed(2)),
        estabilidad: parseFloat((exitosas004/50*100).toFixed(1))
    });
    console.log('');

    // ================================================================
    // PE-005: Resistencia a peticiones inválidas (50 intentos malos)
    // ================================================================
    console.log('▸ PE-005: Resistencia a peticiones inválidas (50 intentos)');
    let manejadosCorrectamente = 0;
    const inicio005 = Date.now();
    
    const peticionesInvalidas = [
        () => request('POST', '/api/auth/login', { usuario: 'falso@x.com', password: 'mala' }, false),
        () => request('GET', '/api/solicitudes/99999'),
        () => request('GET', '/api/no-existe'),
        () => request('POST', '/api/solicitudes', { descripcion: '' }),
        () => request('GET', '/api/usuarios', null, false), // sin token
    ];
    
    for (let i = 1; i <= 50; i++) {
        try {
            const res = await peticionesInvalidas[i % peticionesInvalidas.length]();
            // Lo importante es que devuelva un error controlado (400, 401, 403, 404), no un crash 500
            if (res.status >= 400 && res.status < 500) manejadosCorrectamente++;
        } catch {}
    }
    
    const duracion005 = Date.now() - inicio005;
    console.log(`  ✓ Completado en ${(duracion005/1000).toFixed(2)}s`);
    console.log(`    Errores manejados correctamente: ${manejadosCorrectamente}/50`);
    console.log(`    Robustez: ${(manejadosCorrectamente/50*100).toFixed(1)}%`);
    
    resultados.push({
        prueba: 'PE-005',
        descripcion: '50 peticiones inválidas para verificar manejo de errores',
        operaciones: 50, exitosas: manejadosCorrectamente, errores: 50 - manejadosCorrectamente,
        duracionSegundos: parseFloat((duracion005/1000).toFixed(2)),
        tiempoPromedioMs: parseFloat((duracion005/50).toFixed(2)),
        estabilidad: parseFloat((manejadosCorrectamente/50*100).toFixed(1))
    });
    console.log('');

    // ================================================================
    // PE-006: Verificación final de salud del sistema
    // ================================================================
    console.log('▸ PE-006: Verificación final de salud del sistema');
    const finalCheck = await request('GET', '/api/solicitudes');
    const sistemaEstable = finalCheck.status === 200;
    console.log(`  ${sistemaEstable ? '✓' : '✗'} Sistema sigue respondiendo correctamente: ${sistemaEstable ? 'SÍ' : 'NO'}`);
    
    resultados.push({
        prueba: 'PE-006',
        descripcion: 'Verificación final tras todas las pruebas',
        operaciones: 1, exitosas: sistemaEstable ? 1 : 0, errores: sistemaEstable ? 0 : 1,
        duracionSegundos: 0,
        tiempoPromedioMs: finalCheck.tiempoMs,
        estabilidad: sistemaEstable ? 100 : 0
    });
    console.log('');

    // ================================================================
    // RESUMEN
    // ================================================================
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RESUMEN DE LAS PRUEBAS DE ESTABILIDAD');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('  ID     | Descripción                              | Estab.');
    console.log('  -------|-------------------------------------------|--------');
    resultados.forEach(r => {
        const desc = r.descripcion.substring(0, 41).padEnd(41, ' ');
        const est = String(r.estabilidad + '%').padStart(6, ' ');
        console.log(`  ${r.prueba} | ${desc} | ${est}`);
    });
    console.log('');
    
    const totalOps = resultados.reduce((sum, r) => sum + r.operaciones, 0);
    const totalExitosas = resultados.reduce((sum, r) => sum + r.exitosas, 0);
    const estabilidadGlobal = (totalExitosas / totalOps * 100);
    
    console.log(`  Total de operaciones ejecutadas: ${totalOps}`);
    console.log(`  Operaciones exitosas: ${totalExitosas}`);
    console.log(`  ESTABILIDAD GLOBAL: ${estabilidadGlobal.toFixed(2)}%`);
    console.log('');
    
    if (estabilidadGlobal >= 99) {
        console.log('  ✓ EXCELENTE: Sistema completamente estable');
    } else if (estabilidadGlobal >= 95) {
        console.log('  ✓ BUENO: Sistema estable bajo carga');
    } else if (estabilidadGlobal >= 90) {
        console.log('  ⚠ ACEPTABLE: Sistema funcional con mejoras posibles');
    } else {
        console.log('  ✗ ATENCIÓN: Revisar puntos de inestabilidad');
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Guardar JSON
    const fs = require('fs');
    const fecha = new Date().toISOString().slice(0,10);
    fs.writeFileSync(`./resultados-estabilidad-${fecha}.json`, JSON.stringify({
        fecha: new Date().toISOString(),
        totalOperaciones: totalOps,
        operacionesExitosas: totalExitosas,
        estabilidadGlobal: parseFloat(estabilidadGlobal.toFixed(2)),
        resultados
    }, null, 2));
    console.log(`\n  ✓ Resultados guardados en: resultados-estabilidad-${fecha}.json\n`);
}

correrPruebas().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
