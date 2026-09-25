import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Loader2, ClipboardList, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { authInvoke } from '@/lib/authInvoke';
import moment from 'moment';

const TIPO_LABELS = {
  olvido_entrada: 'Olvido de entrada',
  olvido_salida: 'Olvido de salida',
  salida_por_error: 'Salida por error',
  hora_incorrecta: 'Hora incorrecta',
  otro: 'Otro',
};

export default function SolicitudesPendientes() {
  const { toast } = useToast();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [comentarios, setComentarios] = useState({});

  async function load() {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'listCorrecciones', onlyPending: true });
      if (res.data?.success) setSolicitudes(res.data.solicitudes || []);
    } catch (e) {
      toast({ title: 'Error al cargar solicitudes', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function resolve(s, accion) {
    setBusy(b => ({ ...b, [s.id]: accion }));
    try {
      await authInvoke('trackTime', {
        operation: 'resolveCorreccion',
        solicitudId: s.id,
        accion,
        comentario: comentarios[s.id] || null,
      });
      toast({
        variant: 'success',
        title: accion === 'aprobar' ? '✅ Solicitud aprobada' : 'Solicitud rechazada',
        description: `${s.employee_name} ha sido notificado/a.`,
      });
      setComentarios(c => { const n = { ...c }; delete n[s.id]; return n; });
      await load();
    } catch (e) {
      toast({ title: 'Error al resolver', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(b => { const n = { ...b }; delete n[s.id]; return n; });
    }
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList size={16} className="text-primary" />
            Solicitudes de corrección
            {pendientes.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {pendientes.length}
              </span>
            )}
          </CardTitle>
          <button onClick={load} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" aria-label="Refrescar" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No hay solicitudes pendientes. ✓</p>
        ) : (
          <div className="space-y-3">
            {pendientes.map(s => (
              <div key={s.id} className="rounded-lg border border-border p-4 bg-secondary/30">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.employee_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {moment(s.fecha + 'T00:00:00').format('DD/MM/YYYY')}
                      {s.hora_propuesta ? ` · ${s.hora_propuesta}` : ''}
                      {' · '}<span className="font-medium">{TIPO_LABELS[s.tipo] || s.tipo}</span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{s.motivo}</p>
                {s.lat != null && s.lng != null && (
                  <p className="text-xs text-muted-foreground mb-2">
                    📍 {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </p>
                )}
                <Textarea
                  value={comentarios[s.id] || ''}
                  onChange={(e) => setComentarios(c => ({ ...c, [s.id]: e.target.value }))}
                  placeholder="Comentario opcional para el trabajador…"
                  rows={2}
                  className="mb-3"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="success" className="gap-1.5"
                    onClick={() => resolve(s, 'aprobar')}
                    disabled={busy[s.id]}
                  >
                    {busy[s.id] === 'aprobar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Aprobar
                  </Button>
                  <Button
                    size="sm" variant="outline" className="gap-1.5"
                    onClick={() => resolve(s, 'rechazar')}
                    disabled={busy[s.id]}
                  >
                    {busy[s.id] === 'rechazar' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}