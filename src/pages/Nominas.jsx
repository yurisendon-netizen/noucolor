import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import jsPDF from 'jspdf';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function generatePayslipPDF(payroll) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(30, 36, 50);
  doc.rect(0, 0, w, 45, 'F');
  doc.setTextColor(230, 175, 60);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NOUCOLOR S.L.', 20, 20);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 210);
  doc.text('Pintura i Decoració — Principat d\'Andorra', 20, 28);
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('BUTLLETÍ DE SALARI', 20, 40);

  // Employee info
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  let y = 58;
  doc.setFont('helvetica', 'bold');
  doc.text('Treballador:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(payroll.employee_name, 70, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('DNI:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(payroll.employee_dni || '—', 70, y);
  doc.setFont('helvetica', 'bold');
  doc.text('N.S.S.:', 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(payroll.employee_nss || '—', 140, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Període:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${MONTHS[payroll.period_month - 1]} ${payroll.period_year}`, 70, y);

  // Devengos table
  y += 15;
  doc.setFillColor(240, 240, 245);
  doc.rect(15, y, w - 30, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 36, 50);
  doc.text('DEVENGAMENTS', 20, y + 7);
  doc.text('EUR', w - 35, y + 7, { align: 'right' });
  
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const items = [
    ['Salari base', payroll.base_salary],
    ['Hores extres', payroll.overtime_pay || 0],
    ['Bonificacions', payroll.bonus || 0],
  ];
  items.forEach(([label, val]) => {
    doc.text(label, 20, y);
    doc.text(val.toFixed(2), w - 35, y, { align: 'right' });
    y += 7;
  });
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DEVENGAT', 20, y);
  doc.text((payroll.gross_salary || 0).toFixed(2), w - 35, y, { align: 'right' });

  // Deducciones
  y += 15;
  doc.setFillColor(240, 240, 245);
  doc.rect(15, y, w - 30, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 36, 50);
  doc.text('DEDUCCIONS', 20, y + 7);
  doc.text('EUR', w - 35, y + 7, { align: 'right' });
  
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const deductions = [
    ['Cotització CASS treballador (6,5%)', payroll.cass_employee || 0],
    ['Retenció IRPF', payroll.irpf || 0],
    ['Altres deduccions', payroll.other_deductions || 0],
  ];
  deductions.forEach(([label, val]) => {
    doc.text(label, 20, y);
    doc.text(val.toFixed(2), w - 35, y, { align: 'right' });
    y += 7;
  });
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DEDUCCIONS', 20, y);
  const totalDed = (payroll.cass_employee || 0) + (payroll.irpf || 0) + (payroll.other_deductions || 0);
  doc.text(totalDed.toFixed(2), w - 35, y, { align: 'right' });

  // Net
  y += 15;
  doc.setFillColor(30, 36, 50);
  doc.rect(15, y, w - 30, 12, 'F');
  doc.setTextColor(230, 175, 60);
  doc.setFontSize(12);
  doc.text('LÍQUID A PERCEBRE', 20, y + 9);
  doc.text(`${(payroll.net_salary || 0).toFixed(2)} EUR`, w - 35, y + 9, { align: 'right' });

  // Footer
  y += 25;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text('Document generat per Noucolor — Gestió Interna', 20, y);

  doc.save(`Nomina_${payroll.employee_name.replace(/\s/g, '_')}_${MONTHS[payroll.period_month - 1]}_${payroll.period_year}.pdf`);
}

export default function Nominas() {
  const { toast } = useToast();
  const [payrolls, setPayrolls] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), overtime_hours: 0, bonus: 0, other_deductions: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [p, e] = await Promise.all([
        base44.entities.Payroll.list('-created_date', 200),
        base44.entities.Employee.filter({ is_active: true }),
      ]);
      setPayrolls(p);
      setEmployees(e);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;
    const base = emp.base_salary || 0;
    const overtimePay = (form.overtime_hours || 0) * (base / 160) * 1.5;
    const gross = base + overtimePay + (parseFloat(form.bonus) || 0);
    const cass = gross * 0.065;
    const irpf = gross > 2000 ? gross * 0.05 : 0;
    const net = gross - cass - irpf - (parseFloat(form.other_deductions) || 0);

    try {
      await base44.entities.Payroll.create({
        employee_id: emp.id, employee_name: emp.full_name,
        employee_dni: emp.dni || '', employee_nss: emp.nss || '',
        period_month: parseInt(form.period_month), period_year: parseInt(form.period_year),
        base_salary: base, overtime_hours: parseFloat(form.overtime_hours) || 0,
        overtime_pay: parseFloat(overtimePay.toFixed(2)),
        bonus: parseFloat(form.bonus) || 0,
        gross_salary: parseFloat(gross.toFixed(2)),
        cass_employee: parseFloat(cass.toFixed(2)),
        irpf: parseFloat(irpf.toFixed(2)),
        other_deductions: parseFloat(form.other_deductions) || 0,
        net_salary: parseFloat(net.toFixed(2)),
        status: 'borrador',
      });
      toast({ title: 'Nómina generada' });
      setDialogOpen(false);
      loadData();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  function downloadAll() {
    payrolls.forEach(p => generatePayslipPDF(p));
    toast({ title: `${payrolls.length} nóminas descargadas` });
  }

  const columns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'period', label: 'Período', render: r => `${MONTHS[r.period_month - 1]} ${r.period_year}` },
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
        subtitle="Butlletí de Salari — Formato oficial Andorrano"
        actions={
          <div className="flex gap-2">
            {payrolls.length > 0 && (
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
          <Button variant="ghost" size="sm" onClick={() => generatePayslipPDF(row)} className="text-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,55%)]/10">
            <FileText size={16} />
          </Button>
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
              options={employees.map(e => ({ value: e.id, label: `${e.full_name} — ${(e.base_salary || 0).toFixed(2)}€/mes` }))}
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
            <Input type="number" placeholder="Horas extras" value={form.overtime_hours} onChange={e => setForm({ ...form, overtime_hours: e.target.value })} className="bg-secondary border-border" />
            <Input type="number" placeholder="Bonificaciones (€)" value={form.bonus} onChange={e => setForm({ ...form, bonus: e.target.value })} className="bg-secondary border-border" />
            <Input type="number" placeholder="Otras deducciones (€)" value={form.other_deductions} onChange={e => setForm({ ...form, other_deductions: e.target.value })} className="bg-secondary border-border" />
            <Button onClick={handleCreate} disabled={!form.employee_id} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              Generar Nómina
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}