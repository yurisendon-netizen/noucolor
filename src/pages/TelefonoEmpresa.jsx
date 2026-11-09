import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, ArrowLeft, AlertTriangle, LogIn, LogOut, MapPin, Lock, ClipboardList, PenLine, Plus, Check } from 'lucide-react';
import SignaturePadInput from '@/components/parts/SignaturePadInput';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { linkOneSignalExternalUser, requestPushPermission } from '@/lib/onesignal';

// Estado del permiso de notificaciones del navegador ('granted' | 'denied' | 'default' | 'unsupported')
const pushPerm = () => {
  try { return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; } catch { return 'unsupported'; }
};

// =====================================================================
// MODO TERMINAL DE FICHAJE — móvil compartido del taller (rol Terminal).
// El trabajador toca su nombre, mete SU PIN personal y ficha entrada/salida.
// Todo se valida en el backend (trackTime: kioskCheckPin / kioskClockIn / kioskClockOut).
// =====================================================================

const LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';
const GRANATE = '#5a123e';
const NARANJA = '#e6671a';
const IDLE_MS = 20000;      // sin tocar nada 20 s → vuelve a la lista
const IDLE_PARTES_MS = 120000; // leyendo/firmando un parte: 2 min
const IDLE_FORM_MS = 600000;   // escribiendo un parte nuevo: 10 min
const hoyAndorra = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ymdMinus = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const emptyNp = () => ({ date: hoyAndorra(), title: '', client_name: '', description: '', horas: {}, materials: '', notes: '', encargado: '' });
const OK_MS = 3000;         // confirmación verde 3 s
const GPS_MAX_M = 200;      // misma regla que el backend (GPS_MAX_ACCEPT_M)
const TZ = 'Europe/Andorra';

const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
const fmtH = (h) => { const n = Number(h) || 0; return Number.isInteger(n) ? `${n} h` : `${n.toFixed(2).replace('.', ',')} h`; };
const fmtFecha = (d) => { try { return new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { return d; } };
const errMsg = (e) => e?.response?.data?.error || e?.data?.error || e?.message || 'Error desconocido';
const isAuthErr = (e) => e?.response?.status === 401 || e?.status === 401;

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Este teléfono no puede dar la ubicación. No se puede fichar.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() }),
      (err) => reject(new Error(err.code === 1
        ? 'Sin permiso de ubicación. Activa la ubicación (exacta) para esta app en los ajustes del terminal. No se puede fichar.'
        : 'No se pudo obtener la ubicación GPS. Comprueba que el GPS está activado y vuelve a probar.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

// ---------- Teclado numérico grande ----------
function Keypad({ value, onChange, disabled }) {
  const press = (d) => { if (!disabled && value.length < 4) onChange(value + d); };
  const back = () => { if (!disabled && value.length > 0) onChange(value.slice(0, -1)); };
  const key = 'h-20 rounded-2xl bg-white/10 text-3xl font-bold text-white active:scale-95 active:bg-white/25 transition disabled:opacity-40';
  return (
    <div className="w-full max-w-xs mx-auto select-none">
      <div className="flex justify-center gap-5 mb-6" aria-label={`${value.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-5 h-5 rounded-full border-2 transition"
            style={i < value.length ? { background: NARANJA, borderColor: NARANJA } : { borderColor: 'rgba(255,255,255,0.45)' }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} disabled={disabled} onClick={() => press(d)}>{d}</button>
        ))}
        <div />
        <button type="button" className={key} disabled={disabled} onClick={() => press('0')}>0</button>
        <button type="button" className={`${key} text-xl`} disabled={disabled} onClick={back} aria-label="Borrar">⌫</button>
      </div>
    </div>
  );
}

// ---------- Reloj grande ----------
function BigClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
  const date = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  return (
    <div className="text-center">
      <p className="text-6xl sm:text-7xl font-extrabold tabular-nums tracking-tight leading-none">{time}</p>
      <p className="mt-2 text-lg capitalize text-white/80">{date}</p>
    </div>
  );
}

export default function TelefonoEmpresa() {
  const { terminal, terminalLogout } = useCustomAuth();
  const token = terminal?.token || '';

  const [phoneName, setPhoneName] = useState(terminal?.nombre || '');
  const [fija, setFija] = useState(false); // terminal fijo del taller (portátil): sin GPS, ubicación del taller
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [avisos, setAvisos] = useState(pushPerm);
  const [avisosLuego, setAvisosLuego] = useState(false);
  const linkedRef = useRef('');

  // view: 'list' | 'pin' | 'status' | 'ok'
  const [view, setView] = useState('list');
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(null);

  // Partes por firmar (el encargado de la obra firma con el dedo en el terminal)
  const [partes, setPartes] = useState([]);
  const [parteSel, setParteSel] = useState(null);
  const [encargadoNombre, setEncargadoNombre] = useState('');
  const [firma, setFirma] = useState(null);

  // Parte nuevo desde el terminal: el operario se identifica con su PIN y lo rellena
  const [npAutor, setNpAutor] = useState(null);
  const [np, setNp] = useState(emptyNp);
  const [npFirma, setNpFirma] = useState(null);

  const posRef = useRef(null);
  const posErrRef = useRef('');
  const lastTouch = useRef(Date.now());
  const pinRef = useRef(''); // PIN validado, en memoria solo mientras dura este fichaje

  const reset = useCallback(() => {
    setView('list'); setSel(null); setPin(''); setStatus(null); setErr(''); setOk(null); setBusy(false);
    setParteSel(null); setEncargadoNombre(''); setFirma(null);
    setNpAutor(null); setNp(emptyNp()); setNpFirma(null);
    pinRef.current = '';
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListErr('');
    try {
      const res = await base44.functions.invoke('trackTime', { operation: 'kioskWorkers', sessionToken: token });
      setWorkers(res.data?.workers || []);
      if (res.data?.phone) setPhoneName(res.data.phone);
      setFija(res.data?.ubicacion_fija === true);
      // Vincula este terminal a los avisos push (recordatorio de fichar de las 8:00)
      const tid = res.data?.terminal_id;
      if (tid) {
        setTerminalId(tid);
        if (linkedRef.current !== tid) { linkedRef.current = tid; linkOneSignalExternalUser(`terminal_${tid}`); }
      }
      base44.functions.invoke('trackTime', { operation: 'kioskPartes', sessionToken: token })
        .then((r) => setPartes(r.data?.partes || [])).catch(() => {});
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setListErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [token, terminalLogout]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (view !== 'list') return undefined;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [view, load]);

  // Pantalla siempre encendida (si el navegador lo permite)
  useEffect(() => {
    let lock = null;
    const req = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* no soportado */ } };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release(); } catch { /* nada */ } };
  }, []);

  // Inactividad: 20 s sin tocar → vuelve a la lista (nadie se queda con la sesión de otro)
  useEffect(() => {
    const touch = () => { lastTouch.current = Date.now(); };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const t = setInterval(() => {
      const limite = view === 'np_form' ? IDLE_FORM_MS
        : (view === 'partes' || view === 'parte' || view === 'np_who' || view === 'np_pin') ? IDLE_PARTES_MS : IDLE_MS;
      if (view !== 'list' && view !== 'ok' && !busy && Date.now() - lastTouch.current > limite) reset();
    }, 1000);
    return () => { window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); clearInterval(t); };
  }, [view, busy, reset]);

  // GPS SIEMPRE encendido: el teléfono de empresa se queda en la obra con la app
  // abierta, así que se sigue la ubicación de forma continua y al fichar ya está lista.
  const [gps, setGps] = useState({ status: 'searching', accuracy: null });
  useEffect(() => {
    if (!navigator.geolocation) { setGps({ status: 'unsupported', accuracy: null }); return undefined; }
    let id = null;
    let retry = null;
    const start = () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
      clearTimeout(retry);
      id = navigator.geolocation.watchPosition(
        (p) => {
          const r = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
          const prev = posRef.current;
          if (!(prev && Date.now() - prev.at < 15000 && prev.accuracy < r.accuracy)) posRef.current = r;
          posErrRef.current = '';
          setGps({ status: posRef.current.accuracy <= GPS_MAX_M ? 'ok' : 'imprecise', accuracy: Math.round(posRef.current.accuracy) });
        },
        (err) => {
          if (err.code === 1) {
            posErrRef.current = 'Sin permiso de ubicación. Activa la ubicación (exacta) para esta app en los ajustes del terminal. No se puede fichar.';
            setGps({ status: 'denied', accuracy: null });
            return;
          }
          retry = setTimeout(start, 15000);
        },
        { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 },
      );
    };
    start();
    const onVis = () => { if (document.visibilityState === 'visible') start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); if (id !== null) navigator.geolocation.clearWatch(id); clearTimeout(retry); };
  }, []);

  function warmGps() {
    // Con el GPS continuo ya hay lectura; solo se pide una si no hay ninguna reciente.
    if (posRef.current && Date.now() - posRef.current.at < 60000) return;
    getPosition().then((p) => { posRef.current = p; }).catch((e) => { posErrRef.current = e.message; });
  }

  function pick(w) {
    lastTouch.current = Date.now();
    setSel(w); setPin(''); setErr(''); setStatus(null); pinRef.current = '';
    setView('pin');
    warmGps(); // pedimos el GPS ya, mientras mete el PIN
  }

  async function onPin(v) {
    setPin(v);
    setErr('');
    if (v.length !== 4 || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('trackTime', { operation: 'kioskCheckPin', sessionToken: token, employeeId: sel.id, pin: v });
      if (res.data?.success) {
        pinRef.current = v;
        setStatus(res.data);
        setView('status');
      } else {
        setErr(res.data?.error || 'PIN incorrecto');
        setPin('');
      }
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function fichar() {
    if (busy || !status) return;
    setBusy(true);
    setErr('');
    const entrando = status.estado === 'fuera';
    try {
      // Ubicación GPS precisa obligatoria (misma regla que siempre)
      let pos = posRef.current && Date.now() - posRef.current.at < 60000 ? posRef.current : null;
      if (!pos) {
        try { pos = await getPosition(); } catch (e) { setErr(e.message); return; }
      }
      // Terminal fijo (portátil del taller): no tiene GPS; el servidor comprueba que
      // está cerca del taller y guarda la ubicación del taller.
      if (!fija && (!Number.isFinite(pos.accuracy) || pos.accuracy > GPS_MAX_M)) {
        setErr(`Ubicación poco precisa (±${Math.round(pos.accuracy || 0)} m). Acerca el terminal a una ventana o sal al exterior y vuelve a probar. No se ha fichado.`);
        warmGps();
        return;
      }
      const res = await base44.functions.invoke('trackTime', {
        operation: entrando ? 'kioskClockIn' : 'kioskClockOut',
        sessionToken: token, employeeId: sel.id, pin: pinRef.current,
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
      });
      if (res.data?.success) {
        const iso = entrando ? res.data.clockIn : res.data.clockOut;
        pinRef.current = '';
        setOk({ entrando, nombre: sel.full_name, hora: hm(iso || new Date().toISOString()), tarde: !!res.data.isLate, ya: !!res.data.alreadyClockedIn });
        setView('ok');
        load();
        setTimeout(reset, OK_MS);
      } else {
        setErr(res.data?.error || 'No se pudo fichar');
        warmGps();
      }
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
      warmGps();
    } finally {
      setBusy(false);
    }
  }

  // ---------- Partes por firmar ----------
  async function abrirPartes() {
    lastTouch.current = Date.now();
    setErr(''); setParteSel(null);
    setView('partes');
    try {
      const r = await base44.functions.invoke('trackTime', { operation: 'kioskPartes', sessionToken: token });
      setPartes(r.data?.partes || []);
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
    }
  }

  function abrirParte(p) {
    lastTouch.current = Date.now();
    setErr('');
    setParteSel(p);
    setEncargadoNombre(p.encargado_obra || '');
    setFirma(null);
    setView('parte');
  }

  async function firmarParte() {
    if (busy || !parteSel) return;
    setErr('');
    const nombre = encargadoNombre.trim();
    if (!nombre) { setErr('Pon el nombre del encargado que firma.'); return; }
    if (!firma) { setErr('Firma con el dedo en el recuadro blanco.'); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke('trackTime', {
        operation: 'kioskFirmarParte', sessionToken: token,
        workOrderId: parteSel.id, firmaDataUrl: firma, encargado: nombre,
      });
      if (res.data?.success) {
        setPartes((ps) => ps.filter((x) => x.id !== parteSel.id));
        setOk({ parte: true, nombre: parteSel.title || parteSel.client_name, hora: '' });
        setView('ok');
        setTimeout(reset, OK_MS);
      } else {
        setErr(res.data?.error || 'No se pudo firmar');
      }
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Crear parte nuevo ----------
  function nuevoParte() {
    lastTouch.current = Date.now();
    setErr(''); setNpAutor(null); setNp(emptyNp()); setNpFirma(null); setPin(''); pinRef.current = '';
    setView('np_who');
  }

  function npPick(w) {
    lastTouch.current = Date.now();
    setNpAutor(w); setPin(''); setErr(''); pinRef.current = '';
    setView('np_pin');
  }

  async function npOnPin(v) {
    setPin(v);
    setErr('');
    if (v.length !== 4 || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('trackTime', { operation: 'kioskCheckPin', sessionToken: token, employeeId: npAutor.id, pin: v });
      if (res.data?.success) {
        pinRef.current = v;
        setNp({ ...emptyNp(), horas: { [npAutor.id]: '8' } });
        setNpFirma(null);
        setView('np_form');
      } else {
        setErr(res.data?.error || 'PIN incorrecto');
        setPin('');
      }
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  const npSet = (patch) => setNp((f) => ({ ...f, ...patch }));
  const npToggle = (id) => setNp((f) => {
    const horas = { ...f.horas };
    if (horas[id] !== undefined) delete horas[id]; else horas[id] = '8';
    return { ...f, horas };
  });
  const npNum = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

  async function npGuardar() {
    if (busy || !npAutor) return;
    setErr('');
    if (!np.title.trim()) { setErr('Pon la obra.'); return; }
    if (!np.client_name.trim()) { setErr('Pon el cliente.'); return; }
    if (!np.description.trim()) { setErr('Describe el trabajo realizado.'); return; }
    const filas = Object.entries(np.horas).map(([id, h]) => ({ employee_id: id, horas: npNum(h) }));
    if (filas.length === 0) { setErr('Marca al menos un trabajador.'); return; }
    if (filas.some((r) => r.horas <= 0 || r.horas > 24)) { setErr('Revisa las horas: entre 0,25 y 24 por trabajador.'); return; }
    if (npFirma && !np.encargado.trim()) { setErr('Pon el nombre del encargado que firma.'); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke('trackTime', {
        operation: 'kioskCreateParte', sessionToken: token, employeeId: npAutor.id, pin: pinRef.current,
        workOrder: {
          date: np.date,
          title: np.title.trim(),
          client_name: np.client_name.trim(),
          description: np.description.trim(),
          horas_trabajadas: filas,
          materials: np.materials.trim(),
          notes: np.notes.trim(),
          encargado_obra: np.encargado.trim(),
        },
        firmaDataUrl: npFirma || null,
      });
      if (res.data?.success) {
        pinRef.current = '';
        setOk({ parte: true, creado: true, nombre: np.title.trim(), hora: '' });
        setView('ok');
        load();
        setTimeout(reset, OK_MS);
      } else {
        setErr(res.data?.error || 'No se pudo guardar el parte');
      }
    } catch (e) {
      if (isAuthErr(e)) { terminalLogout(); return; }
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Salida oculta para mantenimiento: mantener pulsado el logo 3 s
  const pressTimer = useRef(null);
  const startPress = () => {
    pressTimer.current = setTimeout(() => {
      if (window.confirm('¿Cerrar la sesión del terminal de fichaje?')) terminalLogout();
    }, 3000);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  const shell = 'min-h-[100dvh] w-full text-white flex flex-col select-none';
  const bg = { background: `radial-gradient(circle at 50% 0%, #7a1d55 0%, ${GRANATE} 55%, #3d0b29 100%)` };

  const ErrorBox = () => (err ? (
    <div className="mt-4 rounded-2xl border border-red-300/60 bg-red-600/90 px-4 py-3 text-base font-semibold flex items-start gap-2 text-left">
      <AlertTriangle size={20} className="shrink-0 mt-0.5" /> <span>{err}</span>
    </div>
  ) : null);

  // ---------- Confirmación ----------
  if (view === 'ok' && ok) {
    return (
      <div className={`${shell} items-center justify-center p-6 text-center`} style={{ background: '#15803d' }}>
        <CheckCircle2 size={110} className="mb-5" />
        <h1 className="text-3xl font-extrabold">{ok.parte ? (ok.creado ? 'Parte creado' : 'Parte firmado') : `${ok.entrando ? 'Entrada registrada' : 'Salida registrada'} ${ok.hora}`}</h1>
        <p className="text-2xl mt-3 font-semibold">{ok.nombre}</p>
        {ok.ya && <p className="text-base mt-4 text-white/85">Ya tenías la entrada abierta hoy.</p>}
        {ok.tarde && <p className="mt-4 text-lg font-semibold flex items-center gap-2"><AlertTriangle size={20} /> Entrada con retraso</p>}
      </div>
    );
  }

  // ---------- Lista de partes por firmar ----------
  if (view === 'partes') {
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={reset} className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 w-full max-w-2xl mx-auto mt-4">
          <button type="button" onClick={nuevoParte}
            className="w-full h-16 mb-6 rounded-2xl text-xl font-extrabold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
            style={{ background: NARANJA, color: '#ffffff' }}>
            <Plus size={26} /> CREAR PARTE NUEVO
          </button>
          <h1 className="text-3xl font-extrabold text-center">Partes por firmar</h1>
          <p className="text-base text-white/75 text-center mt-1 mb-5">El encargado de la obra toca el parte, lo revisa y firma</p>
          <ErrorBox />
          {partes.length === 0 && !err && (
            <p className="text-center text-lg text-white/80 mt-10">No hay partes pendientes de firma.</p>
          )}
          <div className="space-y-3 mt-3">
            {partes.map((p) => (
              <button key={p.id} type="button" onClick={() => abrirParte(p)}
                className="w-full text-left rounded-2xl bg-white/10 border-2 border-white/15 px-4 py-4 active:scale-[0.98] active:bg-white/20 transition">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xl font-bold truncate">{p.title || p.client_name}</p>
                  <span className="shrink-0 text-lg font-bold" style={{ color: NARANJA }}>{fmtH(p.total_horas)}</span>
                </div>
                <p className="text-sm text-white/70 mt-1"><span className="capitalize">{fmtFecha(p.date)}</span>{p.client_name ? ` · ${p.client_name}` : ''} · {p.assigned_name}</p>
                {p.description && <p className="text-base text-white/85 mt-2 line-clamp-2">{p.description}</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Revisar y firmar un parte ----------
  if (view === 'parte' && parteSel) {
    const p = parteSel;
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={() => { setErr(''); setParteSel(null); setView('partes'); }} disabled={busy}
          className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 w-full max-w-2xl mx-auto mt-4 pb-8">
          <h1 className="text-3xl font-extrabold">{p.title || p.client_name}</h1>
          <p className="text-base text-white/75 mt-1"><span className="capitalize">{fmtFecha(p.date)}</span>{p.client_name ? ` · ${p.client_name}` : ''} · hecho por {p.assigned_name}</p>

          <div className="mt-4 rounded-2xl bg-white/10 p-4 space-y-3">
            {p.description && (
              <div>
                <p className="text-sm font-semibold text-white/60 uppercase">Trabajo realizado</p>
                <p className="text-lg whitespace-pre-wrap">{p.description}</p>
              </div>
            )}
            {p.horas_trabajadas.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-white/60 uppercase mb-1">Horas</p>
                <div className="rounded-xl overflow-hidden border border-white/15">
                  {p.horas_trabajadas.map((r, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 text-base odd:bg-white/5">
                      <span>{r.employee_name}</span><span className="font-mono">{fmtH(r.horas)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 text-base font-bold" style={{ background: 'rgba(230,103,26,0.25)' }}>
                    <span>Total</span><span className="font-mono">{fmtH(p.total_horas)}</span>
                  </div>
                </div>
              </div>
            )}
            {p.materials && (
              <div>
                <p className="text-sm font-semibold text-white/60 uppercase">Materiales</p>
                <p className="text-base whitespace-pre-wrap">{p.materials}</p>
              </div>
            )}
            {p.notes && (
              <div>
                <p className="text-sm font-semibold text-white/60 uppercase">Observaciones</p>
                <p className="text-base whitespace-pre-wrap">{p.notes}</p>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <label htmlFor="t-encargado" className="text-sm font-semibold text-white/60 uppercase">Encargado de la obra que firma</label>
            <input id="t-encargado" value={encargadoNombre} onChange={(e) => setEncargadoNombre(e.target.value)}
              placeholder="Nombre y apellido" maxLength={200}
              className="mt-1 w-full h-14 rounded-xl bg-white text-[#1a1a1a] px-4 text-lg font-semibold outline-none" />
            <p className="text-sm font-semibold text-white/60 uppercase mt-4 mb-1">Firma con el dedo</p>
            <div className="[&_canvas]:h-44 [&_button]:text-white [&_button]:bg-white/10">
              <SignaturePadInput key={p.id} onChange={setFirma} />
            </div>
          </div>

          <ErrorBox />
          <button type="button" onClick={firmarParte} disabled={busy}
            className="mt-5 w-full h-20 rounded-3xl text-2xl font-extrabold tracking-wide shadow-2xl active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-3"
            style={{ background: NARANJA, color: '#ffffff' }}>
            {busy ? <><Loader2 size={28} className="animate-spin" /> Firmando…</> : <><PenLine size={28} /> FIRMAR PARTE</>}
          </button>
          <p className="mt-3 text-sm text-white/70 text-center">Al firmar confirmas que el trabajo y las horas son correctos.</p>
        </div>
      </div>
    );
  }

  // ---------- Parte nuevo: ¿quién lo hace? ----------
  if (view === 'np_who') {
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={() => { setErr(''); setView('partes'); }}
          className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 w-full max-w-3xl mx-auto mt-4">
          <h1 className="text-3xl font-extrabold text-center">Parte nuevo</h1>
          <p className="text-lg text-white/80 text-center mt-1 mb-5">¿Quién hace el parte? Toca tu nombre</p>
          <div className="grid grid-cols-2 gap-3">
            {workers.map((w) => (
              <button key={w.id} type="button" onClick={() => npPick(w)}
                className="min-h-[88px] rounded-2xl bg-white/10 border-2 border-white/15 px-3 py-4 text-center text-lg font-bold leading-tight uppercase active:scale-[0.97] active:bg-white/20 transition">
                {w.full_name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Parte nuevo: PIN del autor ----------
  if (view === 'np_pin' && npAutor) {
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={() => { setErr(''); setPin(''); setView('np_who'); }} disabled={busy}
          className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-sm mx-auto">
          <h1 className="text-3xl font-extrabold">{npAutor.full_name}</h1>
          <p className="text-lg text-white/80 mt-2 mb-6">Introduce tu PIN para hacer el parte</p>
          <Keypad value={pin} onChange={npOnPin} disabled={busy} />
          <div className="min-h-[2rem] mt-4">
            {busy && <p className="text-base flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Comprobando…</p>}
          </div>
          <ErrorBox />
        </div>
      </div>
    );
  }

  // ---------- Parte nuevo: formulario ----------
  if (view === 'np_form' && npAutor) {
    const hoy = hoyAndorra();
    const inp = 'mt-1 w-full rounded-xl bg-white text-[#1a1a1a] px-4 text-lg font-semibold outline-none';
    const lbl = 'text-sm font-semibold text-white/60 uppercase';
    const total = Object.values(np.horas).reduce((s, h) => s + npNum(h), 0);
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={reset} disabled={busy}
          className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Cancelar
        </button>
        <div className="flex-1 w-full max-w-2xl mx-auto mt-4 pb-10 space-y-4">
          <div>
            <h1 className="text-3xl font-extrabold">Parte nuevo</h1>
            <p className="text-base text-white/75 mt-1">Lo hace {npAutor.full_name}</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-4 space-y-4">
            <div>
              <label htmlFor="np-date" className={lbl}>Fecha</label>
              <input id="np-date" type="date" value={np.date} min={ymdMinus(hoy, 14)} max={hoy}
                onChange={(e) => npSet({ date: e.target.value })} className={`${inp} h-14`} />
            </div>
            <div>
              <label htmlFor="np-title" className={lbl}>Obra *</label>
              <input id="np-title" value={np.title} onChange={(e) => npSet({ title: e.target.value })}
                placeholder="Nombre o dirección de la obra" maxLength={200} className={`${inp} h-14`} />
            </div>
            <div>
              <label htmlFor="np-client" className={lbl}>Cliente *</label>
              <input id="np-client" value={np.client_name} onChange={(e) => npSet({ client_name: e.target.value })}
                placeholder="Nombre del cliente" maxLength={200} className={`${inp} h-14`} />
            </div>
            <div>
              <label htmlFor="np-desc" className={lbl}>Trabajo realizado *</label>
              <textarea id="np-desc" value={np.description} onChange={(e) => npSet({ description: e.target.value })}
                rows={4} placeholder="Qué se ha hecho hoy" className={`${inp} py-3`} />
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-4">
            <p className={lbl}>Trabajadores y horas *</p>
            <div className="space-y-2 mt-2">
              {workers.map((w) => {
                const on = np.horas[w.id] !== undefined;
                return (
                  <div key={w.id} className="flex items-stretch gap-2">
                    <button type="button" onClick={() => npToggle(w.id)}
                      className="flex-1 min-h-[60px] rounded-xl border-2 px-3 py-2 text-base font-bold uppercase leading-tight flex items-center gap-2 text-left transition active:scale-[0.98]"
                      style={on ? { background: NARANJA, color: '#fff', borderColor: NARANJA } : { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}>
                      <span className="w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center" style={{ borderColor: on ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                        {on && <Check size={16} />}
                      </span>
                      {w.full_name}
                    </button>
                    {on && (
                      <div className="flex items-center gap-1">
                        <input inputMode="decimal" value={np.horas[w.id]} aria-label={`Horas de ${w.full_name}`}
                          onChange={(e) => setNp((f) => ({ ...f, horas: { ...f.horas, [w.id]: e.target.value } }))}
                          className="w-20 h-full min-h-[60px] rounded-xl bg-white text-[#1a1a1a] text-center text-xl font-bold outline-none" />
                        <span className="text-base font-semibold">h</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-base font-bold" style={{ color: NARANJA }}>Total: {fmtH(total)}</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-4 space-y-4">
            <div>
              <label htmlFor="np-mat" className={lbl}>Materiales</label>
              <textarea id="np-mat" value={np.materials} onChange={(e) => npSet({ materials: e.target.value })}
                rows={2} className={`${inp} py-3`} />
            </div>
            <div>
              <label htmlFor="np-notes" className={lbl}>Observaciones</label>
              <textarea id="np-notes" value={np.notes} onChange={(e) => npSet({ notes: e.target.value })}
                rows={2} className={`${inp} py-3`} />
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-4">
            <label htmlFor="np-enc" className={lbl}>Encargado de la obra (si firma ahora)</label>
            <input id="np-enc" value={np.encargado} onChange={(e) => npSet({ encargado: e.target.value })}
              placeholder="Nombre y apellido" maxLength={200} className={`${inp} h-14`} />
            <p className={`${lbl} mt-4 mb-1`}>Firma con el dedo (opcional, se puede firmar luego)</p>
            <div className="[&_canvas]:h-44 [&_button]:text-white [&_button]:bg-white/10">
              <SignaturePadInput key={npAutor.id} onChange={setNpFirma} />
            </div>
          </div>

          <ErrorBox />
          <button type="button" onClick={npGuardar} disabled={busy}
            className="w-full h-20 rounded-3xl text-2xl font-extrabold tracking-wide shadow-2xl active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-3"
            style={{ background: NARANJA, color: '#ffffff' }}>
            {busy ? <><Loader2 size={28} className="animate-spin" /> Guardando…</> : <><ClipboardList size={28} /> GUARDAR PARTE</>}
          </button>
        </div>
      </div>
    );
  }

  // ---------- PIN ----------
  if (view === 'pin' && sel) {
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={reset} disabled={busy} className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-sm mx-auto">
          <h1 className="text-3xl font-extrabold">{sel.full_name}</h1>
          <p className="text-lg text-white/80 mt-2 mb-6">Introduce tu PIN personal</p>
          {!sel.pin_set && <p className="mb-4 text-base font-semibold" style={{ color: NARANJA }}>Aún no tienes PIN. Créalo en tu app personal o pídeselo al administrador.</p>}
          <Keypad value={pin} onChange={onPin} disabled={busy} />
          <div className="min-h-[2rem] mt-4">
            {busy && <p className="text-base flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Comprobando…</p>}
          </div>
          <ErrorBox />
        </div>
      </div>
    );
  }

  // ---------- Estado + botón de fichar ----------
  if (view === 'status' && sel && status) {
    const baja = status.estado_laboral && status.estado_laboral !== 'activo';
    const dentro = status.estado === 'dentro';
    const terminado = status.estado === 'terminado';
    return (
      <div className={`${shell} p-5`} style={bg}>
        <button type="button" onClick={reset} disabled={busy} className="self-start inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold active:bg-white/20">
          <ArrowLeft size={22} /> Volver
        </button>
        <div className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-md mx-auto">
          <h1 className="text-3xl font-extrabold">{sel.full_name}</h1>
          <div className="mt-6 rounded-2xl bg-white/10 px-6 py-5 w-full">
            {dentro && <p className="text-2xl font-bold">Estás dentro desde las {hm(status.entrada)}</p>}
            {status.estado === 'fuera' && <p className="text-2xl font-bold">Estás fuera</p>}
            {terminado && <p className="text-2xl font-bold">Jornada de hoy terminada{status.entrada ? ` (${hm(status.entrada)} – ${hm(status.salida)})` : ''}</p>}
          </div>

          {baja ? (
            <p className="mt-8 text-xl font-semibold" style={{ color: NARANJA }}>Estás marcado como de {status.estado_laboral}. No puedes fichar. Habla con tu encargado.</p>
          ) : terminado ? (
            <p className="mt-8 text-lg text-white/85">Si es un error, habla con tu encargado.</p>
          ) : (
            <button type="button" onClick={fichar} disabled={busy}
              className="mt-8 w-full h-24 rounded-3xl text-3xl font-extrabold tracking-wide shadow-2xl active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-3"
              style={dentro ? { background: '#ffffff', color: GRANATE } : { background: NARANJA, color: '#ffffff' }}>
              {busy ? <><Loader2 size={30} className="animate-spin" /> Fichando…</>
                : dentro ? <><LogOut size={32} /> FICHAR SALIDA</> : <><LogIn size={32} /> FICHAR ENTRADA</>}
            </button>
          )}
          {!baja && !terminado && <p className="mt-3 text-sm text-white/70 flex items-center gap-1"><MapPin size={14} /> {fija ? 'Terminal fijo del taller: se guarda la ubicación del taller' : 'Se guarda la ubicación GPS del terminal'}</p>}
          <ErrorBox />
        </div>
      </div>
    );
  }

  // ---------- Lista de nombres ----------
  return (
    <div className={shell} style={bg}>
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <img src={LOGO} alt="Noucolor" className="h-10 w-auto rounded"
            onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onContextMenu={(e) => e.preventDefault()} draggable={false} />
          <p className="text-sm font-semibold text-white/80 flex items-center gap-1"><Lock size={14} /> {phoneName || 'Terminal de fichaje'}</p>
        </div>
        <BigClock />
      </header>
      <div className="h-1 w-full" style={{ background: NARANJA }} />
      <main className="flex-1 p-4 w-full max-w-3xl mx-auto">
        <p className="text-lg font-semibold text-center mb-4">Toca tu nombre para fichar</p>
        {listErr && <p className="mb-3 rounded-xl bg-red-600/90 px-4 py-2 text-base font-semibold">{listErr}</p>}
        {/* Al entrar como terminal (encargado): pregunta si se activan las notificaciones */}
        {avisos === 'default' && !avisosLuego && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center" style={{ color: GRANATE }}>
              <p className="text-xl font-extrabold mb-2">¿Quieres activar las notificaciones?</p>
              <p className="text-base mb-5 text-gray-700">Este teléfono avisará cada mañana de quién falta por fichar.</p>
              <button type="button"
                onClick={async () => {
                  await requestPushPermission();
                  if (terminalId) await linkOneSignalExternalUser(`terminal_${terminalId}`);
                  setAvisos(pushPerm());
                  setAvisosLuego(true);
                }}
                className="w-full rounded-xl px-4 py-4 text-lg font-bold text-white active:scale-[0.98] transition"
                style={{ background: NARANJA }}>
                Sí, activar
              </button>
              <button type="button" onClick={() => setAvisosLuego(true)}
                className="mt-3 w-full rounded-xl px-4 py-3 text-base font-semibold text-gray-500">
                Ahora no
              </button>
            </div>
          </div>
        )}
        {avisos === 'default' && avisosLuego && (
          <button type="button" onClick={() => setAvisosLuego(false)}
            className="mb-4 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/85">
            Activar notificaciones en este teléfono
          </button>
        )}
        {avisos === 'denied' && (
          <p className="mb-4 rounded-xl bg-red-600/80 px-4 py-2 text-sm font-semibold">Avisos bloqueados en este teléfono. Permite las notificaciones para esta web en los ajustes del navegador y vuelve a abrir.</p>
        )}
        {avisos === 'granted' && (
          <p className="mb-4 text-center text-sm text-emerald-300">✓ Avisos para fichar activados en este teléfono</p>
        )}
        {avisos === 'unsupported' && (
          <p className="mb-4 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/85">Este navegador no admite avisos. En iPhone: Compartir → «Añadir a pantalla de inicio» y abre la app desde ese icono.</p>
        )}
        {!fija && <p className={`mb-4 text-center text-sm flex items-center justify-center gap-1 ${gps.status === 'ok' ? 'text-emerald-300' : gps.status === 'denied' ? 'text-red-200 font-semibold' : 'text-white/70'}`}>
          <MapPin size={14} />
          {gps.status === 'ok' ? `GPS activo siempre (±${gps.accuracy} m)`
            : gps.status === 'denied' ? 'Ubicación bloqueada: permítela siempre para esta web en los ajustes de Chrome'
            : gps.status === 'imprecise' ? `GPS poco preciso (±${gps.accuracy} m). Activa la ubicación exacta`
            : gps.status === 'unsupported' ? 'Este navegador no da ubicación'
            : 'Buscando GPS…'}
        </p>}
        {loading && workers.length === 0 && <p className="text-center flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</p>}
        <div className="grid grid-cols-2 gap-3">
          {workers.map((w) => (
            <button key={w.id} type="button" onClick={() => pick(w)}
              className="relative min-h-[96px] rounded-2xl bg-white/10 border-2 border-white/15 px-3 py-4 text-center text-lg font-bold leading-tight uppercase active:scale-[0.97] active:bg-white/20 transition">
              {w.estado === 'dentro' && <span className="absolute top-2 right-2 w-3 h-3 rounded-full bg-emerald-400" aria-label="Dentro" />}
              {w.full_name}
            </button>
          ))}
        </div>
        {!loading && workers.length === 0 && !listErr && <p className="text-center text-white/80">No hay trabajadores activos.</p>}
      </main>
      {/* Cerrar sesión del terminal (con confirmación para evitar toques sin querer) */}
      <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button type="button"
          onClick={() => { if (window.confirm('¿Cerrar la sesión de este terminal de fichaje?')) terminalLogout(); }}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-base font-semibold text-white/85 active:bg-white/20">
          <LogOut size={18} /> Cerrar sesión
        </button>
        {/* Partes por firmar */}
        <button type="button" onClick={abrirPartes} aria-label="Partes por firmar"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-3 text-base font-bold shadow-lg active:scale-95 transition"
          style={{ background: NARANJA, color: '#ffffff' }}>
          <ClipboardList size={18} /> Partes
          {partes.length > 0 && (
            <span className="min-w-[1.5rem] h-6 px-1.5 rounded-full bg-white text-sm font-bold inline-flex items-center justify-center" style={{ color: GRANATE }}>{partes.length}</span>
          )}
        </button>
      </div>
    </div>
  );
}
