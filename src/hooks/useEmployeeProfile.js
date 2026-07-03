import { useCustomAuth } from '@/lib/CustomAuthContext';

export default function useEmployeeProfile() {
  const { employee, loading, isAdmin } = useCustomAuth();
  return {
    employee,
    user: employee,
    loading,
    isAdmin
  };
}