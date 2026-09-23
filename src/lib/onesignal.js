import { base44 } from '@/api/base44Client';

let initPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar OneSignal SDK'));
    document.head.appendChild(s);
  });
}

// Inicializa el SDK web de OneSignal (suscripción push del navegador). Es
// no-bloqueante y best-effort: en la app nativa (median) se ignora porque median
// gestiona OneSignal de forma nativa. El App ID se pide al backend (getPushConfig).
export function initOneSignalWeb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
      if (window.median) return null; // app nativa: OneSignal lo gestiona median
      await loadScript('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js');

      let appId = null;
      try {
        const res = await base44.functions.invoke('getPushConfig');
        appId = res?.data?.onesignal_app_id || null;
      } catch { /* sin config: no hay web push */ }
      if (!appId) return null;

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      return await new Promise((resolve) => {
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            await OneSignal.init({
              appId,
              serviceWorkerPath: 'OneSignalSDKWorker.js',
              allowLocalhostAsSecureOrigin: true
            });
            resolve(OneSignal);
          } catch {
            resolve(null);
          }
        });
      });
    } catch {
      return null;
    }
  })();
  return initPromise;
}

// Pide permiso de notificaciones push al navegador (solo web, no nativo).
// Debe llamarse dentro de un gesto del usuario (p.ej. al pulsar "Iniciar sesión")
// porque los navegadores bloquean la solicitud de permiso fuera de un gesto.
// Es best-effort: si el usuario ya decidió (otorgó o denegó), no hace nada.
export async function requestPushPermission() {
  try {
    if (typeof window === 'undefined' || window.median) return;
    const OneSignal = await initOneSignalWeb();
    if (!OneSignal || !OneSignal.Notifications) return;
    const granted = OneSignal.Notifications.permission;
    if (granted) return;
    if (typeof OneSignal.Notifications.requestPermission === 'function') {
      await OneSignal.Notifications.requestPermission();
    }
  } catch { /* best-effort */ }
}

// Vincula el id del empleado como external_id en OneSignal para que el cron lo
// alcance vía include_external_user_ids. En nativo usa el bridge de median; en
// web usa OneSignal.login del SDK ya inicializado.
export async function linkOneSignalExternalUser(employeeId) {
  try {
    if (typeof window === 'undefined' || !employeeId) return;
    const median = window.median;
    if (median && median.onesignal && typeof median.onesignal.setExternalUserId === 'function') {
      median.onesignal.setExternalUserId(String(employeeId));
    }
    const OneSignal = await initOneSignalWeb();
    if (OneSignal) {
      try {
        if (typeof OneSignal.login === 'function') await OneSignal.login(String(employeeId));
        else if (typeof OneSignal.setExternalUserId === 'function') await OneSignal.setExternalUserId(String(employeeId));
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort: nunca bloquea el login */ }
}