import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { generateSessionToken } from '../../shared/employeeAuth.ts';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy format (pre-migration): SHA-256('noucolor_salt_' + password) — one static salt shared by
// every user. Kept only so already-stored hashes can still be verified and transparently upgraded.
async function legacyHashPassword(password) {
  return sha256Hex('noucolor_salt_' + password);
}
function isLegacyHash(pwd) {
  return typeof pwd === 'string' && pwd.length === 64 && /^[0-9a-f]+$/i.test(pwd);
}

// Current format: '<random salt>:<sha256(salt:password)>' — unique salt per password.
async function hashPassword(password, salt) {
  const useSalt = salt || randomSaltHex();
  const hash = await sha256Hex(`${useSalt}:${password}`);
  return `${useSalt}:${hash}`;
}
function isSaltedHash(pwd) {
  return typeof pwd === 'string' && /^[0-9a-f]{32}:[0-9a-f]{64}$/i.test(pwd);
}
function isHashed(pwd) {
  return isLegacyHash(pwd) || isSaltedHash(pwd);
}

// The password is the employee's CASS/DNI, whose trailing letter is conventionally
// uppercase (e.g. "283634F"). Accept the password case-insensitively so a worker
// typing the letter lowercase ("283634f") still logs in.
async function verifyPassword(input, stored) {
  const variants = [input];
  const upper = input.toUpperCase();
  if (upper !== input) variants.push(upper);
  for (const v of variants) {
    if (isLegacyHash(stored)) {
      if ((await legacyHashPassword(v)) === stored) return true;
    } else if (isSaltedHash(stored)) {
      const salt = stored.split(':')[0];
      if ((await hashPassword(v, salt)) === stored) return true;
    } else if (v === stored) {
      return true;
    }
  }
  return false;
}

// Código de seguridad (PIN de 4 dígitos): mismo formato de hash con sal única
// que las contraseñas ('<salt>:<sha256(salt:pin)>').
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
    const { username, password, pin } = await req.json();

    if (!username || (!password && !pin)) {
      return Response.json({ success: false }, { status: 400 });
    }

    // Case-insensitive username match (stored user may be capitalized)
    const activeEmployees = await base44.asServiceRole.entities.Employee.filter({
      is_active: true
    });
    const emp = activeEmployees.find(
      e => typeof e.user === 'string' && e.user.toLowerCase() === username.toLowerCase()
    );

    if (!emp) {
      return Response.json({ success: false });
    }

    // Login con código de seguridad: única credencial válida una vez el
    // empleado ha registrado su PIN (la contraseña queda desactivada).
    if (pin) {
      if (!emp.pin_hash || !(await verifyPin(String(pin), emp.pin_hash))) {
        return Response.json({ success: false });
      }
      const { token: pinSessionToken, tokenHash: pinTokenHash } = await generateSessionToken();
      await base44.asServiceRole.entities.Employee.update(emp.id, { session_token: pinTokenHash });
      const { pass, session_token, pin_hash, ...pinSafeEmployee } = emp;
      return Response.json({ success: true, employee: { ...pinSafeEmployee, pin_set: true }, sessionToken: pinSessionToken });
    }

    // Login con contraseña: rechazado si el empleado ya tiene PIN registrado.
    if (emp.pin_hash) {
      return Response.json({ success: false, pin_required: true });
    }
    const valid = await verifyPassword(password, emp.pass);
    if (!valid) {
      return Response.json({ success: false });
    }

    // Upgrade plaintext or legacy shared-salt hashes to the per-user-salt format on successful login
    if (!isSaltedHash(emp.pass)) {
      const hashedPass = await hashPassword(password);
      await base44.asServiceRole.entities.Employee.update(emp.id, { pass: hashedPass });
      const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: emp.id });
      if (datos.length > 0) {
        await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, { pass: hashedPass });
      }
    }

    // Issue a new session token (hash stored on Employee, plaintext returned to client)
    const { token: sessionToken, tokenHash } = await generateSessionToken();
    await base44.asServiceRole.entities.Employee.update(emp.id, { session_token: tokenHash });

    // Return employee data without the password, PIN or session token hash.
    // pin_set indica al cliente si el empleado ya tiene código de seguridad.
    const { pass, session_token, pin_hash, ...safeEmployee } = emp;
    return Response.json({ success: true, employee: { ...safeEmployee, pin_set: !!pin_hash }, sessionToken });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});