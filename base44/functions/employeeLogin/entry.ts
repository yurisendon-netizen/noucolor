import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

async function hashPassword(password) {
  const data = new TextEncoder().encode('noucolor_salt_' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isHashed(pwd) {
  return typeof pwd === 'string' && pwd.length === 64 && /^[0-9a-f]+$/i.test(pwd);
}

async function verifyPassword(input, stored) {
  if (isHashed(stored)) {
    return (await hashPassword(input)) === stored;
  }
  return input === stored;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { username, password } = await req.json();

    if (!username || !password) {
      return Response.json({ success: false }, { status: 400 });
    }

    const employees = await base44.asServiceRole.entities.Employee.filter({
      user: username.toLowerCase(),
      is_active: true
    });

    if (employees.length === 0) {
      return Response.json({ success: false });
    }

    const emp = employees[0];
    const valid = await verifyPassword(password, emp.pass);
    if (!valid) {
      return Response.json({ success: false });
    }

    // Upgrade plaintext password to hashed on successful login
    if (!isHashed(emp.pass)) {
      const hashedPass = await hashPassword(password);
      await base44.asServiceRole.entities.Employee.update(emp.id, { pass: hashedPass });
      const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: emp.id });
      if (datos.length > 0) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: hashedPass });
      }
    }

    // Return employee data without the password
    const { pass, ...safeEmployee } = emp;
    return Response.json({ success: true, employee: safeEmployee });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});