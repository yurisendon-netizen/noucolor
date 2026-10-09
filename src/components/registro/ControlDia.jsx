import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, Loader2, RefreshCw, AlertTriangle, Search, LocateFixed, Trash2, ExternalLink } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { fDate, todayAndorra } from '@/components/registro/registroUtils';

const RADIOS = [150, 300, 500, 1000];

function hora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { timeZone: 'Europe/Andorra', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fDist(m) {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Fechas laborables (lun-vie) entre dos días, máximo 31.
function diasLaborables(desde, hasta) {
  const out = [];
  if (!desde) return out;
  const end = hasta && hasta >= desde ? hasta : desde;
  const d = new Date(`${desde}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && out.length < 31) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function ControlDia() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayAndorra());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [dlg, setDlg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState([]);
  const [desde, setDesde] = useState(todayAndorra());
  const [hasta, setHasta] = useState(todayAndorra());
  const [lugar, setLugar] = useState({ obra_nombre: '', lat: null, lng: null, radio_m: 300 });
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'listControlDia', date });
      if (res?.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      if (!silent) toast({ title: 'Error al cargar el control del día', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [date, toast]);

  useEffect(() => { load(); }, [load]);
  // Refresco automático cada minuto (solo si es hoy).
  useEffect(() => {
    if (date !== todayAndorra()) return undefined;
    const t = setInterval(() => load(true), 60000);
    return () => clearInterval(t);
  }, [date, load]);

  const rows = data?.rows || [];
  const activos = rows.filter(r => r.estado_laboral === 'activo');
  const sinFichar = activos.filter(r => !r.clock_in);
  const fuera = rows.filter(r => r.fuera);
  const esHoy = date === todayAndorra();

  function openDialog(employeeId) {
    setSel(employeeId ? [employeeId] : []);
    setDesde(date);
    setHasta(date);
    setLugar({ obra_nombre: '', lat: null, lng: null, radio_m: 300 });
    setQ('');
    setResults([]);
    setDlg(true);
  }

  async function buscar() {
    const text = q.trim();
    if (text.length < 3) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ad,es,fr&q=${encodeURIComponent(text)}`, { headers: { 'Accept-Language': 'es' } });
      const j = await r.json();
      setResults(Array.isArray(j) ? j : []);
      if (!j || j.length === 0) toast({ title: 'Sin resultados', description: 'Prueba con otra dirección o usa "Mi ubicación actual".' });
    } catch {
      toast({ title: 'No se pudo buscar', description: 'Usa "Mi ubicación actual" estando en la obra.', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      toast({ title: 'Tu navegador no da la ubicación', variant: 'destructive' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLugar(l => ({ ...l, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast({ title: 'No se pudo obtener tu ubicación', description: 'Activa la ubicación del navegador.', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function elegirResultado(r) {
    const nombre = (r.name || r.display_name || '').split(',')[0] || q;
    setLugar(l => ({ ...l, obra_nombre: l.obra_nombre || nombre, lat: Number(r.lat), lng: Number(r.lon) }));
    setResults([]);
  }

  function elegirGuardado(p) {
    setLugar({ obra_nombre: p.obra_nombre, lat: p.lat, lng: p.lng, radio_m: p.radio_m || 300 });
  }

  const diasSel = useMemo(() => diasLaborables(desde, hasta), [desde, hasta]);

  async function guardar() {
    if (sel.length === 0 || diasSel.length === 0 || !lugar.obra_nombre.trim() || lugar.lat == null) {
      toast({ title: 'Faltan datos', description: 'Elige trabajadores, días, nombre de la obra y su ubicación.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await authInvoke('trackTime', {
        operation: 'saveAsignaciones', employeeIds: sel, dates: diasSel,
        obra_nombre: lugar.obra_nombre, lat: lugar.lat, lng: lugar.lng, radio_m: lugar.radio_m,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Obra asignada', description: `${lugar.obra_nombre} · ${sel.length} trabajador${sel.length === 1 ? '' : 'es'} · ${diasSel.length} día${diasSel.length === 1 ? '' : 's'}.` });
      setDlg(false);
      load(true);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function quitar(r) {
    if (!r.asignacion) return;
    if (!confirm(`¿Quitar la obra «${r.asignacion.obra_nombre}» de ${r.full_name} este día?`)) return;
    try {
      const res = await authInvoke('trackTime', { operation: 'deleteAsignacion', asignacionId: r.asignacion.id });
      if (res?.data?.error) throw new Error(res.data.error);
      load(true);
    } catch (e) {
      toast({ title: 'No se pudo quitar', description: e.message, variant: 'destructive' });
    }
  }

  function toggle(id) {
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  }

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold">Control de obra del día</h2>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40 bg-secondary border-border h-9" />
          <Button variant="outline" size="icon" onClick={() => load()} className="border-border h-9 w-9" aria-label="Actualizar">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </Button>
          <Button onClick={() => openDialog()} className="gap-2 h-9"><Plus size={16} /> Asignar obra</Button>
        </div>
      </div>

      {(sinFichar.length > 0 || fuera.length > 0) && (
        <div className="mb-3 space-y-2">
          {fuera.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span><strong>Fuera de la obra:</strong> {fuera.map(r => `${r.full_name} (${fDist(r.distancia)})`).join(', ')}</span>
            </div>
          )}
          {sinFichar.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span><strong>{esHoy ? 'Sin fichar:' : 'No fichó:'}</strong> {sinFichar.map(r => r.full_name).join(', ')}</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {!data && <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>}
        {data && rows.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No hay trabajadores.</p>}
        {rows.map(r => {
          const noActivo = r.estado_laboral !== 'activo';
          const sin = !r.clock_in && !noActivo;
          return (
            <div key={r.id} className={`px-4 py-3 ${r.fuera || sin ? 'bg-red-500/5' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`font-medium ${r.fuera || sin ? 'text-red-500 font-bold' : ''}`}>{r.full_name}</span>
                {noActivo && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{r.estado_laboral}</span>}
                {sin && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{esHoy ? 'Sin fichar' : 'No fichó'}</span>}
                {r.clock_in && <span className="text-sm tabular-nums text-muted-foreground">Fichó {hora(r.clock_in)}</span>}
                {r.fuera && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">FUERA · {fDist(r.distancia)}</span>}
                {r.clock_in && r.asignacion && !r.fuera && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-500">En obra · {fDist(r.distancia)}</span>}
                {r.lat != null && (
                  <a href={mapsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink size={12} /> Dónde fichó
                  </a>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                {r.asignacion ? (
                  <>
                    <span className="text-muted-foreground">Obra: <span className="text-foreground">{r.asignacion.obra_nombre}</span></span>
                    <a href={mapsUrl(r.asignacion.lat, r.asignacion.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink size={12} /> Ver obra
                    </a>
                    <button type="button" onClick={() => quitar(r)} className="text-red-400 hover:text-red-300 p-1" aria-label="Quitar obra"><Trash2 size={14} /></button>
                  </>
                ) : (
                  !noActivo && <span className="text-xs text-muted-foreground">Sin obra asignada</span>
                )}
                {!noActivo && (
                  <Button variant="outline" size="sm" onClick={() => openDialog(r.id)} className="ml-auto h-7 border-border gap-1 text-xs">
                    <Plus size={12} /> {r.asignacion ? 'Cambiar' : 'Asignar'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {fDate(date)} · Si asignas una obra y el trabajador ficha a más distancia de la permitida, sale en rojo y te llega un aviso al móvil.
      </p>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="bg-card border-border max-w-lg w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Asignar obra</DialogTitle>
            <DialogDescription className="text-muted-foreground">Dónde tienen que fichar los trabajadores esos días.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Trabajadores</label>
              <div className="grid grid-cols-2 gap-1.5">
                {activos.map(r => (
                  <label key={r.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer ${sel.includes(r.id) ? 'border-primary bg-primary/10' : 'border-border bg-secondary'}`}>
                    <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
                    <span className="truncate">{r.full_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Desde</label>
                <Input type="date" value={desde} onChange={e => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Hasta</label>
                <Input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">{diasSel.length} día{diasSel.length === 1 ? '' : 's'} laborable{diasSel.length === 1 ? '' : 's'} (lunes a viernes).</p>

            {(data?.lugares || []).length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Obras usadas antes</label>
                <div className="flex flex-wrap gap-1.5">
                  {data.lugares.map(p => (
                    <button key={p.obra_nombre} type="button" onClick={() => elegirGuardado(p)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs hover:bg-secondary/70">
                      {p.obra_nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Buscar dirección</label>
              <div className="flex gap-2">
                <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="Ej: La Cortinada, Ordino" className="bg-secondary border-border" />
                <Button variant="outline" onClick={buscar} disabled={searching} className="border-border shrink-0">
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </Button>
              </div>
              {results.length > 0 && (
                <ul className="mt-2 rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {results.map(r => (
                    <li key={r.place_id}>
                      <button type="button" onClick={() => elegirResultado(r)} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/60 break-words">{r.display_name}</button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="outline" onClick={usarMiUbicacion} disabled={locating} className="mt-2 w-full border-border gap-2">
                {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} Usar mi ubicación actual (estando en la obra)
              </Button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Nombre de la obra</label>
              <Input value={lugar.obra_nombre} onChange={e => setLugar({ ...lugar, obra_nombre: e.target.value })} placeholder="Ej: La Cortinada" className="bg-secondary border-border" />
              {lugar.lat != null && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Ubicación elegida: {Number(lugar.lat).toFixed(5)}, {Number(lugar.lng).toFixed(5)} ·{' '}
                  <a href={mapsUrl(lugar.lat, lugar.lng)} target="_blank" rel="noreferrer" className="text-primary hover:underline">ver en mapa</a>
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Distancia máxima permitida</label>
              <div className="flex flex-wrap gap-1.5">
                {RADIOS.map(m => (
                  <button key={m} type="button" onClick={() => setLugar({ ...lugar, radio_m: m })} className={`rounded-full border px-3 py-1 text-xs ${lugar.radio_m === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary'}`}>
                    {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={guardar} disabled={saving} className="w-full h-11 gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Guardar asignación'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
