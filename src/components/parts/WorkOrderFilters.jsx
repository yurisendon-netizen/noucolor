import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function WorkOrderFilters({ filters, onChange }) {
  const update = (key, value) => onChange({ ...filters, [key]: value });

  const hasActiveFilters = filters.employee || filters.client || filters.dateFrom || filters.dateTo;

  const clear = () => onChange({ employee: '', client: '', dateFrom: '', dateTo: '' });

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Empleado</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nombre del empleado"
              value={filters.employee}
              onChange={e => update('employee', e.target.value)}
              className="pl-9 bg-secondary border-border"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Cliente</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nombre del cliente"
              value={filters.client}
              onChange={e => update('client', e.target.value)}
              className="pl-9 bg-secondary border-border"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Desde</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={e => update('dateFrom', e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Hasta</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={e => update('dateTo', e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
      </div>
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground gap-1.5">
            <X size={14} /> Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}