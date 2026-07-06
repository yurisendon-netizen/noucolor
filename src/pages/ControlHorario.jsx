import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, MapPin, LogIn, LogOut } from 'lucide-react';
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
  const watchIdRef = useRef(null);
  const notifiedRef = useRef({ date: '', reminded: false, warned: false });
  const [currentTime, setCurrentTime] = useState(new Date());

  const empId = employee?.id || user?.id;
  const empName = employee?.full_name || user?.full_name || '';

  useEffect(() => {
    loadEntries();
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [empId]);

  useEffect(() => {
    if (!empId) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const interval = setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();
      const minutes = now.getMinutes();
      const today = now.toISOString().split('T')[0];
      if (notifiedRef.current.date !== today) {
        notifiedRef.current = { date: today, reminded: false, warned: false };
      }
      if (hour !== 8) return;
      try {
        const todayEntries = await base44.entities.TimeEntry.filter({ employee_id: empId, date: today });
        if (todayEntries.length > 0) return;
        if (minutes < 30 && !notifiedRef.current.reminded) {
          notifiedRef.current.reminded = true;
          toast({ title: '⏰ Recuerda fichar', description: 'Tienes hasta las 8:30 para fichar tu entrada' });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Recuerda fichar', { body: 'Tienes hasta las 8:30 para fichar tu entrada' });
          }
        } else if (minutes >= 30 && !notifiedRef.current.warned) {
          notifiedRef.current.warned = true;
          toast({ title: '⚠️ No has fichado', description: 'Has superado el límite de 8:30. Hoy no cobrarás este día.' });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚠️ No has fichado', { body: 'Has superado el límite de 8:30. Hoy no cobrarás este día.' });
          }
        }
      } catch (e) { /* silent */ }
    }, 60000);
    return () => clearInterval(interval);
  }, [empId]);

  useEffect(() => {
    if (!empId) return;
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      if (now.getHours() >= 16 && openEntry) {
        loadEntries();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [empId, openEntry]);

  async function loadEntries() {
    if (!empId) return;
    try {
      let data = await base44.entities.TimeEntry.filter({ employee_id: empId }, '-date', 50);
      let open = data.find(e => e.status === 'abierto');

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const hour = now.getHours();

      // Auto-cierre a las 16:00
      if (open && hour >= 16) {
        const clockOut = new Date(open.clock_in);
        clockOut.setHours(16, 0, 0, 0);
        const hours = ((clockOut - new Date(open.clock_in)) / 3600000).toFixed(2);
        await base44.entities.TimeEntry.update(open.id, {
          clock_out: clockOut.toISOString(),
          total_hours: parseFloat(hours),
          status: 'cerrado'
        });
        stopLocationTracking();
        toast({ title: '🔒 Jornada cerrada automáticamente', description: 'Salida a las 16:00 — Próximo fichaje mañana a las 8:00' });
        data = await base44.entities.TimeEntry.filter({ employee_id: empId }, '-date', 50);
        open = null;
      }

      // Auto-reapertura a las 8:00 si el último fichaje es de un día anterior
      if (!open && data.length > 0 && data[0].status === 'cerrado' && data[0].date < today && hour >= 8) {
        const eightAm = new Date();
        eightAm.setHours(8, 0, 0, 0);
        await base44.entities.TimeEntry.create({
          employee_id: empId, employee_name: empName,
          clock_in: eightAm.toISOString(), date: today,
          status: 'abierto'
        });
        toast({ title: '🔄 Jornada iniciada automáticamente', description: 'Entrada a las 08:00' });
        data = await base44.entities.TimeEntry.filter({ employee_id: empId }, '-date', 50);
        open = data.find(e => e.status === 'abierto');
      }

      setEntries(data);
      setOpenEntry(open || null);
      if (open) startLocationTracking();
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

  function startLocationTracking() {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await base44.entities.EmployeeLocation.filter({ employee_id: empId }).then(async (locs) => {
            const data = {
              employee_id: empId, employee_name: empName,
              latitude: pos.coords.latitude, longitude: pos.coords.longitude,
              is_active: true, last_update: new Date().toISOString()
            };
            if (locs.length > 0) await base44.entities.EmployeeLocation.update(locs[0].id, data);
            else await base44.entities.EmployeeLocation.create(data);
          });
        } catch (e) { /* silent */ }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
  }

  function stopLocationTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    base44.entities.EmployeeLocation.filter({ employee_id: empId }).then(locs => {
      locs.forEach(l => base44.entities.EmployeeLocation.update(l.id, { is_active: false }));
    });
  }

  async function handleClockIn() {
    setClockingIn(true);
    try {
      const loc = await getLocation();
      const now = new Date();
      await base44.entities.TimeEntry.create({
        employee_id: empId, employee_name: empName,
        clock_in: now.toISOString(), date: now.toISOString().split('T')[0],
        clock_in_lat: loc.lat, clock_in_lng: loc.lng, status: 'abierto'
      });
      startLocationTracking();
      toast({ title: '✅ Entrada fichada', description: `${moment(now).format('HH:mm')} — Ubicación registrada` });
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
      const hours = ((now - new Date(openEntry.clock_in)) / 3600000).toFixed(2);
      await base44.entities.TimeEntry.update(openEntry.id, {
        clock_out: now.toISOString(), clock_out_lat: loc.lat, clock_out_lng: loc.lng,
        total_hours: parseFloat(hours), status: 'cerrado'
      });
      stopLocationTracking();
      toast({ title: '✅ Salida fichada', description: `${moment(now).format('HH:mm')} — ${hours}h trabajadas` });
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
  const lastEntry = entries[0];
  const showProximoFichaje = !openEntry && lastEntry && lastEntry.status === 'cerrado' &&
    ((lastEntry.date === today && hour >= 16) || (lastEntry.date < today && hour < 8));

  const columns = [
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'clock_in', label: 'Entrada', render: r => moment(r.clock_in).format('HH:mm') },
    { key: 'clock_out', label: 'Salida', render: r => r.clock_out ? moment(r.clock_out).format('HH:mm') : '—' },
    { key: 'total_hours', label: 'Horas', render: r => r.total_hours ? `${r.total_hours}h` : '—' },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title="Control Horario" subtitle="Registra tu entrada y salida diaria" />

      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 text-center sm:text-left">
            <p className="text-4xl font-bold font-mono">{moment().format('HH:mm')}</p>
            <p className="text-muted-foreground mt-1">{moment().format('dddd, D [de] MMMM [de] YYYY')}</p>
            {openEntry && (
              <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-emerald-400">Jornada activa desde {moment(openEntry.clock_in).format('HH:mm')}</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {openEntry ? (
              <Button onClick={handleClockOut} disabled={clockingOut} variant="destructive" className="gap-2">
                <LogOut size={18} />
                {clockingOut ? 'Fichando...' : 'Fichar Salida'}
              </Button>
            ) : showProximoFichaje ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-sm">
                <Clock size={18} />
                <span>Próximo fichaje a las 8:00 del día siguiente</span>
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
        columns={columns}
        searchField="date"
        filterField="status"
        filterOptions={[{ value: 'abierto', label: 'Abierto' }, { value: 'cerrado', label: 'Cerrado' }]}
        emptyMessage="No hay fichajes registrados"
      />
    </div>
  );
}