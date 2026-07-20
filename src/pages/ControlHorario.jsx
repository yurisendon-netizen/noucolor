import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, LogIn, LogOut, AlertTriangle, ShieldCheck, Eye, MapPin, ChevronDown, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import ClockInBanner from '@/components/clock/ClockInBanner';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

export default function ControlHorario() {
  const { employee, user } = useEmployeeProfile();
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const [entries, setEntries] = useState([]);
  const [openEntry, setOpenEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const notifiedRef = useRef({ date: '', reminded8: false, absent830: false, notified16: false });

  const empId = employee?.id || user?.id;
  const empName = employee?.full_name || user?.full_name || '';

  useEffect(() => {
    loadEntries();
  }, [empId]);

  useEffect(() => {
    if (!empId) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [empId]);

  useEffect(() => {
    if (!empId) return;
    const interval = setInterval(async () => {
      const now = new Date();
      setCurrentTime(now);
      const hour = now.getHours();
      const minutes = now.getMinutes();
      const today = now.toISOString().split('T')[0];

      if (notifiedRef.current.date !== today) {
        notifiedRef.current = { date: today, reminded8: false, absent830: false, notified16: false };
      }

      try {
        const res = await base44.functions.invoke('trackTime', { operation: 'listEntries', callerEmployeeId: empId, limit: 60 });
        const todayEntries = (res.data?.entries || []).filter(e => e.date === today);
        const hasOpen = todayEntries.some(e => e.status === 'abierto');
        const hasAbsence = todayEntries.some(e => e.status === 'ausencia_injustificada');

        if (hour === 8 && !hasOpen && !hasAbsence && !notifiedRef.current.reminded8) {
          notifiedRef.current.reminded8 = true;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Fichar entrada', { body: 'Fichar entrada antes de las 8:30' });
          }
        }

        if (hour === 8 && minutes >= 30 && !hasOpen && !hasAbsence && !notifiedRef.current.absent830) {
          notifiedRef.current.absent830 = true;
          await base44.functions.invoke('trackTime', {
            operation: 'registerAbsence',
            callerEmployeeId: empId,
            clockIn: now.toISOString(),
            date: today,
            description: 'No fichó la entrada antes de las 8:30'
          });
          toast({ title: '⚠️ Falta registrada', description: 'No has fichado antes de las 8:30. Falta registrada (no descuenta sueldo).' });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚠️ Falta registrada', { body: 'No has fichado antes de las 8:30. Falta registrada (no descuenta sueldo).' });
          }
          loadEntries();
        }

        if (hour === 16 && hasOpen && !notifiedRef.current.notified16) {
          notifiedRef.current.notified16 = true;
          toast({ title: '🔒 Hora de salida', description: 'Ventana de fichaje de salida: 16:00 - 16:30' });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🔒 Hora de salida', { body: 'Ventana de fichaje de salida: 16:00 - 16:30' });
          }
        }
      } catch (e) { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [empId]);

  async function loadEntries() {
    if (!empId) return;
    try {
      let res = await base44.functions.invoke('trackTime', { operation: 'listEntries', callerEmployeeId: empId, limit: 50 });
      let data = res.data?.entries || [];
      let open = data.find(e => e.status === 'abierto');

      const now = new Date();
      const hour = now.getHours();
      const minutes = now.getMinutes();

      // Auto-close at 16:30 (end of salida window) if still open — el servidor
      // recalcula la hora de salida y las horas trabajadas, no las mandamos nosotros.
      if (open && (hour > 16 || (hour === 16 && minutes >= 30))) {
        await base44.functions.invoke('trackTime', {
          operation: 'autoClose',
          callerEmployeeId: empId,
          entryId: open.id,
        });
        toast({ title: '🔒 Jornada cerrada automáticamente', description: 'Salida a las 16:00 — Próximo fichaje mañana a las 7:45' });
        res = await base44.functions.invoke('trackTime', { operation: 'listEntries', callerEmployeeId: empId, limit: 50 });
        data = res.data?.entries || [];
        open = null;
      }

      setEntries(data);
      setOpenEntry(open || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocalización no disponible'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // Location management now handled server-side via trackTime function

  async function handleClockIn() {
    setClockingIn(true);
    try {
      const loc = await getLocation();
      // La hora de entrada y si llega tarde las decide el servidor con su propio
      // reloj (ver trackTime/clockIn) — el móvil solo manda la ubicación.
      const res = await base44.functions.invoke('trackTime', {
        operation: 'clockIn',
        callerEmployeeId: empId,
        lat: loc.lat, lng: loc.lng,
      });
      const clockedAt = res.data?.clockIn ? moment(res.data.clockIn) : moment();

      if (res.data?.isLate) {
        toast({ title: '⚠️ Entrada tardía', description: `${clockedAt.format('HH:mm')} — Incumplimiento registrado` });
      } else {
        toast({ variant: 'success', title: '✅ Entrada fichada', description: `${clockedAt.format('HH:mm')} — Ubicación registrada` });
      }

      loadEntries();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setClockingIn(false);
    }
  }

  async function handleClockOut() {
    if (!openEntry) return;
    setClockingOut(true);
    try {
      const loc = await getLocation();
      // Horas trabajadas y horas extra las calcula el servidor a partir de la hora
      // de entrada guardada y su propio reloj (ver trackTime/clockOut) — el móvil
      // solo manda la ubicación.
      const res = await base44.functions.invoke('trackTime', {
        operation: 'clockOut',
        callerEmployeeId: empId,
        entryId: openEntry.id,
        lat: loc.lat, lng: loc.lng,
      });
      const clockedAt = res.data?.clockOut ? moment(res.data.clockOut) : moment();
      const regularHours = res.data?.totalHours ?? 0;
      const overtimeHours = res.data?.overtimeHours ?? 0;

      if (overtimeHours > 0) {
        toast({ variant: 'success', title: '✅ Salida fichada', description: `${clockedAt.format('HH:mm')} — ${regularHours.toFixed(1)}h regulares + ${overtimeHours}h extras` });
      } else {
        toast({ variant: 'success', title: '✅ Salida fichada', description: `${clockedAt.format('HH:mm')} — ${regularHours.toFixed(1)}h trabajadas` });
      }
      loadEntries();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setClockingOut(false);
    }
  }

  const now = currentTime;
  const today = now.toISOString().split('T')[0];
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const todayEntry = entries.find(e => e.date === today);
  const hasClosedToday = todayEntry && todayEntry.status === 'cerrado';
  const hasAbsenceToday = todayEntry && todayEntry.status === 'ausencia_injustificada';
  // Entry window: 7:45 - 8:30 (falta fires at 8:30)
  const inEntryWindow = (hour === 7 && minutes >= 45) || (hour === 8 && minutes < 30);
  const showBanner = hour === 8 && minutes < 30 && !openEntry && !hasAbsenceToday;
  const canClockIn = !openEntry && !hasClosedToday && !hasAbsenceToday && inEntryWindow;
  // Exit window: 16:00 - 16:30
  const inExitWindow = hour === 16 && minutes <= 30;
  const canClockOut = !!openEntry && inExitWindow;
  const showProximo = !openEntry && !canClockIn && !hasAbsenceToday;

  const columns = [
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'clock_in', label: 'Entrada', render: r => r.clock_in ? moment(r.clock_in).format('HH:mm') : '—' },
    { key: 'clock_out', label: 'Salida', render: r => r.clock_out ? moment(r.clock_out).format('HH:mm') : '—' },
    { key: 'total_hours', label: 'Horas', render: r => {
      if (!r.total_hours && r.total_hours !== 0) return '—';
      return r.overtime_hours ? `${r.total_hours}h + ${r.overtime_hours}h ext.` : `${r.total_hours}h`;
    }},
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  if (employee?.role === 'jefe') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader title="Control Horario" />
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Exento de fichaje</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Como jefe y propietario, no necesitas fichar entrada ni salida. Tu rol es supervisar al equipo.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/revision-jornadas" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Eye size={16} /> Ver fichajes del equipo
            </Link>
            <Link to="/geolocalizacion" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors">
              <MapPin size={16} /> Ver ubicaciones
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title="Control Horario" subtitle="Jornada 8:00 - 16:00 · Legislación laboral de Andorra" />

      <ClockInBanner
        visible={showBanner}
        onClockIn={handleClockIn}
        clockingIn={clockingIn}
      />

      {/* Hero: hora, estado de jornada y CTA de fichar — lo primero y más grande que ve el operario */}
      <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 mb-4 text-center">
        <p className="text-6xl sm:text-5xl font-bold font-mono tabular-nums tracking-tight">{moment(now).format('HH:mm')}</p>
        <p className="text-muted-foreground mt-1 capitalize">{moment(now).format('dddd, D [de] MMMM [de] YYYY')}</p>

        {openEntry && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-success/10">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-success">Jornada activa desde {moment(openEntry.clock_in).format('HH:mm')}</span>
          </div>
        )}
        {hasAbsenceToday && !openEntry && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-destructive/10">
            <AlertTriangle size={16} className="text-destructive" />
            <span className="text-sm font-medium text-destructive">Falta registrada hoy</span>
          </div>
        )}

        <div className="mt-6">
          {openEntry ? (
            canClockOut ? (
              <Button
                onClick={handleClockOut}
                disabled={clockingOut || !isOnline}
                variant="destructive"
                className="w-full sm:w-auto h-16 px-10 text-lg gap-3 rounded-xl shadow-lg"
              >
                {isOnline ? <LogOut size={24} /> : <WifiOff size={24} />}
                {!isOnline ? 'Sin conexión' : clockingOut ? 'Fichando...' : 'Fichar Salida'}
              </Button>
            ) : (
              <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-secondary text-muted-foreground text-base font-medium">
                <Clock size={20} />
                <span>Salida: 16:00 - 16:30</span>
              </div>
            )
          ) : showProximo ? (
            <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-secondary text-muted-foreground text-base font-medium">
              <Clock size={20} />
              <span>Próximo fichaje a las 7:45</span>
            </div>
          ) : (
            <Button
              onClick={handleClockIn}
              disabled={clockingIn || !isOnline}
              variant="success"
              className="w-full sm:w-auto h-16 px-10 text-lg gap-3 rounded-xl shadow-lg"
            >
              {isOnline ? <LogIn size={24} /> : <WifiOff size={24} />}
              {!isOnline ? 'Sin conexión' : clockingIn ? 'Fichando...' : 'Fichar Entrada'}
            </Button>
          )}
          {!isOnline && (canClockOut || (!openEntry && !showProximo)) && (
            <p className="text-xs text-muted-foreground mt-2">Necesitas conexión a internet para fichar.</p>
          )}
        </div>
      </div>

      <details className="group mb-6 rounded-xl border border-border bg-card open:pb-4">
        <summary className="list-none flex items-center gap-3 p-4 cursor-pointer select-none">
          <AlertTriangle size={18} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1">Normativa de fichaje</span>
          <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
        </summary>
        <div className="px-4 text-sm text-muted-foreground leading-relaxed">
          Entrada <strong className="text-foreground">7:45 - 8:15</strong> (falta si no fichas antes de las <strong className="text-foreground">8:30</strong>, no descuenta sueldo) · Salida <strong className="text-foreground">16:00 - 16:30</strong> · Cierre automático a las <strong className="text-foreground">16:00</strong> · <strong className="text-foreground">+2h extras</strong> si fichas salida después de las 16:00.
        </div>
      </details>

      <DataTable
        data={entries}
        onRefresh={loadEntries}
        columns={columns}
        searchField="date"
        filterField="status"
        filterOptions={[
          { value: 'abierto', label: 'Abierto' },
          { value: 'cerrado', label: 'Cerrado' },
          { value: 'ausencia_injustificada', label: 'Falta' },
        ]}
        emptyMessage="No hay fichajes registrados"
      />
    </div>
  );
}