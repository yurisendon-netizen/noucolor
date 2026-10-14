import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, LogOut, CheckCircle2, ArrowLeft, Smartphone, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PinPad from '@/components/pin/PinPad';

const LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';
const KEY_TOKEN = 'noucolor_phone_token';
const KEY_NAME = 'noucolor_phone_name';

const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Andorra' }) : '');
const errMsg = (e) => e?.response?.data?.error || e?.message || 'Error desconocido';

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Este teléfono no da la ubicación.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? 'La ubicación está desactivada para esta app. Actívala en los ajustes del teléfono.' : 'No se pudo obtener la ubicación. Sal a un sitio abierto y vuelve a probar.')),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    );
  });
}

// Pantalla de TELÉFONO DE EMPRESA: un solo móvil para que fichen todos.
// El trabajador toca su nombre, mete su código de seguridad (PIN) y ficha.
export default function TelefonoEmpresa() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem(KEY_TOKEN) || ''; } catch { return ''; } });
  const [phoneName, setPhoneName] = useState(() => { try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; } });

  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState('');

  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinErr, setPinErr] = useState('');
  const [done, setDone] = useState(null);
  const posRef = useRef(null);
  const posErrRef = useRef('');

  const logout = useCallback(() => {
    try { localStorage.removeItem(KEY_TOKEN); localStorage.removeItem(KEY_NAME); } catch { /* sin almacenamiento */ }
    setToken(''); setPhoneName(''); setWorkers([]); setSel(null);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListErr('');
    try {
      const res = await base44.functions.invoke('trackTime', { operation: 'kioskWorkers', sessionToken: token });
      setWorkers(res.data?.workers || []);
      if (res.data?.phone) setPhoneName(res.data.phone);
    } catch (e) {
      if (e?.response?.status === 401 || e?.response?.status === 403) { logout(); return; }
      setListErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => { load(); }, [load]);
  // La lista se refresca sola cada minuto para ver quién ha fichado.
  useEffect(() => {
    if (!token || sel || done) return undefined;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [token, sel, done, load]);

  async function doLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginErr('');
    try {
      const res = await base44.functions.invoke('phoneLogin', { username: user, password: pass });
      if (res.data?.success) {
        try { localStorage.setItem(KEY_TOKEN, res.data.sessionToken); localStorage.setItem(KEY_NAME, res.data.phone?.nombre || ''); } catch { /* sin almacenamiento */ }
        setPhoneName(res.data.phone?.nombre || '');
        setToken(res.data.sessionToken);
        setPass('');
      } else {
        setLoginErr(res.data?.error || 'Usuario o contraseña incorrectos');
      }
    } catch (err) {
      setLoginErr(errMsg(err));
    } finally {
      setLoggingIn(false);
    }
  }

  function pick(w) {
    if (w.estado === 'terminado') return;
    setSel(w);
    setPin('');
    setPinErr('');
    posRef.current = null;
    posErrRef.current = '';
    // Pedimos la ubicación ya, mientras mete el código, para que ficharlo sea rápido.
    getPosition().then((p) => { posRef.current = p; }).catch((e) => { posErrRef.current = e.message; });
  }

  function back() { setSel(null); setPin(''); setPinErr(''); }

  async function onPin(v) {
    setPin(v);
    setPinErr('');
    if (v.length !== 4 || busy) return;
    setBusy(true);
    try {
      let pos = posRef.current;
      if (!pos) {
        try { pos = await getPosition(); } catch (e) { setPinErr(e.message); setPin(''); setBusy(false); return; }
      }
      const entrando = sel.estado === 'sin_fichar';
      const res = await base44.functions.invoke('trackTime', {
        operation: entrando ? 'kioskClockIn' : 'kioskClockOut',
        sessionToken: token, employeeId: sel.id, pin: v,
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
      });
      if (res.data?.success) {
        setDone({ nombre: sel.full_name, entrando, hora: hm(new Date().toISOString()), tarde: !!res.data.isLate, ya: !!res.data.alreadyClockedIn });
        setSel(null);
        setPin('');
        load();
        setTimeout(() => setDone(null), 5000);
      } else {
        setPinErr(res.data?.error || 'No se pudo fichar');
        setPin('');
        posRef.current = null;
        getPosition().then((p) => { posRef.current = p; }).catch(() => {});
      }
    } catch (e) {
      if (e?.response?.status === 401) { logout(); return; }
      setPinErr(errMsg(e));
      setPin('');
      // Ubicación imprecisa o similar: pedimos una lectura nueva para el siguiente intento.
      posRef.current = null;
      getPosition().then((p) => { posRef.current = p; }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const shell = 'min-h-[100dvh] bg-background text-foreground flex flex-col';

  // ---------- Login del teléfono ----------
  if (!token) {
    return (
      <div className={`${shell} items-center justify-center p-6`}>
        <form onSubmit={doLogin} className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <img src={LOGO} alt="Noucolor" className="mx-auto h-14 w-auto mb-4 rounded-lg" />
            <h1 className="text-xl font-bold flex items-center justify-center gap-2"><Smartphone size={20} /> Teléfono de empresa</h1>
            <p className="text-sm text-muted-foreground mt-1">Entra con el usuario y la contraseña de este teléfono.</p>
          </div>
          <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Usuario (telefono1)" autoCapitalize="none" autoCorrect="off" className="h-12" />
          <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Contraseña" className="h-12" />
          {loginErr && <p className="text-sm text-red-500">{loginErr}</p>}
          <Button type="submit" disabled={loggingIn || !user || !pass} className="w-full h-12">
            {loggingIn ? <Loader2 className="animate-spin" size={18} /> : 'Entrar'}
          </Button>
        </form>
      </div>
    );
  }

  // ---------- Resultado ----------
  if (done) {
    return (
      <div className={`${shell} items-center justify-center p-6 text-center`}>
        <CheckCircle2 size={88} className="text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold">{done.entrando ? 'Entrada fichada' : 'Salida fichada'}</h1>
        <p className="text-lg mt-2">{done.nombre}</p>
        <p className="text-4xl font-bold tabular-nums mt-2">{done.hora}</p>
        {done.ya && <p className="text-sm text-muted-foreground mt-3">Ya tenía la entrada abierta hoy.</p>}
        {done.tarde && <p className="mt-3 flex items-center gap-2 text-amber-500"><AlertTriangle size={16} /> Entrada registrada con retraso</p>}
        <Button className="mt-8 h-12 px-8" onClick={() => setDone(null)}>Volver a la lista</Button>
      </div>
    );
  }

  // ---------- PIN ----------
  if (sel) {
    const entrando = sel.estado === 'sin_fichar';
    return (
      <div className={`${shell} items-center justify-center p-6`}>
        <div className="w-full max-w-sm text-center">
          <button type="button" onClick={back} disabled={busy} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Volver
          </button>
          <h1 className="text-2xl font-bold">{sel.full_name}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-1">
            {entrando ? 'Mete tu código para fichar la ENTRADA' : `Entraste a las ${hm(sel.entrada)}. Mete tu código para fichar la SALIDA`}
          </p>
          {!sel.pin_set && <p className="text-sm text-amber-500 mb-2">Aún no tienes código de seguridad: créalo en tu usuario personal.</p>}
          <div className="min-h-[1.5rem] mb-2">
            {busy && <p className="text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Fichando…</p>}
            {pinErr && <p className="text-sm text-red-500">{pinErr}</p>}
          </div>
          <PinPad value={pin} onChange={onPin} disabled={busy} />
        </div>
      </div>
    );
  }

  // ---------- Lista de trabajadores ----------
  const dentro = workers.filter((w) => w.estado === 'dentro').length;
  return (
    <div className={shell}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={LOGO} alt="Noucolor" className="h-9 w-auto rounded" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">{phoneName || 'Teléfono de empresa'}</p>
            <p className="text-xs text-muted-foreground">{dentro} trabajando ahora</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={load} aria-label="Actualizar">{loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}</Button>
          <Button variant="ghost" size="icon" onClick={() => { if (confirm('¿Cerrar la sesión de este teléfono?')) logout(); }} aria-label="Cerrar sesión del teléfono"><LogOut size={18} /></Button>
        </div>
      </header>
      <main className="flex-1 p-4 max-w-2xl w-full mx-auto">
        <p className="text-sm text-muted-foreground mb-3">Toca tu nombre para fichar.</p>
        {listErr && <p className="text-sm text-red-500 mb-3">{listErr}</p>}
        <div className="grid gap-2">
          {workers.map((w) => {
            const baja = w.estado_laboral !== 'activo';
            const cls = w.estado === 'dentro' ? 'border-emerald-500/60 bg-emerald-500/10'
              : w.estado === 'terminado' ? 'border-border bg-secondary/40 opacity-60'
                : 'border-border bg-card';
            return (
              <button key={w.id} type="button" disabled={w.estado === 'terminado' || baja} onClick={() => pick(w)}
                className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left active:scale-[0.99] transition ${cls}`}>
                <span className="text-lg font-semibold">{w.full_name}</span>
                <span className="text-sm text-right">
                  {baja ? <span className="text-muted-foreground">{w.estado_laboral}</span>
                    : w.estado === 'dentro' ? <span className="text-emerald-500 font-semibold">Dentro · {hm(w.entrada)}<br /><span className="text-xs font-normal">Toca para fichar salida</span></span>
                      : w.estado === 'terminado' ? <span className="text-muted-foreground">Jornada terminada</span>
                        : <span className="text-primary font-semibold">Fichar entrada</span>}
                </span>
              </button>
            );
          })}
          {!loading && workers.length === 0 && !listErr && <p className="text-sm text-muted-foreground">No hay trabajadores.</p>}
        </div>
      </main>
    </div>
  );
}
