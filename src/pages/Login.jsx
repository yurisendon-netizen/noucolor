import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogIn, Loader2, User, Lock } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { employee, login } = useCustomAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (employee) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const emp = await login(username, password);
      if (emp) {
        // Primera vez sin código de seguridad → pantalla para crearlo (estilo Armo)
        navigate(emp.pin_set === false ? '/codigo-seguridad' : '/');
      } else {
        setError('Usuario o contraseña incorrectos');
      }
    } catch (err) {
      setError('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
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
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Principat d'Andorra © {new Date().getFullYear()} Noucolor
        </p>
      </div>
    </div>
  );
}