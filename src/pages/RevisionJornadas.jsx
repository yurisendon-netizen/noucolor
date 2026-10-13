import React, { useState, useEffect } from 'react';
import { authInvoke } from '@/lib/authInvoke';
import { FileWarning } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
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
  const { employee } = useEmployeeProfile();
  const empId = employee?.id;
  const [entries, setEntries] = useState([]);
  const [incumplimientos, setIncumplimientos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empId) return;
    async function load() {
      try {
        const [eRes, iRes] = await Promise.all([
          authInvoke('trackTime', { operation: 'listAllEntries',  limit: 200 }),
          authInvoke('trackTime', { operation: 'listIncumplimientos',  limit: 200 }),
        ]);
        setEntries(eRes.data?.entries || []);
        setIncumplimientos(iRes.data?.incumplimientos || []);
        try {
          const hRes = await authInvoke('trackTime', { operation: 'listHistorialFichajes', limit: 500 });
          setHistorial(hRes.data?.historial || []);
        } catch { /* sin historial */ }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [empId]);

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
      await authInvoke('trackTime', { operation: 'amonestarIncumplimiento', incumplimientoId: inc.id });
      toast({ variant: 'success', title: 'Amonestación registrada', description: `Se ha marcado la amonestación para ${inc.employee_name}` });
      const iRes = await authInvoke('trackTime', { operation: 'listIncumplimientos', limit: 200 });
      setIncumplimientos(iRes.data?.incumplimientos || []);
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
    { key: 'status', label: 'Estado', render: r => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={r.status} />
        {r.auto_closed && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/15 text-amber-400 border-amber-500/20" title="No fichó la salida: cerrado a las 16:00 sin horas extra">Salida no fichada</span>}
        {r.opened_by_admin && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-500/15 text-blue-400 border-blue-500/20">Abierto por admin</span>}
        {r.corregido_por_solicitud && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-500/15 text-purple-400 border-purple-500/20">Corregido</span>}
      </div>
    ) },
  ];

  const ACTION_LABELS = {
    cierre_automatico: 'Cierre automático',
    apertura_admin: 'Apertura por admin',
    correccion_aprobada: 'Corrección aprobada',
    salida_fichada: 'Salida fichada',
    horas_extra_detectadas: 'Horas extra',
  };
  const fmtChange = (s) => {
    try {
      const o = JSON.parse(s || 'null');
      if (!o) return '—';
      const parts = [];
      if (o.clock_in) parts.push(`entrada ${moment(o.clock_in).format('HH:mm')}`);
      if (o.clock_out) parts.push(`salida ${moment(o.clock_out).format('HH:mm')}`);
      if (o.total_hours != null) parts.push(`${o.total_hours} h`);
      if (o.overtime_hours) parts.push(`+${o.overtime_hours} h ext.`);
      if (o.status) parts.push(o.status);
      return parts.join(' · ') || '—';
    } catch { return '—'; }
  };
  const histColumns = [
    { key: 'created_date', label: 'Cuándo', render: r => moment(r.created_date).format('DD/MM/YYYY HH:mm') },
    { key: 'employee_name', label: 'Trabajador', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'date', label: 'Día del fichaje', render: r => r.date ? moment(r.date).format('DD/MM/YYYY') : '—' },
    { key: 'action', label: 'Cambio', render: r => ACTION_LABELS[r.action] || r.action },
    { key: 'before', label: 'Antes', render: r => <span className="text-xs text-muted-foreground">{fmtChange(r.before)}</span> },
    { key: 'after', label: 'Después', render: r => <span className="text-xs">{fmtChange(r.after)}</span> },
    { key: 'changed_by_name', label: 'Por', render: r => r.changed_by_name || 'Sistema' },
    { key: 'motivo', label: 'Motivo', render: r => <span className="text-xs text-muted-foreground">{r.motivo || '—'}</span> },
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
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
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
          <TabsTrigger value="historial">Historial de cambios</TabsTrigger>
        </TabsList>
        <TabsContent value="fichajes" className="mt-4">
          <DataTable
            data={entries}
            columns={entryColumns}
            pageSize={50}
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
            pageSize={50}
            searchField={['employee_name', 'date']}
            filterField="type"
            filterOptions={[
              { value: 'entrada_tardia', label: 'Entrada tardía' },
              { value: 'sin_fichar', label: 'Sin fichar' },
            ]}
            emptyMessage="No hay incumplimientos registrados"
          />
        </TabsContent>
        <TabsContent value="historial" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Todo cambio sobre un fichaje queda registrado aquí (quién, cuándo, antes y después). Sirve de prueba ante Inspecció de Treball de que los registros no se han manipulado.
          </p>
          <DataTable
            data={historial}
            columns={histColumns}
            pageSize={50}
            searchField={['employee_name', 'date']}
            filterField="action"
            filterOptions={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
            emptyMessage="Todavía no hay cambios registrados"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}