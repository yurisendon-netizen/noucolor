import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Utilidad de un solo uso: añade el email a los empleados indicados,
// buscando por nombre. Solo actualiza el campo "email" — a diferencia de
// manageEmployee/update (que reconstruye el registro completo a partir de
// un formulario), esto no toca teléfono, DNI ni ningún otro campo.
//
// La página de Empleados (Empleados.jsx) lee el email directamente de
// Employee, así que no hace falta tocar DatosTrabajador para que se vea ahí.
const EMAILS_TO_SET = [
  { match: 'jordi areny', email: 'amanfue@hotmail.com' },
  { match: 'roger', email: 'quidemana@gmail.com' },
  { match: 'fernando', email: 'fernandobarreal@gmail.com' },
  { match: 'bruno', email: 'vdsglot@gmail.com' },
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
    for (const { match, email } of EMAILS_TO_SET) {
      const found = employees.find(e => (e.full_name || '').toLowerCase().includes(match));
      if (!found) {
        results.push({ match, email, error: 'No se encontró ningún empleado con ese nombre' });
        continue;
      }
      await base44.asServiceRole.entities.Employee.update(found.id, { email });
      results.push({ match, name: found.full_name, email, updated: true });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
