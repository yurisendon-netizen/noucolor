import React from 'react';
import { WifiOff } from 'lucide-react';
import useOnlineStatus from '@/hooks/useOnlineStatus';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[300] bg-destructive text-destructive-foreground text-xs sm:text-sm font-medium flex items-center justify-center gap-2 py-2 px-4 text-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <WifiOff size={16} className="shrink-0" />
      Sin conexión — fichar y enviar formularios no funcionará hasta que vuelvas a tener cobertura.
    </div>
  );
}
