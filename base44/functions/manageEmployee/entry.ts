import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, callerEmployeeId, data, datosId, employeeId } = await req.json();

    // Verify caller exists
    if (!callerEmployeeId) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    let callers;
    try {
      callers = await base44.asServiceRole.entities.Employee.filter({ id: callerEmployeeId });
    } catch {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (callers.length === 0) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const isAdminCaller = ['administrador', 'jefe', 'admin'].includes(callers[0].role);
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
        return { ...emp, iban: d?.iban || emp.iban || null };
      });
      return Response.json({ success: true, employees: merged });
    }

    if (action === 'getById') {
      if (!employeeId) return Response.json({ error: 'Falta employeeId' }, { status: 400 });
      const found = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
      if (found.length === 0) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });
      const { pass, ...safeEmployee } = found[0];
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