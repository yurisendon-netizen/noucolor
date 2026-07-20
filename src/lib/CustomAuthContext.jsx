import { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';

const AuthContext = createContext(null);

export function CustomAuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedId = localStorage.getItem('noucolor_emp_id');
    const sessionToken = localStorage.getItem('noucolor_session_token');
    
    if (savedId && sessionToken) {
      authInvoke('manageEmployee', { 
        action: 'getById', 
        employeeId: savedId,
      })
        .then(res => {
          if (res.data?.success && res.data.employee) {
            setEmployee(res.data.employee);
          } else {
            clearSession();
          }
        })
        .catch(() => clearSession())
        .finally(() => setLoading(false));
    } else {
      clearSession();
      setLoading(false);
    }
  }, []);

  function clearSession() {
    localStorage.clear();
  }

  async function login(username, password) {
    const result = await base44.functions.invoke('employeeLogin', { username, password });
    if (result.data?.success) {
      localStorage.setItem('noucolor_session', 'active');
      localStorage.setItem('noucolor_emp_id', result.data.employee.id);
      localStorage.setItem('noucolor_session_token', result.data.sessionToken);
      setEmployee(result.data.employee);
      return true;
    }
    return false;
  }

  function logout() {
    clearSession();
    setEmployee(null);
    window.location.replace('/login');   // ← Esta línea es clave
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