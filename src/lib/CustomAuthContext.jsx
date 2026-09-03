import { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';

const AuthContext = createContext(null);

// Claves de sesión en localStorage. localStorage es almacenamiento persistente
// del navegador/app: sobrevive a cierres y reaperturas (semanas o meses) y solo
// se pierde si el usuario cierra sesión manualmente o borra los datos del
// navegador/app. El token de sesión no caduca en el backend, por lo que mientras
// permanezca en el dispositivo el operario entrará directo sin volver a loguearse.
const KEYS = {
  empId: 'noucolor_emp_id',
  token: 'noucolor_session_token',
  cache: 'noucolor_emp_cache',
};

function clearSessionStorage() {
  localStorage.removeItem(KEYS.empId);
  localStorage.removeItem(KEYS.token);
  localStorage.removeItem(KEYS.cache);
  localStorage.removeItem('noucolor_session');
  sessionStorage.removeItem('noucolor_pin_ok');
}

export function CustomAuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // El desbloqueo con código de seguridad solo vale para la carga actual:
    // al reabrir la app se vuelve a pedir el código (si el empleado tiene uno).
    sessionStorage.removeItem('noucolor_pin_ok');
    const savedId = localStorage.getItem(KEYS.empId);
    const sessionToken = localStorage.getItem(KEYS.token);
    const cached = localStorage.getItem(KEYS.cache);

    // Restauración instantánea desde caché: si tenemos un perfil guardado, lo
    // mostramos de inmediato para que al reabrir la app el operario entre directo
    // (sin pasar por el login) aunque la verificación con el backend tarde o
    // falle de forma transitoria.
    let restoredFromCache = false;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id === savedId) {
          setEmployee(parsed);
          restoredFromCache = true;
        }
      } catch { /* caché corrupta — la ignoramos */ }
    }

    if (savedId && sessionToken) {
      authInvoke('manageEmployee', { 
        action: 'getById', 
        employeeId: savedId,
      })
        .then(res => {
          if (res.data?.success && res.data.employee) {
            setEmployee(res.data.employee);
            localStorage.setItem(KEYS.cache, JSON.stringify(res.data.employee));
          } else {
            clearSessionStorage();
            setEmployee(null);
          }
        })
        .catch(err => {
          // 401/403 = el token de sesión ya no es válido (caducado, revocado o
          // el empleado se desactivó) → hay que volver a iniciar sesión.
          // Cualquier otro error (microcorte de red, cold-start, 500…) es
          // transitorio: NO borramos la sesión. Si restauramos desde caché el
          // operario sigue dentro de la app; si no, se le pedirá login pero el
          // token se mantiene para reintentar en la próxima apertura.
          const status = err?.status;
          if (status === 401 || status === 403) {
            clearSessionStorage();
            setEmployee(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      // No hay token en el dispositivo → sesión genuinely cerrada
      clearSessionStorage();
      setEmployee(null);
      setLoading(false);
    }
  }, []);

  async function login(username, password) {
    const result = await base44.functions.invoke('employeeLogin', { username, password });
    if (result.data?.success) {
      localStorage.setItem(KEYS.empId, result.data.employee.id);
      localStorage.setItem(KEYS.token, result.data.sessionToken);
      localStorage.setItem(KEYS.cache, JSON.stringify(result.data.employee));
      localStorage.setItem('noucolor_session', 'active');
      // Acabar de iniciar sesión con credenciales ya autentica: no se pide el código.
      sessionStorage.setItem('noucolor_pin_ok', '1');
      setEmployee(result.data.employee);
      return result.data.employee;
    }
    return null;
  }

  function logout() {
    clearSessionStorage();
    setEmployee(null);
    window.location.replace('/login');
  }

  return (
    <AuthContext.Provider value={{
      employee,
      loading,
      login,
      logout,
      isAdmin: employee?.role === 'administrador' || 
               employee?.role === 'jefe' || 
               employee?.role === 'admin' ||
               employee?.user === 'yuri' || 
               employee?.user === 'jordism' || 
               employee?.user === 'andrea',
      isJefe: employee?.user === 'yuri' || employee?.user === 'jordism'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCustomAuth() {
  return useContext(AuthContext);
}