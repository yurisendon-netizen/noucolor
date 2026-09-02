import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';

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
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
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

    // Empareja cada empleado con su usuario de plataforma por email. SendPushNotification
    // envía a un usuario de plataforma (user_id), no a un registro de Employee: el id de
    // Employee y el id de usuario de plataforma son distintos, así que el cruce se hace
    // por email. Solo los empleados que además son usuarios de plataforma (y con la app
    // nativa instalada + notificaciones activadas) recibirán el push; el resto recibe
    // solo el email. Hoy solo Yuri (jefe, exento) y Andrea son usuarios de plataforma,
    // así que de momento el push solo llega a Andrea; cuando el resto de operarios sean
    // usuarios de plataforma, empezarán a recibirlo automáticamente.
    const platformUsers = await base44.asServiceRole.entities.User.list();
    const emailToUserId = new Map(
      platformUsers
        .filter(u => u.email)
        .map(u => [u.email.toLowerCase(), u.id])
    );

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

      let emailSent = false;
      let emailError = null;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: emp.email,
          from_name: 'Noucolor',
          subject: '⏰ Recuerda fichar tu entrada',
          body: html
        });
        emailSent = true;
      } catch (err) {
        emailError = err.message;
      }

      // Push de recordatorio (solo a usuarios de plataforma). Al pulsarlo abre la
      // app directamente en la pantalla de fichaje (/control-horario).
      let push = { sent: false, reason: 'sin usuario de plataforma' };
      const platformUserId = emailToUserId.get((emp.email || '').toLowerCase());
      if (platformUserId) {
        try {
          await base44.asServiceRole.integrations.Core.SendPushNotification({
            user_id: platformUserId,
            title: '⏰ Recuerda fichar tu entrada',
            content: `Hola ${(emp.full_name || '').split(' ')[0]}, todavía no hemos registrado tu entrada de hoy. Ficha antes de las 8:30 para evitar una incidencia.`,
            action_label: 'Fichar ahora',
            action_url: '/control-horario'
          });
          push = { sent: true };
        } catch (err) {
          push = { sent: false, error: err.message };
        }
      }

      results.push({
        name: emp.full_name,
        email: emp.email,
        sent: emailSent,
        ...(emailError ? { emailError } : {}),
        push
      });
    }

    return Response.json({
      success: true,
      date: today,
      sent: results.filter(r => r.sent).length,
      pushed: results.filter(r => r.push?.sent).length,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});