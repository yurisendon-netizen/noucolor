// Envío de correo vía Resend, usado para avisos que deben llegar a direcciones
// externas (empleados que no son usuarios de la plataforma Base44). El email
// integrado de Base44 (Core.SendEmail) solo entrega a usuarios registrados de
// Base44 — por eso los avisos a trabajadores nunca llegaban.

export async function sendResendEmail({ to, subject, html }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurado');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Noucolor <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Error enviando email con Resend');
  }
  return data;
}

export function buildWelcomeEmailHtml({ fullName, username, password }) {
  const firstName = (fullName || '').split(' ')[0];

  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:20px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:18px;padding:6px 12px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:12px;">Bienvenida a la plataforma</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">¡Bienvenido/a, ${firstName}!</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 20px;">Ya tienes acceso a la plataforma interna de Noucolor. Estas son tus credenciales:</p>
  <div style="background:#f9fafb;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:8px;">
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#999;width:120px;">Usuario</td><td style="padding:8px 0;font-weight:700;color:#1a1a1a;">${username}</td></tr>
      <tr><td style="padding:8px 0;color:#999;border-top:1px solid #eee;">Contraseña</td><td style="padding:8px 0;font-weight:700;color:#1a1a1a;border-top:1px solid #eee;">${password}</td></tr>
    </table>
  </div>
  <p style="color:#999;font-size:12px;line-height:1.5;margin:16px 0 0;">Te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor · Mensaje generado automáticamente.</p>
  </div>
</div>`;
}
