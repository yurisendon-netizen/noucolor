import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const inc = payload.data;

    if (!inc) {
      return Response.json({ error: 'Sin datos de incumplimiento' }, { status: 400 });
    }

    // Notificar a todos los administradores del sistema
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const emails = admins.filter(u => u.email).map(u => u.email);

    if (emails.length === 0) {
      return Response.json({ success: false, message: 'No hay administradores para notificar' });
    }

    const typeLabels = {
      entrada_tardia: 'Entrada tardía',
      sin_fichar: 'Sin fichar'
    };

    const typeLabel = typeLabels[inc.type] || inc.type || 'N/A';
    const fecha = inc.date
      ? new Date(inc.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'N/A';

    const subject = `⚠️ Noucolor - Nuevo incumplimiento: ${inc.employee_name || 'Trabajador'}`;

    const emailBody = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
    <div style="background: #f59e0b; color: #fff; font-weight: 800; font-size: 20px; padding: 8px 14px; border-radius: 8px; letter-spacing: 1px;">NOUCOLOR</div>
    <span style="color: #888; font-size: 13px;">Pro · Gestión interna</span>
  </div>
  <h2 style="color: #1a1a1a; margin: 0 0 8px;">⚠️ Nuevo incumplimiento registrado</h2>
  <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Se ha registrado una nueva incidencia en el sistema que requiere su revisión inmediata.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; font-size: 14px;">
    <tr><td style="padding: 10px 0; color: #999; width: 130px; border-bottom: 1px solid #f0f0f0;">Trabajador</td><td style="padding: 10px 0; font-weight: 600; color: #1a1a1a; border-bottom: 1px solid #f0f0f0;">${inc.employee_name || 'N/A'}</td></tr>
    <tr><td style="padding: 10px 0; color: #999; border-bottom: 1px solid #f0f0f0;">Tipo</td><td style="padding: 10px 0; font-weight: 600; color: #d97706; border-bottom: 1px solid #f0f0f0;">${typeLabel}</td></tr>
    <tr><td style="padding: 10px 0; color: #999; border-bottom: 1px solid #f0f0f0;">Fecha</td><td style="padding: 10px 0; font-weight: 600; color: #1a1a1a; border-bottom: 1px solid #f0f0f0;">${fecha}</td></tr>
    <tr><td style="padding: 10px 0; color: #999;">Estado</td><td style="padding: 10px 0; font-weight: 600; color: #1a1a1a;">Pendiente</td></tr>
  </table>
  ${inc.description ? `<div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 14px 16px; margin: 20px 0; font-size: 14px; color: #333; border-radius: 0 6px 6px 0;"><strong style="color: #d97706;">Descripción:</strong><br>${inc.description}</div>` : ''}
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
    <p style="color: #aaa; font-size: 11px; margin: 0;">Confidencial - Noucolor Pro · Mensaje generado automáticamente.</p>
  </div>
</div>`;

    for (const email of emails) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        from_name: 'Noucolor Pro',
        subject,
        body: emailBody
      });
    }

    return Response.json({ success: true, notified: emails.length, emails });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});