import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/ui/responsive-select';
import moment from 'moment';
import { ESTADOS, CATEGORIAS, eur, num, norm } from './balanceUtils';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-1">{hint}</p>}
    </div>
  );
}

const toInput = (v) => (v === null || v === undefined || v === 0 ? '' : String(v).replace('.', ','));

// ── Obra ────────────────────────────────────────────────────────────────────
export function ObraFormDialog({ open, onOpenChange, obra, onSave }) {
  const empty = { nombre: '', cliente: '', direccion: '', estado: 'en_curso', fecha_inicio: '', fecha_fin: '', importe_presupuesto: '', importe_facturado: '', notas: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(obra ? {
      ...empty, ...obra,
      fecha_inicio: obra.fecha_inicio || '', fecha_fin: obra.fecha_fin || '',
      importe_presupuesto: toInput(obra.importe_presupuesto), importe_facturado: toInput(obra.importe_facturado),
    } : empty);
  }, [open, obra]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setSaving(true);
    try { await onSave(form); onOpenChange(false); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{obra?.id ? 'Editar obra' : 'Nueva obra'}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <Field label="Nombre de la obra *"><Input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Pal · Urb. L'Espalmera" className="bg-secondary border-border" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cliente} onChange={set('cliente')} className="bg-secondary border-border" /></Field>
            <Field label="Estado">
              <ResponsiveSelect value={form.estado} onValueChange={v => setForm({ ...form, estado: v })} options={ESTADOS.map(e => ({ value: e.value, label: e.label }))} placeholder="Estado" className="bg-secondary border-border" />
            </Field>
          </div>
          <Field label="Dirección"><Input value={form.direccion} onChange={set('direccion')} className="bg-secondary border-border" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio"><Input type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} className="bg-secondary border-border" /></Field>
            <Field label="Fin"><Input type="date" value={form.fecha_fin} onChange={set('fecha_fin')} className="bg-secondary border-border" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Presupuesto (€ sin IGI)"><Input inputMode="decimal" value={form.importe_presupuesto} onChange={set('importe_presupuesto')} placeholder="0,00" className="bg-secondary border-border" /></Field>
            <Field label="Facturado (€ sin IGI)" hint="Si lo rellenas, el beneficio se calcula con esto."><Input inputMode="decimal" value={form.importe_facturado} onChange={set('importe_facturado')} placeholder="0,00" className="bg-secondary border-border" /></Field>
          </div>
          <Field label="Notas"><Textarea value={form.notas} onChange={set('notas')} className="bg-secondary border-border" /></Field>
          <Button onClick={submit} disabled={!form.nombre.trim() || saving} className="w-full h-11">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Guardar obra'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Coste ───────────────────────────────────────────────────────────────────
export function CosteFormDialog({ open, onOpenChange, coste, obraId, onSave }) {
  const empty = { concepto: '', categoria: 'material', proveedor: '', fecha: moment().format('YYYY-MM-DD'), factura_ref: '', importe: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(coste ? { ...empty, ...coste, fecha: coste.fecha || '', importe: toInput(coste.importe) } : empty);
  }, [open, coste]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const importeOk = /\d/.test(String(form.importe));

  async function submit() {
    setSaving(true);
    try { await onSave({ ...form, obra_id: obraId }); onOpenChange(false); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{coste?.id ? 'Editar coste' : 'Añadir coste'}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <Field label="Concepto *"><Input value={form.concepto} onChange={set('concepto')} placeholder="Ej: Pintura plástica blanca 15 L × 20" className="bg-secondary border-border" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <ResponsiveSelect value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })} options={CATEGORIAS} placeholder="Categoría" className="bg-secondary border-border" />
            </Field>
            <Field label="Importe (€ sin IGI) *"><Input inputMode="decimal" value={form.importe} onChange={set('importe')} placeholder="0,00" className="bg-secondary border-border" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Proveedor"><Input value={form.proveedor} onChange={set('proveedor')} className="bg-secondary border-border" /></Field>
            <Field label="Fecha"><Input type="date" value={form.fecha} onChange={set('fecha')} className="bg-secondary border-border" /></Field>
          </div>
          <Field label="Nº factura / albarán"><Input value={form.factura_ref} onChange={set('factura_ref')} className="bg-secondary border-border" /></Field>
          <Button onClick={submit} disabled={!form.concepto.trim() || !importeOk || saving} className="w-full h-11">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Guardar coste'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Configuración del cálculo ───────────────────────────────────────────────
export function ConfigDialog({ open, onOpenChange, config, tarifas, onSave }) {
  const [form, setForm] = useState({ horas_mes: '', cass_empresa_pct: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && config) setForm({ horas_mes: String(config.horas_mes).replace('.', ','), cass_empresa_pct: String(config.cass_empresa_pct).replace('.', ',') });
  }, [open, config]);

  async function submit() {
    setSaving(true);
    try { await onSave(form); onOpenChange(false); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Cálculo del coste de mano de obra</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-lg bg-secondary/60 border border-border p-3 text-sm text-muted-foreground flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>Coste/hora = <b className="text-foreground">salario bruto × (1 + CASS empresa)</b> ÷ horas al mes. Es lo que realmente le cuesta a Noucolor cada hora de cada trabajador.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horas al mes"><Input inputMode="decimal" value={form.horas_mes} onChange={e => setForm({ ...form, horas_mes: e.target.value })} className="bg-secondary border-border" /></Field>
            <Field label="CASS empresa (%)"><Input inputMode="decimal" value={form.cass_empresa_pct} onChange={e => setForm({ ...form, cass_empresa_pct: e.target.value })} className="bg-secondary border-border" /></Field>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full h-11">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Guardar y recalcular'}
          </Button>
          <div>
            <p className="text-sm font-semibold mb-2">Coste/hora actual por trabajador</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {(tarifas || []).map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate pr-2">{t.nombre}</span>
                  <span className={`tabular-nums font-medium ${t.coste_hora === 0 ? 'text-red-400' : ''}`}>
                    {t.coste_hora === 0 ? 'Sin salario' : `${eur(t.coste_hora)}/h`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Asignar partes a una obra ───────────────────────────────────────────────
export function AsignarPartesDialog({ open, onOpenChange, partes, obras, obraFija, onAssign }) {
  const [obraId, setObraId] = useState('');
  const [sel, setSel] = useState({});
  const [saving, setSaving] = useState(false);
  const libres = useMemo(() => partes.filter(p => !p.obra_id), [partes]);
  const obra = obras.find(o => o.id === (obraFija?.id || obraId));

  // Preselecciona los partes cuyo título o cliente coinciden con la obra.
  useEffect(() => {
    if (!open) return;
    const target = obraFija || obras.find(o => o.id === obraId);
    if (obraFija) setObraId(obraFija.id);
    if (!target) { setSel({}); return; }
    const n = norm(target.nombre), c = norm(target.cliente);
    const next = {};
    libres.forEach(p => {
      const t = norm(p.title), pc = norm(p.client_name);
      if ((t && (n.includes(t) || t.includes(n))) || (c && pc && c === pc)) next[p.id] = true;
    });
    setSel(next);
  }, [open, obraId, obraFija]);

  const ids = Object.keys(sel).filter(k => sel[k]);
  const horas = libres.filter(p => sel[p.id]).reduce((s, p) => s + (Number(p.total_horas) || 0), 0);

  async function submit() {
    setSaving(true);
    try { await onAssign(obra.id, ids); onOpenChange(false); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Asignar partes a una obra</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {!obraFija && (
            <ResponsiveSelect value={obraId} onValueChange={setObraId} options={obras.map(o => ({ value: o.id, label: o.nombre }))} placeholder="Elige la obra" className="bg-secondary border-border" />
          )}
          {libres.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Todos los partes ya están asignados a una obra.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{libres.length} partes sin obra</span>
                <div className="flex gap-3">
                  <button className="hover:text-foreground" onClick={() => setSel(Object.fromEntries(libres.map(p => [p.id, true])))}>Todos</button>
                  <button className="hover:text-foreground" onClick={() => setSel({})}>Ninguno</button>
                </div>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-[45vh] overflow-y-auto">
                {libres.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-secondary/40">
                    <input type="checkbox" className="h-4 w-4 accent-[#e6671a]" checked={!!sel[p.id]} onChange={e => setSel({ ...sel, [p.id]: e.target.checked })} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.title} <span className="text-muted-foreground font-normal">· {p.client_name}</span></p>
                      <p className="text-xs text-muted-foreground">{p.date ? moment(p.date).format('DD/MM/YYYY') : '—'} · {p.assigned_name || '—'}</p>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{num(p.total_horas)} h</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <Button onClick={submit} disabled={!obra || ids.length === 0 || saving} className="w-full h-11">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Asignando…</> : `Asignar ${ids.length} parte${ids.length === 1 ? '' : 's'} (${num(horas)} h)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
