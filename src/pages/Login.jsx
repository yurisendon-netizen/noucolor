import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PinPad from '@/components/pin/PinPad';
import { LogIn, Loader2, User, Lock, ShieldCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { employee, login } = useCustomAuth();
  // 'password' = empleados aún sin código · 'pin' = empleados que ya lo registraron
  const [mode, setMode] = useState('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinHint, setPinHint] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (employee) {
    return <Navigate to="/" replace />;
  }

  function done(emp) {
    navigate(emp.pin_set === false ? '/codigo-seguridad' : '/');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const emp = await login(username, password);
      if (emp) {
        done(emp);
      } else {
        setError('Usuario o contraseña incorrectos');
      }
    } catch (err) {
      if (err?.pinRequired) {
        // Este empleado ya migró al código de seguridad → pedir su PIN
        setPassword('');
        setPin('');
        setError('');
        setPinHint(true);
        setMode('pin');
      } else {
        setError('Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePin(v) {
    setError('');
    setPin(v);
    if (v.length !== 4 || loading) return;
    submitPin(v);
  }

  async function submitPin(pinValue) {
    setLoading(true);
    setError('');
    try {
      const emp = await login(username, pinValue, { pin: true });
      if (emp) {
        done(emp);
      } else {
        setError('Usuario o código incorrectos');
        setPin('');
      }
    } catch (err) {
      setError('Error al iniciar sesión');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setError('');
    setPin('');
    setPinHint(false);
    setMode(next);
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 15%, hsl(35 92% 55% / 0.12), transparent 55%)' }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png"
            alt="Noucolor"
            className="mx-auto h-20 w-auto mb-3 rounded-lg drop-shadow-[0_8px_24px_rgba(245,158,11,0.25)]"
          />
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gestió Interna</p>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-2xl shadow-black/40 overflow-hidden">
          <div className="h-1 bg-[linear-gradient(90deg,#f59e0b_0%,#d97706_100%)]" aria-hidden="true" />

          {mode === 'password' ? (
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Introduce tu usuario"
                    className="pl-10 bg-secondary border-border h-11"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Introduce tu contraseña"
                    className="pl-10 bg-secondary border-border h-11"
                    required
                  />
                </div>
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={!username || !password || loading}
                className="w-full h-11 font-medium gap-2 bg-[linear-gradient(90deg,#f59e0b_0%,#d97706_100%)] text-white shadow-lg shadow-amber-950/30 hover:brightness-110 hover:shadow-xl hover:shadow-amber-950/40 disabled:brightness-75"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Iniciando sesión...</>
                ) : (
                  <><LogIn size={18} /> Iniciar Sesión</>
                )}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('pin')}
                className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
              >
                <ShieldCheck size={16} /> Entrar con código de seguridad
              </button>
            </form>
          ) : (
            <div className="p-6 sm:p-8 space-y-5">
              {pinHint ? (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/25 text-primary text-sm text-center">
                  Este usuario accede con su código de seguridad
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={username}
                    onChange={e => { setPin(''); setUsername(e.target.value); }}
                    placeholder="Introduce tu usuario"
                    className="pl-10 bg-secondary border-border h-11"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2 text-center">
                <label className="text-sm font-medium">Código de seguridad</label>
                <PinPad value={pin} onChange={handlePin} disabled={loading || !username} />
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                  {error}
                </div>
              )}
              {loading && (
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Iniciando sesión...
                </p>
              )}
              <button
                type="button"
                onClick={() => switchMode('password')}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                ← Entrar con contraseña
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Principat d'Andorra © {new Date().getFullYear()} Noucolor
        </p>
      </div>
    </div>
  );
}