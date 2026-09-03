import React from 'react';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DeleteAccountDialog from '@/components/perfil/DeleteAccountDialog';
import { Mail, Phone, Briefcase, Calendar, User, Hash, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ROLE_LABELS = {
  operario: 'Operario',
  administrador: 'Administrador',
  jefe: 'Jefe',
  admin: 'Administrador'
};

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function Perfil() {
  const { employee } = useCustomAuth();

  if (!employee) return null;

  const initials = (employee.full_name || '')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hireDate = employee.hire_date
    ? new Date(employee.hire_date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="page-transition">
      <PageHeader title="Mi Perfil" subtitle="Consulta tus datos personales y gestiona tu cuenta" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-xl font-bold overflow-hidden">
                {employee.avatar_url ? (
                  <img src={employee.avatar_url} alt={employee.full_name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-xl">{employee.full_name}</CardTitle>
                <CardDescription>
                  {ROLE_LABELS[employee.role] || employee.role}
                  {employee.position ? ` · ${employee.position}` : ''}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-8 sm:grid-cols-2">
            <DetailRow icon={User} label="Usuario" value={employee.user} />
            <DetailRow icon={Mail} label="Email" value={employee.email} />
            <DetailRow icon={Phone} label="Teléfono" value={employee.phone} />
            <DetailRow icon={Hash} label="Código de empleado" value={employee.employee_code} />
            <DetailRow icon={Briefcase} label="Puesto" value={employee.position} />
            <DetailRow icon={Calendar} label="Fecha de incorporación" value={hireDate} />
          </CardContent>
        </Card>

        <Card className="border-primary/30 h-fit">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound size={16} className="text-primary" />
              Código de seguridad
            </CardTitle>
            <CardDescription>
              Código de 4 dígitos para entrar en la app sin escribir tu contraseña cada vez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full h-11">
              <Link to="/codigo-seguridad">{employee.pin_set ? 'Cambiar código' : 'Crear código'}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 h-fit">
          <CardHeader>
            <CardTitle className="text-base">Eliminar cuenta</CardTitle>
            <CardDescription>
              Puedes eliminar tu cuenta en cualquier momento. Se borrará tu acceso a Noucolor
              y tus datos personales de forma permanente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountDialog />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}