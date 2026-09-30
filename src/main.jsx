import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initOneSignalWeb } from '@/lib/onesignal';
import { registerSW } from 'virtual:pwa-register';

// Actualización automática de la app instalada (PWA): antes el móvil se quedaba
// con la versión guardada aunque se publicara una nueva. Ahora se busca versión
// nueva al abrir, al volver a la app y cada minuto, y si la hay se recarga sola.
try {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { updateSW(true); },
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