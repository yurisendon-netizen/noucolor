import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';
import { sendResendEmail, sendCoreEmail, buildWelcomeEmailHtml } from '../../shared/resendEmail.ts';

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Excluye caracteres ambiguos (0/O, 1/l/I) para que sea fácil de teclear a mano.
function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// Current format: '<random salt>:<sha256(salt:password)>' — unique salt per password.
async function hashPassword(password, salt) {
  const useSalt = salt || randomSaltHex();
  const data = new TextEncoder().encode(`${useSalt}:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${useSalt}:${hex}`;
}

// Legacy format from before the per-user-salt migration — still recognized so we don't re-hash
// (and corrupt) a password that was hashed under the old scheme but hasn't logged in since.
function isLegacyHash(pwd) {
  return typeof pwd === 'string' && pwd.length === 64 && /^[0-9a-f]+$/i.test(pwd);
}
function isSaltedHash(pwd) {
  return typeof pwd === 'string' && /^[0-9a-f]{32}:[0-9a-f]{64}$/i.test(pwd);
}
function isHashed(pwd) {
  return isLegacyHash(pwd) || isSaltedHash(pwd);
}

// Intenta primero el correo nativo de Base44 (gratis, pero solo entrega a
// direcciones que ya son un User verificado de la plataforma), y si falla,
// cae a Resend (gratis solo hacia la propia cuenta, hasta verificar un
// dominio). Devuelve { sent: bool, method, error } — nunca lanza.
async function sendWelcomeEmail(base44, { fullName, username, password, email }) {
  const subject = 'Noucolor - Tus credenciales de acceso';
  const html = buildWelcomeEmailHtml({ fullName, username, password });
  try {
    await sendCoreEmail(base44, { to: email, subject, html });
    return { sent: true, method: 'core' };
  } catch (coreError) {
    try {
      await sendResendEmail({ to: email, subject, html });
      return { sent: true, method: 'resend' };
    } catch (resendError) {
      return { sent: false, error: `${coreError.message} / ${resendError.message}` };
    }
  }
}

// Correo de bienvenida con usuario + contraseña en claro — solo posible si se
// llama ANTES de hashear la contraseña (data.pass en 'create'/'update' es el
// valor original que escribió el admin; hashedPass es lo que se guarda).
// Usado tanto al crear un empleado como al asignarle una contraseña nueva
// desde "Editar Empleado".
async function sendWelcomeEmailIfNeeded(base44, { fullName, username, plainPassword, email }) {
  if (!plainPassword || !username || !email || isHashed(plainPassword)) return;
  const result = await sendWelcomeEmail(base44, { fullName, username, password: plainPassword, email: email.trim() });
  if (!result.sent) {
    // No bloquea la creación/actualización del empleado si el correo falla
    console.error('Error enviando correo de bienvenida:', result.error);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, sessionToken, data, datosId, employeeId } = await req.json();

    // Verify caller identity via session token (not client-supplied employeeId)
    const session = await verifySession(base44, sessionToken);
    if (!session) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const callerEmployeeId = session.employee.id;
    const isAdminCaller = session.isAdmin;
    // Any employee can look up their own record (needed to restore their session on reload).
    // Every other action still requires an admin/jefe caller.
    const isSelfLookup = action === 'getById' && employeeId === callerEmployeeId;
    if (!isAdminCaller && !isSelfLookup) {
      return Response.json({ error: 'Prohibido — solo administradores' }, { status: 403 });
    }

    if (action === 'list') {
      const employees = await base44.asServiceRole.entities.Employee.list('-created_date', 200);
      const datos = await base44.asServiceRole.entities.DatosTrabajador.list('-created_date', 500);
      const datosByEmpId = {};
      const datosByName = {};
      for (const d of datos) {
        if (d.employee_id) datosByEmpId[d.employee_id] = d;
        if (d.full_name) datosByName[d.full_name.toLowerCase().trim()] = d;
      }
      const merged = employees.map(emp => {
        const d = datosByEmpId[emp.id] || datosByName[(emp.full_name || '').toLowerCase().trim()];
        const { pass, session_token, ...safeEmp } = emp;
        return { ...safeEmp, iban: d?.iban || emp.iban || null };
      });
      return Response.json({ success: true, employees: merged });
    }

    if (action === 'getById') {
      if (!employeeId) return Response.json({ error: 'Falta employeeId' }, { status: 400 });
      const found = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
      if (found.length === 0) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });
      const { pass, session_token, ...safeEmployee } = found[0];
      return Response.json({ success: true, employee: safeEmployee });
    }

    if (action === 'listDatos') {
      const datos = await base44.asServiceRole.entities.DatosTrabajador.list('-created_date', 500);
      return Response.json({ success: true, datos });
    }

    if (action === 'toggleActive') {
      if (!employeeId) return Response.json({ error: 'Falta employeeId' }, { status: 400 });
      const found = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
      if (found.length === 0) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });
      await base44.asServiceRole.entities.Employee.update(employeeId, { is_active: !found[0].is_active });
      return Response.json({ success: true });
    }

    // Genera una contraseña nueva y la reenvía por correo — no se puede recuperar
    // la contraseña original porque solo se guarda su hash (ver isHashed más abajo).
    if (action === 'resendWelcome') {
      if (!employeeId) return Response.json({ error: 'Falta employeeId' }, { status: 400 });
      const found = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
      if (found.length === 0) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });
      const emp = found[0];
      if (!emp.email) return Response.json({ error: 'Este empleado no tiene email registrado' }, { status: 400 });
      if (!emp.user) return Response.json({ error: 'Este empleado no tiene usuario asignado' }, { status: 400 });

      const newPassword = randomPassword();
      const newHash = await hashPassword(newPassword);
      await base44.asServiceRole.entities.Employee.update(employeeId, { pass: newHash });
      const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: employeeId });
      if (datos.length > 0) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: newHash });
      }

      const result = await sendWelcomeEmail(base44, {
        fullName: emp.full_name, username: emp.user, password: newPassword, email: emp.email,
      });
      if (!result.sent) {
        // La contraseña YA se cambió aunque el correo falle — la devolvemos
        // en la respuesta para que no se pierda sin que nadie se entere
        // (esto es justo lo que pasó antes: una contraseña nueva generada
        // y perdida porque el envío falló en silencio).
        return Response.json({
          success: false,
          error: `Contraseña actualizada, pero el correo no se pudo enviar: ${result.error}`,
          newPassword,
        }, { status: 502 });
      }
      return Response.json({ success: true, sentTo: emp.email, method: result.method });
    }

    const precioHora = parseFloat(data.precioHora) || 0;
    const baseSalary = Math.round(precioHora * 173.33 * 100) / 100;
    const user = (data.user || '').trim().toLowerCase();

    // Hash password if provided and not already hashed
    let hashedPass = data.pass;
    if (data.pass && !isHashed(data.pass)) {
      hashedPass = await hashPassword(data.pass);
    }

    const employeeData = {
      full_name: data.full_name?.trim(),
      email: data.email?.trim(),
      phone: data.phone?.trim(),
      dni: data.dni?.trim(),
      nss: data.cass?.trim(),
      hire_date: data.hire_date || null,
      position: data.position?.trim(),
      precioHora,
      base_salary: baseSalary,
      role: data.cargo || 'operario',
      ...(data.user ? { user } : {}),
      ...(data.pass ? { pass: hashedPass } : {}),
    };

    const datosData = {
      full_name: data.full_name?.trim(),
      email: data.email?.trim(),
      phone: data.phone?.trim(),
      dni: data.dni?.trim(),
      cass: data.cass?.trim(),
      position: data.position?.trim(),
      precioHora,
      cargo: data.cargo || 'operario',
      hire_date: data.hire_date || null,
      ...(data.iban ? { iban: data.iban?.trim() } : {}),
      ...(data.user ? { user } : {}),
      ...(data.pass ? { pass: hashedPass } : {}),
    };

    if (action === 'create') {
      const emp = await base44.asServiceRole.entities.Employee.create({
        ...employeeData,
        is_active: true,
      });
      await base44.asServiceRole.entities.DatosTrabajador.create({
        ...datosData,
        employee_id: emp.id,
      });

      await sendWelcomeEmailIfNeeded(base44, {
        fullName: data.full_name, username: user, plainPassword: data.pass, email: data.email,
      });

      return Response.json({ success: true, employeeId: emp.id });
    }

    if (action === 'update') {
      if (employeeId) {
        await base44.asServiceRole.entities.Employee.update(employeeId, employeeData);
        // Sync DatosTrabajador by employee_id if no explicit datosId
        if (!datosId) {
          const matching = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: employeeId });
          if (matching.length > 0) {
            await base44.asServiceRole.entities.DatosTrabajador.update(matching[0].id, datosData);
          }
        }
      }
      if (datosId) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datosId, datosData);
      }

      // Si el admin asignó una contraseña nueva desde "Editar Empleado",
      // avisa por correo igual que al crear un empleado.
      await sendWelcomeEmailIfNeeded(base44, {
        fullName: data.full_name, username: user, plainPassword: data.pass, email: data.email,
      });

      return Response.json({ success: true });
    }

    if (action === 'delete') {
      if (employeeId) {
        // Also delete linked DatosTrabajador records
        if (!datosId) {
          const matching = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: employeeId });
          for (const d of matching) {
            await base44.asServiceRole.entities.DatosTrabajador.delete(d.id);
          }
        }
        await base44.asServiceRole.entities.Employee.delete(employeeId);
      }
      if (datosId) {
        await base44.asServiceRole.entities.DatosTrabajador.delete(datosId);
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});