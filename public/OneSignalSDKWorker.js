// Service Worker de OneSignal para Noucolor.
// Importa el SDK de OneSignal para recibir/mostrar las notificaciones push del
// navegador, y añade un manejador propio de `notificationclick` para que al
// pulsar la notificación se abra/enfoque la app directamente en Control Horario
// (lista para fichar) en vez del dashboard.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = (event.notification && event.notification.data) || {};
  const target = data.target_url || data.url || "/control-horario";
  const origin = self.location.origin;

  // Solo permitimos rutas del propio origen (evita deep-links externos).
  let path = "/control-horario";
  try {
    const u = new URL(target, origin);
    if (u.origin === origin) path = u.pathname + u.search;
  } catch {
    // target ya era una ruta relativa: úsala si es del mismo origen.
    if (target.startsWith("/") && !target.startsWith("//")) path = target;
  }
  const fullUrl = origin + path;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    // ¿Hay ya una pestaña de la app abierta? La enfocamos y le pedimos que
    // navegue a Control Horario (sin abrir una segunda pestaña).
    for (const client of clientList) {
      if (client.url.startsWith(origin)) {
        try { if ("focus" in client) await client.focus(); } catch {}
        try { client.postMessage({ type: "NOUCOLOR_NAVIGATE", url: path }); } catch {}
        return;
      }
    }

    // No había pestaña abierta: abrimos la app en la URL destino. Si hay sesión
    // iniciada, ProtectedRoute deja entrar directo a Control Horario; si no,
    // manda a login y vuelve después a esa pantalla (returnTo).
    if (self.clients.openWindow) {
      try { await self.clients.openWindow(fullUrl); } catch {}
    }
  })());
});
