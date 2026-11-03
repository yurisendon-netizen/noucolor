import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';
import { runCronTracked } from '../../shared/cronMonitor.ts';

// ── OPERACIÓN DE SISTEMA: disparada por cron a las 08:00 (zona horaria
// Europe/Andorra) en días laborables. Sin usuario detrás. Lista los empleados
// activos, comprueba quién no ha fichado la entrada hoy (TimeEntry con
// date=hoy) y les envía un push de OneSignal recordándoles fichar. El id del
// empleado se vincula como external_id en la app (web y nativa) tras el login,
// por eso aquí se dirige con include_aliases { external_id }.

function todayLocalDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Andorra',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // en-CA → YYYY-MM-DD
}

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);
  return await runCronTracked(base44, 'onesignalClockInReminder', async () => {
    const today = todayLocalDate();

    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
    // Los jefes están exentos de fichar (ver ControlHorario / notifyMissingClockIn).
    const recipients = employees.filter(e => e.role !== 'jefe' && !e.horario_flexible);

    if (recipients.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, message: 'Sin destinatarios' });
    }

    // Una sola consulta de los fichajes de hoy, no una por empleado.
    const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ date: today });
    const clockedInIds = new Set(todayEntries.map(e => e.employee_id));
    const pending = recipients.filter(e => !clockedInIds.has(e.id));

    // ── Terminales de fichaje (teléfonos de empresa): aviso con los operarios que
    // aún no han fichado. Cada terminal se vincula en OneSignal como "terminal_<id>".
    let terminales = { sent: false, skipped: 'nadie pendiente' };
    try {
      const justHoy = (await base44.asServiceRole.entities.Justificante.filter({ status: 'aprobado' }))
        .filter(j => j.date_from <= today && j.date_to >= today);
      const ausentes = new Set(justHoy.map(j => j.employee_id));
      const faltan = employees
        .filter(e => e.role === 'operario' && e.user !== 'googletester'
          && e.estado_laboral !== 'baja' && e.estado_laboral !== 'vacaciones'
          && !ausentes.has(e.id) && !clockedInIds.has(e.id))
        .map(e => String(e.full_name || '').split(' ')[0])
        .map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
      if (faltan.length > 0) {
        const phones = (await base44.asServiceRole.entities.TelefonoEmpresa.list('nombre', 50)).filter(p => p.activo === true);
        if (phones.length > 0) {
          terminales = await sendOneSignalPush({
            externalUserIds: phones.map(p => `terminal_${p.id}`),
            heading: `Hay que fichar la entrada (${faltan.length})`,
            content: `Faltan por fichar: ${faltan.join(', ')}`,
            url: 'https://noucolor.base44.app/terminal',
            data: { target_url: '/terminal' }
          });
        }
      }
    } catch (err) {
      terminales = { sent: false, error: err?.message || String(err) };
    }

    // Yuri (03/11/2026): el recordatorio de las 8:00 llega SOLO al teléfono de
    // empresa (terminal), no al móvil personal de cada trabajador.
    const SOLO_TERMINAL = true;
    if (SOLO_TERMINAL || pending.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, pending: pending.length, terminales, message: SOLO_TERMINAL ? 'Aviso solo a los terminales' : 'Todos los empleados ya han fichado' });
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
      terminales,
      checked: recipients.length,
      pending: pending.length,
      pushed: results.filter(r => r.push?.sent).length,
      notified: results.filter(r => r.inApp?.created).length,
      results
    });
  });
});