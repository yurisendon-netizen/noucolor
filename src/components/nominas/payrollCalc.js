// Cálculo de nóminas según la Llei 31/2018 de relacions laborals (Andorra).
//
// Regla de Noucolor (no cambia lo que cobra el trabajador):
//   NETO a cobrar = salario neto de la ficha + horas extra × precio hora extra (neto)
//                 + bonificaciones (netas) − otras deducciones
//
// Lo que cambia es CÓMO se declara (art. 71 y 77.3): las horas extra y las
// bonificaciones son salario, así que van en BRUTO en el butlletí y cotizan a la
// CASS. El bruto se calcula "hacia atrás" para que el neto quede igual:
//   bruto extras = neto extras / (1 − 6,5 %)
// La empresa paga además su parte de CASS (15,5 %) sobre todo el bruto.

export const CASS_WORKER = 0.065;
export const CASS_EMPLOYER = 0.155;
export const OVERTIME_MIN_INCREASE = 1.4; // art. 58.2: mínimo +40 % sobre el salario fijo

// Límites de horas extra (art. 57.2)
export const OT_LIMIT_WEEK = 12;
export const OT_LIMIT_MONTH = 48;
export const OT_LIMIT_YEAR = 426;

// Salario mínimo interprofesional mensual (jornada completa). Añadir arriba
// cada nueva subida que publique el Govern (mínimo una vez al año).
const SMI_TABLE = [
  { from: '2026-07', monthly: 1568.67 },
  { from: '2026-01', monthly: 1525.33 },
];

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function smiFor(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const row = SMI_TABLE.find(s => key >= s.from);
  return row ? row.monthly : null;
}

// Precio hora "normal" en bruto (art. 76.2): salario mensual × 12 / 52 / 40
export const hourlyGross = (baseSalary) => r2((Number(baseSalary) || 0) * 12 / 52 / 40);

export function computePayroll(emp, overtimeHours, bonusNet = 0, otherDeductions = 0) {
  const base = r2(emp.base_salary);
  const baseNet = r2(emp.net_salary);
  const cassBase = r2(base - baseNet);

  const hours = r2(overtimeHours);
  const extraPriceNet = r2(emp.precioHoraExtra);
  const overtimeNet = r2(hours * extraPriceNet);
  const overtimeGross = r2(overtimeNet / (1 - CASS_WORKER));
  const cassOvertime = r2(overtimeGross - overtimeNet);

  const bonusN = r2(bonusNet);
  const bonusGross = r2(bonusN / (1 - CASS_WORKER));
  const cassBonus = r2(bonusGross - bonusN);

  const gross = r2(base + overtimeGross + bonusGross);
  const cassEmployee = r2(cassBase + cassOvertime + cassBonus);
  const cassEmployer = r2(gross * CASS_EMPLOYER);
  const net = r2(baseNet + overtimeNet + bonusN - r2(otherDeductions));

  const hourly = hourlyGross(base);
  const extraPriceGross = r2(extraPriceNet / (1 - CASS_WORKER));
  const minExtraGross = r2(hourly * OVERTIME_MIN_INCREASE);
  const minExtraNet = r2(minExtraGross * (1 - CASS_WORKER));

  return {
    base, baseNet, cassBase, hours,
    extraPriceNet, extraPriceGross, overtimeNet, overtimeGross,
    bonusNet: bonusN, bonusGross,
    gross, cassEmployee, cassEmployer, net,
    hourly, minExtraGross, minExtraNet,
  };
}

// Comprobaciones legales antes de emitir la nómina.
// errors = no se puede generar; warnings = se avisa al admin.
export function checkPayroll(p, { year, month, overtimeHours }) {
  const errors = [];
  const warnings = [];

  const smi = smiFor(year, month);
  if (smi && p.base < smi) {
    errors.push(`El salario bruto (${p.base.toFixed(2)} €) está por debajo del salario mínimo (${smi.toFixed(2)} €/mes). Si es a tiempo parcial, revísalo con el gestor.`);
  }
  if (overtimeHours > 0 && p.extraPriceNet > 0 && p.extraPriceGross + 0.005 < p.minExtraGross) {
    errors.push(`El precio de la hora extra es demasiado bajo: la ley obliga a pagarla como mínimo un 40 % más que la hora normal (${p.minExtraGross.toFixed(2)} € brutos = ${p.minExtraNet.toFixed(2)} € netos/hora). Súbelo en la ficha del trabajador.`);
  }
  const expectedCass = r2(p.base * CASS_WORKER);
  if (p.base > 0 && Math.abs(p.cassBase - expectedCass) > 1) {
    warnings.push(`La diferencia entre bruto y neto de la ficha (${p.cassBase.toFixed(2)} €) no es el 6,5 % de CASS (${expectedCass.toFixed(2)} €). Revisa el bruto/neto con el gestor.`);
  }
  return { errors, warnings };
}

const isoWeekKey = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const isWeekend = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
};

// Horas extra por día: SOLO las aprobadas por un admin en Horas Extras
// (laborables y fines de semana). Lo que no se aprueba no se paga.
export function overtimeByDay(entries, approvedOvertime) {
  const map = {};
  for (const o of approvedOvertime) {
    if (o.status && o.status !== 'aprobado') continue;
    map[o.date] = (map[o.date] || 0) + (Number(o.duration) || 0);
  }
  return map;
}

// Límites de horas extra (12/semana, 48/mes, 426/año) y descanso semanal (art. 61).
export function checkLimits(entries, approvedOvertime, year, month) {
  const warnings = [];
  const byDay = overtimeByDay(entries, approvedOvertime);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const weeks = {};
  let monthTotal = 0;
  let yearTotal = 0;
  for (const [date, h] of Object.entries(byDay)) {
    if (date.startsWith(`${year}-`) && date.slice(0, 7) <= monthKey) yearTotal += h;
    if (date.startsWith(monthKey)) {
      monthTotal += h;
      const wk = isoWeekKey(date);
      weeks[wk] = (weeks[wk] || 0) + h;
    }
  }
  for (const [wk, h] of Object.entries(weeks)) {
    if (h > OT_LIMIT_WEEK) warnings.push(`Semana ${wk.split('-W')[1]}: ${r2(h)} h extra (máximo legal ${OT_LIMIT_WEEK} h/semana).`);
  }
  if (monthTotal > OT_LIMIT_MONTH) warnings.push(`Mes: ${r2(monthTotal)} h extra (máximo legal ${OT_LIMIT_MONTH} h/mes).`);
  if (yearTotal > OT_LIMIT_YEAR) warnings.push(`Año: ${r2(yearTotal)} h extra acumuladas (máximo legal ${OT_LIMIT_YEAR} h/año).`);

  // 7 o más días seguidos trabajados = sin el día de descanso semanal obligatorio.
  const worked = [...new Set(entries.filter(e => e.status !== 'ausencia_injustificada').map(e => e.date))].sort();
  let streak = 0; let prev = null; let maxStreak = 0; let streakEnd = null;
  for (const d of worked) {
    if (prev) {
      const diff = (Date.UTC(...d.split('-').map((n, i) => i === 1 ? n - 1 : +n)) - Date.UTC(...prev.split('-').map((n, i) => i === 1 ? n - 1 : +n))) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else streak = 1;
    if (streak > maxStreak) { maxStreak = streak; streakEnd = d; }
    prev = d;
  }
  if (maxStreak >= 7 && streakEnd && streakEnd.startsWith(monthKey)) {
    warnings.push(`Ha trabajado ${maxStreak} días seguidos (hasta el ${streakEnd.split('-').reverse().join('/')}): la ley obliga a un día entero de descanso semanal.`);
  }
  return { warnings, monthTotal: r2(monthTotal), yearTotal: r2(yearTotal) };
}
