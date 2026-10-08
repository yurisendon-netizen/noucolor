import React, { useMemo, useState } from 'react';
import { Gavel, Plus, Trash2, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { fDate, todayAndorra } from '@/components/registro/registroUtils';

export const SANCION_LIMITE = 3;

const MOTIVOS_RAPIDOS = ['Llegó tarde', 'No fichó', 'Faltó sin avisar', 'Ubicación desactivada al fichar'];

// Cuenta las sanciones por trabajador: { [employee_id]: n }
export function contarSanciones(sanciones) {
  const c = {};
  (sanciones || []).forEach(s => { c[s.employee_id] = (c[s.employee_id] || 0) + 1; });
  return c;
}

export default function Amonestaciones({ employees, sanciones, onChanged }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ employeeId: '', date: todayAndorra(), motivo: '' });

  const counts = useMemo(() => contarSanciones(sanciones), [sanciones]);

  // Todos los trabajadores del registro, y cualquiera con sanciones aunque ya no salga en el mes.
  const rows = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => map.set(e.id, { id: e.id, name: e.full_name }));
    (sanciones || []).forEach(s => { if (!map.has(s.employee_id)) map.set(s.employee_id, { id: s.employee_id, name: s.employee_name }); });
    return [...map.values()]
      .map(r => ({ ...r, count: counts[r.id] || 0, items: (sanciones || []).filter(s => s.employee_id === r.id).sort((a, b) => String(b.date).localeCompare(String(a.date))) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [employees, sanciones, counts]);

  function openDialog(employeeId = '') {
    setForm({ employeeId, date: todayAndorra(), motivo: '' });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.employeeId || !form.date || !form.motivo.trim()) {
      toast({ title: 'Faltan datos', description: 'Elige trabajador, fecha y escribe el motivo.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'createSancion', ...form });
      if (res?.data?.error) throw new Error(res.data.error);
      const name = rows.find(r => r.id === form.employeeId)?.name || 'El trabajador';
      const total = res?.data?.total;
      toast({
        variant: total >= SANCION_LIMITE ? 'destructive' : 'success',
        title: 'Sanción registrada',
        description: total >= SANCION_LIMITE ? `${name} ya lleva ${total} sanciones.` : `${name}: ${total} sanción${total === 1 ? '' : 'es'}.`,
      });
      setDialogOpen(false);
      onChanged?.();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e?.response?.data?.error || e?.message || 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(s) {
    if (!confirm(`¿Quitar esta sanción de ${s.employee_name} (${fDate(s.date)})?`)) return;
    try {
      const res = await authInvoke('trackTime', { operation: 'deleteSancion', sancionId: s.id });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Sanción eliminada' });
      onChanged?.();
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: e?.message, variant: 'destructive' });
    }
  }

  const enLimite = rows.filter(r => r.count >= SANCION_LIMITE);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Gavel size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold">Amonestaciones</h2>
        </div>
        <Button onClick={() => openDialog()} className="gap-2"><Plus size={16} /> Sancionar</Button>
      </div>

      {enLimite.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{enLimite.map(r => `${r.name} (${r.count})`).join(', ')} — {SANCION_LIMITE} sanciones o más.</span>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No hay trabajadores.</p>}
        {rows.map(r => {
          const red = r.count >= SANCION_LIMITE;
          const expanded = open === r.id;
          return (
            <div key={r.id} className={red ? 'bg-red-500/5' : ''}>
              <div className="flex items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="flex flex-1 min-w-0 items-center gap-2 text-left" disabled={r.count === 0}>
                  {r.count > 0 ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
                  <span className={`truncate font-medium ${red ? 'text-red-500 font-bold' : ''}`}>{r.name}</span>
                </button>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${red ? 'bg-red-500 text-white' : r.count > 0 ? 'bg-amber-500/20 text-amber-500' : 'bg-secondary text-muted-foreground'}`}
                  title={`${r.count} de ${SANCION_LIMITE} sanciones`}
                >
                  {r.count} / {SANCION_LIMITE}
                </span>
                <Button variant="outline" size="sm" onClick={() => openDialog(r.id)} className="shrink-0 border-border gap-1">
                  <Plus size={14} /> Sancionar
                </Button>
              </div>
              {expanded && r.items.length > 0 && (
                <ul className="px-4 pb-3 space-y-1.5">
                  {r.items.map(s => (
                    <li key={s.id} className="flex items-start gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fDate(s.date)}</span>
                      <span className="flex-1 min-w-0 break-words">{s.motivo}{s.impuesta_por ? <span className="text-xs text-muted-foreground"> · {s.impuesta_por}</span> : null}</span>
                      <button type="button" onClick={() => remove(s)} className="shrink-0 text-red-400 hover:text-red-300 p-1" aria-label="Quitar sanción">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-2">Se cuentan todas las sanciones de cada trabajador. A partir de {SANCION_LIMITE} su nombre sale en rojo.</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Nueva sanción</DialogTitle>
            <DialogDescription className="text-muted-foreground">Queda registrada en la ficha del trabajador y suma al contador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Trabajador</label>
              <select
                value={form.employeeId}
                onChange={e => setForm({ ...form, employeeId: e.target.value })}
                className="w-full h-10 rounded-md bg-secondary border border-border px-2 text-sm"
              >
                <option value="">Elegir…</option>
                {rows.map(r => <option key={r.id} value={r.id}>{r.name} ({r.count})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Fecha</label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Motivo</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {MOTIVOS_RAPIDOS.map(m => (
                  <button key={m} type="button" onClick={() => setForm({ ...form, motivo: m })} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs hover:bg-secondary/70">
                    {m}
                  </button>
                ))}
              </div>
              <Textarea value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Escribe el motivo" className="bg-secondary border-border" />
            </div>
            <Button onClick={save} disabled={saving} className="w-full h-11 gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Registrar sanción'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
