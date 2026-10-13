import React, { useState, useEffect } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { Plus, Download, FileText, Calculator, CheckCircle2, Pen, Trash2, AlertTriangle, MessageSquareWarning } from 'lucide-react';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import NominaSignDialog from '@/components/nominas/NominaSignDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { generateNominaPdf } from '@/components/nominas/NominaPdf';
import { computePayroll, checkPayroll, checkLimits, overtimeByDay, r2 } from '@/components/nominas/payrollCalc';
import { buildRegistro } from '@/components/registro/registroUtils';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Nómina (Llei 31/2018):
// - Horas extra = horas extra APROBADAS en Horas Extras (laborables) + todo lo
//   trabajado en sábado o domingo.
// - Las extras van en bruto y cotizan a la CASS; el neto que cobra el trabajador
//   es el mismo de siempre (ver payrollCalc.js).
// - Con cada nómina se entrega el compte d'hores del mes (art. 59.2) y el
//   trabajador firma "Conforme" o pulsa "Reclamar" (7 días).

export default function Nominas() {
  const { toast } = useToast();
  const { employee, isAdmin } = useEmployeeProfile();
  const [payrolls, setPayrolls] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), overtime_hours: 0, bonus: 0, other_deductions: 0 });
  const [calcSummary, setCalcSummary] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [signPayroll, setSignPayroll] = useState(null);
  const [disputePayroll, setDisputePayroll] = useState(null);
  const [disputeText, setDisputeText] = useState('');
  const [resolvePayroll, setResolvePayroll] = useState(null);
  const [resolveText, setResolveText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { loadData(); }, [isAdmin]);

  useEffect(() => {
    if (!form.employee_id || !form.period_month || !form.period_year || employees.length === 0) return;
    recalculate();
  }, [form.employee_id, form.period_month, form.period_year, employees]);

  async function loadData() {
    try {
      const pRes = await authInvoke('trackTime', { operation: 'listPayrolls', limit: 200 });
      setPayrolls(pRes.data?.payrolls || []);
      if (isAdmin) {
        const empRes = await authInvoke('manageEmployee', { action: 'list' });
        setEmployees((empRes.data?.employees || []).filter(e => e.is_active));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function recalculate() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;
    setCalculating(true);
    try {
      const year = parseInt(form.period_year);
      const month = parseInt(form.period_month);
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const inPeriod = (d) => typeof d === 'string' && d.startsWith(prefix);

      const [entriesRes, overtimeRes, regRes] = await Promise.all([
        authInvoke('trackTime', { operation: 'listAllEntries', employeeId: emp.id, limit: 1000 }),
        authInvoke('trackTime', { operation: 'listOvertimeByEmployee', targetEmployeeId: emp.id, limit: 1000 }),
        authInvoke('trackTime', { operation: 'registroMensual', month: prefix }),
      ]);
      const allEntries = (entriesRes.data?.entries || []).filter(e => e.employee_id === emp.id);
      const allOvertime = overtimeRes.data?.overtime || [];
      const approved = allOvertime.filter(o => o.status === 'aprobado');
      const monthEntries = allEntries.filter(e => inPeriod(e.date));
      const pendingOT = allOvertime.filter(o => inPeriod(o.date) && o.status === 'pendiente');

      const byDay = overtimeByDay(monthEntries, approved.filter(o => inPeriod(o.date)));
      const overtimeHours = r2(Object.values(byDay).reduce((s, h) => s + h, 0));

      const absences = monthEntries.filter(e => e.status === 'ausencia_injustificada').length;
      const regularHours = r2(monthEntries
        .filter(e => e.status !== 'ausencia_injustificada')
        .filter(e => { const [y, m, d] = e.date.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return dow !== 0 && dow !== 6; })
        .reduce((sum, e) => sum + (e.total_hours || 0), 0));
      const autoClosed = monthEntries.filter(e => e.auto_closed).length;

      // Compte d'hores del mes (mismo cálculo que Registro de fichajes)
      let compte = null;
      if (regRes.data?.success) {
        const reg = buildRegistro(regRes.data);
        const row = reg.rows.find(r => r.emp.id === emp.id);
        if (row) compte = { month: prefix, totals: row.totals, detalle: row.detalle, laborables: reg.laborables };
      }

      const limits = checkLimits(allEntries, approved, year, month);

      setCalcSummary({
        overtimeHours, absences, regularHours, autoClosed,
        totalEntries: monthEntries.length,
        pendingOTHours: r2(pendingOT.reduce((s, o) => s + (o.duration || 0), 0)),
        pendingOTCount: pendingOT.length,
        limitWarnings: limits.warnings,
        compte,
      });
      setForm(f => ({ ...f, overtime_hours: overtimeHours }));
    } catch (e) { console.error(e); }
    finally { setCalculating(false); }
  }

  const selectedEmp = employees.find(e => e.id === form.employee_id);
  const preview = (selectedEmp && calcSummary) ? computePayroll(selectedEmp, calcSummary.overtimeHours, form.bonus, form.other_deductions) : null;
  const legal = preview ? checkPayroll(preview, { year: parseInt(form.period_year), month: parseInt(form.period_month), overtimeHours: calcSummary.overtimeHours }) : { errors: [], warnings: [] };

  async function handleCreate() {
    const emp = selectedEmp;
    if (!emp) return;
    if (!emp.net_salary || !emp.base_salary) {
      toast({ title: 'Faltan datos', description: `${emp.full_name} no tiene salario bruto/neto en su ficha de Empleados.`, variant: 'destructive' });
      return;
    }
    if ((calcSummary?.overtimeHours || 0) > 0 && !emp.precioHoraExtra) {
      toast({ title: 'Faltan datos', description: `${emp.full_name} tiene horas extra pero no tiene precio hora extra en su ficha.`, variant: 'destructive' });
      return;
    }
    if (calculating || !calcSummary) return;
    if (legal.errors.length > 0) {
      toast({ title: 'No se puede generar', description: legal.errors[0], variant: 'destructive' });
      return;
    }
    if (calcSummary.pendingOTCount > 0 && !confirm(`Hay ${calcSummary.pendingOTHours} h extra PENDIENTES de aprobar este mes que no entrarán en la nómina. ¿Generar igualmente?`)) return;

    const year = parseInt(form.period_year);
    const month = parseInt(form.period_month);
    // Una falta/ausencia registrada NO descuenta sueldo. El neto base es el
    // pactado; solo las horas extra y las bonificaciones lo aumentan.
    const p = computePayroll(emp, calcSummary.overtimeHours, form.bonus, form.other_deductions);

    try {
      await authInvoke('trackTime', {
        operation: 'createPayroll',
        payroll: {
          employee_id: emp.id, employee_name: emp.full_name,
          employee_dni: emp.dni || '', employee_nss: emp.nss || '',
          employee_iban: emp.iban || '', employee_position: emp.position || emp.role || '',
          employee_hire_date: emp.hire_date || '',
          period_month: month, period_year: year,
          precio_hora: r2(emp.precioHora) || p.hourly,
          precio_hora_extra: p.extraPriceNet,
          total_hours: calcSummary.regularHours,
          base_salary: p.base,
          base_net_salary: p.baseNet,
          overtime_hours: p.hours,
          overtime_net: p.overtimeNet,
          overtime_gross: p.overtimeGross,
          overtime_pay: p.overtimeGross,
          bonus: p.bonusNet,
          bonus_gross: p.bonusGross,
          gross_salary: p.gross,
          cass_base: p.gross,
          cass_employee: p.cassEmployee,
          cass_employer: p.cassEmployer,
          irpf: 0,
          other_deductions: r2(form.other_deductions),
          net_salary: p.net,
          calc_version: 2,
          compte_hores: calcSummary.compte ? JSON.stringify(calcSummary.compte) : '',
          status: 'borrador',
        },
      });
      toast({ variant: 'success', title: 'Nómina generada' });
      setDialogOpen(false);
      loadData();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function downloadAll() {
    for (const p of payrolls) {
      await generateNominaPdf(p);
    }
    toast({ variant: 'success', title: `${payrolls.length} nóminas descargadas` });
  }

  async function handleDelete(payroll) {
    if (payroll.worker_signature_name || payroll.reclamacion_texto) {
      toast({ title: 'No se puede eliminar', description: 'Está firmada o reclamada por el trabajador: hay que conservarla mínimo 3 años.', variant: 'destructive' });
      return;
    }
    if (!confirm(`¿Eliminar la nómina de ${payroll.employee_name} (${MONTHS[payroll.period_month - 1]} ${payroll.period_year})? Podrás generarla de nuevo después.`)) return;
    const prev = payrolls;
    setPayrolls(payrolls.filter(p => p.id !== payroll.id));
    try {
      const res = await authInvoke('trackTime', { operation: 'deletePayroll', payrollId: payroll.id });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Nómina eliminada' });
    } catch (e) {
      setPayrolls(prev);
      toast({ title: 'Error al eliminar la nómina', description: e?.message, variant: 'destructive' });
    }
  }

  function handleSigned(updatedPayroll) {
    setSignPayroll(null);
    generateNominaPdf(updatedPayroll);
    toast({ variant: 'success', title: 'Nòmina firmada correctament' });
    loadData();
  }

  async function sendDispute() {
    if (!disputeText.trim()) return;
    setSending(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'disputePayroll', payrollId: disputePayroll.id, texto: disputeText });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Reclamación enviada', description: 'La empresa la revisará y te responderá.' });
      setDisputePayroll(null); setDisputeText('');
      loadData();
    } catch (e) {
      toast({ title: 'Error al enviar', description: e?.message, variant: 'destructive' });
    } finally { setSending(false); }
  }

  async function sendResolve() {
    if (!resolveText.trim()) return;
    setSending(true);
    try {
      const res = await authInvoke('trackTime', { operation: 'resolveDisputePayroll', payrollId: resolvePayroll.id, respuesta: resolveText });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Respuesta guardada' });
      setResolvePayroll(null); setResolveText('');
      loadData();
    } catch (e) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally { setSending(false); }
  }

  const columns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'period', label: 'Período', render: r => `${MONTHS[r.period_month - 1]} ${r.period_year}` },
    { key: 'base_salary', label: 'Base', render: r => `${(r.base_salary || 0).toFixed(2)} €` },
    { key: 'overtime_pay', label: 'Extras (bruto)', render: r => `${(r.overtime_pay || 0).toFixed(2)} €` },
    { key: 'gross_salary', label: 'Bruto', render: r => `${(r.gross_salary || 0).toFixed(2)} €` },
    { key: 'net_salary', label: 'Neto', render: r => <span className="font-semibold text-emerald-400">{(r.net_salary || 0).toFixed(2)} €</span> },
    { key: 'status', label: 'Estado', render: r => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={r.status} />
        {r.reclamacion_estado === 'pendiente' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-red-500/15 text-red-400 border-red-500/20">Reclamada</span>}
        {r.reclamacion_estado === 'resuelta' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-500/15 text-slate-400 border-slate-500/20">Reclamación resuelta</span>}
        {r.worker_signature_name && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-500/15 text-emerald-400 border-emerald-500/20">Conforme</span>}
      </div>
    ) },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Nóminas"
        subtitle="Butlletí de Salari + compte d'hores del mes"
        actions={
          isAdmin ? (
            <div className="flex gap-2">
              {payrolls.length > 0 && (
                <Button variant="outline" onClick={downloadAll} className="gap-2 border-border">
                  <Download size={18} /> Descargar Todas
                </Button>
              )}
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus size={18} /> Generar Nómina
              </Button>
            </div>
          ) : null
        }
      />

      {!isAdmin && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Cada mes recibes tu nómina con el <strong className="text-foreground">compte d'hores</strong> (días, horas, extras, vacaciones y ausencias).
          Revísalo: si está bien pulsa <strong className="text-foreground">Firmar (conforme)</strong>; si algo no cuadra pulsa
          <strong className="text-foreground"> Reclamar</strong> en un plazo de <strong className="text-foreground">7 días</strong> y la empresa lo revisará.
        </div>
      )}

      <DataTable
        data={payrolls}
        onRefresh={loadData}
        columns={columns}
        searchField="employee_name"
        filterField="status"
        filterOptions={[
          { value: 'borrador', label: 'Borrador' },
          { value: 'emitida', label: 'Emitida' },
          { value: 'pagada', label: 'Pagada' },
        ]}
        emptyMessage="No hay nóminas generadas"
        actions={(row) => {
          const mine = row.employee_id === employee?.id;
          return (
            <div className="flex items-center gap-1">
              {(isAdmin || mine) && (
                <Button variant="ghost" size="sm" onClick={() => generateNominaPdf(row)} className="text-primary hover:bg-primary/10" title="Descargar PDF (nómina + compte d'hores)">
                  <FileText size={16} />
                </Button>
              )}
              {mine && !row.worker_signature_name && (
                <Button variant="ghost" size="sm" onClick={() => setSignPayroll(row)} className="text-primary hover:bg-primary/10 gap-1" title="Firmar: conforme">
                  <Pen size={16} />
                </Button>
              )}
              {mine && !row.worker_signature_name && !row.reclamacion_texto && (
                <Button variant="ghost" size="sm" onClick={() => { setDisputePayroll(row); setDisputeText(''); }} className="text-red-400 hover:bg-red-500/10" title="Reclamar: no estoy conforme">
                  <MessageSquareWarning size={16} />
                </Button>
              )}
              {row.worker_signature_name && (
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" title={`Firmada per ${row.worker_signature_name}`} />
              )}
              {isAdmin && row.reclamacion_estado === 'pendiente' && (
                <Button variant="ghost" size="sm" onClick={() => { setResolvePayroll(row); setResolveText(''); }} className="text-red-400 hover:bg-red-500/10 gap-1" title="Ver y responder reclamación">
                  <AlertTriangle size={16} />
                </Button>
              )}
              {isAdmin && !row.worker_signature_name && !row.reclamacion_texto && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(row)} className="text-red-400 hover:bg-red-500/10" title="Eliminar nómina">
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          );
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Generar Nómina</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <ResponsiveSelect
              value={form.employee_id}
              onValueChange={v => setForm({ ...form, employee_id: v })}
              placeholder="Seleccionar empleado"
              options={employees.filter(e => e.role !== 'jefe').map(e => ({ value: e.id, label: `${e.full_name} — neto ${(e.net_salary || 0).toFixed(2)}€` }))}
              className="bg-secondary border-border"
            />
            <div className="grid grid-cols-2 gap-3">
              <ResponsiveSelect
                value={String(form.period_month)}
                onValueChange={v => setForm({ ...form, period_month: v })}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                className="bg-secondary border-border"
              />
              <Input type="number" placeholder="Año" value={form.period_year} onChange={e => setForm({ ...form, period_year: e.target.value })} className="bg-secondary border-border" />
            </div>

            {calcSummary && (
              <div className="bg-secondary/50 rounded-lg border border-border p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calculator size={14} />
                  <span className="font-medium">{calculating ? 'Calculando...' : 'Resumen del período'}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Días fichados</span><span>{calcSummary.totalEntries}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horas ordinarias</span><span>{calcSummary.regularHours.toFixed(1)}h</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horas extra (aprobadas + fines de semana)</span><span className="text-primary">{calcSummary.overtimeHours.toFixed(2)}h</span></div>
                {calcSummary.absences > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Ausencias injustificadas</span><span className="text-red-400 font-medium">{calcSummary.absences}</span></div>
                )}
                {calcSummary.autoClosed > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Salidas no fichadas (cierre automático)</span><span className="text-amber-400 font-medium">{calcSummary.autoClosed}</span></div>
                )}
                {calcSummary.pendingOTCount > 0 && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 p-2 text-xs">
                    {calcSummary.pendingOTHours} h extra pendientes de aprobar en Horas Extras: apruébalas o recházalas antes de generar la nómina.
                  </div>
                )}
                {preview && (
                  <div className="border-t border-border mt-2 pt-2 space-y-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Salario base (bruto)</span><span>{preview.base.toFixed(2)} €</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Extras brutas ({preview.hours.toFixed(2)}h × {preview.extraPriceGross.toFixed(2)} €)</span><span>{preview.overtimeGross.toFixed(2)} €</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total bruto</span><span>{preview.gross.toFixed(2)} €</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">CASS trabajador</span><span>− {preview.cassEmployee.toFixed(2)} €</span></div>
                    <div className="flex justify-between font-semibold"><span>Neto a cobrar</span><span className="text-emerald-400">{preview.net.toFixed(2)} €</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">CASS empresa (15,5 %)</span><span>{preview.cassEmployer.toFixed(2)} €</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Coste total empresa</span><span>{r2(preview.gross + preview.cassEmployer).toFixed(2)} €</span></div>
                  </div>
                )}
                {[...legal.errors].map((w, i) => (
                  <div key={`e${i}`} className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 p-2 text-xs flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}</div>
                ))}
                {[...legal.warnings, ...(calcSummary.limitWarnings || [])].map((w, i) => (
                  <div key={`w${i}`} className="rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 p-2 text-xs flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}</div>
                ))}
              </div>
            )}

            <Button onClick={handleCreate} disabled={!form.employee_id || calculating || legal.errors.length > 0} className="w-full h-11">
              Generar Nómina
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {signPayroll && (
        <NominaSignDialog
          payroll={signPayroll}
          employeeId={employee?.id}
          employeeName={employee?.full_name}
          onClose={() => setSignPayroll(null)}
          onSigned={handleSigned}
        />
      )}

      <Dialog open={!!disputePayroll} onOpenChange={(o) => !o && setDisputePayroll(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Reclamar nómina</DialogTitle>
            <DialogDescription>
              {disputePayroll && `${MONTHS[disputePayroll.period_month - 1]} ${disputePayroll.period_year}`} · Explica qué no es correcto (días, horas, extras, importe…).
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={disputeText} onChange={e => setDisputeText(e.target.value)} placeholder="Ej.: el día 14 salí a las 18:00 y no aparecen las 2 horas extra" className="bg-secondary border-border" />
          <Button onClick={sendDispute} disabled={sending || !disputeText.trim()} className="w-full h-11">Enviar reclamación</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolvePayroll} onOpenChange={(o) => !o && setResolvePayroll(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Reclamación de {resolvePayroll?.employee_name}</DialogTitle>
            <DialogDescription>
              {resolvePayroll && `${MONTHS[resolvePayroll.period_month - 1]} ${resolvePayroll.period_year}`} · Revísala y responde. Si hay un error, corrige el fichaje o las horas extra, elimina esta respuesta en blanco no: genera una nómina nueva y explícalo aquí.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-secondary/50 border border-border p-3 text-sm whitespace-pre-wrap">{resolvePayroll?.reclamacion_texto}</div>
          <Textarea rows={4} value={resolveText} onChange={e => setResolveText(e.target.value)} placeholder="Respuesta al trabajador" className="bg-secondary border-border" />
          <Button onClick={sendResolve} disabled={sending || !resolveText.trim()} className="w-full h-11">Guardar respuesta</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
