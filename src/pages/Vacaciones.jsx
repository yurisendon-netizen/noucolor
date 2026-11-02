import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Check, X, AlertTriangle, Palmtree } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';

// VACACIONES: 30 días naturales al año a prorrata desde el alta. Lo que no se gasta
// se pierde el 31/12. El trabajador pide, el admin aprueba y el calendario muestra
// quién falta cada día (vacaciones, bajas y permisos aprobados).

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TIPO = {
  vacaciones: { label: 'Vacaciones', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  baja_medica: { label: 'Baja', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  permiso_personal: { label: 'Permiso', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  otro: { label: 'Ausencia', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
};
const ESTADO = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-400' },
  aprobado: { label: 'Aprobada', cls: 'bg-emerald-500/15 text-emerald-400' },
  rechazado: { label: 'Rechazada', cls: 'bg-red-500/15 text-red-400' },
};

const errMsg = (e) => e?.response?.data?.error || e?.message || 'Error';
const fmt = (s) => (s ? s.split('-').reverse().join('/') : '');
const dayN = (s) => Math.round(Date.parse(`${s}T12:00:00Z`) / 86400000);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nombreCorto = (n) => String(n || '').split(' ')[0].toLowerCase().replace(/^./, c => c.toUpperCase());

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Saldo({ s }) {
  const items = [
    ['Te corresponden', s.derecho],
    ['Disfrutados', s.usados],
    ['Pendientes de aprobar', s.pendientes],
  ];
  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Te quedan este año</p>
          <p className="text-5xl font-bold text-primary tabular-nums leading-tight">{s.quedan}<span className="text-lg font-medium text-muted-foreground ml-1">días</span></p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {items.map(([l, v]) => (
            <div key={l}>
              <p className="text-xl font-semibold tabular-nums">{v}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{l}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">30 días naturales al año (a prorrata si entraste este año). Los días que no gastes se pierden el 31 de diciembre. Pídelas con 45 días de antelación.</p>
    </div>
  );
}

export default function Vacaciones() {
  const { isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const hoy = today();
  const [year, setYear] = useState(Number(hoy.slice(0, 4)));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(hoy.slice(0, 7));
  const [ausencias, setAusencias] = useState([]);
  const [calLoading, setCalLoading] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);
  const [pedirOpen, setPedirOpen] = useState(false);
  const [form, setForm] = useState({ date_from: '', date_to: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ employee_id: '', date_from: '', date_to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'vacacionesResumen', year });
      setData(res.data);
    } catch (e) {
      toast({ title: 'Error al cargar', description: errMsg(e), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [year, toast]);

  const loadCal = useCallback(async () => {
    setCalLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'ausenciasMes', month });
      setAusencias(res.data?.ausencias || []);
    } catch { setAusencias([]); }
    finally { setCalLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCal(); }, [loadCal]);

  const diasPedidos = form.date_from && form.date_to && form.date_to >= form.date_from ? dayN(form.date_to) - dayN(form.date_from) + 1 : 0;
  const antelacion = form.date_from ? dayN(form.date_from) - dayN(hoy) : null;

  async function pedir() {
    setSaving(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'solicitarVacaciones', ...form });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Solicitud enviada', description: `${res.data.dias} días. Te avisaremos cuando se apruebe.` });
      setPedirOpen(false);
      setForm({ date_from: '', date_to: '', reason: '' });
      load(); loadCal();
    } catch (e) {
      toast({ title: 'No se ha podido pedir', description: errMsg(e), variant: 'destructive' });
    } finally { setSaving(false); }
  }

  async function resolver(id, status) {
    setBusyId(id);
    try {
      await authInvoke('trackTime', { operation: 'resolverVacaciones', id, status });
      toast({ title: status === 'aprobado' ? 'Vacaciones aprobadas' : 'Solicitud rechazada' });
      load(); loadCal();
    } catch (e) {
      toast({ title: 'Error', description: errMsg(e), variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  async function apuntar() {
    setSaving(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'adminVacaciones', ...addForm });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Vacaciones apuntadas' });
      setAddOpen(false);
      setAddForm({ employee_id: '', date_from: '', date_to: '' });
      load(); loadCal();
    } catch (e) {
      toast({ title: 'No se ha podido apuntar', description: errMsg(e), variant: 'destructive' });
    } finally { setSaving(false); }
  }

  async function cancelar(id) {
    if (!confirm('¿Anular esta solicitud de vacaciones?')) return;
    setBusyId(id);
    try {
      await authInvoke('trackTime', { operation: 'cancelarVacaciones', id });
      toast({ title: 'Solicitud anulada' });
      load(); loadCal();
    } catch (e) {
      toast({ title: 'Error', description: errMsg(e), variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  // ── Calendario del mes
  const cal = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= nDays; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const dow = (first + d - 1) % 7;
      const quien = ausencias.filter(a => a.date_from <= date && a.date_to >= date);
      cells.push({ d, date, finde: dow >= 5, quien });
    }
    return cells;
  }, [month, ausencias]);

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  const mio = data?.mio;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Vacaciones"
        subtitle={isAdmin ? 'Solicitudes, días de cada trabajador y quién falta cada día' : 'Pide tus vacaciones y mira los días que te quedan'}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border">
              <Button variant="ghost" size="icon" onClick={() => setYear(y => y - 1)} aria-label="Año anterior"><ChevronLeft size={18} /></Button>
              <span className="px-1 text-sm font-semibold tabular-nums">{year}</span>
              <Button variant="ghost" size="icon" onClick={() => setYear(y => y + 1)} aria-label="Año siguiente"><ChevronRight size={18} /></Button>
            </div>
            <Button onClick={() => setPedirOpen(true)} className="gap-2"><Plus size={18} /> Pedir vacaciones</Button>
          </div>
        }
      />

      {mio && <Saldo s={mio} />}

      {/* ── ADMIN: solicitudes pendientes */}
      {isAdmin && (
        <section className="bg-card rounded-xl border border-border p-4 sm:p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Palmtree size={18} className="text-primary" /> Solicitudes pendientes</h2>
          {(data?.pendientes || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
          ) : (
            <div className="space-y-2">
              {data.pendientes.map(s => (
                <div key={s.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium">{s.employee_name}</p>
                    <p className="text-sm">{fmt(s.date_from)} – {fmt(s.date_to)} · <span className="font-semibold">{s.dias} días</span>
                      {s.quedan != null && <span className="text-muted-foreground"> · le quedarían {s.quedan}</span>}
                    </p>
                    {s.antelacion < 45 && (
                      <p className="text-xs text-amber-400 flex items-center gap-1 mt-1"><AlertTriangle size={13} /> Pedida con {s.antelacion} días de antelación (el reglamento dice 45)</p>
                    )}
                    {s.reason && <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => resolver(s.id, 'rechazado')} className="gap-1 text-red-400 border-red-500/40"><X size={15} /> Rechazar</Button>
                    <Button size="sm" disabled={busyId === s.id} onClick={() => resolver(s.id, 'aprobado')} className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Check size={15} /> Aprobar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Calendario: quién falta cada día */}
      <section className="bg-card rounded-xl border border-border p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><CalendarDays size={18} className="text-primary" /> {isAdmin ? 'Quién falta' : 'Mis días'}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mes anterior"><ChevronLeft size={18} /></Button>
            <span className="text-sm font-semibold w-36 text-center">{MESES[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
            <Button variant="ghost" size="icon" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Mes siguiente"><ChevronRight size={18} /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {DOW.map(d => <div key={d}>{d}</div>)}
        </div>
        <div className={`grid grid-cols-7 gap-1 ${calLoading ? 'opacity-60' : ''}`}>
          {cal.map((c, i) => c ? (
            <button key={c.date} type="button" onClick={() => c.quien.length && setDayOpen(c)}
              className={`min-h-[64px] sm:min-h-[84px] rounded-lg border p-1 text-left align-top transition ${c.date === hoy ? 'border-primary' : 'border-border'} ${c.finde ? 'bg-secondary/30' : 'bg-background'} ${c.quien.length ? 'hover:border-primary/60' : 'cursor-default'}`}>
              <span className={`text-xs font-semibold ${c.finde ? 'text-muted-foreground' : ''}`}>{c.d}</span>
              <div className="mt-0.5 space-y-0.5">
                {c.quien.slice(0, 3).map(a => (
                  <div key={a.id} className={`truncate rounded border px-1 text-[10px] leading-4 ${TIPO[a.type]?.cls || TIPO.otro.cls} ${a.status === 'pendiente' ? 'border-dashed opacity-70' : ''}`}>
                    {isAdmin ? nombreCorto(a.employee_name) : (TIPO[a.type]?.label || 'Ausencia')}
                  </div>
                ))}
                {c.quien.length > 3 && <div className="text-[10px] text-muted-foreground">+{c.quien.length - 3}</div>}
              </div>
            </button>
          ) : <div key={`e${i}`} />)}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
          {['vacaciones', 'baja_medica', 'permiso_personal'].map(k => (
            <span key={k} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded border ${TIPO[k].cls}`} /> {TIPO[k].label}</span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-dashed border-sky-500/60" /> Pendiente de aprobar</span>
        </div>
      </section>

      {/* ── ADMIN: días de cada trabajador */}
      {isAdmin && (data?.empleados || []).length > 0 && (
        <section className="bg-card rounded-xl border border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 className="font-semibold">Días de cada trabajador · {year}</h2>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1"><Plus size={15} /> Apuntar vacaciones ya hechas</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-medium">Trabajador</th>
                  <th className="text-right py-2 px-2 font-medium">Corresponden</th>
                  <th className="text-right py-2 px-2 font-medium">Disfrutados</th>
                  <th className="text-right py-2 px-2 font-medium">Pendientes</th>
                  <th className="text-right py-2 pl-2 font-medium">Quedan</th>
                </tr>
              </thead>
              <tbody>
                {data.empleados.map(e => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2 pr-2">{e.full_name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{e.derecho}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{e.usados}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{e.pendientes || '—'}</td>
                    <td className={`py-2 pl-2 text-right tabular-nums font-semibold ${e.quedan < 0 ? 'text-red-400' : 'text-primary'}`}>{e.quedan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Mis solicitudes */}
      {mio && (
        <section className="bg-card rounded-xl border border-border p-4 sm:p-5">
          <h2 className="font-semibold mb-3">Mis solicitudes · {year}</h2>
          {mio.solicitudes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has pedido vacaciones este año.</p>
          ) : (
            <div className="space-y-2">
              {mio.solicitudes.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{fmt(s.date_from)} – {fmt(s.date_to)} · {s.dias} días</p>
                    {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${ESTADO[s.status]?.cls || ''}`}>{ESTADO[s.status]?.label || s.status}</span>
                    {s.status === 'pendiente' && (
                      <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => cancelar(s.id)} className="text-red-400">Anular</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Pedir vacaciones */}
      <Dialog open={pedirOpen} onOpenChange={setPedirOpen}>
        <DialogContent className="bg-card border-border max-w-md w-[calc(100vw-1.5rem)]">
          <DialogHeader><DialogTitle>Pedir vacaciones</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Desde</label>
                <Input type="date" min={hoy} value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value, date_to: f.date_to && f.date_to < e.target.value ? e.target.value : f.date_to }))} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Hasta (incluido)</label>
                <Input type="date" min={form.date_from || hoy} value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} className="bg-secondary border-border" />
              </div>
            </div>
            {diasPedidos > 0 && (
              <p className="text-sm">Son <span className="font-semibold">{diasPedidos} días naturales</span>{mio ? <> · te quedarían <span className="font-semibold">{mio.quedan - diasPedidos}</span></> : null}.</p>
            )}
            {mio && diasPedidos > mio.quedan && (
              <p className="text-sm text-red-400">No tienes tantos días: te quedan {mio.quedan}.</p>
            )}
            {antelacion !== null && antelacion >= 0 && antelacion < 45 && (
              <p className="text-xs text-amber-400 flex items-start gap-1"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> Faltan {antelacion} días: el reglamento pide 45 días de antelación. Puedes pedirlas igual; la empresa decidirá.</p>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Comentario (opcional)</label>
              <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="bg-secondary border-border" rows={2} />
            </div>
            <Button onClick={pedir} disabled={saving || !diasPedidos || (mio && diasPedidos > mio.quedan)} className="w-full h-11">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Enviar solicitud'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Admin: apuntar vacaciones a un trabajador (ya aprobadas) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border max-w-md w-[calc(100vw-1.5rem)]">
          <DialogHeader><DialogTitle>Apuntar vacaciones</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">Para cargar las vacaciones que ya ha hecho este año (antes de la app) o las que fija la empresa. Quedan aprobadas directamente.</p>
            <select value={addForm.employee_id} onChange={e => setAddForm(f => ({ ...f, employee_id: e.target.value }))}
              className="w-full h-10 rounded-md bg-secondary border border-border px-2 text-sm">
              <option value="">Trabajador…</option>
              {(data?.empleados || []).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={addForm.date_from} onChange={e => setAddForm(f => ({ ...f, date_from: e.target.value }))} className="bg-secondary border-border" />
              <Input type="date" min={addForm.date_from} value={addForm.date_to} onChange={e => setAddForm(f => ({ ...f, date_to: e.target.value }))} className="bg-secondary border-border" />
            </div>
            {addForm.date_from && addForm.date_to && addForm.date_to >= addForm.date_from && (
              <p className="text-sm">{dayN(addForm.date_to) - dayN(addForm.date_from) + 1} días naturales</p>
            )}
            <Button onClick={apuntar} disabled={saving || !addForm.employee_id || !addForm.date_from || !addForm.date_to} className="w-full h-11">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detalle de un día */}
      <Dialog open={!!dayOpen} onOpenChange={o => { if (!o) setDayOpen(null); }}>
        <DialogContent className="bg-card border-border max-w-sm w-[calc(100vw-1.5rem)]">
          <DialogHeader><DialogTitle>{dayOpen ? fmt(dayOpen.date) : ''}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(dayOpen?.quien || []).map(a => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="text-sm font-medium">{a.employee_name}</span>
                <span className={`text-xs rounded border px-1.5 ${TIPO[a.type]?.cls || TIPO.otro.cls} ${a.status === 'pendiente' ? 'border-dashed' : ''}`}>
                  {TIPO[a.type]?.label || 'Ausencia'}{a.status === 'pendiente' ? ' (pendiente)' : ''}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
