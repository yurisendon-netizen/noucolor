import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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

async function verifyPassword(input, stored) {
  if (isLegacyHash(stored)) {
    return (await legacyHashPassword(input)) === stored;
  }
  if (isSaltedHash(stored)) {
    const salt = stored.split(':')[0];
    return (await hashPassword(input, salt)) === stored;
  }
  return input === stored;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { username, password } = await req.json();

    if (!username || !password) {
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

    // Return employee data without the password
    const { pass, ...safeEmployee } = emp;
    return Response.json({ success: true, employee: safeEmployee });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});