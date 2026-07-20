import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';
import { Clock, FileText, Users, Receipt, TrendingUp, AlertCircle, FileWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';

function StatCard({ icon: Icon, label, value, color, to, badge }) {
  const content = (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5 active:scale-[0.98] hover:border-primary/30 transition-all duration-150 group h-full">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} />
        </div>
        <TrendingUp size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
      </div>
      <p className="text-2xl sm:text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
      {badge && (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full mt-2 ${badge.color}`}>
          {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {badge.label}
        </span>
      )}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function Dashboard() {
  const { employee, isAdmin, user } = useEmployeeProfile();
  const empId = employee?.id || user?.id;
  const [stats, setStats] = useState({ entries: 0, orders: 0, employees: 0, payrolls: 0, pending: 0, incumplimientos: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [warningEmployees, setWarningEmployees] = useState([]);
  const [todayClockStatus, setTodayClockStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empId) return;
    async function load() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [entriesCount, orders, employees, payrolls, incumplimientos, todayEntries] = await Promise.all([
          authInvoke('trackTime', { operation: 'countEntriesByDate', date: today }).then(r => r.data?.count || 0),
          base44.entities.WorkOrder.list('-created_date', 5),
          isAdmin ? base44.entities.Employee.filter({ is_active: true }) : Promise.resolve([]),
          isAdmin ? authInvoke('trackTime', { operation: 'listPayrolls', limit: 5 }).then(r => r.data?.payrolls || []) : Promise.resolve([]),
          isAdmin ? authInvoke('trackTime', { operation: 'listIncumplimientos', limit: 200 }).then(r => r.data?.incumplimientos || []) : Promise.resolve([]),
          employee?.role !== 'jefe' ? authInvoke('trackTime', { operation: 'listEntries', limit: 5 }).then(r => r.data?.entries || []) : Promise.resolve([]),
        ]);
        const pendingOrders = orders.filter(o => o.status === 'pendiente');
        const todayEntry = todayEntries.find(e => e.date === today);
        if (todayEntry?.status === 'abierto') setTodayClockStatus({ label: 'Jornada activa', color: 'bg-success/15 text-success', pulse: true });
        else if (todayEntry?.status === 'cerrado') setTodayClockStatus({ label: 'Jornada cerrada', color: 'bg-secondary text-muted-foreground' });
        else if (todayEntry?.status === 'ausencia_injustificada') setTodayClockStatus({ label: 'Falta hoy', color: 'bg-destructive/15 text-destructive' });
        else if (employee?.role !== 'jefe') setTodayClockStatus({ label: 'Sin fichar', color: 'bg-yellow-500/15 text-yellow-500' });

        const incCounts = {};
        incumplimientos.forEach(i => {
          if (!incCounts[i.employee_id]) incCounts[i.employee_id] = { name: i.employee_name, count: 0 };
          incCounts[i.employee_id].count++;
        });
        const warnings = Object.values(incCounts).filter(e => e.count >= 3);

        setStats({
          entries: entriesCount,
          orders: orders.length,
          employees: employees.length,
          payrolls: payrolls.length,
          pending: pendingOrders.length,
          incumplimientos: incumplimientos.length,
        });
        setRecentOrders(orders.slice(0, 5));
        setWarningEmployees(warnings);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAdmin, empId]);

  const displayName = (employee?.full_name || user?.full_name || 'Usuario').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`${greeting}, ${displayName}`}
        subtitle={isAdmin ? 'Panel de Administración — Noucolor' : 'Panel de Operario — Noucolor'}
      />

      {isAdmin && warningEmployees.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <FileWarning size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-400 mb-1">Amonestaciones pendientes</p>
            <p className="text-sm text-red-300/80">
              {warningEmployees.map(e => `${e.name} (${e.count})`).join(', ')} — 3+ incumplimientos registrados.
            </p>
          </div>
          <Link to="/revision-jornadas" className="text-sm text-red-400 hover:underline shrink-0 mt-0.5">Ver detalle</Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard icon={Clock} label="Fichajes Hoy" value={stats.entries} color="bg-blue-500/15 text-blue-400" to="/control-horario" badge={todayClockStatus} />
        <StatCard icon={FileText} label="Partes de Trabajo" value={stats.orders} color="bg-emerald-500/15 text-emerald-400" to="/partes-trabajo" />
        {isAdmin && <StatCard icon={Users} label="Empleados Activos" value={stats.employees} color="bg-purple-500/15 text-purple-400" to="/empleados" />}
        {isAdmin && <StatCard icon={Receipt} label="Nóminas" value={stats.payrolls} color="bg-primary/15 text-primary" to="/nominas" />}
        {isAdmin && stats.incumplimientos > 0 && <StatCard icon={AlertCircle} label="Incumplimientos" value={stats.incumplimientos} color="bg-red-500/15 text-red-400" to="/revision-jornadas" />}
        {!isAdmin && <StatCard icon={AlertCircle} label="Pendientes" value={stats.pending} color="bg-yellow-500/15 text-yellow-400" to="/partes-trabajo" />}
      </div>

      <div className="bg-card rounded-xl border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Últimos Partes de Trabajo</h2>
        </div>
        <div className="divide-y divide-border">
          {recentOrders.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">No hay partes recientes</div>
          ) : (
            recentOrders.map(order => (
              <div key={order.id} className="px-5 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">{order.title}</p>
                  <p className="text-xs text-muted-foreground">{order.client_name} · {order.date}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  order.status === 'completado' ? 'bg-emerald-500/15 text-emerald-400' :
                  order.status === 'en_progreso' ? 'bg-blue-500/15 text-blue-400' :
                  'bg-yellow-500/15 text-yellow-400'
                }`}>
                  {order.status === 'completado' ? 'Completado' : order.status === 'en_progreso' ? 'En Progreso' : 'Pendiente'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}