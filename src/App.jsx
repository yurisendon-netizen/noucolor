import { Toaster } from "@/components/ui/toaster"
import OfflineBanner from "@/components/shared/OfflineBanner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { CustomAuthProvider, useCustomAuth } from '@/lib/CustomAuthContext';
import { ThemeProvider } from 'next-themes';
import ProtectedRoute from '@/components/ProtectedRoute';
import PushNavListener from '@/components/PushNavListener';

import Login from '@/pages/Login';
import TelefonoEmpresa from '@/pages/TelefonoEmpresa';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import ControlHorario from '@/pages/ControlHorario';
import HorasExtras from '@/pages/HorasExtras';
import PartesTrabajo from '@/pages/PartesTrabajo';
import Justificantes from '@/pages/Justificantes';
import PartesDiarios from '@/pages/PartesDiarios';
import Empleados from '@/pages/Empleados';
import EstadoNotificaciones from '@/pages/EstadoNotificaciones';
import RevisionJornadas from '@/pages/RevisionJornadas';
import Nominas from '@/pages/Nominas';
import Geolocalizacion from '@/pages/Geolocalizacion';
import Normas from '@/pages/Normas';
import Informes from '@/pages/Informes';
import RegistroFichajes from '@/pages/RegistroFichajes';
import Estadisticas from '@/pages/Estadisticas';
import BalanceObras from '@/pages/BalanceObras';
import Perfil from '@/pages/Perfil';
import CodigoSeguridad from '@/pages/CodigoSeguridad';

// Rol Terminal: con la sesión del terminal abierta, CUALQUIER URL lleva a /terminal
// (sin menú ni acceso a otras páginas). Sin ella, /terminal lleva al login.
function TerminalGate({ children }) {
  const { terminal } = useCustomAuth();
  const { pathname } = useLocation();
  if (terminal && pathname !== '/terminal') return <Navigate to="/terminal" replace />;
  if (!terminal && (pathname === '/terminal' || pathname === '/telefono')) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <CustomAuthProvider>
          <QueryClientProvider client={queryClientInstance}>
          <OfflineBanner />
          <Router>
            <ScrollToTop />
            <PushNavListener />
            <TerminalGate>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/terminal" element={<TelefonoEmpresa />} />
              <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/control-horario" element={<ControlHorario />} />
                <Route path="/horas-extras" element={<HorasExtras />} />
                  <Route path="/partes-trabajo" element={<PartesTrabajo />} />
                  <Route path="/partes-diarios" element={<PartesDiarios />} />
                  <Route path="/justificantes" element={<Justificantes />} />
                  <Route path="/empleados" element={<Empleados />} />
                  <Route path="/estado-notificaciones" element={<EstadoNotificaciones />} />
                  <Route path="/revision-jornadas" element={<RevisionJornadas />} />
                  <Route path="/nominas" element={<Nominas />} />
                  <Route path="/geolocalizacion" element={<Geolocalizacion />} />
                  <Route path="/normas" element={<Normas />} />
                  <Route path="/informes" element={<Informes />} />
                  <Route path="/registro-fichajes" element={<RegistroFichajes />} />
                  <Route path="/estadisticas" element={<Estadisticas />} />
                  <Route path="/balance-obras" element={<BalanceObras />} />
                  <Route path="/perfil" element={<Perfil />} />
                  <Route path="/codigo-seguridad" element={<CodigoSeguridad />} />
                </Route>
              </Route>
              <Route path="*" element={<PageNotFound />} />
            </Routes>
            </TerminalGate>
          </Router>
          <Toaster />
          </QueryClientProvider>
        </CustomAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App