import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Función de utilidad para administradores: envía a un empleado concreto un
// aviso de fichaje tardío por correo, con la misma normativa que se muestra
// en la pantalla de Control Horario. Se dispara a mano desde Base44 Studio
// (no tiene automatización asociada); no forma parte del recordatorio de
// las 8:00 (ver notifyMissingClockIn).
//
// Body esperado: { "username": "yuri" }  — o  { "employeeId": "..." }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { employeeId, username } = body;

    let target = null;
    if (employeeId) {
      const matches = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
      target = matches[0] || null;
    } else if (username) {
      const matches = await base44.asServiceRole.entities.Employee.filter({ user: username });
      target = matches[0] || null;
    }

    if (!target) {
      return Response.json({ error: 'Empleado no encontrado (pasa employeeId o username)' }, { status: 404 });
    }
    if (!target.email) {
      return Response.json({ error: `${target.full_name || 'El empleado'} no tiene email registrado` }, { status: 400 });
    }

    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:20px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:18px;padding:6px 12px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:12px;">Aviso de fichaje</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">⚠️ Hola ${(target.full_name || '').split(' ')[0]}, tu fichaje de hoy ha sido tardío</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 16px;">Se ha registrado tu entrada fuera del horario permitido.</p>
  <div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:14px 16px;border-radius:0 6px 6px 0;">
    <p style="color:#666;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Normativa de fichaje</p>
    <p style="color:#333;font-size:13px;line-height:1.6;margin:0;">
      Entrada <strong>7:45 - 8:15</strong> (falta si no fichas antes de las <strong>8:30</strong>, no descuenta sueldo) ·
      Salida <strong>16:00 - 16:30</strong> · Cierre automático a las <strong>16:00</strong> ·
      <strong>+2h extras</strong> si fichas salida después de las 16:00.
    </p>
  </div>
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor · Mensaje generado automáticamente.</p>
  </div>
</div>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: target.email,
      from_name: 'Noucolor',
      subject: '⚠️ Fichaje tardío registrado',
      body: html
    });

    return Response.json({ success: true, sentTo: target.email, name: target.full_name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
