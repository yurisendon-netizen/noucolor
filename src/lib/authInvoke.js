import { base44 } from '@/api/base44Client';

// Wraps base44.functions.invoke, auto-injecting the session token from localStorage.
// The token is a random unguessable string issued by employeeLogin on successful login.
// Backend functions verify it via the shared employeeAuth module instead of trusting
// a client-supplied employeeId.
export function authInvoke(functionName, payload = {}) {
  const sessionToken = localStorage.getItem('noucolor_session_token');
  if (!sessionToken) {
    return Promise.reject(new Error('No hay sesión activa'));
  }
  return base44.functions.invoke(functionName, { ...payload, sessionToken });
}