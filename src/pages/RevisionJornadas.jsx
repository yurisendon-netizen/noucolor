import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

export default function RevisionJornadas() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await base44.entities.TimeEntry.list('-date', 200);
        setEntries(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const columns = [
    { key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'clock_in', label: 'Entrada', render: r => moment(r.clock_in).format('HH:mm') },
    { key: 'clock_out', label: 'Salida', render: r => r.clock_out ? moment(r.clock_out).format('HH:mm') : '—' },
    { key: 'total_hours', label: 'Horas', render: r => r.total_hours ? `${r.total_hours}h` : '—' },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Revisión de Jornadas" subtitle="Historial completo de fichajes de todos los empleados" />
      <DataTable
        data={entries}
        columns={columns}
        searchField={['employee_name', 'date']}
        filterField="status"
        filterOptions={[
          { value: 'abierto', label: 'Abierto' },
          { value: 'cerrado', label: 'Cerrado' },
        ]}
        emptyMessage="No hay fichajes registrados"
      />
    </div>
  );
}