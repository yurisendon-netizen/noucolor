import React from 'react';
import { ArrowLeft, Pencil, Trash2, Plus, Link2Off, Link2, AlertTriangle, Euro, Wallet, TrendingUp, Percent, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import moment from 'moment';
import { eur, num, pct, EstadoBadge, KpiCard, profitClass, catLabel, CATEGORIAS, COLOR_MAROON, downloadCsv, csvNum } from './balanceUtils';

function Row({ label, value, strong, cls = '' }) {
  return (
    <div className={`flex items-center justify-between py-2 ${strong ? 'font-semibold text-base' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

export default function ObraDetalle({ obra, costes, partes, onBack, onEdit, onDelete, onAddCoste, onEditCoste, onDeleteCoste, onAsignar, onUnlink }) {
  const misCostes = costes.filter(c => c.obra_id === obra.id).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const misPartes = partes.filter(p => p.obra_id === obra.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const costeTotal = obra.coste_total || 0;
  const share = (v) => (costeTotal > 0 ? Math.round((v / costeTotal) * 1000) / 10 : 0);

  const segmentos = [
    { label: 'Mano de obra', value: obra.coste_mano_obra, color: COLOR_MAROON },
    ...CATEGORIAS.map((c, i) => ({ label: c.label, value: obra.coste_por_categoria?.[c.value] || 0, color: ['#e6671a', '#f0a06a', '#b0527c', '#8a8a8a', '#d98ba6', '#c4c4c4'][i] })),
  ].filter(s => s.value > 0);

  function exportar() {
    const rows = [
      ['Obra', obra.nombre], ['Cliente', obra.cliente || ''], ['Estado', obra.estado],
      [], ['Resumen', 'Importe (€)'],
      ['Venta' + (obra.venta_es_facturada ? ' (facturado)' : ' (presupuesto)'), csvNum(obra.venta)],
      ['Mano de obra', csvNum(obra.coste_mano_obra)], ['Otros costes', csvNum(obra.coste_otros)],
      ['Coste total', csvNum(obra.coste_total)], ['Beneficio', csvNum(obra.beneficio)],
      ['Margen %', obra.margen_pct === null ? '' : csvNum(obra.margen_pct)],
      [], ['Mano de obra', 'Horas', 'Coste/h', 'Coste'],
      ...obra.mano_obra_detalle.map(t => [t.nombre, csvNum(t.horas), csvNum(t.coste_hora), csvNum(t.coste)]),
      [], ['Fecha', 'Categoría', 'Concepto', 'Proveedor', 'Factura', 'Importe'],
      ...misCostes.map(c => [c.fecha || '', catLabel(c.categoria), c.concepto, c.proveedor || '', c.factura_ref || '', csvNum(c.importe)]),
    ];
    downloadCsv(`Balance_${obra.nombre.replace(/[^\w\-]+/g, '_')}.csv`, rows);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="shrink-0 p-2 -ml-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Volver">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{obra.nombre}</h1>
              <EstadoBadge estado={obra.estado} />
            </div>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {[obra.cliente, obra.direccion, obra.fecha_inicio && `desde ${moment(obra.fecha_inicio).format('DD/MM/YYYY')}`].filter(Boolean).join(' · ') || 'Sin datos de cliente'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={exportar} className="gap-1.5 border-border"><Download size={15} /> CSV</Button>
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 border-border"><Pencil size={15} /> Editar</Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10"><Trash2 size={16} /></Button>
        </div>
      </div>

      {obra.avisos?.length > 0 && (
        <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-300 space-y-1">
          {obra.avisos.map((a, i) => <p key={i} className="flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{a}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard icon={Euro} label="Venta" value={eur(obra.venta)} hint={obra.venta_es_facturada ? 'Facturado' : 'Según presupuesto'} />
        <KpiCard icon={Wallet} label="Coste total" value={eur(obra.coste_total)} hint={`${num(obra.horas)} h de mano de obra`} tone="orange" />
        <KpiCard icon={TrendingUp} label="Beneficio" value={eur(obra.beneficio)} valueClass={profitClass(obra.beneficio)} />
        <KpiCard icon={Percent} label="Margen" value={pct(obra.margen_pct)} valueClass={profitClass(obra.beneficio)} tone="orange" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-2">Cuenta de resultados</h3>
          <div className="divide-y divide-border">
            <Row label="Presupuesto" value={eur(obra.presupuesto)} />
            <Row label="Facturado" value={obra.facturado ? eur(obra.facturado) : '—'} />
            <Row label="Venta considerada" value={eur(obra.venta)} strong />
            <Row label="Mano de obra propia" value={`− ${eur(obra.coste_mano_obra)}`} />
            {CATEGORIAS.filter(c => (obra.coste_por_categoria?.[c.value] || 0) > 0).map(c => (
              <Row key={c.value} label={c.label} value={`− ${eur(obra.coste_por_categoria[c.value])}`} />
            ))}
            <Row label="Beneficio" value={eur(obra.beneficio)} strong cls={profitClass(obra.beneficio)} />
          </div>
        </div>
        <div className="lg:col-span-3 bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Reparto del coste</h3>
          {costeTotal === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Todavía no hay costes. Asigna partes de trabajo o añade materiales.</p>
          ) : (
            <>
              <div className="flex h-4 w-full rounded-full overflow-hidden bg-secondary">
                {segmentos.map(s => <div key={s.label} style={{ width: `${share(s.value)}%`, background: s.color }} title={`${s.label}: ${eur(s.value)}`} />)}
              </div>
              <div className="mt-4 space-y-2">
                {segmentos.map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="flex-1 text-muted-foreground">{s.label}</span>
                    <span className="tabular-nums w-14 text-right text-muted-foreground">{num(share(s.value))} %</span>
                    <span className="tabular-nums w-28 text-right font-medium">{eur(s.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="mano">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="mano">Mano de obra</TabsTrigger>
          <TabsTrigger value="costes">Otros costes ({misCostes.length})</TabsTrigger>
          <TabsTrigger value="partes">Partes ({misPartes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="mano">
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left">Trabajador</th><th className="px-4 py-3 text-right">Horas</th><th className="px-4 py-3 text-right">Coste/h</th><th className="px-4 py-3 text-right">Coste</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {obra.mano_obra_detalle.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Sin partes asignados a esta obra.</td></tr>
                ) : obra.mano_obra_detalle.map(t => (
                  <tr key={t.employee_id || t.nombre}>
                    <td className="px-4 py-3 font-medium">{t.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{num(t.horas)} h</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{eur(t.coste_hora)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{eur(t.coste)}</td>
                  </tr>
                ))}
              </tbody>
              {obra.mano_obra_detalle.length > 0 && (
                <tfoot><tr className="border-t border-border bg-secondary/30 font-semibold">
                  <td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{num(obra.horas)} h</td><td /><td className="px-4 py-3 text-right tabular-nums">{eur(obra.coste_mano_obra)}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        <TabsContent value="costes">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={onAddCoste} className="gap-1.5"><Plus size={16} /> Añadir coste</Button>
          </div>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left">Fecha</th><th className="px-4 py-3 text-left">Concepto</th><th className="px-4 py-3 text-left">Categoría</th><th className="px-4 py-3 text-right">Importe</th><th className="px-2 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-border">
                {misCostes.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Añade materiales, subcontratas, desplazamientos…</td></tr>
                ) : misCostes.map(c => (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{c.fecha ? moment(c.fecha).format('DD/MM/YY') : '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.concepto}</p>
                      {(c.proveedor || c.factura_ref) && <p className="text-xs text-muted-foreground">{[c.proveedor, c.factura_ref && `Fra. ${c.factura_ref}`].filter(Boolean).join(' · ')}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{catLabel(c.categoria)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">{eur(c.importe)}</td>
                    <td className="px-2 py-3 whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => onEditCoste(c)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteCoste(c)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10"><Trash2 size={15} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {misCostes.length > 0 && (
                <tfoot><tr className="border-t border-border bg-secondary/30 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total otros costes</td><td className="px-4 py-3 text-right tabular-nums">{eur(obra.coste_otros)}</td><td />
                </tr></tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        <TabsContent value="partes">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={onAsignar} className="gap-1.5"><Link2 size={16} /> Asignar partes</Button>
          </div>
          <div className="rounded-xl border border-border divide-y divide-border">
            {misPartes.length === 0 ? (
              <p className="px-4 py-10 text-center text-muted-foreground text-sm">No hay partes asignados. Pulsa «Asignar partes».</p>
            ) : misPartes.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.date ? moment(p.date).format('DD/MM/YYYY') : '—'} · {p.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{(p.horas_trabajadas || []).map(h => `${h.employee_name?.split(' ')[0]} ${num(h.horas)}h`).join(' · ')}</p>
                </div>
                <span className="tabular-nums text-muted-foreground">{num(p.total_horas)} h</span>
                <Button variant="ghost" size="sm" title="Quitar de esta obra" onClick={() => onUnlink(p)} className="text-muted-foreground hover:text-red-400"><Link2Off size={15} /></Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
