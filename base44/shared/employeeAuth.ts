// Shared session-token utilities used by employeeLogin, manageEmployee, and trackTime.
// The plaintext token is NEVER stored — only its SHA-256 hash, so a DB leak
// cannot be used to forge a session.

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomTokenHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns { token (plaintext, returned to client), tokenHash (stored on Employee) }
export async function generateSessionToken() {
  const token = randomTokenHex(32);
  const tokenHash = await sha256Hex(token);
  return { token, tokenHash };
}

// Verifies a session token against the stored hash. Returns { employee, isAdmin } or null.
export async function verifySession(base44, sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  const tokenHash = await sha256Hex(sessionToken);
  const employees = await base44.asServiceRole.entities.Employee.filter({ session_token: tokenHash });
  if (employees.length === 0) return null;
  const employee = employees[0];
  if (employee.is_active === false) return null;
  const isAdmin = ['administrador', 'jefe', 'admin'].includes(employee.role);
  return { employee, isAdmin };
}