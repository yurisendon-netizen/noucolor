import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Download, FileText, Calculator, CheckCircle2, Pen } from 'lucide-react';
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

function getWorkingDaysInMonth(year, month) {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
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
      const [pRes, e] = await Promise.all([
        base44.functions.invoke('trackTime', { operation: 'listPayrolls', callerEmployeeId: employee?.id, limit: 200 }),
        base44.entities.Employee.filter({ is_active: true }),
      ]);
      setPayrolls(pRes.data?.payrolls || []);
      setEmployees(e);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function recalculate() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;
    setCalculating(true);
    try {
      const entriesRes = await base44.functions.invoke('trackTime', { operation: 'listAllEntries', callerEmployeeId: employee?.id, limit: 500 });
      const allEntries = (entriesRes.data?.entries || []).filter(e => e.employee_id === emp.id);
      const year = parseInt(form.period_year);
      const month = parseInt(form.period_month);
      const monthEntries = allEntries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });
      // Fetch approved OvertimeHour records for the period
      const overtimeRes = await base44.functions.invoke('trackTime', { operation: 'listOvertimeByEmployee', callerEmployeeId: employee?.id, targetEmployeeId: emp.id, limit: 200 });
      const allOvertime = overtimeRes.data?.overtime || [];
      const monthOvertime = allOvertime.filter(o => {
        const d = new Date(o.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year && o.status === 'aprobado';
      });

      const overtimeFromEntries = monthEntries.reduce((sum, e) => sum + (e.overtime_hours || 0), 0);
      const empPrecio = emp.precioHora || 0;
      const hasOvertimeRecords = monthOvertime.length > 0;
      const overtimeHours = hasOvertimeRecords
        ? monthOvertime.reduce((sum, o) => sum + (o.duration || 0), 0)
        : overtimeFromEntries;
      const overtimePay = hasOvertimeRecords
        ? monthOvertime.reduce((sum, o) => sum + (o.total || 0), 0)
        : overtimeHours * empPrecio * 1.4;

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
    const precioHora = emp.precioHora || 0;
    const monthlyBase = emp.base_salary || 0;
    const year = parseInt(form.period_year);
    const month = parseInt(form.period_month);

    const workingDays = getWorkingDaysInMonth(year, month);
    const dailyRate = monthlyBase / workingDays;
    const absenceDeduction = (calcSummary?.absences || 0) * dailyRate;
    const adjustedBase = Math.max(monthlyBase - absenceDeduction, 0);

    const overtimePay = calcSummary?.overtimePay || ((form.overtime_hours || 0) * precioHora * 1.4);
    const gross = adjustedBase + overtimePay + (parseFloat(form.bonus) || 0);
    const cass = adjustedBase * 0.065;
    const irpf = 0;
    const net = gross - cass - irpf - (parseFloat(form.other_deductions) || 0);

    try {
      await base44.functions.invoke('trackTime', {
        operation: 'createPayroll',
        callerEmployeeId: employee?.id,
        payroll: {
          employee_id: emp.id, employee_name: emp.full_name,
          employee_dni: emp.dni || '', employee_nss: emp.nss || '',
          period_month: month, period_year: year,
          precio_hora: parseFloat(precioHora.toFixed(2)),
          total_hours: parseFloat((calcSummary?.regularHours || 0).toFixed(2)),
          base_salary: parseFloat(adjustedBase.toFixed(2)),
          overtime_hours: parseFloat(form.overtime_hours) || 0,
          overtime_pay: parseFloat(overtimePay.toFixed(2)),
          bonus: parseFloat(form.bonus) || 0,
          gross_salary: parseFloat(gross.toFixed(2)),
          cass_employee: parseFloat(cass.toFixed(2)),
          irpf: parseFloat(irpf.toFixed(2)),
          other_deductions: parseFloat(form.other_deductions) || 0,
          net_salary: parseFloat(net.toFixed(2)),
          status: 'borrador',
        },
      });
      toast({ title: 'Nómina generada' });
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
    toast({ title: `${payrolls.length} nóminas descargadas` });
  }

  function handleDownload(payroll) {
    generateNominaPdf(payroll);
  }

  function handleSign(payroll) {
    setSignPayroll(payroll);
  }

  function handleSigned(updatedPayroll) {
    setSignPayroll(null);
    generateNominaPdf(updatedPayroll);
    toast({ title: 'Nòmina firmada correctament' });
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
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
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
            <Button onClick={() => setDialogOpen(true)} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
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
              <Button variant="ghost" size="sm" onClick={() => handleSign(row)} className="text-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,55%)]/10 gap-1" title="Firmar nómina">
                <Pen size={16} />
              </Button>
            )}
            {row.worker_signature_name && (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" title={`Firmada per ${row.worker_signature_name}`} />
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => handleDownload(row)} className="text-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,55%)]/10" title="Descarregar PDF">
                <FileText size={16} />
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
              options={employees.map(e => ({ value: e.id, label: `${e.full_name} — ${(e.precioHora || 0).toFixed(2)}€/h` }))}
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
                <div className="flex justify-between"><span className="text-muted-foreground">Horas extras</span><span className="text-[hsl(35,92%,55%)]">{calcSummary.overtimeHours.toFixed(1)}h</span></div>
                {calcSummary.overtimePay > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Importe extras</span><span className="text-[hsl(35,92%,55%)] font-medium">{calcSummary.overtimePay.toFixed(2)} €</span></div>
                )}
                {calcSummary.absences > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Ausencias injustificadas</span><span className="text-red-400 font-medium">{calcSummary.absences}</span></div>
                )}
              </div>
            )}


            <Button onClick={handleCreate} disabled={!form.employee_id} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
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