import { Navigate, Outlet } from 'react-router-dom';
import { useCustomAuth } from '@/lib/CustomAuthContext';

export default function ProtectedRoute({ unauthenticatedElement }) {
  const { employee, loading } = useCustomAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return unauthenticatedElement || <Navigate to="/login" replace />;
  }

  return <Outlet />;
}