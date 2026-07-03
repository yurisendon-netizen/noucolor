import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function useEmployeeProfile() {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const employees = await base44.entities.Employee.filter({ email: me.email });
        if (employees.length > 0) {
          const emp = employees[0];
          setEmployee(emp);
          setIsAdmin(emp.role === 'administrador');
        } else {
          setIsAdmin(me.role === 'admin');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { user, employee, loading, isAdmin };
}