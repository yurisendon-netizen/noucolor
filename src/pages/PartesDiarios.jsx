import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ChevronDown, ChevronUp, Save, Clock } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import { fDate, fH, hhmm } from '@/components/registro/registroUtils';

const DOW_NAME = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DOW_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function WeekNav({ weekStart, weekEnd, today, onChange }) {
  const isCurrent = today >= weekStart && today <= weekEnd;
  return (
    <div className="flex items-center gap-2 mb-5">
      <Button variant="outline" size="icon" className="h-9 w-9 border-border" onClick={() => onChange(addDays(weekStart, -7))} aria-label="Semana anterior"><ChevronLeft size={16} /></Button>
      <div className="text-sm font-medium px-2 min-w-[190px] text-center">
        Semana del {fDate(weekStart)} al {fDate(weekEnd)}
      </div>
      <Button variant="outline" size="icon" className="h-9 w-9 border-border" onClick={() => onChange(addDays(weekStart, 7))} disabled={isCurrent || weekStart > today} aria-label="Semana siguiente"><ChevronRight size={16} /></Button>
      {!isCurrent && <Button variant="ghost" className="h-9 text-xs" onClick={() => onChange(today)}>Esta semana</Button>}
    </div>
  );
}

// Resumen de fichaje de un día: "08:02 – 16:00 · 8 h (+1 h extra)".
function fichajeResumen(day) {
  if (!day.fichado) return day.future ? 'Aún no' : 'Sin fichaje';
  if (day.abierto) return `Entrada ${hhmm(day.entrada)} · jornada en curso`;
  const extra = day.horas_extra > 0 ? ` (+${fH(day.horas_extra)} h extra)` : '';
  return `${hhmm(day.entrada)} – ${hhmm(day.salida)} · ${fH(day.horas)} h${extra}`;
}

// ── Vista del trabajador ──────────────────────────────────────────────────
// El parte se rellena solo con el fichaje; el trabajador puede añadir una nota.
function DayCard({ day, today, onSave }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(day.descripcion || '');
  const [mat, setMat] = useState(day.materiales || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDesc(day.descripcion || '');
    setMat(day.materiales || '');
  }, [day.date, day.descripcion, day.materiales]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ date: day.date, obra_nombre: day.obra_nombre, descripcion: desc, materiales: mat });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`bg-card rounded-xl border border-border ${day.future ? 'opacity-50' : ''}`}>
      <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => !day.future && setOpen(o => !o)} disabled={day.future}>
        <div className="min-w-0">
          <p className="font-semibold">{DOW_NAME[day.dow]} <span className="text-muted-foreground font-normal text-sm">{fDate(day.date)}{day.date === today ? ' · hoy' : ''}</span></p>
          <p className="text-xs text-muted-foreground truncate">
            {fichajeResumen(day)}{day.obra_nombre ? ` · ${day.obra_nombre}` : ''}
          </p>
          {day.descripcion && <p className="text-xs text-muted-foreground truncate mt-0.5">Nota: {day.descripcion}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {day.fichado && !day.abierto && <span className="text-sm font-semibold">{fH(day.horas)} h</span>}
          {day.abierto && <span className="text-xs text-amber-500 font-medium">En curso</span>}
          {!day.future && (open ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
        </div>
      </button>
      {open && !day.future && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">Las horas salen solas de tu fichaje. Si quieres, añade una nota del día.</p>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nota (opcional)</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-secondary border-border min-h-[80px]" placeholder="Qué has hecho, incidencias…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Materiales usados (opcional)</label>
            <Textarea value={mat} onChange={(e) => setMat(e.target.value)} className="bg-secondary border-border min-h-[60px]" placeholder="Pintura, cinta, masilla…" />
          </div>
          <Button onClick={save} disabled={saving || (!desc.trim() && !mat.trim())} className="w-full h-11 gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar nota
          </Button>
        </div>
      )}
    </div>
  );
}

function WorkerView() {
  const { toast } = useToast();
  const [date, setDate] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'getParteSemana', ...(d ? { date: d } : {}) });
      if (res?.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      toast({ title: 'Error al cargar el parte', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(date); }, [date, load]);

  async function onSave(payload) {
    try {
      const res = await authInvoke('trackTime', { operation: 'saveParteDia', ...payload });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Nota guardada' });
      await load(date);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  }

  if (loading && !data) return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!data) return null;
  const total = data.days.reduce((s, d) => s + (Number(d.horas) || 0), 0);

  return (
    <>
      <WeekNav weekStart={data.week_start} weekEnd={data.week_end} today={data.today} onChange={setDate} />
      <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm flex items-center gap-2">
        <Clock size={16} className="text-primary" /> Total fichado esta semana: <b>{fH(total)} h</b>
      </div>
      <div className="space-y-3">
        {data.days.map(d => <DayCard key={d.date} day={d} today={data.today} onSave={onSave} />)}
      </div>
    </>
  );
}

// ── Vista del administrador ───────────────────────────────────────────────
function AdminView() {
  const { toast } = useToast();
  const [date, setDate] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'listPartesSemana', ...(d ? { date: d } : {}) });
      if (res?.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      toast({ title: 'Error al cargar los partes', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(date); }, [date, load]);

  const cols = useMemo(() => {
    if (!data) return [];
    const set = new Map();
    for (const r of data.rows) for (const d of r.days) set.set(d.date, d.dow);
    // lunes a viernes siempre
    for (let i = 0; i < 5; i++) { const dd = addDays(data.week_start, i); if (dd >= '2026-10-14') set.set(dd, (i + 1) % 7); }
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, dow]) => ({ date, dow }));
  }, [data]);

  if (loading && !data) return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  return (
    <>
      <WeekNav weekStart={data.week_start} weekEnd={data.week_end} today={data.today} onChange={setDate} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600" /> Horas fichadas</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-500" /> Jornada en curso</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-secondary" /> Sin fichaje / futuro</span>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="bg-secondary/60 text-muted-foreground text-xs">
              <th className="text-left px-3 py-2 font-semibold">Trabajador</th>
              {cols.map(c => <th key={c.date} className="px-2 py-2 text-center font-medium w-12"><div>{DOW_SHORT[c.dow]}</div><div className="text-[10px]">{c.date.slice(8)}</div></th>)}
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map(r => {
              const expanded = open === r.employee_id;
              return (
                <React.Fragment key={r.employee_id}>
                  <tr className="hover:bg-secondary/30 cursor-pointer" onClick={() => setOpen(expanded ? null : r.employee_id)}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employee_name}</td>
                    {cols.map(c => {
                      const d = r.days.find(x => x.date === c.date);
                      let cls = 'bg-secondary';
                      let mark = '';
                      if (d?.fichado && d.abierto) { cls = 'bg-amber-500 text-black'; mark = '…'; }
                      else if (d?.fichado) { cls = 'bg-green-600 text-white'; mark = fH(d.horas); }
                      return <td key={c.date} className="p-1 text-center"><span className={`min-w-[2.25rem] h-7 px-1 mx-auto rounded text-xs font-bold flex items-center justify-center ${cls}`}>{mark}</span></td>;
                    })}
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{fH(r.days.reduce((s, d) => s + (Number(d.horas) || 0), 0))} h</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={cols.length + 2} className="bg-secondary/20 px-3 py-3">
                        {r.days.filter(d => d.fichado).length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin fichajes esta semana.</p>
                        ) : (
                          <div className="space-y-3 max-w-3xl">
                            {r.days.filter(d => d.fichado).map(d => (
                              <div key={d.date} className="text-xs">
                                <p className="font-semibold">{DOW_NAME[d.dow]} {fDate(d.date)} · {fichajeResumen(d)}{d.obra_nombre ? ` · ${d.obra_nombre}` : ''}</p>
                                {d.descripcion && <p className="text-muted-foreground whitespace-pre-wrap">Nota: {d.descripcion}</p>}
                                {d.materiales && <p className="text-muted-foreground whitespace-pre-wrap">Materiales: {d.materiales}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Las horas salen solas de los fichajes. Toca un trabajador para ver entrada, salida, horas extra, obra y sus notas.</p>
    </>
  );
}

export default function PartesDiarios() {
  const { isAdmin, loading } = useEmployeeProfile();
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Partes diarios"
        subtitle={isAdmin ? 'Horas fichadas por cada trabajador, día a día' : 'Tu registro de horas de cada día, a partir de tus fichajes'}
      />
      {isAdmin ? <AdminView /> : <WorkerView />}
    </div>
  );
}
