import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ── OPERACIÓN DE SISTEMA: pensada para ser disparada por un cron de Base44 a
// las 8:00 hora de Andorra en días laborables, sin usuario detrás (igual que
// autoCloseAll en trackTime). No requiere callerEmployeeId.
//
// Ajusta este offset si Andorra está en horario de invierno (+01:00) vs verano (+02:00)
const LOCAL_UTC_OFFSET_HOURS = 2;

function todayLocalDate() {
  const shifted = new Date(Date.now() + LOCAL_UTC_OFFSET_HOURS * 3600000);
  return shifted.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = todayLocalDate();

    // Empleados activos con email — los jefes están exentos de fichar (ver ControlHorario)
    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
    const recipients = employees.filter(e => e.role !== 'jefe' && e.email);

    if (recipients.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, message: 'No hay destinatarios con email' });
    }

    // Una sola consulta de los fichajes de hoy en vez de una por empleado
    const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ date: today });
    const clockedInIds = new Set(todayEntries.map(e => e.employee_id));

    const pending = recipients.filter(e => !clockedInIds.has(e.id));

    if (pending.length === 0) {
      return Response.json({ success: true, date: today, sent: 0, message: 'Todos los empleados ya han fichado' });
    }

    const results = [];
    for (const emp of pending) {
      const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:20px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:18px;padding:6px 12px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:12px;">Recordatorio de fichaje</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">⏰ Hola ${(emp.full_name || '').split(' ')[0]}, no olvides fichar</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 8px;">Todavía no hemos registrado tu entrada de hoy. Recuerda fichar antes de las <strong>8:15</strong> para evitar una incidencia.</p>
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor · Mensaje generado automáticamente.</p>
  </div>
</div>`;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: emp.email,
          from_name: 'Noucolor',
          subject: '⏰ Recuerda fichar tu entrada',
          body: html
        });
        results.push({ name: emp.full_name, email: emp.email, sent: true });
      } catch (err) {
        results.push({ name: emp.full_name, email: emp.email, sent: false, error: err.message });
      }
    }

    return Response.json({
      success: true,
      date: today,
      sent: results.filter(r => r.sent).length,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
