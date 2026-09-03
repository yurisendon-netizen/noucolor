import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';

// Código de seguridad (PIN de 4 dígitos) del empleado — segunda pantalla de
// acceso estilo Armo. El código NUNCA se guarda en claro: solo su hash con
// sal única, mismo formato que las contraseñas ('<salt>:<sha256(salt:pin)>').

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
  const useSalt = salt || randomSaltHex();
  const data = new TextEncoder().encode(`${useSalt}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${useSalt}:${hex}`;
}

async function verifyPin(input, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const salt = stored.split(':')[0];
  return (await hashPin(input, salt)) === stored;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // La identidad SIEMPRE sale del token de sesión, nunca del body del cliente
    const session = await verifySession(base44, body.sessionToken);
    if (!session) {
      return Response.json({ success: false, error: 'Sesión no válida' }, { status: 401 });
    }
    const emp = session.employee;

    const pin = String(body.pin || '');
    if (!/^\d{4}$/.test(pin)) {
      return Response.json({ success: false, error: 'El código debe tener 4 dígitos' }, { status: 400 });
    }

    // Desbloqueo de la app: comprobar el código
    if (body.action === 'verify') {
      if (!emp.pin_hash) {
        return Response.json({ success: false, error: 'Sin código configurado' });
      }
      return Response.json({ success: await verifyPin(pin, emp.pin_hash) });
    }

    // Crear (primera vez) o cambiar (exige el código actual)
    if (body.action === 'set') {
      if (emp.pin_hash) {
        const current = String(body.current_pin || '');
        if (!(await verifyPin(current, emp.pin_hash))) {
          return Response.json({ success: false, error: 'El código actual no es correcto' }, { status: 403 });
        }
      }
      const hash = await hashPin(pin);
      await base44.asServiceRole.entities.Employee.update(emp.id, { pin_hash: hash });
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});