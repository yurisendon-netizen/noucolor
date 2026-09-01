import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';

// Cron de las 15:45 (hora de Madrid / Andorra, UTC+2 verano): revisa qué
// empleados siguen con la jornada abierta (fichaje de entrada sin salida) y
// deja un aviso en el centro de notificaciones para los admins, antes del
// cierre automático de las 16:35.

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  try {
    const base44 = createClientFromRequest(req);
    const openEntries = await base44.asServiceRole.entities.TimeEntry.filter({ status: 'abierto' });
    const names = [...new Set(openEntries.map(e => e.employee_name).filter(Boolean))];

    if (names.length > 0) {
      await base44.asServiceRole.entities.Notification.create({
        type: 'jornada_abierta',
        title: 'Jornadas abiertas',
        message: `Empleados con jornada abierta a las 15:45: ${names.join(', ')}`,
        employee_name: '',
        employee_id: '',
        read: false
      });
    }
    return Response.json({ success: true, openCount: names.length, names });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});