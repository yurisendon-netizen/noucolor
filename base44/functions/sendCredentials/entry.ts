import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function isHashed(pwd) {
  return typeof pwd === 'string' && pwd.length === 64 && /^[0-9a-f]+$/i.test(pwd);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });

    const appBaseUrl = req.headers.get('origin') || '';
    const appLink = appBaseUrl ? appBaseUrl.replace(/\/$/, '') + '/login' : '';

    const results = [];
    for (const emp of employees) {
      // Skip employees with hashed passwords (can't recover plaintext)
      if (isHashed(emp.pass)) {
        results.push({ name: emp.full_name, skipped: 'Contraseña ya hasheada' });
        continue;
      }
      if (!emp.email || !emp.user || !emp.pass) {
        results.push({ name: emp.full_name, skipped: 'Faltan datos (email/usuario/contraseña)' });
        continue;
      }

      const buttonHtml = appLink
        ? `<a href="${appLink}" style="display:inline-block;background:#f59e0b;color:#1a1a1a;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Acceder a la plataforma</a>`
        : '';

      const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:20px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:18px;padding:6px 12px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:12px;">Acceso a la plataforma</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">Hola ${emp.full_name.split(' ')[0]},</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 20px;">Estas son tus credenciales para acceder a la plataforma interna de Noucolor:</p>
  <div style="background:#f9fafb;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:8px;">
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#999;width:120px;">Usuario</td><td style="padding:8px 0;font-weight:700;color:#1a1a1a;">${emp.user}</td></tr>
      <tr><td style="padding:8px 0;color:#999;border-top:1px solid #eee;">Contraseña</td><td style="padding:8px 0;font-weight:700;color:#1a1a1a;border-top:1px solid #eee;">${emp.pass}</td></tr>
    </table>
  </div>
  ${buttonHtml}
  <p style="color:#999;font-size:12px;line-height:1.5;margin:16px 0 0;">Te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor · Mensaje generado automáticamente.</p>
  </div>
</div>`;

      try {
        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Noucolor <onboarding@resend.dev>',
            to: [emp.email],
            subject: 'Noucolor - Tus credenciales de acceso',
            html: html
          })
        });
        if (!resendResp.ok) {
          const errData = await resendResp.json().catch(() => ({}));
          throw new Error(errData.message || `Resend error ${resendResp.status}`);
        }
        results.push({ name: emp.full_name, email: emp.email, sent: true });
      } catch (err) {
        results.push({ name: emp.full_name, error: err.message });
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});