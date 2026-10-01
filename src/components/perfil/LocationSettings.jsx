import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { MapPin, MapPinOff, Info, RefreshCw } from 'lucide-react';
import { getLocationState, subscribeLocation, startLocationWarmup, IMPRECISE_M } from '@/lib/locationWarmup';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Interruptor de ubicación (como el de notificaciones). Activarlo pide el permiso
// del móvil y arranca el GPS. Desde la web no se puede quitar el permiso: la
// ubicación es obligatoria para fichar, así que una vez activada queda fija.
export default function LocationSettings() {
  const [loc, setLoc] = useState(getLocationState());
  const [perm, setPerm] = useState('unknown'); // granted | denied | prompt | unknown

  useEffect(() => subscribeLocation(setLoc), []);

  useEffect(() => {
    let status = null;
    let cancelled = false;
    const onChange = () => { if (!cancelled && status) setPerm(status.state); };
    try {
      navigator.permissions?.query({ name: 'geolocation' })
        .then((s) => {
          if (cancelled) return;
          status = s;
          setPerm(s.state);
          s.addEventListener?.('change', onChange);
        })
        .catch(() => {});
    } catch { /* Safari antiguo: sin Permissions API */ }
    return () => {
      cancelled = true;
      try { status?.removeEventListener?.('change', onChange); } catch { /* */ }
    };
  }, []);

  const unsupported = loc.status === 'unsupported';
  const denied = perm === 'denied' || loc.status === 'denied';
  const granted = !denied && (perm === 'granted' || loc.status === 'ok' || loc.status === 'imprecise');
  const searching = loc.status === 'searching';
  const acc = loc.best?.accuracy;
  const ios = isIOS();

  let statusText = 'Desactivada';
  if (unsupported) statusText = 'Este dispositivo no da ubicación';
  else if (denied) statusText = 'Bloqueada en este móvil';
  else if (searching && !loc.best) statusText = 'Buscando señal…';
  else if (loc.best && acc <= IMPRECISE_M) statusText = `Activada · exacta (±${acc} m)`;
  else if (loc.best) statusText = `Activada · aproximada (±${acc} m)`;
  else if (granted) statusText = 'Activada';

  const imprecise = !denied && loc.best && acc > IMPRECISE_M;

  return (
    <Card className="border-primary/30 h-fit">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          Ubicación
        </CardTitle>
        <CardDescription>
          Necesaria para fichar. Se registra solo al fichar la entrada y la salida.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {granted ? (
                <MapPin size={18} className="shrink-0 text-primary" />
              ) : (
                <MapPinOff size={18} className="shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">Ubicación exacta</p>
                <p className="text-xs text-muted-foreground">{statusText}</p>
              </div>
            </div>
            <Switch
              checked={granted}
              disabled={unsupported || denied || granted}
              onCheckedChange={(next) => { if (next) startLocationWarmup(); }}
              aria-label="Activar ubicación"
            />
          </div>

          {granted && (
            <Button variant="outline" onClick={startLocationWarmup} className="w-full h-10 gap-2">
              <RefreshCw size={16} /> Comprobar ubicación ahora
            </Button>
          )}

          {denied && (
            <div className="flex items-start gap-3 text-sm rounded-lg bg-destructive/10 p-3 border border-destructive/20">
              <Info size={18} className="shrink-0 mt-0.5 text-destructive" />
              <p className="text-foreground/90">
                {ios
                  ? 'Ve a Ajustes → Privacidad y seguridad → Localización → Safari (o Noucolor) → "Al usar la app" y activa "Ubicación exacta". Luego vuelve aquí.'
                  : 'Toca el candado junto a la dirección (o Ajustes → Apps → Chrome/Noucolor → Permisos) → Ubicación → Permitir y marca "Usar ubicación precisa". Luego vuelve aquí.'}
              </p>
            </div>
          )}

          {imprecise && (
            <div className="flex items-start gap-3 text-sm rounded-lg bg-primary/10 p-3 border border-primary/20">
              <Info size={18} className="shrink-0 mt-0.5 text-primary" />
              <p className="text-foreground/90">
                {ios
                  ? 'Tu ubicación es aproximada y así no podrás fichar. Ajustes → Privacidad y seguridad → Localización → Safari (o Noucolor) → activa "Ubicación exacta".'
                  : 'Tu ubicación es aproximada y así no podrás fichar. Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → activa "Usar ubicación precisa". Si estás dentro, sal al exterior y pulsa "Comprobar ubicación ahora".'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
