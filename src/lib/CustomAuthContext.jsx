import { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export function CustomAuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No recordar la sesión: en cada carga de la app se borra cualquier
    // sesión persistida y se exige login de nuevo. El estado de sesión
    // vive solo en memoria durante la visita actual.
    localStorage.removeItem('noucolor_session');
    localStorage.removeItem('noucolor_emp_id');
    setLoading(false);
  }, []);

  async function login(username, password) {
    const result = await base44.functions.invoke('employeeLogin', { username, password });
    if (result.data?.success) {
      localStorage.setItem('noucolor_session', 'active');
      localStorage.setItem('noucolor_emp_id', result.data.employee.id);
      setEmployee(result.data.employee);
      return true;
    }
    return false;
  }

  function logout() {
    localStorage.removeItem('noucolor_session');
    localStorage.removeItem('noucolor_emp_id');
    setEmployee(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{
      employee,
      loading,
      login,
      logout,
      isAdmin: employee?.role === 'administrador',
      isJefe: employee?.role === 'jefe'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCustomAuth() {
  return useContext(AuthContext);
}