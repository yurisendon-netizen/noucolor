import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initOneSignalWeb } from '@/lib/onesignal';
import { registerSW } from 'virtual:pwa-register';

// Actualización de la app instalada (PWA): antes el móvil se quedaba con la
// versión guardada aunque se publicara una nueva. Ahora se busca versión nueva
// al abrir, al volver a la app y cada minuto:
//  - si la app se acaba de abrir (<20 s) se recarga sola, no hay nada a medias;
//  - si ya se está usando, sale un aviso con botón "Actualizar" para no perder
//    lo que se esté escribiendo (un parte, una firma…).
const APP_LOADED_AT = Date.now();
function showUpdateBanner(apply) {
  if (document.getElementById('nc-update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'nc-update-banner';
  bar.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:99999;background:#e6a030;color:#111;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)');
  const txt = document.createElement('span');
  txt.textContent = 'Hay una versión nueva de la app';
  txt.style.flex = '1';
  const btn = document.createElement('button');
  btn.textContent = 'Actualizar';
  btn.setAttribute('style', 'background:#111;color:#fff;border:0;border-radius:8px;padding:8px 12px;font:600 14px system-ui,sans-serif');
  btn.onclick = () => { btn.textContent = 'Actualizando…'; apply(); };
  bar.appendChild(txt);
  bar.appendChild(btn);
  document.body.appendChild(bar);
}
try {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (Date.now() - APP_LOADED_AT < 20000) updateSW(true);
      else showUpdateBanner(() => updateSW(true));
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { try { reg.update(); } catch { /* sin conexión */ } };
      setInterval(check, 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
} catch { /* navegador sin service worker */ }

// Inicializa OneSignal web (push) lo antes posible. No bloquea: en la app
// nativa (median) se ignora automáticamente.
initOneSignalWeb();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)