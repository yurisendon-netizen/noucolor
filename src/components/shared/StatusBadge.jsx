import React from 'react';

const statusStyles = {
  pendiente: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  en_progreso: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  completado: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  aprobado: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  rechazado: 'bg-red-500/15 text-red-400 border-red-500/20',
  abierto: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  cerrado: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  borrador: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  emitida: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  pagada: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  baja: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  media: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  alta: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const labels = {
  pendiente: 'Pendiente', en_progreso: 'En Progreso', completado: 'Completado',
  aprobado: 'Aprobado', rechazado: 'Rechazado', abierto: 'Abierto', cerrado: 'Cerrado',
  borrador: 'Borrador', emitida: 'Emitida', pagada: 'Pagada',
  baja: 'Baja', media: 'Media', alta: 'Alta',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyles[status] || 'bg-secondary text-muted-foreground border-border'}`}>
      {labels[status] || status}
    </span>
  );
}