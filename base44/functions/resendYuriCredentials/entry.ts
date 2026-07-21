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

// Utilidad de un solo uso: reasigna la contraseña conocida de Yuri (283634F,
// confirmada por el usuario) y le envía el correo de bienvenida real a su
// propio email — sin pasar por el formulario de Empleados. Se dispara a
// mano desde Base44 Studio (Test Function, sin body).
const TARGET_USERNAME = 'yuri';
const NEW_PASSWORD = '283634F';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const employees = await base44.asServiceRole.entities.Employee.list('-created_date', 200);
    const emp = employees.find(e => (e.user || '').toLowerCase() === TARGET_USERNAME);
    if (!emp) return Response.json({ error: 'No se encontró ningún empleado con usuario "yuri"' }, { status: 404 });
    if (!emp.email) return Response.json({ error: 'Este empleado no tiene email registrado' }, { status: 400 });

    const newHash = await hashPassword(NEW_PASSWORD);
    await base44.asServiceRole.entities.Employee.update(emp.id, { pass: newHash });
    const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: emp.id });
    if (datos.length > 0) {
      await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: newHash });
    }

    await sendResendEmail({
      to: emp.email,
      subject: 'Noucolor - Tus credenciales de acceso',
      html: buildWelcomeEmailHtml({
        fullName: emp.full_name, username: emp.user, password: NEW_PASSWORD,
      }),
    });

    return Response.json({ success: true, sentTo: emp.email, name: emp.full_name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
