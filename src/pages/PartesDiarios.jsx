import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Loader2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import { fDate, fH } from '@/components/registro/registroUtils';

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

// ── Vista del trabajador ──────────────────────────────────────────────────
function DayCard({ day, today, onSave, employeeId }) {
  const [open, setOpen] = useState(day.date === today && !day.done);
  const [obra, setObra] = useState(day.obra_nombre || '');
  const [horas, setHoras] = useState(day.horas != null ? String(day.horas).replace('.', ',') : '');
  const [desc, setDesc] = useState(day.descripcion || '');
  const [mat, setMat] = useState(day.materiales || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObra(day.obra_nombre || '');
    setHoras(day.horas != null ? String(day.horas).replace('.', ',') : '');
    setDesc(day.descripcion || '');
    setMat(day.materiales || '');
  }, [day.date, day.obra_nombre, day.horas, day.descripcion, day.materiales]);

  const needs = !day.done && !day.future && (day.fichado || day.date === today);
  const status = day.done ? 'ok' : day.future ? 'future' : needs ? 'pending' : 'none';

  async function save() {
    setSaving(true);
    try {
      await onSave({ date: day.date, obra_nombre: obra, horas: Number(String(horas).replace(',', '.')), descripcion: desc, materiales: mat, employeeId });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`bg-card rounded-xl border ${status === 'pending' ? 'border-amber-500/60' : 'border-border'} ${day.future ? 'opacity-50' : ''}`}>
      <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => !day.future && setOpen(o => !o)} disabled={day.future}>
        <div className="min-w-0">
          <p className="font-semibold">{DOW_NAME[day.dow]} <span className="text-muted-foreground font-normal text-sm">{fDate(day.date)}{day.date === today ? ' · hoy' : ''}</span></p>
          <p className="text-xs text-muted-foreground truncate">
            {day.done ? `${day.obra_nombre || '—'} · ${fH(day.horas)} h` : day.fichado ? 'Fichado · parte pendiente' : day.future ? 'Aún no' : 'Sin fichaje'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === 'ok' && <span className="inline-flex items-center gap-1 text-xs text-green-500 font-medium"><Check size={14} /> Hecho</span>}
          {status === 'pending' && <span className="text-xs text-amber-500 font-medium">Pendiente</span>}
          {!day.future && (open ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
        </div>
      </button>
      {open && !day.future && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Obra / cliente</label>
            <Input value={obra} onChange={(e) => setObra(e.target.value)} className="bg-secondary border-border" placeholder="Ej. La Cortinada" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Horas trabajadas</label>
            <Input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" className="bg-secondary border-border w-32" placeholder="8" />
            {day.abierto && <p className="text-[11px] text-muted-foreground mt-1">Tu jornada sigue abierta: pon las horas que llevas o ajusta al fichar la salida.</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Qué has hecho</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-secondary border-border min-h-[90px]" placeholder="Describe el trabajo de hoy" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Materiales usados (opcional)</label>
            <Textarea value={mat} onChange={(e) => setMat(e.target.value)} className="bg-secondary border-border min-h-[60px]" placeholder="Pintura, cinta, masilla…" />
          </div>
          <Button onClick={save} disabled={saving || !obra.trim() || !desc.trim() || horas === ''} className="w-full h-11 gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {day.done ? 'Actualizar parte del día' : 'Guardar parte del día'}
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
      toast({ variant: 'success', title: 'Parte guardado' });
      await load(date);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  }

  if (loading && !data) return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!data) return null;
  const pendientes = data.days.filter(d => !d.done && !d.future && (d.fichado || d.date === data.today)).length;

  return (
    <>
      <WeekNav weekStart={data.week_start} weekEnd={data.week_end} today={data.today} onChange={setDate} />
      {pendientes > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Tienes <b>{pendientes}</b> {pendientes === 1 ? 'día' : 'días'} sin parte esta semana. Rellénalo cada día antes de irte.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm">Todos los partes de esta semana están al día.</div>
      )}
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
    for (let i = 0; i < 5; i++) set.set(addDays(data.week_start, i), (i + 1) % 7);
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, dow]) => ({ date, dow }));
  }, [data]);

  if (loading && !data) return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  return (
    <>
      <WeekNav weekStart={data.week_start} weekEnd={data.week_end} today={data.today} onChange={setDate} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600" /> Parte hecho</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-600" /> Fichó y no hizo parte</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-secondary" /> Sin fichaje / futuro</span>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="bg-secondary/60 text-muted-foreground text-xs">
              <th className="text-left px-3 py-2 font-semibold">Trabajador</th>
              {cols.map(c => <th key={c.date} className="px-2 py-2 text-center font-medium w-12"><div>{DOW_SHORT[c.dow]}</div><div className="text-[10px]">{c.date.slice(8)}</div></th>)}
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
                      if (d?.done) { cls = 'bg-green-600 text-white'; mark = '✓'; }
                      else if (d && d.fichado && !d.future && !d.abierto) { cls = 'bg-red-600 text-white'; mark = '!'; }
                      else if (d && d.fichado && !d.future && c.date < data.today) { cls = 'bg-red-600 text-white'; mark = '!'; }
                      else if (d && d.fichado && !d.future) { cls = 'bg-amber-500 text-black'; mark = '…'; }
                      return <td key={c.date} className="p-1 text-center"><span className={`w-7 h-7 mx-auto rounded text-xs font-bold flex items-center justify-center ${cls}`}>{mark}</span></td>;
                    })}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={cols.length + 1} className="bg-secondary/20 px-3 py-3">
                        {r.days.filter(d => d.done).length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin partes esta semana.</p>
                        ) : (
                          <div className="space-y-3 max-w-3xl">
                            {r.days.filter(d => d.done).map(d => (
                              <div key={d.date} className="text-xs">
                                <p className="font-semibold">{DOW_NAME[d.dow]} {fDate(d.date)} · {d.obra_nombre} · {fH(d.horas)} h</p>
                                <p className="text-muted-foreground whitespace-pre-wrap">{d.descripcion}</p>
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
      <p className="text-xs text-muted-foreground mt-3">Toca un trabajador para leer sus partes. Cada trabajador rellena un parte por semana con una línea por día.</p>
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
        subtitle={isAdmin ? 'Partes semanales de los trabajadores' : 'Rellena tu parte cada día; la semana entera va en el mismo parte'}
      />
      {isAdmin ? <AdminView /> : <WorkerView />}
    </div>
  );
}
