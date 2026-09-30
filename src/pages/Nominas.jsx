import React, { useState, useEffect } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { Plus, Download, FileText, Calculator, CheckCircle2, Pen, Trash2 } from 'lucide-react';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import NominaSignDialog from '@/components/nominas/NominaSignDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { generateNominaPdf } from '@/components/nominas/NominaPdf';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Regla de nómina de Noucolor:
//   NETO = salario neto de la hoja de la empresa
//        + horas extra × precio hora extra (ya es neto, no se le descuenta nada)
//        + bonificaciones − otras deducciones
//   El CASS mostrado es el del salario base: bruto − neto (cuadra al céntimo).
function computePayroll(emp, overtimeHours, bonus, otherDeductions) {
  const base = r2(emp.base_salary);
  const baseNet = r2(emp.net_salary);
  const extraPrice = r2(emp.precioHoraExtra);
  const hours = r2(overtimeHours);
  const overtimePay = r2(hours * extraPrice);
  const cass = r2(base - baseNet);
  const net = r2(baseNet + overtimePay + r2(bonus) - r2(otherDeductions));
  return { base, baseNet, extraPrice, hours, overtimePay, cass, gross: r2(base + overtimePay + r2(bonus)), net };
}

// PDF generation moved to src/components/nominas/NominaPdf.js

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

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!form.employee_id || !form.period_month || !form.period_year || employees.length === 0) return;
    recalculate();
  }, [form.employee_id, form.period_month, form.period_year, employees]);

  async function loadData() {
    try {
      const [pRes, empRes] = await Promise.all([
        authInvoke('trackTime', { operation: 'listPayrolls',  limit: 200 }),
        authInvoke('manageEmployee', { action: 'list' }),
      ]);
      setPayrolls(pRes.data?.payrolls || []);
      setEmployees((empRes.data?.employees || []).filter(e => e.is_active));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function recalculate() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;
    setCalculating(true);
    try {
      const entriesRes = await authInvoke('trackTime', { operation: 'listAllEntries', employeeId: emp.id, limit: 1000 });
      const allEntries = (entriesRes.data?.entries || []).filter(e => e.employee_id === emp.id);
      const year = parseInt(form.period_year);
      const month = parseInt(form.period_month);
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const inPeriod = (d) => typeof d === 'string' && d.startsWith(prefix);
      const monthEntries = allEntries.filter(e => inPeriod(e.date));
      // Horas extra aprobadas del período
      const overtimeRes = await authInvoke('trackTime', { operation: 'listOvertimeByEmployee',  targetEmployeeId: emp.id, limit: 500 });
      const allOvertime = overtimeRes.data?.overtime || [];
      const monthOvertime = allOvertime.filter(o => inPeriod(o.date) && o.status === 'aprobado');

      const overtimeFromEntries = monthEntries.reduce((sum, e) => sum + (e.overtime_hours || 0), 0);
      const hasOvertimeRecords = monthOvertime.length > 0;
      const overtimeHours = hasOvertimeRecords
        ? monthOvertime.reduce((sum, o) => sum + (o.duration || 0), 0)
        : overtimeFromEntries;
      const overtimePay = r2(r2(overtimeHours) * r2(emp.precioHoraExtra));

      const absences = monthEntries.filter(e => e.status === 'ausencia_injustificada').length;
      const regularHours = monthEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
      setCalcSummary({ overtimeHours: parseFloat(overtimeHours.toFixed(2)), overtimePay: parseFloat(overtimePay.toFixed(2)), absences, regularHours: parseFloat(regularHours.toFixed(2)), totalEntries: monthEntries.length });
      setForm(f => ({ ...f, overtime_hours: parseFloat(overtimeHours.toFixed(2)) }));
    } catch (e) { console.error(e); }
    finally { setCalculating(false); }
  }

  async function handleCreate() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;
    if (!emp.net_salary || !emp.base_salary) {
      toast({ title: 'Faltan datos', description: `${emp.full_name} no tiene salario bruto/neto en su ficha de Empleados.`, variant: 'destructive' });
      return;
    }
    if ((calcSummary?.overtimeHours || 0) > 0 && !emp.precioHoraExtra) {
      toast({ title: 'Faltan datos', description: `${emp.full_name} tiene horas extra pero no tiene precio hora extra en su ficha.`, variant: 'destructive' });
      return;
    }
    const year = parseInt(form.period_year);
    const month = parseInt(form.period_month);

    // Una falta/ausencia registrada NO descuenta sueldo. El neto base es el
    // pactado; solo las horas extra y las bonificaciones lo aumentan.
    const p = computePayroll(emp, calcSummary?.overtimeHours || 0, form.bonus, form.other_deductions);

    try {
      await authInvoke('trackTime', {
        operation: 'createPayroll',
        payroll: {
          employee_id: emp.id, employee_name: emp.full_name,
          employee_dni: emp.dni || '', employee_nss: emp.nss || '',
          employee_iban: emp.iban || '', employee_position: emp.position || emp.role || '',
          employee_hire_date: emp.hire_date || '',
          period_month: month, period_year: year,
          precio_hora: r2(emp.precioHora),
          precio_hora_extra: p.extraPrice,
          total_hours: r2(calcSummary?.regularHours || 0),
          base_salary: p.base,
          base_net_salary: p.baseNet,
          overtime_hours: p.hours,
          overtime_pay: p.overtimePay,
          bonus: r2(form.bonus),
          gross_salary: p.gross,
          cass_employee: p.cass,
          irpf: 0,
          other_deductions: r2(form.other_deductions),
          net_salary: p.net,
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

  function handleDownload(payroll) {
    generateNominaPdf(payroll);
  }

  function handleSign(payroll) {
    setSignPayroll(payroll);
  }

  async function handleDelete(payroll) {
    if (!confirm(`¿Eliminar la nómina de ${payroll.employee_name} (${MONTHS[payroll.period_month - 1]} ${payroll.period_year})? Podrás generarla de nuevo después.`)) return;
    const prev = payrolls;
    setPayrolls(payrolls.filter(p => p.id !== payroll.id));
    try {
      await authInvoke('trackTime', { operation: 'deletePayroll', payrollId: payroll.id });
      toast({ variant: 'success', title: 'Nómina eliminada' });
    } catch (e) {
      setPayrolls(prev);
      toast({ title: 'Error al eliminar la nómina', variant: 'destructive' });
    }
  }

  function handleSigned(updatedPayroll) {
    setSignPayroll(null);
    generateNominaPdf(updatedPayroll);
    toast({ variant: 'success', title: 'Nòmina firmada correctament' });
    loadData();
  }

  const columns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'period', label: 'Período', render: r => `${MONTHS[r.period_month - 1]} ${r.period_year}` },
    { key: 'base_salary', label: 'Base', render: r => `${(r.base_salary || 0).toFixed(2)} €` },
    { key: 'overtime_pay', label: 'Horas Extras', render: r => `${(r.overtime_pay || 0).toFixed(2)} €` },
    { key: 'gross_salary', label: 'Bruto', render: r => `${(r.gross_salary || 0).toFixed(2)} €` },
    { key: 'net_salary', label: 'Neto', render: r => <span className="font-semibold text-emerald-400">{(r.net_salary || 0).toFixed(2)} €</span> },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Nóminas"
        subtitle="Butlletí de Salari — Solo se pagan horas 8:00-16:00 + horas extras"
        actions={
          <div className="flex gap-2">
            {isAdmin && payrolls.length > 0 && (
              <Button variant="outline" onClick={downloadAll} className="gap-2 border-border">
                <Download size={18} /> Descargar Todas
              </Button>
            )}
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus size={18} /> Generar Nómina
            </Button>
          </div>
        }
      />

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
        actions={(row) => (
          <div className="flex items-center gap-1">
            {row.employee_id === employee?.id && !row.worker_signature_name && (
              <Button variant="ghost" size="sm" onClick={() => handleSign(row)} className="text-primary hover:bg-primary/10 gap-1" title="Firmar nómina">
                <Pen size={16} />
              </Button>
            )}
            {row.worker_signature_name && (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" title={`Firmada per ${row.worker_signature_name}`} />
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => handleDownload(row)} className="text-primary hover:bg-primary/10" title="Descarregar PDF">
                <FileText size={16} />
              </Button>
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(row)} className="text-red-400 hover:bg-red-500/10" title="Eliminar nómina">
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
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
                <div className="flex justify-between"><span className="text-muted-foreground">Horas regulares</span><span>{calcSummary.regularHours.toFixed(1)}h</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horas extras</span><span className="text-primary">{calcSummary.overtimeHours.toFixed(1)}h</span></div>
                {calcSummary.overtimePay > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Importe extras</span><span className="text-primary font-medium">{calcSummary.overtimePay.toFixed(2)} €</span></div>
                )}
                {calcSummary.absences > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Ausencias injustificadas</span><span className="text-red-400 font-medium">{calcSummary.absences}</span></div>
                )}
                {(() => {
                  const emp = employees.find(e => e.id === form.employee_id);
                  if (!emp) return null;
                  const p = computePayroll(emp, calcSummary.overtimeHours, form.bonus, form.other_deductions);
                  return (
                    <div className="border-t border-border mt-2 pt-2 space-y-1.5">
                      <div className="flex justify-between"><span className="text-muted-foreground">Salario neto base</span><span>{p.baseNet.toFixed(2)} €</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Extras ({p.hours.toFixed(2)}h × {p.extraPrice.toFixed(2)} €)</span><span>{p.overtimePay.toFixed(2)} €</span></div>
                      <div className="flex justify-between font-semibold"><span>Neto a cobrar</span><span className="text-emerald-400">{p.net.toFixed(2)} €</span></div>
                    </div>
                  );
                })()}
              </div>
            )}


            <Button onClick={handleCreate} disabled={!form.employee_id} className="w-full h-11">
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
    </div>
  );
}