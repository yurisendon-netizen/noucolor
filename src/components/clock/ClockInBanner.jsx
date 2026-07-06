import React, { useState, useEffect } from 'react';
import { LogIn, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClockInBanner({ visible, onClockIn, clockingIn }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!visible) setDismissed(false);
  }, [visible]);

  if (!visible || dismissed) return null;

  return (
    <div className="mb-6 rounded-xl border border-[hsl(35,92%,55%)]/30 bg-[hsl(35,92%,55%)]/10 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="shrink-0 w-10 h-10 rounded-full bg-[hsl(35,92%,55%)]/15 flex items-center justify-center">
        <Clock size={20} className="text-[hsl(35,92%,55%)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">Fichar entrada antes de las 8:30</p>
        <p className="text-xs text-muted-foreground">Recuerda fichar para evitar que se registre una falta.</p>
      </div>
      <Button
        onClick={onClockIn}
        disabled={clockingIn}
        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
        size="sm"
      >
        <LogIn size={16} />
        {clockingIn ? 'Fichando...' : 'Fichar Ahora'}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Cerrar"
      >
        <X size={18} />
      </button>
    </div>
  );
}