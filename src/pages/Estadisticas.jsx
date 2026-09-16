import React, { useState, useEffect, useMemo } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { Clock, CalendarClock, Timer, CalendarCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import moment from 'moment';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Colores corporativos Noucolor para esta página
const COLOR_MAROON = '#5a123e';
const COLOR_ORANGE = '#e6671a';

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function Estadisticas() {
  const { employee, loading } = useEmployeeProfile();
  const isAdmin = employee?.role === 'administrador' || employee?.role === 'jefe';
  const [entries, setEntries] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!employee) return;
    async function load() {
      try {
        const res = await authInvoke('trackTime', { operation: 'listAllEntries', limit: 500 });
        setEntries(res.data?.entries || []);
      } catch (e) { console.error(e); }
      finally { setDataLoading(false); }
    }
    load();
  }, [employee]);

  // Filtrar entradas del mes/año seleccionados
  const monthEntries = useMemo(() => {
    return entries.filter(e => {
      if (!e.date) return false;
      const d = moment(e.date);
      return d.month() === month && d.year() === year;
    });
  }, [entries, month, year]);

  // Agregación por empleado
  const perEmployee = useMemo(() => {
    const map = {};
    monthEntries.forEach(e => {
      const id = e.employee_id;
      if (!map[id]) {
        map[id] = {
          id,
          employee_name: e.employee_name,
          normales: 0,
          extra: 0,
          dias_fichados: 0,
          ausencias: 0,
        };
      }
      const normales = Number(e.total_hours) || 0;
      const extra = Number(e.overtime_hours) || 0;
      if (e.status === 'ausencia_injustificada') {
        map[id].ausencias += 1;
      } else {
        map[id].normales += normales;
        map[id].extra += extra;
        map[id].dias_fichados += 1;
      }
    });
    return Object.values(map).sort((a, b) => (b.normales + b.extra) - (a.normales + a.extra));
  }, [monthEntries]);

  // KPIs globales
  const kpis = useMemo(() => {
    let normales = 0, extra = 0, dias = 0;
    perEmployee.forEach(e => {
      normales += e.normales;
      extra += e.extra;
      dias += e.dias_fichados;
    });
    return {
      total: normales + extra,
      normales,
      extra,
      dias,
    };
  }, [perEmployee]);

  // Datos para el gráfico (nombre corto)
  const chartData = useMemo(() => {
    return perEmployee.map(e => ({
      name: e.employee_name.split(' ')[0],
      normales: parseFloat(e.normales.toFixed(2)),
      extra: parseFloat(e.extra.toFixed(2)),
    }));
  }, [perEmployee]);

  const columns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'total', label: 'Horas trabajadas', render: r => `${(r.normales + r.extra).toFixed(2)}h` },
    { key: 'normales', label: 'Horas normales', render: r => `${r.normales.toFixed(2)}h` },
    { key: 'extra', label: 'Horas extra', render: r => <span style={{ color: COLOR_ORANGE }} className="font-semibold">{r.extra.toFixed(2)}h</span> },
    { key: 'dias_fichados', label: 'Días fichados' },
    { key: 'ausencias', label: 'Ausencias', render: r => r.ausencias > 0 ? <span className="text-red-400 font-medium">{r.ausencias}</span> : '—' },
  ];

  if (loading || dataLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <PageHeader title="Informes" subtitle="Estadísticas" />
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No tienes permisos para ver esta página.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Informes"
        subtitle={`Estadísticas de ${MONTHS[month]} ${year}`}
        actions={
          <div className="flex gap-2">
            <ResponsiveSelect
              value={String(month)}
              onValueChange={v => setMonth(Number(v))}
              options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
              className="w-40 bg-secondary border-border"
            />
            <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-28 bg-secondary border-border" />
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={Clock} label="Horas trabajadas" value={`${kpis.total.toFixed(1)}h`} color="bg-[#5a123e]/15 text-[#5a123e] dark:text-[#d98ba6]" />
        <KpiCard icon={CalendarClock} label="Horas normales" value={`${kpis.normales.toFixed(1)}h`} color="bg-[#5a123e]/15 text-[#5a123e] dark:text-[#d98ba6]" />
        <KpiCard icon={Timer} label="Horas extra" value={`${kpis.extra.toFixed(1)}h`} color="bg-[#e6671a]/15 text-[#e6671a] dark:text-[#f0a06a]" />
        <KpiCard icon={CalendarCheck} label="Días fichados" value={kpis.dias} color="bg-[#e6671a]/15 text-[#e6671a] dark:text-[#f0a06a]" />
      </div>

      {/* Gráfico de barras agrupadas */}
      <div className="bg-card rounded-xl border border-border p-5 mb-8">
        <h3 className="font-semibold mb-4">Horas por empleado</h3>
        {chartData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">No hay datos para este período</div>
        ) : (
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.75rem',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="normales" name="Horas normales" fill={COLOR_MAROON} radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="extra" name="Horas extra" fill={COLOR_ORANGE} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabla detalle */}
      <div>
        <h3 className="font-semibold mb-4">Detalle por empleado</h3>
        <DataTable
          data={perEmployee}
          columns={columns}
          pageSize={50}
          searchField="employee_name"
          emptyMessage="No hay datos para este período"
        />
      </div>
    </div>
  );
}