// ============================================================
// CONFIGURACIÓN DE EMAIL — Nodemailer + Gmail SMTP
// Para Entrega 3: notificaciones por correo del sistema
// ============================================================

const nodemailer = require('nodemailer');

// Transporter de Gmail (configurado vía variables de entorno en .env)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Verificar conexión al iniciar el servidor
async function verifyEmailConnection() {
    try {
        await transporter.verify();
        console.log('✅ Servicio de correo (Gmail SMTP) conectado correctamente');
        return true;
    } catch (err) {
        console.error('⚠️ Error conectando al servicio de correo:', err.message);
        console.error('   Verifica las variables GMAIL_USER y GMAIL_APP_PASSWORD en .env');
        return false;
    }
}

// Nombre del remitente
const FROM_NAME = process.env.MAIL_FROM_NAME || 'J&N31 A1 Importaciones - Sistema';
const FROM_ADDRESS = process.env.GMAIL_USER;
const FROM = `"${FROM_NAME}" <${FROM_ADDRESS}>`;

// ============================================================
// PLANTILLAS HTML
// ============================================================

function plantillaBase(contenido) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f4f6fb; font-family: Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb; padding:30px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background:#0d47a1; padding:24px 30px; text-align:center;">
                            <h1 style="color:#fff; margin:0; font-size:22px; font-weight:600;">J&amp;N31 A1 Importaciones, C.A.</h1>
                            <p style="color:#bbdefb; margin:6px 0 0 0; font-size:13px;">Sistema de Gestión de Recursos Materiales</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 36px; color:#333; font-size:14px; line-height:1.6;">
                            ${contenido}
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f9fafb; padding:18px 30px; text-align:center; border-top:1px solid #e5e7eb;">
                            <p style="margin:0; font-size:11px; color:#9ca3af;">© J&amp;N31 A1 Importaciones, C.A. — Maturín, Estado Monagas, Venezuela</p>
                            <p style="margin:4px 0 0 0; font-size:11px; color:#9ca3af;">Este es un correo automático, por favor no responda a esta dirección.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// ============================================================
// EMAIL 1: Bienvenida con contraseña temporal
// ============================================================
async function enviarBienvenida({ destinatario, nombre, email, passwordTemporal }) {
    const contenido = `
        <h2 style="color:#0d47a1; margin:0 0 16px 0; font-size:20px;">Bienvenido(a), ${nombre}</h2>
        <p>Se ha creado una cuenta para usted en el <strong>Sistema de Gestión de Recursos Materiales</strong> de J&amp;N31 A1 Importaciones, C.A.</p>

        <div style="background:#f0f9ff; border-left:4px solid #3b82f6; padding:16px 20px; margin:20px 0; border-radius:4px;">
            <p style="margin:0 0 10px 0;"><strong>Sus credenciales de acceso:</strong></p>
            <p style="margin:0 0 6px 0;"><span style="color:#6b7280;">Email:</span> <strong style="color:#111;">${email}</strong></p>
            <p style="margin:0;"><span style="color:#6b7280;">Contraseña temporal:</span> <strong style="color:#dc2626; font-family:'Courier New',monospace; font-size:16px; letter-spacing:1px;">${passwordTemporal}</strong></p>
        </div>

        <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:14px 18px; margin:20px 0; border-radius:4px;">
            <p style="margin:0; color:#92400e;"><strong>⚠ Importante:</strong> Por seguridad, deberá cambiar esta contraseña la primera vez que ingrese al sistema.</p>
        </div>

        <p>Recomendaciones de seguridad:</p>
        <ul style="color:#4b5563; padding-left:20px;">
            <li>No comparta esta información con nadie</li>
            <li>Elimine este correo después de iniciar sesión por primera vez</li>
            <li>Use una contraseña fuerte: mínimo 8 caracteres, mayúsculas, minúsculas y números</li>
        </ul>

        <p style="margin-top:24px; color:#6b7280; font-size:13px;">Si usted no esperaba este correo, por favor ignórelo o contacte al administrador del sistema.</p>
    `;

    return transporter.sendMail({
        from: FROM,
        to: destinatario,
        subject: '🔐 Bienvenido al Sistema — Sus credenciales de acceso',
        html: plantillaBase(contenido),
        text: `Bienvenido(a) ${nombre}.\n\nSus credenciales:\nEmail: ${email}\nContraseña temporal: ${passwordTemporal}\n\nDeberá cambiar la contraseña al iniciar sesión por primera vez.\n\n— Sistema J&N31 A1 Importaciones, C.A.`
    });
}

// ============================================================
// EMAIL 2: Código de recuperación de contraseña
// ============================================================
async function enviarCodigoRecuperacion({ destinatario, nombre, codigo, minutosValido }) {
    const contenido = `
        <h2 style="color:#0d47a1; margin:0 0 16px 0; font-size:20px;">Recuperación de Contraseña</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Hemos recibido una solicitud para restablecer la contraseña de su cuenta. Use el siguiente código para continuar con el proceso:</p>

        <div style="text-align:center; margin:30px 0;">
            <div style="display:inline-block; background:#0d47a1; color:#fff; padding:18px 36px; border-radius:8px; font-size:32px; font-weight:bold; letter-spacing:8px; font-family:'Courier New',monospace;">
                ${codigo}
            </div>
        </div>

        <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:14px 18px; margin:20px 0; border-radius:4px;">
            <p style="margin:0; color:#92400e;">⏱ Este código es válido por <strong>${minutosValido} minutos</strong>.</p>
        </div>

        <p style="color:#6b7280; font-size:13px;"><strong>Si usted no solicitó este código, ignore este correo.</strong> Su contraseña actual seguirá funcionando.</p>

        <p style="margin-top:20px; color:#6b7280; font-size:13px;">Por seguridad, no comparta este código con nadie. El sistema nunca le pedirá su código por teléfono o por otro canal.</p>
    `;

    return transporter.sendMail({
        from: FROM,
        to: destinatario,
        subject: `🔑 Código de recuperación: ${codigo}`,
        html: plantillaBase(contenido),
        text: `Hola ${nombre},\n\nSu código de recuperación es: ${codigo}\n\nEste código vence en ${minutosValido} minutos.\n\nSi usted no lo solicitó, ignore este correo.\n\n— Sistema J&N31 A1 Importaciones, C.A.`
    });
}

// ============================================================
// EMAIL 3: Confirmación de cambio de contraseña
// ============================================================
async function enviarConfirmacionCambio({ destinatario, nombre }) {
    const contenido = `
        <h2 style="color:#0d47a1; margin:0 0 16px 0; font-size:20px;">Contraseña actualizada</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Le confirmamos que la contraseña de su cuenta fue cambiada exitosamente el <strong>${new Date().toLocaleString('es-VE', { dateStyle:'long', timeStyle:'short' })}</strong>.</p>

        <div style="background:#dcfce7; border-left:4px solid #16a34a; padding:14px 18px; margin:20px 0; border-radius:4px;">
            <p style="margin:0; color:#166534;">✅ Su cuenta ahora está protegida con la nueva contraseña.</p>
        </div>

        <p style="color:#6b7280; font-size:13px;"><strong>¿No fue usted?</strong> Si usted no realizó este cambio, contacte de inmediato al administrador del sistema.</p>
    `;

    return transporter.sendMail({
        from: FROM,
        to: destinatario,
        subject: '✅ Su contraseña fue actualizada',
        html: plantillaBase(contenido),
        text: `Hola ${nombre},\n\nSu contraseña fue cambiada exitosamente.\n\nSi no fue usted, contacte al administrador.\n\n— Sistema J&N31 A1 Importaciones, C.A.`
    });
}

// ============================================================
// UTILIDADES
// ============================================================

// Genera contraseña aleatoria fuerte (10 caracteres: letras + números + 1 mayúscula + 1 minúscula + 1 número)
function generarPasswordTemporal(longitud = 10) {
    const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I, O para evitar confusión
    const minus = 'abcdefghijkmnpqrstuvwxyz'; // sin l, o
    const nums  = '23456789'; // sin 0, 1 para evitar confusión
    const todos = mayus + minus + nums;

    // Garantiza al menos 1 de cada tipo
    let pwd = [
        mayus[Math.floor(Math.random() * mayus.length)],
        minus[Math.floor(Math.random() * minus.length)],
        nums[Math.floor(Math.random() * nums.length)]
    ];
    for (let i = pwd.length; i < longitud; i++) {
        pwd.push(todos[Math.floor(Math.random() * todos.length)]);
    }
    // Mezclar
    return pwd.sort(() => Math.random() - 0.5).join('');
}

// Genera código de 6 dígitos
function generarCodigoVerificacion() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// Validación de contraseña fuerte
function validarPasswordFuerte(password) {
    if (!password || password.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' };
    if (!/[A-Z]/.test(password)) return { ok: false, error: 'Debe contener al menos una letra MAYÚSCULA' };
    if (!/[a-z]/.test(password)) return { ok: false, error: 'Debe contener al menos una letra minúscula' };
    if (!/[0-9]/.test(password)) return { ok: false, error: 'Debe contener al menos un número' };
    return { ok: true };
}

module.exports = {
    transporter,
    verifyEmailConnection,
    enviarBienvenida,
    enviarCodigoRecuperacion,
    enviarConfirmacionCambio,
    generarPasswordTemporal,
    generarCodigoVerificacion,
    validarPasswordFuerte
};
