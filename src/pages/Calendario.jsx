import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import { MESES, fH, hhmm } from '@/components/registro/registroUtils';

// Calendario mensual de horas fichadas, al estilo del calendario del iPhone: mes a
// pantalla completa, fines de semana atenuados, hoy en un círculo rojo y, bajo cada
// día, una barra por trabajador que fichó. Al tocar un día se ve el detalle.

const DOW_HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const PALETTE = ['#4A8DB7', '#E06A10', '#8E8E93', '#7E9C8F', '#C0558F', '#D4B000', '#6C7BD4', '#3FA37A', '#B5654A', '#5AA9C9'];

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function andorraToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Cada día fichado cuenta como una jornada de 8 h exactas, más las horas extra.
const JORNADA_H = 8;

// Agrupa los fichajes por día y trabajador (puede haber varios tramos en un día).
function groupByDay(entries) {
  const days = {};
  for (const e of entries) {
    const byEmp = (days[e.date] ||= {});
    const g = (byEmp[e.employee_id] ||= { employee_id: e.employee_id, horas: JORNADA_H, extra: 0, entrada: null, salida: null, abierto: false });
    g.horas += e.overtime_hours;
    g.extra += e.overtime_hours;
    if (e.clock_in && (!g.entrada || e.clock_in < g.entrada)) g.entrada = e.clock_in;
    if (e.clock_out && (!g.salida || e.clock_out > g.salida)) g.salida = e.clock_out;
    if (e.abierto) g.abierto = true;
  }
  return days;
}

export default function Calendario() {
  const { isAdmin, loading: authLoading } = useEmployeeProfile();
  const { toast } = useToast();
  const today = andorraToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [employeeId, setEmployeeId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const touch = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'calendarioHoras', month, ...(employeeId ? { employeeId } : {}) });
      if (res?.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      toast({ title: 'Error al cargar el calendario', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [month, employeeId, toast]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const employees = useMemo(() => data?.employees || [], [data]);
  const color = useMemo(() => {
    const map = {};
    employees.forEach((e, i) => { map[e.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [employees]);
  const nameOf = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e.full_name])), [employees]);
  const days = useMemo(() => groupByDay(data?.month === month ? data.entries : []), [data, month]);
  const single = !isAdmin || !!employeeId;

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthTotal = Object.values(days).reduce((s, byEmp) => s + Object.values(byEmp).reduce((t, g) => t + (g.abierto ? 0 : g.horas), 0), 0);

  function onTouchEnd(e) {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMonth(mm => shiftMonth(mm, dx < 0 ? 1 : -1));
  }

  const selectedList = selected ? Object.values(days[selected] || {}).sort((a, b) => (nameOf[a.employee_id] || '').localeCompare(nameOf[b.employee_id] || '')) : [];
  const selDate = selected ? new Date(`${selected}T12:00:00Z`) : null;

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-3xl mx-auto pb-28 select-none" onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }} onTouchEnd={onTouchEnd}>
      {/* Barra superior: meses como en iOS */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="h-11 pl-3 pr-4 rounded-full bg-secondary/80 border border-border flex items-center gap-1 text-base">
          <ChevronLeft size={22} /> {MESES[(m + 10) % 12].slice(0, 3)}
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="h-11 pl-3 pr-2 rounded-full bg-secondary/80 border border-border flex items-center gap-2 text-sm">
              <Users size={18} />
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="bg-transparent outline-none max-w-[9rem] sm:max-w-[14rem]">
                <option value="">Todos</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="h-11 w-11 rounded-full bg-secondary/80 border border-border flex items-center justify-center" aria-label="Mes siguiente">
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-5 pb-2 flex items-end justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          {MESES[m - 1]} <span className="text-muted-foreground font-semibold text-2xl sm:text-3xl">{y}</span>
        </h1>
        {loading ? <Loader2 size={18} className="animate-spin text-muted-foreground mb-2" /> : (
          <span className="text-sm text-muted-foreground mb-1.5 whitespace-nowrap">{fH(monthTotal)} h fichadas</span>
        )}
      </div>

      <div className="grid grid-cols-7 px-1 text-center text-xs font-semibold text-muted-foreground border-b border-border pb-1.5">
        {DOW_HEAD.map(d => <div key={d}>{d}</div>)}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 px-1">
          {week.map((day, di) => {
            if (!day) return <div key={di} />;
            const date = ymd(y, m, day);
            const list = Object.values(days[date] || {});
            const isToday = date === today;
            const weekend = di >= 5;
            const total = list.reduce((s, g) => s + (g.abierto ? 0 : g.horas), 0);
            return (
              <button
                key={di}
                type="button"
                onClick={() => setSelected(date)}
                className="border-t border-border min-h-[5.5rem] sm:min-h-[6.5rem] pt-2 pb-1 flex flex-col items-center gap-1 active:bg-secondary/40"
              >
                <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xl sm:text-2xl font-medium ${isToday ? 'bg-[#E5484D] text-white font-semibold' : weekend ? 'text-muted-foreground' : ''}`}>
                  {day}
                </span>
                {single ? (
                  list[0] && (
                    <span
                      className="w-[88%] rounded-md text-[11px] sm:text-xs font-semibold text-white py-0.5"
                      style={{ background: list[0].abierto ? '#D98E04' : (isAdmin ? color[list[0].employee_id] : PALETTE[0]) }}
                    >
                      {list[0].abierto ? 'En curso' : `${fH(list[0].horas)} h`}
                    </span>
                  )
                ) : (
                  <>
                    <div className="w-[88%] flex flex-col gap-[3px]">
                      {list.slice(0, 3).map(g => (
                        <span key={g.employee_id} className="h-[5px] rounded-full" style={{ background: g.abierto ? '#D98E04' : color[g.employee_id] }} />
                      ))}
                    </div>
                    {list.length > 0 && (
                      <span className="text-[10px] leading-none text-muted-foreground">
                        {list.length > 3 ? `+${list.length - 3} · ` : ''}{fH(total)} h
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Botón "Hoy" flotante, como en iOS */}
      {month !== today.slice(0, 7) && (
        <button
          type="button"
          onClick={() => setMonth(today.slice(0, 7))}
          className="fixed left-4 bottom-24 lg:bottom-8 z-30 h-12 px-6 rounded-full bg-secondary/90 border border-border backdrop-blur text-base shadow-lg"
        >
          Hoy
        </button>
      )}

      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="bg-card border-border max-w-md w-[calc(100vw-1.5rem)] max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {selDate && `${DOW_LONG[selDate.getUTCDay()].replace(/^./, c => c.toUpperCase())} ${selDate.getUTCDate()} de ${MESES[selDate.getUTCMonth()].toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          {selectedList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{selected > today ? 'Este día aún no ha llegado.' : 'Nadie fichó este día.'}</p>
          ) : (
            <div className="divide-y divide-border">
              {selectedList.map(g => (
                <div key={g.employee_id} className="flex items-center gap-3 py-3">
                  <span className="w-1.5 self-stretch rounded-full" style={{ background: g.abierto ? '#D98E04' : (single && !isAdmin ? PALETTE[0] : color[g.employee_id]) }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{nameOf[g.employee_id] || 'Trabajador'}</p>
                    <p className="text-xs text-muted-foreground">
                      {hhmm(g.entrada)} – {g.abierto ? 'en curso' : hhmm(g.salida)}
                      {!g.abierto && g.extra > 0 ? ` · +${fH(g.extra)} h extra` : ''}
                    </p>
                  </div>
                  <span className="font-semibold whitespace-nowrap">{g.abierto ? 'En curso' : `${fH(g.horas)} h`}</span>
                </div>
              ))}
              {selectedList.length > 1 && (
                <div className="flex justify-between pt-3 text-sm font-semibold">
                  <span>Total</span>
                  <span>{fH(selectedList.reduce((s, g) => s + (g.abierto ? 0 : g.horas), 0))} h</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
