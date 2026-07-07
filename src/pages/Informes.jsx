import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Clock, TrendingUp, Calendar, Users, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import ResponsiveSelect from '@/components/ui/responsive-select';
import ResumenMensual from '@/components/informes/ResumenMensual';
import VidaLaboral from '@/components/informes/VidaLaboral';
import HistorialSalarial from '@/components/informes/HistorialSalarial';
import FirmaSeccion from '@/components/informes/FirmaSeccion';
import * as XLSX from 'xlsx';
import moment from 'moment';

const MONTHS = [
  { value: 0, label: 'Enero' }, { value: 1, label: 'Febrero' }, { value: 2, label: 'Marzo' },
  { value: 3, label: 'Abril' }, { value: 4, label: 'Mayo' }, { value: 5, label: 'Junio' },
  { value: 6, label: 'Julio' }, { value: 7, label: 'Agosto' }, { value: 8, label: 'Septiembre' },
  { value: 9, label: 'Octubre' }, { value: 10, label: 'Noviembre' }, { value: 11, label: 'Diciembre' },
];
const EXPECTED_HOURS_PER_DAY = 8;
const WORKING_DAYS_PER_MONTH = 22;

export default function Informes() {
  const { isAdmin, employee, loading: profileLoading } = useEmployeeProfile();
  const { toast } = useToast();
  const now = moment();
  const [month, setMonth] = useState(now.month());
  const [year, setYear] = useState(now.year());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('total_hours');
  const [sortDir, setSortDir] = useState('desc');
  const [vidaLaboralEmp, setVidaLaboralEmp] = useState(null);
  const [salarialEmp, setSalarialEmp] = useState(null);
  const [payrolls, setPayrolls] = useState([]);

  useEffect(() => {
    loadEntries();
    loadPayrolls();
  }, [month, year]);

  async function loadEntries() {
    setLoading(true);
    try {
      const data = await base44.entities.TimeEntry.list('-date', 1000);
      setEntries(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadPayrolls() {
    try {
      const data = await base44.entities.Payroll.list('-period_year', 1000);
      setPayrolls(data);
    } catch (e) { console.error(e); }
  }

  const periodLabel = `${MONTHS[month].label} ${year}`;

  const rows = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let periodEntries = entries.filter(e => e.date && e.date.startsWith(prefix));
    if (!isAdmin && employee) {
      periodEntries = periodEntries.filter(e => e.employee_id === employee.id);
    }
    const grouped = {};
    periodEntries.forEach(e => {
      const id = e.employee_id || e.employee_name;
      if (!grouped[id]) {
        grouped[id] = {
          employee_id: id,
          employee_name: e.employee_name || 'Desconocido',
          dias_trabajados: 0,
          horas_regulares: 0,
          overtime_hours: 0,
          total_hours: 0,
          ausencias: 0,
        };
      }
      const total = Number(e.total_hours) || 0;
      const overtime = Number(e.overtime_hours) || 0;
      const regular = Math.max(0, total - overtime);
      if (e.status === 'ausencia_injustificada') {
        grouped[id].ausencias += 1;
      } else {
        grouped[id].dias_trabajados += 1;
        grouped[id].horas_regulares += regular;
        grouped[id].overtime_hours += overtime;
        grouped[id].total_hours += total;
      }
    });
    const expected = EXPECTED_HOURS_PER_DAY * WORKING_DAYS_PER_MONTH;
    return Object.values(grouped).map(r => ({
      ...r,
      horas_regulares: Number(r.horas_regulares.toFixed(2)),
      overtime_hours: Number(r.overtime_hours.toFixed(2)),
      total_hours: Number(r.total_hours.toFixed(2)),
      productividad: expected > 0 ? Math.min(150, (r.total_hours / expected) * 100) : 0,
    }));
  }, [entries, month, year, isAdmin, employee]);

  const totals = useMemo(() => ({
    empleados: rows.length,
    horas: rows.reduce((s, r) => s + r.total_hours, 0),
    extras: rows.reduce((s, r) => s + r.overtime_hours, 0),
    dias: rows.reduce((s, r) => s + r.dias_trabajados, 0),
  }), [rows]);

  function handleSort(field) {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  function handleExportExcel() {
    if (rows.length === 0) {
      toast({ title: 'No hay datos para exportar' });
      return;
    }
    const excelRows = rows.map(r => ({
      'Empleado': r.employee_name,
      'Días trabajados': r.dias_trabajados,
      'Horas regulares': r.horas_regulares.toFixed(1),
      'Horas extra': r.overtime_hours.toFixed(1),
      'Horas totales': r.total_hours.toFixed(1),
      'Ausencias': r.ausencias,
      'Productividad (%)': r.productividad.toFixed(0),
    }));
    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
    XLSX.writeFile(wb, `Informe_Productividad_${periodLabel.replace(' ', '_')}.xlsx`);
    toast({ title: '📊 Excel exportado', description: periodLabel });
  }

  const yearOptions = useMemo(() => {
    const current = moment().year();
    const years = [];
    for (let y = current; y >= current - 3; y--) years.push({ value: y, label: String(y) });
    return years;
  }, []);

  if (profileLoading || loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  const stats = [
    { icon: Users, label: 'Empleados', value: totals.empleados, color: 'bg-blue-500/10 text-blue-400' },
    { icon: Clock, label: 'Horas totales', value: `${totals.horas.toFixed(1)}h`, color: 'bg-[hsl(35,92%,55%)]/10 text-[hsl(35,92%,55%)]' },
    { icon: TrendingUp, label: 'Horas extra', value: `${totals.extras.toFixed(1)}h`, color: 'bg-emerald-500/10 text-emerald-400' },
    { icon: Calendar, label: 'Días trabajados', value: totals.dias, color: 'bg-purple-500/10 text-purple-400' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Informes de Productividad"
        subtitle={isAdmin ? "Resumen mensual de horas trabajadas por empleado" : "Tu resumen mensual de horas trabajadas"}
        actions={!loading && (
          <div className="flex items-center gap-2">
            <Button onClick={() => window.print()} variant="outline" className="gap-2">
              <Printer size={18} /> Imprimir
            </Button>
            {isAdmin && (
              <Button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Download size={18} /> Exportar Excel
              </Button>
            )}
          </div>
        )}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1.5 block">Mes</label>
          <ResponsiveSelect
            value={month}
            onValueChange={v => setMonth(Number(v))}
            options={MONTHS.map(m => ({ value: m.value, label: m.label }))}
            className="bg-secondary border-border"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1.5 block">Año</label>
          <ResponsiveSelect
            value={year}
            onValueChange={v => setYear(Number(v))}
            options={yearOptions}
            className="bg-secondary border-border"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold truncate">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {isAdmin ? 'Detalle por empleado' : 'Mi detalle'} · <span className="text-foreground">{periodLabel}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {rows.length} resultado{rows.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div id="print-area">
        <ResumenMensual rows={rows} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} onVerVidaLaboral={setVidaLaboralEmp} onVerSalarial={setSalarialEmp} />
        <FirmaSeccion
          signerName={employee?.full_name}
          role={isAdmin ? 'administrador' : (employee?.role || 'operario')}
          periodLabel={periodLabel}
        />
      </div>

      <VidaLaboral
        employee={vidaLaboralEmp}
        entries={entries}
        open={!!vidaLaboralEmp}
        onOpenChange={(v) => !v && setVidaLaboralEmp(null)}
      />

      <HistorialSalarial
        employee={salarialEmp}
        payrolls={payrolls}
        open={!!salarialEmp}
        onOpenChange={(v) => !v && setSalarialEmp(null)}
      />
    </div>
  );
}