import { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export function CustomAuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem('noucolor_session');
    const empId = localStorage.getItem('noucolor_emp_id');
    if (session === 'active' && empId) {
      base44.entities.Employee.get(empId)
        .then(emp => setEmployee(emp))
        .catch(() => {
          localStorage.removeItem('noucolor_session');
          localStorage.removeItem('noucolor_emp_id');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(username, password) {
    const employees = await base44.entities.Employee.filter({
      user: username.toLowerCase(),
      pass: password
    });
    if (employees.length > 0) {
      const emp = employees[0];
      localStorage.setItem('noucolor_session', 'active');
      localStorage.setItem('noucolor_emp_id', emp.id);
      setEmployee(emp);
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