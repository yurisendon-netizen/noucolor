import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Settings2, Euro, Wallet, TrendingUp, Percent, FileWarning, Download, ChevronRight, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import ObraDetalle from '@/components/balance/ObraDetalle';
import { ObraFormDialog, CosteFormDialog, ConfigDialog, AsignarPartesDialog } from '@/components/balance/BalanceDialogs';
import { eur, num, pct, ESTADOS, EstadoBadge, KpiCard, profitClass, COLOR_MAROON, COLOR_ORANGE, downloadCsv, csvNum } from '@/components/balance/balanceUtils';

const yearOf = (o) => String(o.fecha_inicio || o.created_date || '').slice(0, 4);

export default function BalanceObras() {
  const { employee, loading, isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [estado, setEstado] = useState('all');
  const [year, setYear] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [obraDlg, setObraDlg] = useState({ open: false, obra: null });
  const [costeDlg, setCosteDlg] = useState({ open: false, coste: null });
  const [configOpen, setConfigOpen] = useState(false);
  const [asignar, setAsignar] = useState({ open: false, obra: null });

  const call = useCallback(async (operation, payload = {}) => {
    const res = await authInvoke('balanceObras', { operation, ...payload });
    if (res?.data?.error) throw new Error(res.data.error);
    return res.data;
  }, []);

  const load = useCallback(async () => {
    try { setData(await call('getAll')); }
    catch (e) { toast({ title: 'Error al cargar el balance', description: e?.response?.data?.error || e.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  }, [call]);

  useEffect(() => { if (employee && isAdmin) load(); else if (employee) setBusy(false); }, [employee, isAdmin, load]);

  async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast({ variant: 'success', title: okMsg }); await load(); }
    catch (e) { toast({ title: 'No se ha podido guardar', description: e?.response?.data?.error || e.message, variant: 'destructive' }); throw e; }
  }

  const obras = data?.obras || [];
  const years = useMemo(() => [...new Set(obras.map(yearOf).filter(Boolean))].sort().reverse(), [obras]);
  const filtered = useMemo(() => obras.filter(o =>
    (estado === 'all' || o.estado === estado) &&
    (year === 'all' || yearOf(o) === year) &&
    (!search || `${o.nombre} ${o.cliente}`.toLowerCase().includes(search.toLowerCase()))
  ), [obras, estado, year, search]);

  const totals = useMemo(() => {
    const t = filtered.reduce((a, o) => ({
      venta: a.venta + Math.round(o.venta * 100),
      coste: a.coste + Math.round(o.coste_total * 100),
      mano: a.mano + Math.round(o.coste_mano_obra * 100),
      horas: a.horas + (o.horas || 0),
    }), { venta: 0, coste: 0, mano: 0, horas: 0 });
    const beneficio = t.venta - t.coste;
    return { venta: t.venta / 100, coste: t.coste / 100, mano: t.mano / 100, horas: t.horas, beneficio: beneficio / 100, margen: t.venta > 0 ? Math.round((beneficio / t.venta) * 1000) / 10 : null };
  }, [filtered]);

  const chartData = useMemo(() => filtered.slice(0, 12).map(o => ({
    name: o.nombre.length > 14 ? o.nombre.slice(0, 13) + '…' : o.nombre,
    Venta: o.venta, Coste: o.coste_total,
  })), [filtered]);

  const sinObra = (data?.partes || []).filter(p => !p.obra_id);
  const selected = obras.find(o => o.id === selectedId);

  function exportar() {
    downloadCsv(`Balance_obras_${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Obra', 'Cliente', 'Estado', 'Horas', 'Venta', 'Venta facturada', 'Mano de obra', 'Otros costes', 'Coste total', 'Beneficio', 'Margen %'],
      ...filtered.map(o => [o.nombre, o.cliente || '', ESTADOS.find(e => e.value === o.estado)?.label || '', csvNum(o.horas), csvNum(o.venta), o.venta_es_facturada ? 'Sí' : 'No (presupuesto)', csvNum(o.coste_mano_obra), csvNum(o.coste_otros), csvNum(o.coste_total), csvNum(o.beneficio), o.margen_pct === null ? '' : csvNum(o.margen_pct)]),
      ['TOTAL', '', '', csvNum(totals.horas), csvNum(totals.venta), '', csvNum(totals.mano), csvNum(totals.coste - totals.mano), csvNum(totals.coste), csvNum(totals.beneficio), totals.margen === null ? '' : csvNum(totals.margen)],
    ]);
  }

  if (loading || busy) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <PageHeader title="Balance de obras" />
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No tienes permisos para ver esta página.</div>
      </div>
    );
  }

  const dialogs = (
    <>
      <ObraFormDialog open={obraDlg.open} obra={obraDlg.obra} onOpenChange={o => setObraDlg(s => ({ ...s, open: o }))}
        onSave={form => run(() => call('saveObra', { obra: form }), form.id ? 'Obra actualizada' : 'Obra creada')} />
      <CosteFormDialog open={costeDlg.open} coste={costeDlg.coste} obraId={selectedId} onOpenChange={o => setCosteDlg(s => ({ ...s, open: o }))}
        onSave={form => run(() => call('saveCoste', { coste: form }), form.id ? 'Coste actualizado' : 'Coste añadido')} />
      <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} config={data?.config} tarifas={data?.tarifas}
        onSave={form => run(() => call('saveConfig', { config: form }), 'Cálculo actualizado')} />
      <AsignarPartesDialog open={asignar.open} obraFija={asignar.obra} onOpenChange={o => setAsignar(s => ({ ...s, open: o }))}
        partes={data?.partes || []} obras={obras}
        onAssign={(obraId, parteIds) => run(() => call('linkPartes', { obraId, parteIds }), `${parteIds.length} partes asignados`)} />
    </>
  );

  if (selected) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <ObraDetalle
          obra={selected} costes={data.costes} partes={data.partes}
          onBack={() => setSelectedId(null)}
          onEdit={() => setObraDlg({ open: true, obra: selected })}
          onDelete={async () => {
            if (!confirm(`¿Eliminar la obra «${selected.nombre}» y sus costes? Los partes de trabajo NO se borran.`)) return;
            try { await run(() => call('deleteObra', { obraId: selected.id }), 'Obra eliminada'); setSelectedId(null); } catch { /* aviso ya mostrado */ }
          }}
          onAddCoste={() => setCosteDlg({ open: true, coste: null })}
          onEditCoste={c => setCosteDlg({ open: true, coste: c })}
          onDeleteCoste={c => { if (confirm(`¿Eliminar «${c.concepto}»?`)) run(() => call('deleteCoste', { costeId: c.id }), 'Coste eliminado').catch(() => {}); }}
          onAsignar={() => setAsignar({ open: true, obra: selected })}
          onUnlink={p => { run(() => call('linkPartes', { obraId: null, parteIds: [p.id] }), 'Parte quitado de la obra').catch(() => {}); }}
        />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Balance de obras"
        subtitle="Venta, costes y beneficio de cada trabajo · importes sin IGI"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setConfigOpen(true)} title="Cálculo del coste/hora" className="border-border"><Settings2 size={18} /></Button>
            <Button variant="outline" size="icon" onClick={exportar} title="Exportar CSV" className="border-border"><Download size={18} /></Button>
            <Button onClick={() => setObraDlg({ open: true, obra: null })} className="gap-2"><Plus size={18} /> Nueva obra</Button>
          </>
        }
      />

      {sinObra.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#e6671a]/30 bg-[#e6671a]/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <FileWarning size={20} className="text-[#e6671a] shrink-0" />
          <p className="text-sm flex-1">
            Hay <b>{sinObra.length} partes de trabajo</b> ({num(sinObra.reduce((s, p) => s + (p.total_horas || 0), 0))} h) sin asignar a ninguna obra. Sus horas no cuentan en ningún balance.
          </p>
          <Button size="sm" variant="outline" disabled={obras.length === 0} onClick={() => setAsignar({ open: true, obra: null })} className="border-[#e6671a]/40 shrink-0">
            {obras.length === 0 ? 'Crea antes una obra' : 'Asignar partes'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard icon={Euro} label="Ventas" value={eur(totals.venta)} hint={`${filtered.length} obra${filtered.length === 1 ? '' : 's'}`} />
        <KpiCard icon={Wallet} label="Costes" value={eur(totals.coste)} hint={`Mano de obra: ${eur(totals.mano)}`} tone="orange" />
        <KpiCard icon={TrendingUp} label="Beneficio" value={eur(totals.beneficio)} valueClass={profitClass(totals.beneficio)} />
        <KpiCard icon={Percent} label="Margen medio" value={pct(totals.margen)} valueClass={profitClass(totals.beneficio)} tone="orange" />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 mb-6">
          <h3 className="font-semibold mb-4">Venta vs. coste por obra</h3>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <YAxis tickFormatter={v => `${num(v / 1000)}k`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <Tooltip formatter={v => eur(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', color: 'hsl(var(--foreground))' }} />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="Venta" fill={COLOR_MAROON} radius={[4, 4, 0, 0]} maxBarSize={44} />
                <Bar dataKey="Coste" fill={COLOR_ORANGE} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar obra o cliente…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-secondary border-border" />
        </div>
        <ResponsiveSelect value={estado} onValueChange={setEstado} placeholder="Estado"
          options={[{ value: 'all', label: 'Todos los estados' }, ...ESTADOS.map(e => ({ value: e.value, label: e.label }))]}
          className="w-full sm:w-48 bg-secondary border-border" />
        <ResponsiveSelect value={year} onValueChange={setYear} placeholder="Año"
          options={[{ value: 'all', label: 'Todos los años' }, ...years.map(y => ({ value: y, label: y }))]}
          className="w-full sm:w-40 bg-secondary border-border" />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Obra</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Horas</th>
                <th className="px-4 py-3 text-right">Venta</th>
                <th className="px-4 py-3 text-right">Coste</th>
                <th className="px-4 py-3 text-right">Beneficio</th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-muted-foreground">
                  {obras.length === 0 ? 'Aún no hay obras. Crea la primera con «Nueva obra».' : 'Ninguna obra coincide con los filtros.'}
                </td></tr>
              ) : filtered.map(o => (
                <tr key={o.id} onClick={() => setSelectedId(o.id)} className="hover:bg-secondary/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.nombre}</p>
                    <p className="text-xs text-muted-foreground">{o.cliente || '—'}</p>
                  </td>
                  <td className="px-4 py-3"><EstadoBadge estado={o.estado} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{num(o.horas)} h</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {eur(o.venta)}
                    {!o.venta_es_facturada && o.venta > 0 && <span className="block text-[10px] text-muted-foreground">presupuesto</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{eur(o.coste_total)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap ${profitClass(o.beneficio)}`}>{eur(o.beneficio)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${profitClass(o.beneficio)}`}>{pct(o.margen_pct)}</td>
                  <td className="pr-3 text-muted-foreground"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 1 && (
              <tfoot>
                <tr className="border-t border-border bg-secondary/30 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(totals.horas)} h</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{eur(totals.venta)}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{eur(totals.coste)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${profitClass(totals.beneficio)}`}>{eur(totals.beneficio)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${profitClass(totals.beneficio)}`}>{pct(totals.margen)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {dialogs}
    </div>
  );
}
