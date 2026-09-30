import React from 'react';

export const COLOR_MAROON = '#5a123e';
export const COLOR_ORANGE = '#e6671a';

const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const eur = (v) => fmtEur.format(Number(v) || 0);
export const num = (v) => fmtNum.format(Number(v) || 0);
export const pct = (v) => (v === null || v === undefined ? '—' : `${fmtNum.format(v)} %`);

export const ESTADOS = [
  { value: 'presupuestada', label: 'Presupuestada', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
  { value: 'en_curso', label: 'En curso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  { value: 'finalizada', label: 'Finalizada', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  { value: 'facturada', label: 'Facturada', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  { value: 'cobrada', label: 'Cobrada', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
];

export const CATEGORIAS = [
  { value: 'material', label: 'Material' },
  { value: 'subcontrata', label: 'Subcontrata' },
  { value: 'desplazamiento', label: 'Desplazamiento' },
  { value: 'maquinaria', label: 'Maquinaria / alquiler' },
  { value: 'mano_obra_externa', label: 'Mano de obra externa' },
  { value: 'otros', label: 'Otros' },
];
export const catLabel = (v) => CATEGORIAS.find(c => c.value === v)?.label || 'Otros';

export function EstadoBadge({ estado }) {
  const e = ESTADOS.find(x => x.value === estado) || ESTADOS[1];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

export function profitClass(v) {
  if (v > 0) return 'text-emerald-500';
  if (v < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

export function KpiCard({ icon: Icon, label, value, hint, tone = 'maroon', valueClass = '' }) {
  const toneCls = tone === 'orange'
    ? 'bg-[#e6671a]/15 text-[#e6671a] dark:text-[#f0a06a]'
    : 'bg-[#5a123e]/15 text-[#5a123e] dark:text-[#d98ba6]';
  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5 min-w-0">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${toneCls}`}>
        <Icon size={20} />
      </div>
      <p className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${valueClass}`}>{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
      {hint && <p className="text-xs text-muted-foreground/80 mt-0.5">{hint}</p>}
    </div>
  );
}

// Normaliza texto para comparar nombres de obra / cliente de los partes.
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Número para CSV con coma decimal (Excel en español).
export const csvNum = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
