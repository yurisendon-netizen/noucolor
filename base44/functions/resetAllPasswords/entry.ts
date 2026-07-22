import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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

// Utilidad de un solo uso: corrige las contraseñas de TODOS los empleados a
// los valores conocidos de la tabla de nóminas — algunas se habían quedado
// con valores aleatorios generados por el botón "reenviar credenciales"
// (resendWelcome). Esta función SOLO corrige la base de datos, no envía
// ningún correo (para eso ya están resendYuriCredentials/resendAllCredentials).
const PASSWORDS = [
  { user: 'andrea', password: '190701U' },
  { user: 'julio', password: '378645E' },
  { user: 'bruno', password: '106031H' },
  { user: 'fernando', password: '191699C' },
  { user: 'nabil', password: '232335X' },
  { user: 'jordi', password: '028809T' },
  { user: 'roger', password: '362041F' },
  { user: 'yuri', password: '283634F' },
  { user: 'jordism', password: '031938W' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const employees = await base44.asServiceRole.entities.Employee.list('-created_date', 200);
    const results = [];

    for (const { user: username, password } of PASSWORDS) {
      const emp = employees.find(e => (e.user || '').toLowerCase() === username);
      if (!emp) {
        results.push({ user: username, error: 'No se encontró ningún empleado con ese usuario' });
        continue;
      }

      const newHash = await hashPassword(password);
      await base44.asServiceRole.entities.Employee.update(emp.id, { pass: newHash });
      const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: emp.id });
      if (datos.length > 0) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: newHash });
      }

      results.push({ user: username, name: emp.full_name, fixed: true });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
