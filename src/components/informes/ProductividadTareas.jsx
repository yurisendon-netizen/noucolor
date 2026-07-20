import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Inbox, CheckCircle2 } from 'lucide-react';

const PRIORITY_LABELS = {
  alta: { label: 'Alta', color: 'bg-red-500/15 text-red-400' },
  media: { label: 'Media', color: 'bg-yellow-500/15 text-yellow-400' },
  baja: { label: 'Baja', color: 'bg-blue-500/15 text-blue-400' },
};

export default function ProductividadTareas({ month, year, isAdmin, employee, periodLabel }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, [month, year]);

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await base44.entities.WorkOrder.list('-date', 1000);
      setOrders(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const rows = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let periodOrders = data_filter(orders, prefix);
    if (!isAdmin && employee) {
      periodOrders = periodOrders.filter(o => o.assigned_to === employee.id);
    }
    const completed = periodOrders.filter(o => o.status === 'completado');

    const grouped = {};
    completed.forEach(o => {
      const id = o.assigned_to || o.assigned_name || 'sin_asignar';
      if (!grouped[id]) {
        grouped[id] = {
          employee_name: o.assigned_name || 'Sin asignar',
          total: 0,
          alta: 0,
          media: 0,
          baja: 0,
          clients: new Set(),
        };
      }
      grouped[id].total += 1;
      if (PRIORITY_LABELS[o.priority]) grouped[id][o.priority] += 1;
      if (o.client_name) grouped[id].clients.add(o.client_name);
    });

    return Object.values(grouped)
      .map(r => ({
        ...r,
        clients: r.clients.size,
      }))
      .sort((a, b) => b.total - a.total);
  }, [orders, month, year, isAdmin, employee]);

  function data_filter(list, prefix) {
    return list.filter(o => o.date && o.date.startsWith(prefix));
  }

  const totals = useMemo(() => ({
    empleados: rows.length,
    tareas: rows.reduce((s, r) => s + r.total, 0),
    alta: rows.reduce((s, r) => s + r.alta, 0),
    media: rows.reduce((s, r) => s + r.media, 0),
    baja: rows.reduce((s, r) => s + r.baja, 0),
    clientes: rows.reduce((s, r) => s + r.clients, 0),
  }), [rows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center min-h-32">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <h3 className="text-sm font-semibold">Productividad por Tareas Completadas</h3>
          </div>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border">
        <div className="bg-card p-4 text-center">
          <p className="text-2xl font-bold">{totals.empleados}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Empleados</p>
        </div>
        <div className="bg-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{totals.tareas}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tareas completadas</p>
        </div>
        <div className="bg-card p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{totals.alta}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Prioridad alta</p>
        </div>
        <div className="bg-card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{totals.media}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Prioridad media</p>
        </div>
        <div className="bg-card p-4 text-center col-span-2 sm:col-span-1">
          <p className="text-2xl font-bold text-blue-400">{totals.clientes}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Clientes atendidos</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empleado</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completadas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alta</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Media</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Baja</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clientes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  No hay tareas completadas en este periodo
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const maxTotal = Math.max(...rows.map(x => x.total));
                return (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{r.employee_name}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${maxTotal > 0 ? (r.total / maxTotal) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="font-bold">{r.total}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {r.alta > 0 ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">{r.alta}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {r.media > 0 ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400">{r.media}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {r.baja > 0 ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">{r.baja}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{r.clients}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}