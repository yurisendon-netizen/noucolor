import React, { useMemo } from 'react';
import { Inbox, FileText } from 'lucide-react';

export default function ResumenMensual({ rows, sortBy, sortDir, onSort, onVerVidaLaboral }) {
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [rows, sortBy, sortDir]);

  const Th = ({ field, label, align = 'left' }) => (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors text-${align} ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === field && (
          <span className="text-[hsl(35,92%,55%)]">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <Th field="employee_name" label="Empleado" />
              <Th field="dias_trabajados" label="Días" align="right" />
              <Th field="horas_regulares" label="Horas reg." align="right" />
              <Th field="overtime_hours" label="Horas extra" align="right" />
              <Th field="total_hours" label="Horas totales" align="right" />
              <Th field="ausencias" label="Ausencias" align="right" />
              <Th field="productividad" label="Productividad" align="right" />
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vida laboral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  No hay datos de fichajes para este periodo
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr key={r.employee_id || i} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">{r.employee_name}</td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">{r.dias_trabajados}</td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">{r.horas_regulares.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-sm text-right text-[hsl(35,92%,55%)] font-medium">{r.overtime_hours > 0 ? `${r.overtime_hours.toFixed(1)}h` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">{r.total_hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {r.ausencias > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">{r.ausencias}</span>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-[hsl(35,92%,55%)] rounded-full transition-all"
                          style={{ width: `${Math.min(100, r.productividad)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">{r.productividad.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onVerVidaLaboral(r)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,55%)]/10 transition-colors"
                    >
                      <FileText size={14} /> Ver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/50">
                <td className="px-4 py-3 text-sm font-bold">TOTAL ({sorted.length})</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{sorted.reduce((s, r) => s + r.dias_trabajados, 0)}</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{sorted.reduce((s, r) => s + r.horas_regulares, 0).toFixed(1)}h</td>
                <td className="px-4 py-3 text-sm text-right font-bold text-[hsl(35,92%,55%)]">{sorted.reduce((s, r) => s + r.overtime_hours, 0).toFixed(1)}h</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{sorted.reduce((s, r) => s + r.total_hours, 0).toFixed(1)}h</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{sorted.reduce((s, r) => s + r.ausencias, 0)}</td>
                <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}