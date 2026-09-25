import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, Smartphone, Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { initOneSignalWeb, linkOneSignalExternalUser } from '@/lib/onesignal';

// Detecta iPhone (Safari) sin estar instalada en pantalla de inicio: iOS solo
// permite push web si la PWA está añadida al home screen y abierta desde el icono.
function isIosWithoutInstall() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  if (!isIos) return false;
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return !standalone;
}

// App nativa (median bridge)
function isNativeApp() {
  return typeof window !== 'undefined' && !!window.median;
}

export default function NotificationSettings({ employee }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState('default'); // granted|denied|default
  const [optedIn, setOptedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function refreshState(OneSignal) {
    if (!OneSignal) {
      setReady(false);
      setLoading(false);
      return;
    }
    const granted = OneSignal.Notifications?.permission ?? false;
    const opted = OneSignal.User?.PushSubscription?.optedIn ?? false;
    // El estado "denegado" lo leemos del navegador (Notification.permission),
    // porque OneSignal.Notifications.permission solo dice si está concedido.
    const browserPerm =
      typeof Notification !== 'undefined' && Notification.permission
        ? Notification.permission
        : granted ? 'granted' : 'default';
    if (mountedRef.current) {
      setPermission(browserPerm);
      setOptedIn(opted);
      setReady(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!employee?.id) return;
    // Asegura la vinculación del external_id antes de leer/escribir el estado.
    linkOneSignalExternalUser(employee.id);

    if (isNativeApp()) {
      setLoading(false);
      return;
    }
    if (isIosWithoutInstall()) {
      setLoading(false);
      return; // no hay push web posible hasta instalar la PWA
    }

    let unsubPush = null;
    let unsubPerm = null;
    (async () => {
      const OneSignal = await initOneSignalWeb();
      if (!OneSignal) {
        if (mountedRef.current) { setReady(false); setLoading(false); }
        return;
      }
      await refreshState(OneSignal);
      try {
        if (OneSignal.User?.PushSubscription?.addEventListener) {
          const handler = (e) => {
            const opted = e?.currentTarget?.optedIn ?? false;
            if (mountedRef.current) setOptedIn(opted);
          };
          OneSignal.User.PushSubscription.addEventListener('change', handler);
          unsubPush = () => OneSignal.User?.PushSubscription?.removeEventListener?.('change', handler);
        }
      } catch { /* best-effort */ }
      try {
        if (OneSignal.Notifications?.addEventListener) {
          const handler = (granted) => {
            if (!mountedRef.current) return;
            setPermission(granted ? 'granted' : 'denied');
            if (!granted) setOptedIn(false);
          };
          OneSignal.Notifications.addEventListener('permissionChange', handler);
          unsubPerm = () => OneSignal.Notifications?.removeEventListener?.('permissionChange', handler);
        }
      } catch { /* best-effort */ }
    })();

    return () => {
      try { unsubPush?.(); } catch { /* */ }
      try { unsubPerm?.(); } catch { /* */ }
    };
  }, [employee?.id]);

  // App nativa: median gestiona OneSignal nativamente. No exponemos toggle web;
  // abrimos los ajustes de notificaciones del sistema si median lo permite.
  if (isNativeApp()) {
    const openSettings = () => {
      try {
        if (typeof window.median?.openSettings === 'function') window.median.openSettings();
        else if (typeof window.median?.app?.openSettings === 'function') window.median.app.openSettings();
      } catch { /* best-effort */ }
    };
    const hasBridge = typeof window.median?.openSettings === 'function' ||
      typeof window.median?.app?.openSettings === 'function';
    return (
      <Card className="border-primary/30 h-fit">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            Notificaciones
          </CardTitle>
          <CardDescription>
            Las notificaciones push en esta app se gestionan desde los ajustes del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Smartphone size={18} className="shrink-0 mt-0.5 text-primary" />
            <p>
              Activa o desactiva las notificaciones de Noucolor en Ajustes del dispositivo →
              Notificaciones → Noucolor.
            </p>
          </div>
          {hasBridge && (
            <Button onClick={openSettings} variant="outline" className="w-full h-11 mt-4 gap-2">
              <ExternalLink size={16} /> Abrir ajustes del sistema
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // iPhone sin instalar: iOS no permite push web salvo como PWA instalada.
  if (isIosWithoutInstall()) {
    return (
      <Card className="border-primary/30 h-fit">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            Notificaciones
          </CardTitle>
          <CardDescription>
            Activa los avisos push de fichaje y novedades en este dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 text-sm rounded-lg bg-primary/10 p-3 border border-primary/20">
            <Info size={18} className="shrink-0 mt-0.5 text-primary" />
            <p className="text-foreground/90">
              En iPhone primero añade Noucolor a la pantalla de inicio
              (Compartir → Añadir a pantalla de inicio) y ábrela desde el icono.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const blocked = permission === 'denied';
  const checked = optedIn && !blocked;
  const statusText = checked ? 'Activadas en este dispositivo' : 'Desactivadas';

  async function handleToggle(nextChecked) {
    if (busy) return;
    setBusy(true);
    try {
      const OneSignal = await initOneSignalWeb();
      if (!OneSignal) return;
      if (nextChecked) {
        // Activar: si no se ha pedido permiso, pedirlo; si ya está concedido, optIn.
        const granted = OneSignal.Notifications?.permission ?? false;
        if (!granted && typeof OneSignal.Notifications?.requestPermission === 'function') {
          await OneSignal.Notifications.requestPermission();
        }
        const nowGranted = OneSignal.Notifications?.permission ?? false;
        if (nowGranted && typeof OneSignal.User?.PushSubscription?.optIn === 'function') {
          await OneSignal.User.PushSubscription.optIn();
        }
        await refreshState(OneSignal);
      } else {
        // Desactivar este dispositivo.
        if (typeof OneSignal.User?.PushSubscription?.optOut === 'function') {
          await OneSignal.User.PushSubscription.optOut();
        }
        await refreshState(OneSignal);
      }
    } catch { /* best-effort */ } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30 h-fit">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Activa los avisos push de fichaje y novedades en este dispositivo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-5 rounded-full bg-muted animate-pulse" />
            <span className="text-sm text-muted-foreground">Cargando estado…</span>
          </div>
        ) : !ready ? (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <BellOff size={18} className="shrink-0 mt-0.5" />
            <p>Las notificaciones push no están disponibles en este navegador.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {checked ? (
                  <Bell size={18} className="shrink-0 text-primary" />
                ) : (
                  <BellOff size={18} className="shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">Avisos push</p>
                  <p className="text-xs text-muted-foreground">{statusText}</p>
                </div>
              </div>
              <Switch
                checked={checked}
                disabled={busy || blocked}
                onCheckedChange={handleToggle}
                aria-label="Activar o desactivar notificaciones push"
              />
            </div>

            {blocked && (
              <div className="flex items-start gap-3 text-sm rounded-lg bg-destructive/10 p-3 border border-destructive/20">
                <Info size={18} className="shrink-0 mt-0.5 text-destructive" />
                <p className="text-foreground/90">
                  El permiso de notificaciones está bloqueado en este navegador. Para
                  permitirlo: abre los ajustes del navegador → Permisos del sitio →
                  Noucolor → Notificaciones → Permitir. En móvil, ve a Ajustes del
                  navegador → Notificaciones del sitio y actívalas.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}