import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, FileWarning } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import moment from 'moment';

const typeLabels = {
  entrada_tardia: 'Entrada tardía',
  sin_fichar: 'Sin fichar',
};

const typeStyles = {
  entrada_tardia: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  sin_fichar: 'bg-red-500/15 text-red-400 border-red-500/20',
};

export default function RevisionJornadas() {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [incumplimientos, setIncumplimientos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [e, i] = await Promise.all([
          base44.entities.TimeEntry.list('-date', 200),
          base44.entities.Incumplimiento.list('-date', 200),
        ]);
        setEntries(e);
        setIncumplimientos(i);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const incumplimientoCounts = {};
  incumplimientos.forEach(i => {
    if (!incumplimientoCounts[i.employee_id]) {
      incumplimientoCounts[i.employee_id] = { name: i.employee_name, count: 0, items: [] };
    }
    incumplimientoCounts[i.employee_id].count++;
    incumplimientoCounts[i.employee_id].items.push(i);
  });
  const employeesWithWarnings = Object.values(incumplimientoCounts).filter(e => e.count >= 3);

  async function handleAmonestar(inc) {
    try {
      await base44.entities.Incumplimiento.update(inc.id, { status: 'amonestado' });
      toast({ title: 'Amonestación registrada', description: `Se ha marcado la amonestación para ${inc.employee_name}` });
      const i = await base44.entities.Incumplimiento.list('-date', 200);
      setIncumplimientos(i);
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  const entryColumns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'clock_in', label: 'Entrada', render: r => r.clock_in ? moment(r.clock_in).format('HH:mm') : '—' },
    { key: 'clock_out', label: 'Salida', render: r => r.clock_out ? moment(r.clock_out).format('HH:mm') : '—' },
    { key: 'total_hours', label: 'Horas', render: r => {
      if (!r.total_hours && r.total_hours !== 0) return '—';
      return r.overtime_hours ? `${r.total_hours}h + ${r.overtime_hours}h ext.` : `${r.total_hours}h`;
    }},
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  const incColumns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'type', label: 'Tipo', render: r => (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeStyles[r.type] || ''}`}>
        {typeLabels[r.type] || r.type}
      </span>
    )},
    { key: 'description', label: 'Descripción', render: r => <span className="text-sm text-muted-foreground">{r.description || '—'}</span> },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Revisión de Jornadas" subtitle="Historial de fichajes e incumplimientos disciplinarios" />

      {employeesWithWarnings.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileWarning size={20} className="text-red-400" />
            <h3 className="font-semibold text-red-400">Amonestaciones sugeridas (3+ incumplimientos)</h3>
          </div>
          <div className="space-y-2">
            {employeesWithWarnings.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-red-500/5 rounded-lg px-3 py-2">
                <span>{e.name} — <strong className="text-red-400">{e.count} incumplimientos</strong></span>
                <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleAmonestar(e.items[0])}>
                  Emitir amonestación escrita
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="fichajes">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="fichajes">Fichajes</TabsTrigger>
          <TabsTrigger value="incumplimientos">
            Incumplimientos
            {incumplimientos.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">{incumplimientos.length}</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fichajes" className="mt-4">
          <DataTable
            data={entries}
            columns={entryColumns}
            searchField={['employee_name', 'date']}
            filterField="status"
            filterOptions={[
              { value: 'abierto', label: 'Abierto' },
              { value: 'cerrado', label: 'Cerrado' },
              { value: 'ausencia_injustificada', label: 'Ausencia' },
            ]}
            emptyMessage="No hay fichajes registrados"
          />
        </TabsContent>
        <TabsContent value="incumplimientos" className="mt-4">
          <DataTable
            data={incumplimientos}
            columns={incColumns}
            searchField={['employee_name', 'date']}
            filterField="type"
            filterOptions={[
              { value: 'entrada_tardia', label: 'Entrada tardía' },
              { value: 'sin_fichar', label: 'Sin fichar' },
            ]}
            emptyMessage="No hay incumplimientos registrados"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}