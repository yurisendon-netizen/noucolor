import React, { useState } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import PinPad from '@/components/pin/PinPad';

const LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';

// Pantalla de bloqueo: se muestra al reabrir la app con la sesión guardada
// cuando el empleado ya tiene un código de seguridad configurado.
export default function PinLock({ onUnlock }) {
  const { logout } = useCustomAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleChange(v) {
    setPin(v);
    setError('');
    if (v.length !== 4 || loading) return;
    setLoading(true);
    try {
      const res = await authInvoke('employeePin', { action: 'verify', pin: v });
      if (res.data?.success) {
        onUnlock();
      } else {
        setError('Código incorrecto');
        setPin('');
      }
    } catch {
      setError('No se pudo verificar el código. Inténtalo de nuevo.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 15%, hsl(35 92% 55% / 0.10), transparent 55%)' }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm text-center">
        <img src={LOGO} alt="Noucolor" className="mx-auto h-14 w-auto mb-5 rounded-lg" />
        <h1 className="text-xl font-bold">Código de seguridad</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-2">Introduce tu código para entrar</p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <PinPad value={pin} onChange={handleChange} disabled={loading} />
        <button
          type="button"
          onClick={logout}
          className="mt-6 text-sm text-muted-foreground hover:text-foreground"
        >
          ¿Olvidaste el código? Entra con tu usuario
        </button>
      </div>
    </div>
  );
}