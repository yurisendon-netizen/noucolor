// Calentamiento del GPS: al abrir la app se pide la ubicación (salta el aviso de
// permiso si aún no lo han aceptado) y se escucha el GPS un rato para que, cuando
// el operario pulse "Fichar", ya haya una lectura exacta y reciente.
// Estado compartido por toda la app (AppLayout, ControlHorario, Perfil, banner).

const WARMUP_MS = 60000;          // cuánto tiempo se escucha el GPS en cada arranque
const GOOD_ACCURACY_M = 50;       // lectura "exacta": se para de escuchar al llegar
export const IMPRECISE_M = 200;   // peor que esto = ubicación aproximada (red/wifi)
export const FRESH_MS = 90000;    // una lectura sirve para fichar durante 90 s

let state = {
  status: 'idle',   // idle | searching | ok | imprecise | denied | unavailable | unsupported
  best: null,       // { lat, lng, accuracy, ts }
};
let watchId = null;
let stopTimer = null;
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(state); } catch { /* noop */ } });
}

export function getLocationState() {
  return state;
}

export function subscribeLocation(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Devuelve la mejor lectura si es reciente (FRESH_MS), si no null.
export function getFreshLocation() {
  const b = state.best;
  if (!b) return null;
  if (Date.now() - b.ts > FRESH_MS) return null;
  return b;
}

// Guarda una lectura (también la usan otros componentes que leen el GPS).
export function recordPosition(pos) {
  const acc = Number.isFinite(pos?.coords?.accuracy) ? Math.round(pos.coords.accuracy) : null;
  if (acc === null) return;
  const reading = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: acc, ts: Date.now() };
  const prev = state.best;
  const prevFresh = prev && Date.now() - prev.ts <= FRESH_MS;
  // Nos quedamos con la más precisa de las recientes; una antigua se sustituye siempre.
  if (!prevFresh || acc <= prev.accuracy) {
    setState({ best: reading });
  }
  const best = state.best;
  setState({ status: best.accuracy <= IMPRECISE_M ? 'ok' : 'imprecise' });
}

export function stopLocationWarmup() {
  if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
}

export function startLocationWarmup() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    setState({ status: 'unsupported' });
    return;
  }
  stopLocationWarmup();
  if (state.status !== 'ok' && state.status !== 'imprecise') setState({ status: 'searching' });
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      recordPosition(pos);
      if (state.best && state.best.accuracy <= GOOD_ACCURACY_M) stopLocationWarmup();
    },
    (err) => {
      if (err?.code === 1) {
        setState({ status: 'denied' });
        stopLocationWarmup();
      } else if (!state.best) {
        setState({ status: 'unavailable' });
      }
    },
    { enableHighAccuracy: true, timeout: WARMUP_MS, maximumAge: 0 }
  );
  stopTimer = setTimeout(() => {
    stopLocationWarmup();
    if (!state.best && state.status === 'searching') setState({ status: 'unavailable' });
  }, WARMUP_MS);
}
