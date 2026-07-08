import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, TrendingUp, AlertCircle, CalendarDays, Printer } from 'lucide-react';
import { PrintHeader, PrintFooter } from '@/components/informes/PrintBranding';
import moment from 'moment';

const statusStyles = {
  abierto: 'bg-blue-500/15 text-blue-400',
  cerrado: 'bg-emerald-500/15 text-emerald-400',
  ausencia_injustificada: 'bg-red-500/15 text-red-400',
};
const statusLabels = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  ausencia_injustificada: 'Ausencia',
};

export default function VidaLaboral({ employee, entries, open, onOpenChange }) {
  const history = useMemo(() => {
    if (!employee) return [];
    return entries
      .filter(e => (e.employee_id || e.employee_name) === employee.employee_id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [employee, entries]);

  const summary = useMemo(() => {
    if (history.length === 0) return null;
    const totalHours = history.reduce((s, e) => s + (Number(e.total_hours) || 0), 0);
    const overtime = history.reduce((s, e) => s + (Number(e.overtime_hours) || 0), 0);
    const regular = Math.max(0, totalHours - overtime);
    const daysWorked = history.filter(e => e.status !== 'ausencia_injustificada').length;
    const absences = history.filter(e => e.status === 'ausencia_injustificada').length;
    const dates = history.map(e => new Date(e.date)).sort((a, b) => a - b);
    return {
      totalHours,
      overtime,
      regular,
      daysWorked,
      absences,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      totalEntries: history.length,
    };
  }, [history]);

  const stats = summary ? [
    { icon: CalendarDays, label: 'Días trabajados', value: summary.daysWorked, color: 'bg-purple-500/10 text-purple-400' },
    { icon: Clock, label: 'Horas regulares', value: `${summary.regular.toFixed(1)}h`, color: 'bg-blue-500/10 text-blue-400' },
    { icon: TrendingUp, label: 'Horas extra', value: `${summary.overtime.toFixed(1)}h`, color: 'bg-[hsl(35,92%,55%)]/10 text-[hsl(35,92%,55%)]' },
    { icon: Clock, label: 'Horas totales', value: `${summary.totalHours.toFixed(1)}h`, color: 'bg-emerald-500/10 text-emerald-400' },
    { icon: AlertCircle, label: 'Ausencias', value: summary.absences, color: 'bg-red-500/10 text-red-400' },
    { icon: Calendar, label: 'Periodo', value: `${moment(summary.firstDate).format('DD/MM/YYYY')} - ${moment(summary.lastDate).format('DD/MM/YYYY')}`, color: 'bg-secondary text-foreground' },
  ] : [];

  function handlePrint() {
    document.body.classList.add('printing-modal');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-modal'), 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Vida laboral — {employee?.employee_name}</DialogTitle>
            {summary && (
              <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 shrink-0">
                <Printer size={16} /> Imprimir
              </Button>
            )}
          </div>
        </DialogHeader>

        {!summary ? (
          <p className="text-center text-muted-foreground py-8">No hay registros de fichajes.</p>
        ) : (
          <div id="vida-laboral-print">
            <PrintHeader title="Vida Laboral" periodLabel={employee?.employee_name || ''} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {stats.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[40vh]">
                <table className="w-full">
                  <thead className="sticky top-0">
                    <tr className="border-b border-border bg-secondary">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Fecha</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Entrada</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Salida</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Horas</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Extra</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map(e => (
                      <tr key={e.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-2.5 text-sm">{moment(e.date).format('DD/MM/YYYY')}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{e.clock_in ? moment(e.clock_in).format('HH:mm') : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{e.clock_out ? moment(e.clock_out).format('HH:mm') : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium">{Number(e.total_hours) ? `${Number(e.total_hours).toFixed(1)}h` : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-[hsl(35,92%,55%)]">{Number(e.overtime_hours) ? `${Number(e.overtime_hours).toFixed(1)}h` : '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[e.status] || ''}`}>
                            {statusLabels[e.status] || e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <PrintFooter />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}