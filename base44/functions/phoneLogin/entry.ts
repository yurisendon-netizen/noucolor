import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { generateSessionToken, hashPin } from '../../shared/employeeAuth.ts';

// Login de un teléfono de empresa (TelefonoEmpresa). La contraseña se guarda
// con el mismo formato que las demás: '<salt>:<sha256(salt:password)>'.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // El terminal entra desde el login normal con usuario + PIN de 4 cifras
    // (se acepta también 'password' por compatibilidad: es el mismo hash).
    const body = await req.json().catch(() => ({}));
    const username = body.username;
    const password = body.pin ?? body.password;
    if (!username || !password) {
      return Response.json({ success: false, error: 'Faltan usuario o contraseña' }, { status: 400 });
    }
    const phones = await base44.asServiceRole.entities.TelefonoEmpresa.list('user', 50);
    const phone = phones.find(p => typeof p.user === 'string' && p.user.toLowerCase() === String(username).trim().toLowerCase());
    if (!phone || typeof phone.pass !== 'string' || !phone.pass.includes(':')) {
      return Response.json({ success: false, error: 'Usuario o contraseña incorrectos' });
    }
    const salt = phone.pass.split(':')[0];
    if ((await hashPin(String(password), salt)) !== phone.pass) {
      return Response.json({ success: false, error: 'Usuario o contraseña incorrectos' });
    }
    if (phone.activo !== true) {
      return Response.json({ success: false, error: 'Este teléfono todavía no está activado. Avisa a un administrador.' });
    }
    const { token, tokenHash } = await generateSessionToken();
    await base44.asServiceRole.entities.TelefonoEmpresa.update(phone.id, { session_token: tokenHash });
    return Response.json({ success: true, role: 'terminal', phone: { id: phone.id, nombre: phone.nombre }, sessionToken: token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
