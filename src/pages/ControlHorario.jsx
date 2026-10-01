import React, { useState, useEffect, useRef } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { Clock, LogIn, LogOut, AlertTriangle, ShieldCheck, Eye, MapPin, ChevronDown, WifiOff, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import ClockInBanner from '@/components/clock/ClockInBanner';
import AdminOpenEntryDialog from '@/components/clock/AdminOpenEntryDialog';
import SolicitudCorreccionDialog from '@/components/clock/SolicitudCorreccionDialog';
import SolicitudesPendientes from '@/components/clock/SolicitudesPendientes';
import StatusBadge from '@/components/shared/StatusBadge';
import { ClipboardEdit } from 'lucide-react';
import moment from 'moment';
import { getFreshLocation, recordPosition } from '@/lib/locationWarmup';

// Fichar exige la ubicación REAL del móvil: nunca se usan coordenadas de respaldo.
// Se espera hasta GPS_MAX_WAIT_MS a que el GPS fije y se guarda la mejor lectura.
const GPS_MAX_WAIT_MS = 25000;
const GPS_GOOD_ACCURACY_M = 50;
// Más error que esto = ubicación aproximada (red/wifi): NO se ficha.
const GPS_MAX_ACCEPT_M = 200;

export default function ControlHorario() {
  const { employee, user, isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const [entries, setEntries] = useState([]);
  const [openEntry, setOpenEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [adminEntryOpen, setAdminEntryOpen] = useState(false);
  const [correccionOpen, setCorreccionOpen] = useState(false);
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
        const res = await authInvoke('trackTime', { operation: 'listEntries',  limit: 60 });
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
          await authInvoke('trackTime', {
            operation: 'registerAbsence',
            
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
      let res = await authInvoke('trackTime', { operation: 'listEntries',  limit: 50 });
      let data = res.data?.entries || [];
      let open = data.find(e => e.status === 'abierto');

      const now = new Date();
      const hour = now.getHours();
      const minutes = now.getMinutes();

      // Auto-close at 16:30 (end of salida window) if still open — el servidor
      // recalcula la hora de salida y las horas trabajadas, no las mandamos nosotros.
      if (open && (hour > 16 || (hour === 16 && minutes >= 30))) {
        await authInvoke('trackTime', {
          operation: 'autoClose',
          entryId: open.id,
        });
        toast({ title: '🔒 Jornada cerrada automáticamente', description: 'Salida a las 16:00 — Próximo fichaje mañana a las 7:45' });
        res = await authInvoke('trackTime', { operation: 'listEntries', limit: 50 });
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

  // Traduce un error de navigator.geolocation a un mensaje claro en español
  // para el operario (permiso denegado / GPS apagado / timeout). Devuelve null
  // si el error no es de geolocalización (p.ej. un fallo de red del servidor).
  function geoErrorMessage(e) {
    if (!e) return null;
    if (typeof e.code === 'number' && e.code >= 1 && e.code <= 4) {
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      if (e.code === 4) {
        const acc = Number.isFinite(e.accuracy) ? e.accuracy : null;
        const accTxt = acc !== null ? ` (±${acc} m)` : '';
        if (acc !== null && acc < 1000) {
          return `Tu ubicación no es precisa${accTxt}. No se ha fichado. Sal al exterior o acércate a una ventana, espera unos segundos y vuelve a fichar.`;
        }
        return ios
          ? `Tu móvil da una ubicación aproximada${accTxt}. No se ha fichado. Ajustes → Privacidad y seguridad → Localización → Safari (o Noucolor) → activa "Ubicación exacta". Después vuelve a fichar.`
          : `Tu móvil da una ubicación aproximada${accTxt}. No se ha fichado. Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → activa "Usar ubicación precisa". Después vuelve a fichar.`;
      }
      if (e.code === 4) {
        return `Tu móvil solo da una ubicación aproximada${acc !== null ? ` (±${acc} m)` : ''}, no la del GPS. En iPhone: Ajustes → Privacidad → Localización → Safari (o Noucolor) → activa "Ubicación exacta". En Android: activa "Ubicación precisa". Sal al exterior y vuelve a fichar.`;
      }
      if (e.code === 1) {
        return ios
          ? 'No se ha fichado: el permiso de ubicación está bloqueado. Ajustes → Privacidad y seguridad → Localización → Safari (o Noucolor) → "Al usar la app" y "Ubicación exacta". Después vuelve a fichar.'
          : 'No se ha fichado: el permiso de ubicación está bloqueado. En Chrome toca el icono a la izquierda de la dirección → Permisos → Ubicación → Permitir. Si no sale: Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → Permitir. Después vuelve a fichar.';
      }
      if (e.code === 3) {
        return 'No hemos podido obtener tu ubicación (tiempo agotado). Asegúrate de tener el GPS activado y buena señal, e inténtalo de nuevo.';
      }
      // code 2 — POSITION_UNAVAILABLE: GPS apagado o sin señal
      return 'No hemos podido obtener tu ubicación. Activa el GPS de tu móvil (Ajustes → Ubicación → Activar) con buena señal y vuelve a intentar fichar.';
    }
    if (typeof e.message === 'string' && /geolocalización no disponible/i.test(e.message)) {
      return 'Tu dispositivo no admite geolocalización: necesitas un móvil con GPS para fichar.';
    }
    return null;
  }

  // Obtiene la ubicación real del móvil. Escucha el GPS hasta 25 s y se queda con
  // la lectura más precisa; si llega una de 50 m o menos, la acepta al momento.
  // Si no hay ninguna lectura, rechaza con el código de error (1 = permiso
  // denegado, 2 = sin posición, 3 = tiempo agotado) y NO se ficha.
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 2, message: 'Geolocalización no disponible' });
        return;
      }
      // Si el GPS ya se calentó al abrir la app y hay una lectura exacta y
      // reciente, se ficha al momento con ella.
      const fresh = getFreshLocation();
      if (fresh && fresh.accuracy <= GPS_GOOD_ACCURACY_M) {
        resolve({ lat: fresh.lat, lng: fresh.lng, accuracy: fresh.accuracy });
        return;
      }
      let best = null;
      let lastError = null;
      let done = false;
      let watchId = null;
      let timer = null;
      const accOf = (pos) => (pos.coords.accuracy ?? Infinity);
      const finish = () => {
        if (done) return;
        done = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (timer) clearTimeout(timer);
        // Se elige la mejor lectura (la calentada al abrir la app o la de ahora).
        const warm = getFreshLocation();
        let chosen = null;
        if (warm && (!best || warm.accuracy < accOf(best))) {
          chosen = { lat: warm.lat, lng: warm.lng, accuracy: warm.accuracy };
        } else if (best) {
          chosen = {
            lat: best.coords.latitude,
            lng: best.coords.longitude,
            accuracy: Number.isFinite(accOf(best)) ? Math.round(accOf(best)) : null,
          };
        }
        if (chosen) {
          // Fichaje PRECISO obligatorio: más de 200 m de error no vale.
          if (chosen.accuracy === null || chosen.accuracy > GPS_MAX_ACCEPT_M) {
            reject({ code: 4, message: 'Ubicación imprecisa', accuracy: chosen.accuracy });
          } else {
            resolve(chosen);
          }
        } else {
          reject(lastError || { code: 3, message: 'Tiempo agotado' });
        }
      };
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          recordPosition(pos);
          if (!best || accOf(pos) < accOf(best)) best = pos;
          if (accOf(pos) <= GPS_GOOD_ACCURACY_M) finish();
        },
        (err) => {
          lastError = { code: err?.code ?? 2, message: err?.message || '' };
          // Permiso denegado: no tiene sentido seguir esperando.
          if (err?.code === 1) finish();
        },
        { enableHighAccuracy: true, timeout: GPS_MAX_WAIT_MS, maximumAge: 30000 }
      );
      timer = setTimeout(finish, GPS_MAX_WAIT_MS);
    });
  }

  // Si no se pudo obtener la ubicación, se avisa al servidor para que registre la
  // incidencia (permiso denegado o sin GPS) y notifique a los admins.
  async function reportLocationFailure(e, stage) {
    try {
      await authInvoke('trackTime', {
        operation: 'reportLocationFailure',
        kind: e?.code === 1 ? 'denied' : e?.code === 4 ? 'imprecise' : 'unavailable',
        stage,
        userAgent: navigator.userAgent,
        errorCode: e?.code ?? null,
        accuracy: Number.isFinite(e?.accuracy) ? e.accuracy : null,
        errorMessage: String(e?.message || '').slice(0, 120),
      });
    } catch { /* no bloquea el aviso al trabajador */ }
  }

  // Location management now handled server-side via trackTime function

  async function handleClockIn() {
    setClockingIn(true);
    let loc;
    try {
      toast({ title: '📍 Obteniendo tu ubicación…', description: 'Espera unos segundos sin cerrar la app.' });
      loc = await getLocation();
    } catch (e) {
      await reportLocationFailure(e, 'in');
      toast({ title: 'No se ha fichado la entrada', description: geoErrorMessage(e) || 'No se ha podido obtener tu ubicación. Vuelve a intentarlo.', variant: 'destructive' });
      setClockingIn(false);
      return;
    }
    try {
      // La hora de entrada y si llega tarde las decide el servidor con su propio
      // reloj (ver trackTime/clockIn); el móvil solo manda su ubicación real.
      const res = await authInvoke('trackTime', {
        operation: 'clockIn',
        lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
      });
      const clockedAt = res.data?.clockIn ? moment(res.data.clockIn) : moment();
      const precision = loc.accuracy > 100 ? ` (precisión ±${loc.accuracy} m)` : '';
      if (res.data?.isLate) {
        toast({ title: '⚠️ Entrada tardía', description: `${clockedAt.format('HH:mm')} — Incumplimiento registrado${precision}` });
      } else {
        toast({ variant: 'success', title: '✅ Entrada fichada', description: `${clockedAt.format('HH:mm')} — Ubicación registrada${precision}` });
      }
      loadEntries();
    } catch (e) {
      toast({ title: 'No se ha fichado', description: e?.response?.data?.error || e.message, variant: 'destructive', duration: 15000 });
    } finally {
      setClockingIn(false);
    }
  }

  async function handleClockOut() {
    if (!openEntry) return;
    setClockingOut(true);
    let loc;
    try {
      toast({ title: '📍 Obteniendo tu ubicación…', description: 'Espera unos segundos sin cerrar la app.' });
      loc = await getLocation();
    } catch (e) {
      await reportLocationFailure(e, 'out');
      toast({ title: 'No se ha fichado la salida', description: geoErrorMessage(e) || 'No se ha podido obtener tu ubicación. Vuelve a intentarlo.', variant: 'destructive' });
      setClockingOut(false);
      return;
    }
    try {
      // Horas trabajadas y extra las calcula el servidor con su propio reloj.
      const res = await authInvoke('trackTime', {
        operation: 'clockOut',
        entryId: openEntry.id,
        lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
      });
      const clockedAt = res.data?.clockOut ? moment(res.data.clockOut) : moment();
      const regularHours = res.data?.totalHours ?? 0;
      const overtimeHours = res.data?.overtimeHours ?? 0;
      const precision = loc.accuracy > 100 ? ` (precisión ±${loc.accuracy} m)` : '';
      if (overtimeHours > 0) {
        toast({ variant: 'success', title: '✅ Salida fichada', description: `${clockedAt.format('HH:mm')} — ${regularHours.toFixed(1)}h regulares + ${overtimeHours}h extras${precision}` });
      } else {
        toast({ variant: 'success', title: '✅ Salida fichada', description: `${clockedAt.format('HH:mm')} — ${regularHours.toFixed(1)}h trabajadas${precision}` });
      }
      loadEntries();
    } catch (e) {
      toast({ title: 'No se ha fichado', description: e?.response?.data?.error || e.message, variant: 'destructive', duration: 15000 });
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
  // El botón verde de entrada solo aparece dentro de la ventana de fichaje
  // (7:45 - 8:30); fuera de ese tramo se muestra en gris "Próximo fichaje".
  const inClockInWindow = (hour === 7 && minutes >= 45) || (hour === 8 && minutes <= 30);
  const showBanner = hour === 8 && minutes < 30 && !openEntry && !hasAbsenceToday;
  const canClockIn = !openEntry && !hasClosedToday && inClockInWindow;
  // Exit window: 16:00 - 16:30
  const inExitWindow = hour === 16 && minutes <= 30;
  const canClockOut = !!openEntry && inExitWindow;
  const showProximo = !openEntry && !canClockIn;

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
            <Button onClick={() => setAdminEntryOpen(true)} className="gap-2">
              <UserPlus size={16} /> Abrir fichaje a trabajador
            </Button>
            <Link to="/revision-jornadas" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Eye size={16} /> Ver fichajes del equipo
            </Link>
            <Link to="/geolocalizacion" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors">
              <MapPin size={16} /> Ver ubicaciones
            </Link>
          </div>
        </div>
        <div className="mt-6">
          <SolicitudesPendientes />
        </div>
        <AdminOpenEntryDialog open={adminEntryOpen} onOpenChange={setAdminEntryOpen} onDone={loadEntries} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Control Horario"
        subtitle="Jornada 8:00 - 16:00 · Legislación laboral de Andorra"
        actions={isAdmin ? (
          <Button variant="outline" onClick={() => setAdminEntryOpen(true)} className="gap-2">
            <UserPlus size={16} /> Abrir fichaje a trabajador
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setCorreccionOpen(true)} className="gap-2">
            <ClipboardEdit size={16} /> Solicitar corrección
          </Button>
        )}
      />

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

      {isAdmin && (
        <div className="mt-6">
          <SolicitudesPendientes />
        </div>
      )}

      {isAdmin && (
        <AdminOpenEntryDialog open={adminEntryOpen} onOpenChange={setAdminEntryOpen} onDone={loadEntries} />
      )}

      {!isAdmin && (
        <SolicitudCorreccionDialog open={correccionOpen} onOpenChange={setCorreccionOpen} />
      )}
    </div>
  );
}
