import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCustomAuth } from '@/lib/CustomAuthContext';

export default function ProtectedRoute({ unauthenticatedElement }) {
  const { employee, loading } = useCustomAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    // Si abren una ruta protegida sin sesión, van a login y vuelven después a
    // esa pantalla (returnTo) — clave para el deep-link de la notificación push.
    const returnTo = location.pathname + location.search;
    const dest = returnTo && !returnTo.startsWith('/login')
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : '/login';
    return <Navigate to={dest} replace />;
  }

  return <Outlet />;
}