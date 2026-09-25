import React, { useState, useEffect } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, RefreshCw, Smartphone, BellOff, BellRing, HelpCircle } from 'lucide-react';
import moment from 'moment';

const STATUS_META = {
  activadas: { label: 'Activadas', Icon: BellRing, badge: 'bg-success/10 text-success', dot: 'bg-success' },
  desactivadas: { label: 'Desactivadas', Icon: BellOff, badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-500', dot: 'bg-amber-500' },
  sin_dispositivo: { label: 'Sin dispositivo', Icon: Smartphone, badge: 'bg-secondary text-muted-foreground', dot: 'bg-muted-foreground' },
  error: { label: 'Error', Icon: HelpCircle, badge: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
};

export default function EstadoNotificaciones() {
  const { isAdmin } = useEmployeeProfile();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [empleados, setEmpleados] = useState([]);

  async function load() {
    try {
      const res = await authInvoke('onesignalUserStatus', {});
      if (res.data?.success) setEmpleados(res.data.employees || []);
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Estado de notificaciones" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">No tienes acceso a esta sección.</CardContent></Card>
      </div>
    );
  }

  const counts = empleados.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Estado de notificaciones"
        subtitle="Estado de las notificaciones push de cada trabajador"
        actions={
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); load(); }} disabled={refreshing} className="gap-2">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refrescar
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {['activadas', 'desactivadas', 'sin_dispositivo', 'error'].map(st => {
          const m = STATUS_META[st];
          return (
            <Card key={st}>
              <CardContent className="py-4 flex items-center gap-3">
                <m.Icon size={20} className={m.badge.split(' ').find(c => c.startsWith('text-'))} />
                <div>
                  <p className="text-2xl font-bold leading-none">{counts[st] || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : empleados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay empleados activos.</p>
          ) : (
            <div className="divide-y divide-border">
              {empleados.map(emp => {
                const m = STATUS_META[emp.status] || STATUS_META.error;
                const lastActive = emp.lastActive ? moment(new Date(emp.lastActive * 1000)).format('DD/MM/YYYY HH:mm') : null;
                return (
                  <div key={emp.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                        <Bell size={16} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {emp.devices > 0 ? `${emp.devices} dispositivo(s)` : ''}
                          {lastActive ? ` · Última actividad: ${lastActive}` : ''}
                          {emp.error ? ` · ${emp.error}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}