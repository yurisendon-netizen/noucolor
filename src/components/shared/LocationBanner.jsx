import React, { useEffect, useState } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { getLocationState, subscribeLocation, startLocationWarmup } from '@/lib/locationWarmup';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Aviso fijo arriba de la app cuando la ubicación no es exacta o está bloqueada.
// No bloquea nada: solo explica al operario cómo arreglarlo antes de fichar.
export default function LocationBanner() {
  const [loc, setLoc] = useState(getLocationState());

  useEffect(() => subscribeLocation(setLoc), []);

  const ios = isIOS();
  let title = null;
  let text = null;

  if (loc.status === 'denied') {
    title = 'Ubicación bloqueada';
    text = ios
      ? 'Ajustes → Privacidad → Localización → Safari (o Noucolor) → "Al usar la app" y activa "Ubicación exacta".'
      : 'Toca el candado junto a la dirección (o Ajustes → Apps → Chrome/Noucolor → Permisos) → Ubicación → Permitir, y marca "Usar ubicación precisa".';
  } else if (loc.status === 'imprecise') {
    title = `Tu ubicación es aproximada (±${loc.best?.accuracy ?? '?'} m)`;
    text = ios
      ? 'Ajustes → Privacidad → Localización → Safari (o Noucolor) → activa "Ubicación exacta".'
      : 'Ajustes → Ubicación → activa "Precisión de la ubicación de Google" / "Ubicación precisa", y en los permisos de Chrome/Noucolor marca "Precisa".';
  } else if (loc.status === 'unavailable') {
    title = 'No se detecta tu ubicación';
    text = 'Activa la ubicación (GPS) del móvil y pulsa Reintentar.';
  } else if (loc.status === 'unsupported') {
    title = 'Este dispositivo no da ubicación';
    text = 'Para fichar necesitas un móvil con GPS.';
  }

  if (!title) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/30 px-4 py-2.5 flex items-start gap-3 shrink-0">
      <MapPin size={18} className="text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
      </div>
      {loc.status !== 'unsupported' && (
        <button
          onClick={startLocationWarmup}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-foreground border border-border rounded-md px-2 py-1"
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      )}
    </div>
  );
}
