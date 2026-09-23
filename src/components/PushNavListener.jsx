import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Escucha mensajes del Service Worker (notificationclick) para navegar dentro
// de la SPA a la pantalla indicada sin recargar ni abrir una segunda pestaña.
export default function PushNavListener() {
  const navigate = useNavigate();

  useEffect(() => {
    function onMessage(e) {
      const data = e?.data;
      if (!data || data.type !== 'NOUCOLOR_NAVIGATE' || typeof data.url !== 'string') return;
      const url = data.url;
      // Solo rutas internas (mismo origen), evitando navegaciones externas.
      if (!url.startsWith('/') || url.startsWith('//')) return;
      navigate(url, { replace: true });
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', onMessage);
    }
    window.addEventListener('message', onMessage);
    return () => {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      }
      window.removeEventListener('message', onMessage);
    };
  }, [navigate]);

  return null;
}