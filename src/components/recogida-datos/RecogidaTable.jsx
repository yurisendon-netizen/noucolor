import React, { useState, useMemo } from 'react';
import { Search, Edit2, Trash2, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import moment from 'moment';

const puestoStyles = {
  operario: 'bg-blue-500/10 text-blue-400',
  administrador: 'bg-[hsl(35,92%,55%)]/10 text-[hsl(35,92%,55%)]',
  jefe: 'bg-red-500/10 text-red-400',
};
const puestoLabels = { operario: 'Operario', administrador: 'Administrador', jefe: 'Jefe' };

export default function RecogidaTable({ workers, selected, onToggle, onToggleAll, onEdit, onDelete }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return workers;
    const s = search.toLowerCase();
    return workers.filter(w =>
      [w.full_name, w.email, w.phone, w.dni, w.cass, w.iban, w.user, w.cargo].some(v =>
        String(v || '').toLowerCase().includes(s)
      )
    );
  }, [workers, search]);

  const allSelected = filtered.length > 0 && filtered.every(w => selected.has(w.id));
  const someSelected = filtered.some(w => selected.has(w.id));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, DNI, correo, CASS, IBAN, usuario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border"
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={() => onToggleAll(filtered)}
                    className="w-4 h-4 rounded accent-[hsl(35,92%,55%)] cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre completo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Correo electrónico</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teléfono</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">DNI / Pasaporte</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarjeta CASS</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">IBAN</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contraseña</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Puesto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha incorporación</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                    <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                    {search ? 'Sin resultados para la búsqueda' : 'No hay trabajadores registrados todavía'}
                  </td>
                </tr>
              ) : (
                filtered.map(w => (
                  <tr key={w.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(w.id)}
                        onChange={() => onToggle(w.id)}
                        className="w-4 h-4 rounded accent-[hsl(35,92%,55%)] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{w.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{w.email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{w.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{w.dni || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{w.cass || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">{w.iban ? w.iban.substring(0, 8) + '…' + w.iban.slice(-4) : '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[hsl(35,92%,55%)]">{w.user || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{w.pass || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${puestoStyles[w.cargo] || puestoStyles.operario}`}>
                        {puestoLabels[w.cargo] || (w.cargo ? w.cargo.charAt(0).toUpperCase() + w.cargo.slice(1) : 'Operario')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{w.hire_date ? moment(w.hire_date).format('DD/MM/YYYY') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(w)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <Edit2 size={15} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(w)} className="h-8 w-8 text-red-400 hover:bg-red-500/10">
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          {selected.size > 0 && ` · ${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`}
        </p>
      )}
    </div>
  );
}