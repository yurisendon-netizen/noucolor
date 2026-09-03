import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';

// Borrado de cuenta propio (guía 14 de Google Play: apps con cuenta deben permitir
// eliminarla desde dentro de la app). El empleado se identifica con su token de
// sesión (inyectado por authInvoke desde el cliente) — nunca con un employeeId
// suministrado por el cliente. Solo se puede eliminar la cuenta propia.
//
// Se eliminan: Employee (acceso y credenciales) y sus DatosTrabajador (datos
// personales). Los registros laborales de la empresa (TimeEntry, Payroll,
// WorkOrder, Justificante...) se conservan por obligación legal.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const session = await verifySession(base44, body.sessionToken);
    if (!session) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const employee = session.employee;

    // Datos personales vinculados
    const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: employee.id });
    for (const d of datos) {
      await base44.asServiceRole.entities.DatosTrabajador.delete(d.id);
    }

    // La cuenta de empleado
    await base44.asServiceRole.entities.Employee.delete(employee.id);

    return Response.json({ success: true, deletedEmployeeId: employee.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}