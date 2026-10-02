// Registro mensual de días fichados: convierte los datos del mes en una
// cuadrícula trabajador × día con totales.

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export const monthLabel = (month) => {
  const [y, m] = String(month).split('-');
  return `${MESES[Number(m) - 1] || m} ${y}`;
};

// Códigos de cada día
export const CODES = {
  F: { label: 'Fichado', bg: '#16a34a', fg: '#ffffff', rgb: [22, 163, 74] },
  X: { label: 'Falta / sin fichar', bg: '#dc2626', fg: '#ffffff', rgb: [220, 38, 38] },
  B: { label: 'Baja médica', bg: '#7c3aed', fg: '#ffffff', rgb: [124, 58, 237] },
  V: { label: 'Vacaciones', bg: '#2563eb', fg: '#ffffff', rgb: [37, 99, 235] },
  P: { label: 'Permiso / otro justificado', bg: '#0d9488', fg: '#ffffff', rgb: [13, 148, 136] },
  S: { label: 'Sin registro (laborable)', bg: '#f59e0b', fg: '#111111', rgb: [245, 158, 11] },
};

const JUST_CODE = { baja_medica: 'B', vacaciones: 'V', permiso_personal: 'P', otro: 'P' };
const JUST_LABEL = { baja_medica: 'Baja médica', vacaciones: 'Vacaciones', permiso_personal: 'Permiso personal', otro: 'Justificado' };

export const hhmm = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Andorra' });
  } catch {
    return '—';
  }
};

export const fH = (h) => {
  const n = Math.round((Number(h) || 0) * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace('.', ',');
};

export const fDate = (d) => {
  const [y, m, dd] = String(d || '').split('-');
  return dd ? `${dd}/${m}/${y}` : '—';
};

export function todayAndorra() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => parts.find(p => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function buildRegistro(data) {
  const month = data.month;
  const [y, m] = month.split('-').map(Number);
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayAndorra();

  const days = Array.from({ length: nDays }, (_, i) => {
    const d = i + 1;
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { d, date, dow, weekend: dow === 0 || dow === 6, future: date > today };
  });

  const rows = data.employees.map((emp) => {
    const myEntries = data.entries.filter(e => e.employee_id === emp.id);
    const myJusts = data.justificantes.filter(j => j.employee_id === emp.id);
    const myIncs = data.incumplimientos.filter(i => i.employee_id === emp.id);

    const cells = {};
    const detalle = [];
    const t = { fichados: 0, horas: 0, extras: 0, faltas: 0, sinRegistro: 0, B: 0, V: 0, P: 0, tardes: 0 };

    for (const day of days) {
      const es = myEntries.filter(e => e.date === day.date);
      const ok = es.filter(e => e.status !== 'ausencia_injustificada');
      const just = myJusts.find(j => j.date_from <= day.date && j.date_to >= day.date);
      const incs = myIncs.filter(i => i.date === day.date);
      const tarde = incs.some(i => i.type === 'entrada_tardia');
      let cell = null;

      if (ok.length > 0) {
        const horas = ok.reduce((s, e) => s + (Number(e.total_hours) || 0), 0);
        const extras = ok.reduce((s, e) => s + (Number(e.overtime_hours) || 0), 0);
        const first = ok[0];
        const notas = [];
        if (ok.some(e => e.status === 'abierto')) notas.push('Jornada abierta');
        if (ok.some(e => e.auto_closed)) notas.push('Cierre automático');
        if (ok.some(e => e.opened_by_admin)) notas.push('Abierto por admin');
        if (tarde) notas.push('Entrada tarde');
        cell = { code: 'F', horas, extras, title: `${hhmm(first.clock_in)}–${hhmm(ok[ok.length - 1].clock_out)} · ${fH(horas)} h${extras ? ` (+${fH(extras)} extra)` : ''}` };
        t.fichados += 1;
        t.horas += horas;
        t.extras += extras;
        if (tarde) t.tardes += 1;
        detalle.push({
          date: day.date, tipo: 'Fichado',
          entrada: hhmm(first.clock_in), salida: hhmm(ok[ok.length - 1].clock_out),
          horas, extras, notas: notas.join(', '),
        });
      } else if (just) {
        const code = JUST_CODE[just.type] || 'P';
        cell = { code, title: `${JUST_LABEL[just.type] || 'Justificado'}${just.reason ? ` · ${just.reason}` : ''}` };
        if (!day.weekend) {
          t[code] += 1;
          detalle.push({ date: day.date, tipo: JUST_LABEL[just.type] || 'Justificado', entrada: '—', salida: '—', horas: 0, extras: 0, notas: just.reason || '' });
        } else {
          cell = null;
        }
      } else if (es.length > 0 || incs.some(i => i.type === 'sin_fichar')) {
        cell = { code: 'X', title: 'Falta / no fichó' };
        t.faltas += 1;
        detalle.push({ date: day.date, tipo: 'Falta', entrada: '—', salida: '—', horas: 0, extras: 0, notas: (incs.find(i => i.type === 'sin_fichar')?.description) || 'Sin fichar' });
      } else if (!day.weekend && !day.future && day.date < today) {
        cell = { code: 'S', title: 'Laborable sin ningún registro' };
        t.sinRegistro += 1;
      }
      if (cell) cells[day.date] = cell;
    }
    t.horas = Math.round(t.horas * 100) / 100;
    t.extras = Math.round(t.extras * 100) / 100;
    return { emp, cells, detalle, totals: t };
  });

  const laborables = days.filter(d => !d.weekend).length;
  return { month, days, rows, laborables };
}
