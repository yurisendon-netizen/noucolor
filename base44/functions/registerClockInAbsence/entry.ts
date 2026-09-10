import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// ── OPERACIÓN DE SISTEMA: disparada por cron a las 08:30 hora de Andorra
// (UTC+2 verano → 06:30 UTC) en días laborables. Sin usuario detrás.
// Vuelve a comprobar quién sigue sin haber fichado la entrada hoy y, para cada
// uno, crea un registro de falta en Incumplimiento (type=sin_fichar) y le envía
// un push de OneSignal avisando de que se ha registrado la incidencia.

const LOCAL_UTC_OFFSET_HOURS = 2;

function todayLocalDate() {
  const shifted = new Date(Date.now() + LOCAL_UTC_OFFSET_HOURS * 3600000);
  return shifted.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  try {
    const base44 = createClientFromRequest(req);
    const today = todayLocalDate();

    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
    const recipients = employees.filter(e => e.role !== 'jefe');

    const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ date: today });
    const clockedInIds = new Set(todayEntries.map(e => e.employee_id));
    const pending = recipients.filter(e => !clockedInIds.has(e.id));

    if (pending.length === 0) {
      return Response.json({ success: true, date: today, registered: 0, message: 'Todos han fichado' });
    }

    // Evita duplicar incidencias si el cron se reejecuta el mismo día.
    const existingToday = await base44.asServiceRole.entities.Incumplimiento.filter({ date: today });
    const existingByEmp = new Set(existingToday.map(i => i.employee_id));

    const results = [];
    for (const emp of pending) {
      if (existingByEmp.has(emp.id)) {
        results.push({ id: emp.id, name: emp.full_name, skipped: 'incumplimiento ya registrado hoy' });
        continue;
      }

      await base44.asServiceRole.entities.Incumplimiento.create({
        employee_id: emp.id,
        employee_name: emp.full_name,
        date: today,
        type: 'sin_fichar',
        description: 'No fichó entrada antes de las 08:30',
        status: 'pendiente'
      });

      const push = await sendOneSignalPush({
        externalUserIds: emp.id,
        heading: 'Incidencia de fichaje',
        content: 'Se ha registrado una falta por no fichar tu entrada antes de las 08:30',
        data: { target_url: '/control-horario', url: '/control-horario' }
      });

      // Registro en el centro de notificaciones interno (campanita), con los
      // mismos campos que usa el envío manual desde el panel de admin.
      let inApp = { created: false };
      try {
        await base44.asServiceRole.entities.Notification.create({
          type: 'fichaje_entrada',
          employee_id: emp.id,
          employee_name: emp.full_name,
          title: 'Falta de fichaje registrada',
          message: 'Se ha registrado una incidencia por no fichar tu entrada antes de las 08:30.',
          read: false
        });
        inApp = { created: true };
      } catch (err) {
        inApp = { created: false, error: err.message };
      }

      results.push({ id: emp.id, name: emp.full_name, registered: true, push, inApp });
    }

    return Response.json({
      success: true,
      date: today,
      pending: pending.length,
      registered: results.filter(r => r.registered).length,
      notified: results.filter(r => r.inApp?.created).length,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});