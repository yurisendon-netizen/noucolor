import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet, Euro, TrendingUp, Receipt, Calendar, Printer, Inbox } from 'lucide-react';
import { PrintHeader, PrintFooter } from '@/components/informes/PrintBranding';
import moment from 'moment';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const statusStyles = {
  borrador: 'bg-secondary text-muted-foreground',
  emitida: 'bg-blue-500/15 text-blue-400',
  pagada: 'bg-emerald-500/15 text-emerald-400',
};
const statusLabels = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  pagada: 'Pagada',
};

function eur(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function HistorialSalarial({ employee, payrolls, open, onOpenChange }) {
  const history = useMemo(() => {
    if (!employee) return [];
    return payrolls
      .filter(p => (p.employee_id || p.employee_name) === employee.employee_id)
      .sort((a, b) => {
        if (b.period_year !== a.period_year) return b.period_year - a.period_year;
        return b.period_month - a.period_month;
      });
  }, [employee, payrolls]);

  const summary = useMemo(() => {
    if (history.length === 0) return null;
    const base = history.reduce((s, p) => s + (Number(p.base_salary) || 0), 0);
    const overtimePay = history.reduce((s, p) => s + (Number(p.overtime_pay) || 0), 0);
    const overtimeHours = history.reduce((s, p) => s + (Number(p.overtime_hours) || 0), 0);
    const bonus = history.reduce((s, p) => s + (Number(p.bonus) || 0), 0);
    const gross = history.reduce((s, p) => s + (Number(p.gross_salary) || 0), 0);
    const net = history.reduce((s, p) => s + (Number(p.net_salary) || 0), 0);
    return { base, overtimePay, overtimeHours, bonus, gross, net, count: history.length };
  }, [history]);

  const stats = summary ? [
    { icon: Calendar, label: 'Nóminas', value: summary.count, color: 'bg-purple-500/10 text-purple-400' },
    { icon: Wallet, label: 'Salario base', value: eur(summary.base), color: 'bg-blue-500/10 text-blue-400' },
    { icon: TrendingUp, label: 'Horas extra', value: `${summary.overtimeHours.toFixed(1)}h · ${eur(summary.overtimePay)}`, color: 'bg-[hsl(35,92%,55%)]/10 text-[hsl(35,92%,55%)]' },
    { icon: Euro, label: 'Bonus', value: eur(summary.bonus), color: 'bg-emerald-500/10 text-emerald-400' },
    { icon: Receipt, label: 'Bruto total', value: eur(summary.gross), color: 'bg-secondary text-foreground' },
    { icon: Wallet, label: 'Neto total', value: eur(summary.net), color: 'bg-emerald-500/15 text-emerald-400' },
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
            <DialogTitle>Historial salarial — {employee?.employee_name}</DialogTitle>
            {summary && (
              <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 shrink-0">
                <Printer size={16} /> Imprimir
              </Button>
            )}
          </div>
        </DialogHeader>

        {!summary ? (
          <p className="text-center text-muted-foreground py-8">No hay registros de nóminas para este empleado.</p>
        ) : (
          <div id="vida-laboral-print">
            <PrintHeader title="Historial Salarial" periodLabel={employee?.employee_name || ''} />
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
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Periodo</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Salario base</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">H. extra</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Extra (€)</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Bonus</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Bruto</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Neto</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map(p => (
                      <tr key={p.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-2.5 text-sm font-medium">{MONTHS[p.period_month] || '—'} {p.period_year}</td>
                        <td className="px-4 py-2.5 text-sm text-right">{eur(p.base_salary)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-[hsl(35,92%,55%)]">{Number(p.overtime_hours) ? `${Number(p.overtime_hours).toFixed(1)}h` : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-[hsl(35,92%,55%)]">{Number(p.overtime_pay) ? eur(p.overtime_pay) : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right">{Number(p.bonus) ? eur(p.bonus) : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium">{eur(p.gross_salary)}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-bold">{eur(p.net_salary)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[p.status] || ''}`}>
                            {statusLabels[p.status] || p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/50">
                      <td className="px-4 py-3 text-sm font-bold">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{eur(summary.base)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-[hsl(35,92%,55%)]">{summary.overtimeHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-[hsl(35,92%,55%)]">{eur(summary.overtimePay)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{eur(summary.bonus)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{eur(summary.gross)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{eur(summary.net)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
              <Inbox size={12} />
              Registro completo de nóminas: salario base, horas extra, bonus y deducciones por periodo.
            </p>
            <PrintFooter />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}