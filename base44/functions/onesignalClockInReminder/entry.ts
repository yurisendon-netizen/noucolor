import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// ── OPERACIÓN DE SISTEMA: disparada por cron a las 08:00 hora de Andorra
// (UTC+2 verano → 06:00 UTC) en días laborables. Sin usuario detrás.
// Lista los empleados activos, comprueba quién no ha fichado la entrada hoy
// (TimeEntry con date=hoy) y les envía un push de OneSignal recordándoles fichar.
// El id del empleado se vincula como external_user_id en la app nativa tras el
// login (window.median.onesignal.setExternalUserId), por eso aquí se dirige con
// include_external_user_ids.

// Andorra: +01:00 invierno / +02:00 verano. Mismo offset que notifyMissingClockIn.
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
    // Los jefes están exentos de fichar (ver ControlHorario / notifyMissingClockIn).
    const recipients = employees.filter(e => e.role !== 'jefe');

    if (recipients.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, message: 'Sin destinatarios' });
    }

    // Una sola consulta de los fichajes de hoy, no una por empleado.
    const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ date: today });
    const clockedInIds = new Set(todayEntries.map(e => e.employee_id));
    const pending = recipients.filter(e => !clockedInIds.has(e.id));

    if (pending.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, message: 'Todos los empleados ya han fichado' });
    }

    const results = [];
    for (const emp of pending) {
      const push = await sendOneSignalPush({
        externalUserIds: emp.id,
        heading: 'Recuerda fichar',
        content: 'No has fichado tu entrada todavía',
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
          title: 'Recordatorio de fichaje',
          message: 'Recuerda fichar tu entrada antes de las 8:30 para evitar incidencias.',
          read: false
        });
        inApp = { created: true };
      } catch (err) {
        inApp = { created: false, error: err.message };
      }

      results.push({ id: emp.id, name: emp.full_name, push, inApp });
    }

    return Response.json({
      success: true,
      date: today,
      checked: recipients.length,
      pending: pending.length,
      pushed: results.filter(r => r.push?.sent).length,
      notified: results.filter(r => r.inApp?.created).length,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});