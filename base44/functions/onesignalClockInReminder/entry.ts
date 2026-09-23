import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// ── OPERACIÓN DE SISTEMA: disparada por cron a las 08:00 (zona horaria
// Europe/Andorra) en días laborables. Sin usuario detrás. Lista los empleados
// activos, comprueba quién no ha fichado la entrada hoy (TimeEntry con
// date=hoy) y les envía un push de OneSignal recordándoles fichar. El id del
// empleado se vincula como external_id en la app (web y nativa) tras el login,
// por eso aquí se dirige con include_aliases { external_id }.

// Fecha "de pared" en Andorra calculada con la zona horaria real (Europe/Andorra)
// vía Intl, no sumando un offset fijo: así funciona en invierno (+01:00) y en
// verano (+02:00) sin tocar código al cambiar de horario.
function todayLocalDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Andorra',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // en-CA → YYYY-MM-DD
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
        heading: 'Recuerda fichar tu entrada',
        content: 'Toca para fichar ahora',
        data: { target_url: '/control-horario' }
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