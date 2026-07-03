import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { CustomAuthProvider } from '@/lib/CustomAuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import ControlHorario from '@/pages/ControlHorario';
import HorasExtras from '@/pages/HorasExtras';
import PartesTrabajo from '@/pages/PartesTrabajo';
import Justificantes from '@/pages/Justificantes';
import Empleados from '@/pages/Empleados';
import RevisionJornadas from '@/pages/RevisionJornadas';
import Nominas from '@/pages/Nominas';
import Geolocalizacion from '@/pages/Geolocalizacion';
import Normas from '@/pages/Normas';

function App() {
  return (
    <AuthProvider>
      <CustomAuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/control-horario" element={<ControlHorario />} />
                <Route path="/horas-extras" element={<HorasExtras />} />
                  <Route path="/partes-trabajo" element={<PartesTrabajo />} />
                  <Route path="/justificantes" element={<Justificantes />} />
                  <Route path="/empleados" element={<Empleados />} />
                  <Route path="/revision-jornadas" element={<RevisionJornadas />} />
                  <Route path="/nominas" element={<Nominas />} />
                  <Route path="/geolocalizacion" element={<Geolocalizacion />} />
                  <Route path="/normas" element={<Normas />} />
                </Route>
              </Route>
              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </CustomAuthProvider>
    </AuthProvider>
  )
}

export default App