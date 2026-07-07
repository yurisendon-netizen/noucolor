import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

const TYPE_LABELS = {
  entrada_tardia: 'Entrada tardía',
  sin_fichar: 'Sin fichar',
};

export default function HistorialIncidencias({ month, year, isAdmin, employee, periodLabel }) {
  const [incidencias, setIncidencias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIncidencias();
  }, [month, year]);

  async function loadIncidencias() {
    setLoading(true);
    try {
      const data = await base44.entities.Incumplimiento.list('-date', 500);
      setIncidencias(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const periodIncidencias = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let filtered = incidencias.filter(i => i.date && i.date.startsWith(prefix));
    if (!isAdmin && employee) {
      filtered = filtered.filter(i => i.employee_id === employee.id);
    }
    return filtered.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [incidencias, month, year, isAdmin, employee]);

  const summary = useMemo(() => {
    const byType = { entrada_tardia: 0, sin_fichar: 0 };
    const byStatus = { pendiente: 0, amonestado: 0, resuelto: 0 };
    periodIncidencias.forEach(i => {
      if (byType[i.type] !== undefined) byType[i.type]++;
      if (byStatus[i.status] !== undefined) byStatus[i.status]++;
    });
    return { total: periodIncidencias.length, byType, byStatus };
  }, [periodIncidencias]);

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={18} className="text-amber-500" />
        <h3 className="text-sm font-semibold">Historial de incidencias</h3>
        <span className="ml-auto text-xs text-muted-foreground">{periodLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {isAdmin
          ? 'Registro de incidencias del periodo que pueden motivar ajustes salariales o anotaciones administrativas.'
          : 'Registro de tus incidencias del periodo que pueden motivar ajustes salariales o anotaciones administrativas.'}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : periodIncidencias.length === 0 ? (
        <div className="rounded-lg bg-secondary/50 p-4 text-center">
          <p className="text-sm text-muted-foreground italic">Sin incidencias registradas en este periodo.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-lg font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-lg font-bold text-amber-400">{summary.byType.entrada_tardia}</p>
              <p className="text-xs text-muted-foreground">Entradas tardías</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-lg font-bold text-red-400">{summary.byType.sin_fichar}</p>
              <p className="text-xs text-muted-foreground">Sin fichar</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{summary.byStatus.resuelto}</p>
              <p className="text-xs text-muted-foreground">Resueltas</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  {isAdmin && <th className="px-4 py-2 font-medium">Empleado</th>}
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Descripción</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periodIncidencias.map((inc) => (
                  <tr key={inc.id} className="hover:bg-secondary/30">
                    {isAdmin && <td className="px-4 py-2.5 font-medium">{inc.employee_name}</td>}
                    <td className="px-4 py-2.5 whitespace-nowrap">{moment(inc.date).format('DD/MM/YYYY')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${inc.type === 'sin_fichar' ? 'text-red-400' : 'text-amber-400'}`}>
                        {TYPE_LABELS[inc.type] || inc.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <p className="text-xs text-muted-foreground line-clamp-2">{inc.description || '—'}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={inc.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}