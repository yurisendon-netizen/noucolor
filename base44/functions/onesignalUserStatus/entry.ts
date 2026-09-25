import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';
import { getOneSignalUserStatus } from '../../shared/onesignalPush.ts';

// Devuelve el estado de suscripción push de cada empleado activo leyendo la
// API de OneSignal (users/by/external_id) en el servidor — la clave REST
// nunca sale al cliente. Solo admins/jefes. Cada empleado se clasifica como:
//  - 'activadas' (verde): tiene al menos una suscripción habilitada
//  - 'desactivadas' (naranja): tiene dispositivo pero todas desactivadas
//  - 'sin_dispositivo' (gris): no existe en OneSignal
//  - 'error' (rojo): fallo al consultar la API
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { /* sin body */ }

    const session = await verifySession(base44, body.sessionToken);
    if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
    if (!session.isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });

    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });

    const results = [];
    for (const emp of employees) {
      const st = await getOneSignalUserStatus(emp.id);
      let status = 'sin_dispositivo';
      let devices = 0;
      let lastActive = null;

      if (st.available && st.hasDevice) {
        devices = st.subscriptions.length;
        const enabled = st.subscriptions.filter(s => s.enabled === true || s.enabled === 1);
        status = enabled.length > 0 ? 'activadas' : 'desactivadas';
        const acts = st.subscriptions
          .map(s => s.last_active)
          .filter(v => v != null)
          .sort((a, b) => Number(b) - Number(a));
        lastActive = acts[0] || null;
      } else if (st.available && !st.hasDevice) {
        status = 'sin_dispositivo';
      } else {
        status = 'error';
      }

      results.push({
        id: emp.id,
        name: emp.full_name,
        role: emp.role,
        status,
        devices,
        lastActive,
        error: st.error || null
      });
    }

    return Response.json({ success: true, employees: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});