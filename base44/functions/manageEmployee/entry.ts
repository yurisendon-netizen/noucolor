import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

async function hashPassword(password) {
  const data = new TextEncoder().encode('noucolor_salt_' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isHashed(pwd) {
  return typeof pwd === 'string' && pwd.length === 64 && /^[0-9a-f]+$/i.test(pwd);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, callerEmployeeId, data, datosId, employeeId } = await req.json();

    // Verify caller is admin
    if (!callerEmployeeId) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    let callers;
    try {
      callers = await base44.asServiceRole.entities.Employee.filter({ id: callerEmployeeId });
    } catch {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (callers.length === 0 || callers[0].role !== 'administrador') {
      return Response.json({ error: 'Prohibido — solo administradores' }, { status: 403 });
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
      user,
      pass: hashedPass,
    };

    const datosData = {
      full_name: data.full_name?.trim(),
      email: data.email?.trim(),
      phone: data.phone?.trim(),
      dni: data.dni?.trim(),
      cass: data.cass?.trim(),
      iban: data.iban?.trim(),
      position: data.position?.trim(),
      precioHora,
      cargo: data.cargo || 'operario',
      hire_date: data.hire_date || null,
      user,
      pass: hashedPass,
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
      }
      if (datosId) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datosId, datosData);
      }
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      if (employeeId) {
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