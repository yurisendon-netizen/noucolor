import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { authInvoke } from '@/lib/authInvoke';

const TIPOS = [
  { value: 'olvido_entrada', label: 'Olvidé fichar la entrada' },
  { value: 'olvido_salida', label: 'Olvidé fichar la salida' },
  { value: 'salida_por_error', label: 'Fiché salida por error' },
  { value: 'hora_incorrecta', label: 'Hora incorrecta' },
  { value: 'otro', label: 'Otro' },
];

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

export default function SolicitudCorreccionDialog({ open, onOpenChange, onDone }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState('olvido_entrada');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [hora, setHora] = useState('08:00');
  const [motivo, setMotivo] = useState('');
  const [loc, setLoc] = useState(null);
  const [gettingLoc, setGettingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo('olvido_entrada');
    setFecha(new Date().toISOString().split('T')[0]);
    setHora('08:00');
    setMotivo('');
    setLoc(null);
  }, [open]);

  async function handleAddLocation() {
    setGettingLoc(true);
    const l = await getCurrentLocation();
    setLoc(l);
    setGettingLoc(false);
    if (!l) toast({ title: 'No se pudo obtener tu ubicación', description: 'Puedes enviar la solicitud sin ella.', variant: 'destructive' });
  }

  async function handleSubmit() {
    if (!motivo.trim()) {
      toast({ title: 'El motivo es obligatorio', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await authInvoke('trackTime', {
        operation: 'createCorreccion',
        fecha, tipo,
        horaPropuesta: hora || null,
        lat: loc?.lat ?? null, lng: loc?.lng ?? null,
        motivo: motivo.trim(),
      });
      toast({ variant: 'success', title: '✅ Solicitud enviada', description: 'Tu encargado revisará la corrección.' });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast({ title: 'Error al enviar la solicitud', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar corrección de fichaje</DialogTitle>
          <DialogDescription>
            Indica qué ocurrió. Tu encargado recibirá la solicitud y la revisará.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Motivo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hora propuesta</label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Explica qué pasó</label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Se me olvidó fichar la entrada porque llegué directamente a la obra…"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Button type="button" variant="outline" size="sm" onClick={handleAddLocation} disabled={gettingLoc} className="gap-2">
              {gettingLoc ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              {loc ? `Ubicación: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : 'Añadir mi ubicación actual'}
            </Button>
            <p className="text-xs text-muted-foreground">Opcional — ayuda a verificar dónde estabas.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !motivo.trim()} className="gap-2">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}