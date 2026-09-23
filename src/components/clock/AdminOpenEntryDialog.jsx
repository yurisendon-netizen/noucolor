import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { MapPin, Users, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { authInvoke } from '@/lib/authInvoke';
import L from 'leaflet';

// Mismo fix de icono por defecto de Leaflet que en Geolocalización.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Captura los clics en el mapa y notifica la posición elegida.
function MapClickHandler({ onPick }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

export default function AdminOpenEntryDialog({ open, onOpenChange, onDone }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [selected, setSelected] = useState([]); // ids
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('08:00');
  const [coords, setCoords] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadEmployees();
    setSelected([]);
    setCoords(null);
    setDate(new Date().toISOString().split('T')[0]);
    setTime('08:00');
  }, [open]);

  async function loadEmployees() {
    setLoadingEmps(true);
    try {
      const res = await authInvoke('manageEmployee', { action: 'list' });
      const all = res.data?.employees || [];
      // Solo operarios activos (los jefes están exentos de fichar).
      setEmployees(all.filter(e => e.is_active !== false && e.role !== 'jefe'));
    } catch (e) {
      toast({ title: 'Error al cargar empleados', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingEmps(false);
    }
  }

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const canSubmit = selected.length > 0 && coords && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await authInvoke('trackTime', {
        operation: 'admin_open_entry',
        employeeIds: selected,
        date, time,
        lat: coords.lat, lng: coords.lng,
      });
      const data = res.data || {};
      const openedNames = data.opened || [];
      if (openedNames.length > 0) {
        toast({
          variant: 'success',
          title: '✅ Fichaje abierto',
          description: `Se ha abierto entrada a: ${openedNames.join(', ')}.`,
        });
      }
      if ((data.skippedOpen || []).length > 0) {
        toast({
          title: 'Ya tenían entrada abierta',
          description: data.skippedOpen.join(', '),
        });
      }
      if ((data.skippedAbsent || []).length > 0) {
        toast({
          title: 'Falta convertida en entrada',
          description: `Se reactivó la falta de: ${data.skippedAbsent.join(', ')}.`,
        });
      }
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast({ title: 'Error al abrir fichaje', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir fichaje a trabajador</DialogTitle>
          <DialogDescription>
            Para operarios que se olvidaron de fichar. Elige trabajador(es), fecha, hora y un punto en el mapa.
          </DialogDescription>
        </DialogHeader>

        {/* Trabajadores */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users size={16} /> Trabajadores
          </div>
          {loadingEmps ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary cursor-pointer">
                  <Checkbox checked={selected.includes(emp.id)} onCheckedChange={() => toggle(emp.id)} />
                  <span className="text-sm">{emp.full_name}</span>
                  {emp.position && <span className="text-xs text-muted-foreground">· {emp.position}</span>}
                </label>
              ))}
              {employees.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">No hay operarios activos</p>
              )}
            </div>
          )}
        </div>

        {/* Fecha y hora */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fecha</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hora de entrada</label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {/* Mapa */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-2">
            <MapPin size={16} /> Ubicación del fichaje
          </label>
          <div className="rounded-lg overflow-hidden border border-border h-64">
            <MapContainer
              center={coords ? [coords.lat, coords.lng] : [42.5063, 1.5218]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='Tiles &copy; Esri'
              />
              <MapClickHandler onPick={setCoords} />
              {coords && <Marker position={[coords.lat, coords.lng]} />}
            </MapContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            {coords
              ? `Coordenadas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
              : 'Toca el mapa para elegir la ubicación del fichaje.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Abriendo…</> : 'Abrir fichaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}