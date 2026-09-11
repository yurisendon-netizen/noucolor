import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';
import PullToRefresh from '@/components/shared/PullToRefresh';

export default function DataTable({
  data, columns, searchField, filterField, filterOptions,
  pageSize = 10, emptyMessage = 'No hay datos disponibles',
  actions, onRefresh
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = data || [];
    if (search && searchField) {
      const s = search.toLowerCase();
      result = result.filter(row => {
        const fields = Array.isArray(searchField) ? searchField : [searchField];
        return fields.some(f => String(row[f] || '').toLowerCase().includes(s));
      });
    }
    if (filter !== 'all' && filterField) {
      result = result.filter(row => row[filterField] === filter);
    }
    return result;
  }, [data, search, filter, searchField, filterField]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {searchField && (
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 bg-secondary border-border"
              />
            </div>
          )}
          {filterField && filterOptions && (
            <ResponsiveSelect
              value={filter}
              onValueChange={v => { setFilter(v); setPage(0); }}
              options={[{ value: 'all', label: 'Todos' }, ...filterOptions]}
              className="w-full sm:w-48 bg-secondary border-border"
            />
          )}
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                  {actions && <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-12 text-center text-muted-foreground">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  paged.map((row, i) => (
                    <tr key={row.id || i} className="hover:bg-secondary/30 transition-colors">
                      {columns.map(col => (
                        <td key={col.key} className="px-4 py-3 text-sm">
                          {col.render ? col.render(row) : row[col.key]}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {actions(row)}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-muted-foreground pt-2">
          <span className="font-medium">
            Mostrando {filtered.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} de {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors text-xs font-medium"
              >
                Primera
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 font-semibold text-foreground tabular-nums">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors text-xs font-medium"
              >
                Última
              </button>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}