import React from 'react';

// Si una página falla al pintarse, en vez de quedarse la pantalla en negro
// mostramos el error y un botón que limpia la caché del navegador y recarga.
// La primera vez que pasa, se intenta reparar sola (una sola vez por sesión).
const FLAG = 'noucolor_autofix_done';

async function limpiarYRecargar() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* sin Cache Storage */ }
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());
  window.location.replace(url.toString());
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[ErrorBoundary]', error);
    let done = false;
    try { done = sessionStorage.getItem(FLAG) === '1'; } catch { /* nada */ }
    if (!done) {
      try { sessionStorage.setItem(FLAG, '1'); } catch { /* nada */ }
      limpiarYRecargar();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold">Esta página no se ha podido cargar</h2>
          <p className="text-sm text-muted-foreground">Seguramente el navegador tiene guardada una versión antigua de la app.</p>
          <button
            type="button"
            onClick={limpiarYRecargar}
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Actualizar la app
          </button>
          <p className="text-[11px] text-muted-foreground break-words">{String(this.state.error?.message || this.state.error)}</p>
        </div>
      </div>
    );
  }
}
