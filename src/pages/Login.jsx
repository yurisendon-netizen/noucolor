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
      const success = await login(username, password);
      if (success) {
        navigate('/');
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(35,92%,55%)] to-[hsl(25,90%,45%)] items-center justify-center mb-4 shadow-lg shadow-[hsl(35,92%,55%)]/25">
            <span className="text-2xl font-bold text-black">N</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Noucolor</h1>
          <p className="text-muted-foreground mt-2">Gestió Interna — Pintura i Decoració</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 space-y-5">
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
            <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={!username || !password || loading}
            className="w-full h-11 bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black font-medium gap-2"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Iniciando sesión...</>
            ) : (
              <><LogIn size={18} /> Iniciar Sesión</>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Principat d'Andorra © {new Date().getFullYear()} Noucolor
        </p>
      </div>
    </div>
  );
}