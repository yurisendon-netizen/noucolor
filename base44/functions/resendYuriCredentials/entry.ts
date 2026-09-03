import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { sendResendEmail, buildWelcomeEmailHtml } from '../../shared/resendEmail.ts';

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mismo formato/algoritmo que manageEmployee y employeeLogin: '<salt>:<sha256(salt:password)>'
async function hashPassword(password, salt) {
  const useSalt = salt || randomSaltHex();
  const data = new TextEncoder().encode(`${useSalt}:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${useSalt}:${hex}`;
}

// Contraseña aleatoria fuerte (sin caracteres ambiguos). Se usa cuando el admin
// no aporta una en el body; nunca se fija en el código.
function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// Utilidad admin: restablece la contraseña de un empleado (username en el body;
// si no se aporta `password` se genera una aleatoria), guarda solo el hash en
// Employee y DatosTrabajador y envía las credenciales por email. Si el email
// falla, devuelve la contraseña generada para que el admin la entregue a mano.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    let payload = {};
    try { payload = await req.clone().json(); } catch { /* body vacío */ }
    const username = String(payload.username || '').trim().toLowerCase();
    if (!username) {
      return Response.json({ error: 'Falta el parámetro "username" (usuario del empleado)' }, { status: 400 });
    }

    const employees = await base44.asServiceRole.entities.Employee.list('-created_date', 200);
    const emp = employees.find(e => (e.user || '').toLowerCase() === username);
    if (!emp) return Response.json({ error: `No se encontró ningún empleado con usuario "${username}"` }, { status: 404 });
    if (!emp.email) return Response.json({ error: 'Este empleado no tiene email registrado' }, { status: 400 });

    const newPassword = String(payload.password || '').trim() || randomPassword();
    const newHash = await hashPassword(newPassword);
    // Al restablecer la credencial se invalida también la sesión activa
    await base44.asServiceRole.entities.Employee.update(emp.id, { pass: newHash, session_token: '' });
    const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: emp.id });
    if (datos.length > 0) {
      await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: newHash });
    }

    let emailFailed = false;
    let emailError = null;
    try {
      await sendResendEmail({
        to: emp.email,
        subject: 'Noucolor - Tus credenciales de acceso',
        html: buildWelcomeEmailHtml({
          fullName: emp.full_name, username: emp.user, password: newPassword,
        }),
      });
    } catch (e) {
      emailFailed = true;
      emailError = e.message;
    }

    if (emailFailed) {
      // Credencial restablecida pero no entregada: devolverla al admin para
      // que la comunique por otro canal seguro.
      return Response.json({
        success: true, name: emp.full_name, emailFailed: true, emailError,
        password: newPassword,
      });
    }

    return Response.json({ success: true, sentTo: emp.email, name: emp.full_name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});