import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Pen, Loader2, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import SignaturePadInput from '@/components/parts/SignaturePadInput';
import { buildRegistro, CODES, DOW, monthLabel, fH, fDate, todayAndorra } from '@/components/registro/registroUtils';
import { downloadRegistroPdf } from '@/components/registro/RegistroPdf';
import Amonestaciones, { contarSanciones, SANCION_LIMITE } from '@/components/registro/Amonestaciones';

// Registro mensual de días fichados por trabajador (solo admin)
export default function RegistroFichajes() {
  const { isAdmin, employee, loading: profileLoading } = useEmployeeProfile();
  const { toast } = useToast();
  const [month, setMonth] = useState(todayAndorra().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signature, setSignature] = useState(null);
  const [sanciones, setSanciones] = useState([]);
  const sancionCounts = useMemo(() => contarSanciones(sanciones), [sanciones]);

  const loadSanciones = useCallback(async () => {
    try {
      const res = await authInvoke('trackTime', { operation: 'listSanciones' });
      setSanciones(res?.data?.sanciones || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadSanciones(); }, [isAdmin, loadSanciones]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'registroMensual', month });
      if (res?.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      toast({ title: 'Error al cargar el registro', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const reg = useMemo(() => (data && data.month === month ? buildRegistro(data) : null), [data, month]);

  const totals = useMemo(() => {
    if (!reg) return null;
    return reg.rows.reduce((a, r) => ({
      fichados: a.fichados + r.totals.fichados,
      horas: a.horas + r.totals.horas,
      extras: a.extras + r.totals.extras,
      faltas: a.faltas + r.totals.faltas + r.totals.sinRegistro,
    }), { fichados: 0, horas: 0, extras: 0, faltas: 0 });
  }, [reg]);

  async function pdf(sig) {
    if (!reg) return;
    setBusy(true);
    try {
      await downloadRegistroPdf(reg, { signerName: employee?.full_name, signature: sig });
      toast({ variant: 'success', title: sig ? 'Registro firmado y descargado' : 'Registro descargado' });
      setSignOpen(false);
      setSignature(null);
    } catch (e) {
      toast({ title: 'Error al generar el PDF', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader title="Registro de fichajes" />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Registro de fichajes"
        subtitle="Días fichados de cada trabajador, mes a mes"
        actions={
          <>
            <Button variant="outline" onClick={() => pdf(null)} disabled={!reg || busy} className="gap-2 border-border">
              {busy && !signOpen ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF
            </Button>
            <Button onClick={() => setSignOpen(true)} disabled={!reg || busy} className="gap-2">
              <Pen size={16} /> Firmar y descargar
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-5">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Mes</label>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-48 bg-secondary border-border" />
        </div>
        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <Stat label="Días fichados" value={totals.fichados} />
            <Stat label="Horas" value={fH(totals.horas)} />
            <Stat label="Horas extra" value={fH(totals.extras)} />
            <Stat label="Faltas / sin registro" value={totals.faltas} danger={totals.faltas > 0} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 text-xs text-muted-foreground">
        {Object.entries(CODES).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center" style={{ background: c.bg, color: c.fg }}>{k === 'S' ? '?' : k}</span>
            {c.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-secondary" /> Fin de semana</span>
      </div>

      {loading || !reg ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-secondary/60 text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-secondary text-left px-3 py-2 font-semibold min-w-[170px]">Trabajador</th>
                  {reg.days.map(d => (
                    <th key={d.date} className={`px-0 py-1 font-medium w-7 min-w-[28px] text-center ${d.weekend ? 'opacity-50' : ''}`}>
                      <div>{d.d}</div><div className="text-[9px]">{DOW[d.dow]}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Días</th>
                  <th className="px-2 py-2 text-right font-semibold">Horas</th>
                  <th className="px-2 py-2 text-right font-semibold">Extra</th>
                  <th className="px-2 py-2 text-right font-semibold">Faltas</th>
                  <th className="px-2 py-2 text-right font-semibold pr-3">Just.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reg.rows.map(r => {
                  const t = r.totals;
                  const expanded = open === r.emp.id;
                  return (
                    <React.Fragment key={r.emp.id}>
                      <tr className="hover:bg-secondary/30 cursor-pointer" onClick={() => setOpen(expanded ? null : r.emp.id)}>
                        <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span className={(sancionCounts[r.emp.id] || 0) >= SANCION_LIMITE ? 'text-red-500 font-bold' : ''}>{r.emp.full_name}</span>
                            {(sancionCounts[r.emp.id] || 0) > 0 && (
                              <span className={`ml-1 rounded-full px-1.5 text-[10px] font-semibold ${(sancionCounts[r.emp.id] || 0) >= SANCION_LIMITE ? 'bg-red-500 text-white' : 'bg-amber-500/20 text-amber-500'}`} title="Sanciones">{sancionCounts[r.emp.id]}</span>
                            )}
                          </span>
                        </td>
                        {reg.days.map(d => {
                          const c = r.cells[d.date];
                          const code = c ? CODES[c.code] : null;
                          return (
                            <td key={d.date} className={`p-0.5 text-center ${d.weekend ? 'bg-secondary/60' : ''}`} title={c ? `${fDate(d.date)} · ${c.title}` : fDate(d.date)}>
                              {code && (
                                <span className="w-6 h-6 mx-auto rounded text-[10px] font-bold flex items-center justify-center" style={{ background: code.bg, color: code.fg }}>
                                  {c.code === 'S' ? '?' : c.code}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 text-right tabular-nums font-semibold">{t.fichados}</td>
                        <td className="px-2 text-right tabular-nums">{fH(t.horas)}</td>
                        <td className="px-2 text-right tabular-nums">{fH(t.extras)}</td>
                        <td className={`px-2 text-right tabular-nums ${t.faltas + t.sinRegistro > 0 ? 'text-red-500 font-semibold' : ''}`}>{t.faltas + t.sinRegistro}</td>
                        <td className="px-2 pr-3 text-right tabular-nums">{t.B + t.V + t.P}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={reg.days.length + 6} className="bg-secondary/20 px-3 py-3">
                            <p className="text-xs text-muted-foreground mb-2">
                              {t.fichados} días fichados · {fH(t.horas)} h · {fH(t.extras)} h extra · {t.faltas} faltas · {t.sinRegistro} laborables sin registro · {t.B} baja · {t.V} vacaciones · {t.P} permiso{t.tardes ? ` · ${t.tardes} entradas tarde` : ''}
                            </p>
                            {r.detalle.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin registros este mes.</p>
                            ) : (
                              <table className="text-xs w-full max-w-3xl">
                                <thead><tr className="text-muted-foreground text-left">
                                  <th className="py-1 pr-3">Fecha</th><th className="pr-3">Tipo</th><th className="pr-3">Entrada</th><th className="pr-3">Salida</th><th className="pr-3 text-right">Horas</th><th className="pr-3 text-right">Extra</th><th>Notas</th>
                                </tr></thead>
                                <tbody>
                                  {r.detalle.map(d => (
                                    <tr key={d.date} className={`border-t border-border/60 ${d.tipo === 'Falta' ? 'text-red-500' : ''}`}>
                                      <td className="py-1 pr-3 whitespace-nowrap">{fDate(d.date)}</td>
                                      <td className="pr-3">{d.tipo}</td>
                                      <td className="pr-3 tabular-nums">{d.entrada}</td>
                                      <td className="pr-3 tabular-nums">{d.salida}</td>
                                      <td className="pr-3 text-right tabular-nums">{d.horas ? fH(d.horas) : '—'}</td>
                                      <td className="pr-3 text-right tabular-nums">{d.extras ? fH(d.extras) : '—'}</td>
                                      <td className="text-muted-foreground">{d.notas}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        {reg ? `${monthLabel(reg.month)} · ${reg.laborables} días laborables (lunes a viernes). ` : ''}Toca un trabajador para ver el detalle de cada día. Los festivos no se marcan aparte.
      </p>

      <Amonestaciones employees={data?.employees || []} sanciones={sanciones} onChanged={loadSanciones} />

      <Dialog open={signOpen} onOpenChange={(o) => { setSignOpen(o); if (!o) setSignature(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Firmar registro de fichajes</DialogTitle>
            <DialogDescription className="text-muted-foreground">{reg ? monthLabel(reg.month) : ''} · Firmante: {employee?.full_name}</DialogDescription>
          </DialogHeader>
          <SignaturePadInput onChange={setSignature} />
          <p className="text-xs text-muted-foreground">Al firmar confirmas que el registro es correcto. La firma se inserta en el PDF.</p>
          <Button onClick={() => pdf(signature)} disabled={!signature || busy} className="w-full h-11 gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Pen size={16} />} Firmar y descargar PDF
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="bg-card rounded-xl border border-border px-4 py-3">
      <p className={`text-xl font-bold tabular-nums ${danger ? 'text-red-500' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
