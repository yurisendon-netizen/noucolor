import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, LogIn, LogOut, AlertTriangle, ShieldCheck, Eye, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

export default function ControlHorario() {
  const { employee, user } = useEmployeeProfile();
  const { toast } = useToast();
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
        const todayEntries = await base44.entities.TimeEntry.filter({ employee_id: empId, date: today });
        const hasOpen = todayEntries.some(e => e.status === 'abierto');
        const hasAbsence = todayEntries.some(e => e.status === 'ausencia_injustificada');

        if (hour === 8 && !hasOpen && !hasAbsence && !notifiedRef.current.reminded8) {
          notifiedRef.current.reminded8 = true;
          toast({ title: '⏰ Fichar entrada', description: 'Fichar entrada antes de las 8:30' });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Fichar entrada', { body: 'Fichar entrada antes de las 8:30' });
          }
        }

        if (hour === 8 && minutes >= 30 && !hasOpen && !hasAbsence && !notifiedRef.current.absent830) {
          notifiedRef.current.absent830 = true;
          await base44.entities.TimeEntry.create({
            employee_id: empId, employee_name: empName,
            clock_in: now.toISOString(), date: today, status: 'ausencia_injustificada'
          });
          await base44.entities.Incumplimiento.create({
            employee_id: empId, employee_name: empName,
            date: today, type: 'sin_fichar',
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
      let data = await base44.entities.TimeEntry.filter({ employee_id: empId }, '-date', 50);
      let open = data.find(e => e.status === 'abierto');

      const now = new Date();
      const hour = now.getHours();
      const minutes = now.getMinutes();

      // Auto-close at 16:30 (end of salida window) if still open
      if (open && (hour > 16 || (hour === 16 && minutes >= 30))) {
        const clockOut = new Date();
        clockOut.setHours(16, 0, 0, 0);
        const clockIn = new Date(open.clock_in);
        const regularHours = Math.min(Math.max(((clockOut - clockIn) / 3600000), 0), 8);
        await base44.entities.TimeEntry.update(open.id, {
          clock_out: clockOut.toISOString(),
          total_hours: parseFloat(regularHours.toFixed(2)),
          overtime_hours: 0,
          status: 'cerrado',
          auto_closed: true
        });
        await deactivateLocation();
        toast({ title: '🔒 Jornada cerrada automáticamente', description: 'Salida a las 16:00 — Próximo fichaje mañana a las 7:45' });
        data = await base44.entities.TimeEntry.filter({ employee_id: empId }, '-date', 50);
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

  // Capture location ONLY at clock-in / clock-out (no continuous tracking)
  async function upsertEmployeeLocation(isActive, coords) {
    try {
      const locs = await base44.entities.EmployeeLocation.filter({ employee_id: empId });
      const data = {
        employee_id: empId, employee_name: empName,
        latitude: coords.lat, longitude: coords.lng,
        is_active: isActive, last_update: new Date().toISOString()
      };
      if (locs.length > 0) await base44.entities.EmployeeLocation.update(locs[0].id, data);
      else await base44.entities.EmployeeLocation.create(data);
    } catch (e) { /* silent */ }
  }

  async function deactivateLocation() {
    try {
      const locs = await base44.entities.EmployeeLocation.filter({ employee_id: empId });
      locs.forEach(l => base44.entities.EmployeeLocation.update(l.id, { is_active: false, last_update: new Date().toISOString() }));
    } catch (e) { /* silent */ }
  }

  async function handleClockIn() {
    setClockingIn(true);
    try {
      const loc = await getLocation();
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const hour = now.getHours();
      const minutes = now.getMinutes();

      const todayEntries = await base44.entities.TimeEntry.filter({ employee_id: empId, date: today });
      const absenceEntry = todayEntries.find(e => e.status === 'ausencia_injustificada');

      if (absenceEntry) {
        await base44.entities.TimeEntry.update(absenceEntry.id, {
          clock_in: now.toISOString(),
          clock_in_lat: loc.lat, clock_in_lng: loc.lng,
          status: 'abierto'
        });
      } else {
        await base44.entities.TimeEntry.create({
          employee_id: empId, employee_name: empName,
          clock_in: now.toISOString(), date: today,
          clock_in_lat: loc.lat, clock_in_lng: loc.lng, status: 'abierto'
        });
      }

      await upsertEmployeeLocation(true, loc);

      // Late entry: after 8:15 (window is 7:45 - 8:15)
      if (hour > 8 || (hour === 8 && minutes > 15)) {
        await base44.entities.Incumplimiento.create({
          employee_id: empId, employee_name: empName,
          date: today, type: 'entrada_tardia',
          description: `Fichó entrada a las ${moment(now).format('HH:mm')} (límite 8:15)`
        });
        toast({ title: '⚠️ Entrada tardía', description: `${moment(now).format('HH:mm')} — Incumplimiento registrado` });
      } else {
        toast({ title: '✅ Entrada fichada', description: `${moment(now).format('HH:mm')} — Ubicación registrada` });
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
      const now = new Date();
      const clockIn = new Date(openEntry.clock_in);
      const sixteenToday = new Date();
      sixteenToday.setHours(16, 0, 0, 0);

      // Flat +2h overtime if clocking out after 16:00; regular hours capped at 8 (until 16:00)
      const isAfter16 = now > sixteenToday;
      let regularHours, overtimeHours;
      if (isAfter16) {
        regularHours = ((sixteenToday - clockIn) / 3600000);
        overtimeHours = 2;
      } else {
        regularHours = ((now - clockIn) / 3600000);
        overtimeHours = 0;
      }
      regularHours = Math.min(Math.max(regularHours, 0), 8);

      await base44.entities.TimeEntry.update(openEntry.id, {
        clock_out: now.toISOString(), clock_out_lat: loc.lat, clock_out_lng: loc.lng,
        total_hours: parseFloat(regularHours.toFixed(2)),
        overtime_hours: parseFloat(overtimeHours.toFixed(2)),
        status: 'cerrado'
      });
      await upsertEmployeeLocation(false, loc);

      if (overtimeHours > 0) {
        toast({ title: '✅ Salida fichada', description: `${moment(now).format('HH:mm')} — ${regularHours.toFixed(1)}h regulares + ${overtimeHours}h extras` });
      } else {
        toast({ title: '✅ Salida fichada', description: `${moment(now).format('HH:mm')} — ${regularHours.toFixed(1)}h trabajadas` });
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
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  if (employee?.role === 'jefe') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader title="Control Horario" />
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[hsl(35,92%,55%)]/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-[hsl(35,92%,55%)]" />
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
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title="Control Horario" subtitle="Jornada 8:00 - 16:00 · Legislación laboral de Andorra" />

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle size={20} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300/90">
          <p className="font-medium mb-1">Normativa de fichaje</p>
          <p>Entrada <strong>7:45 - 8:15</strong> (falta si no fichas antes de las <strong>8:30</strong>, no descuenta sueldo) · Salida <strong>16:00 - 16:30</strong> · Cierre automático a las <strong>16:00</strong> · <strong>+2h extras</strong> si fichas salida después de las 16:00.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 text-center sm:text-left">
            <p className="text-4xl font-bold font-mono">{moment(now).format('HH:mm')}</p>
            <p className="text-muted-foreground mt-1">{moment(now).format('dddd, D [de] MMMM [de] YYYY')}</p>
            {openEntry && (
              <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-emerald-400">Jornada activa desde {moment(openEntry.clock_in).format('HH:mm')}</span>
              </div>
            )}
            {hasAbsenceToday && !openEntry && (
              <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm text-red-400">Falta registrada hoy</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {openEntry ? (
              canClockOut ? (
                <Button onClick={handleClockOut} disabled={clockingOut} variant="destructive" className="gap-2">
                  <LogOut size={18} />
                  {clockingOut ? 'Fichando...' : 'Fichar Salida'}
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-sm">
                  <Clock size={18} />
                  <span>Salida: 16:00 - 16:30</span>
                </div>
              )
            ) : showProximo ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-sm">
                <Clock size={18} />
                <span>Próximo fichaje a las 7:45</span>
              </div>
            ) : (
              <Button onClick={handleClockIn} disabled={clockingIn} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <LogIn size={18} />
                {clockingIn ? 'Fichando...' : 'Fichar Entrada'}
              </Button>
            )}
          </div>
        </div>
      </div>

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