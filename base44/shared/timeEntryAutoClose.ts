// Cierre automático de fichajes abiertos — usado tanto por la operación manual
// trackTime/autoCloseAll (Test Function desde Base44 Studio) como por el cron
// diario en autoCloseTimeEntries (lógica duplicada allí: mantener ambas iguales).
//
// Reglas (Llei 31/2018, art. 59 — el compte d'hores debe reflejar la realidad):
// - Solo se cierran fichajes de días anteriores o, del día de hoy, a partir de
//   las 21:00 hora de Andorra. Así quien hace horas extra puede fichar su
//   salida real y no se le borran las horas.
// - La salida se pone a las 16:00 (fin del horario ordinario), SIN horas extra,
//   y el fichaje queda marcado auto_closed = "salida no fichada". Queda en el
//   historial de cambios y en el compte d'hores mensual que firma el trabajador.
// - Hora de Andorra calculada con horario de verano/invierno (no offset fijo).

export const AUTO_CLOSE_FROM_HOUR = 21;

export function andorraOffsetMinutes(instant) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Andorra', timeZoneName: 'longOffset'
    }).formatToParts(instant);
    const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+00:00';
    const m = tz.match(/([+-])(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  } catch { return 60; }
}

// Hora "de pared" de Andorra (YYYY-MM-DD + HH:mm) → Date UTC.
export function andorraLocalToUtc(dateStr, timeStr) {
  const hhmm = String(timeStr).padStart(5, '0');
  const naive = new Date(`${dateStr}T${hhmm}:00.000Z`);
  const offset = andorraOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60000);
}

export function andorraNowParts(now = new Date()) {
  const shifted = new Date(now.getTime() + andorraOffsetMinutes(now) * 60000);
  return {
    dateStr: shifted.toISOString().split('T')[0],
    hour: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

async function deactivateLocation(base44, empId) {
  try {
    const locs = await base44.asServiceRole.entities.EmployeeLocation.filter({ employee_id: empId });
    for (const l of locs) {
      await base44.asServiceRole.entities.EmployeeLocation.update(l.id, {
        is_active: false, last_update: new Date().toISOString()
      });
    }
  } catch { /* silent */ }
}

async function logHistorial(base44, data) {
  try {
    await base44.asServiceRole.entities.FichajeHistorial.create(data);
  } catch (e) { console.error('FichajeHistorial', e?.message); }
}

// ¿Se puede cerrar ya este fichaje? (día anterior, o hoy a partir de las 21:00)
export function canAutoClose(entry, now = new Date()) {
  const { dateStr, hour } = andorraNowParts(now);
  if (entry.date < dateStr) return true;
  return entry.date === dateStr && hour >= AUTO_CLOSE_FROM_HOUR;
}

// Cierra un único fichaje abierto usando la FECHA REAL del fichaje (no la de hoy)
export async function autoCloseEntry(base44, entry, closedBy = null) {
  const clockIn = new Date(entry.clock_in);
  const clockOut = andorraLocalToUtc(entry.date, '16:00');

  let totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  totalHours = Math.min(Math.max(totalHours, 0), 8);

  await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
    clock_out: clockOut.toISOString(),
    total_hours: parseFloat(totalHours.toFixed(2)),
    overtime_hours: 0,
    status: 'cerrado',
    auto_closed: true
  });
  await logHistorial(base44, {
    entry_id: entry.id, employee_id: entry.employee_id, employee_name: entry.employee_name,
    date: entry.date, action: 'cierre_automatico',
    changed_by_id: closedBy?.id || '', changed_by_name: closedBy?.name || 'Sistema',
    before: JSON.stringify({ clock_in: entry.clock_in, clock_out: null, status: entry.status }),
    after: JSON.stringify({ clock_out: clockOut.toISOString(), total_hours: parseFloat(totalHours.toFixed(2)), status: 'cerrado' }),
    motivo: 'Salida no fichada: se cierra a las 16:00 (horario ordinario), sin horas extra'
  });
  await deactivateLocation(base44, entry.employee_id);
}

export async function autoCloseAllOpenEntries(base44, now = new Date()) {
  const openEntries = await base44.asServiceRole.entities.TimeEntry.filter({ status: 'abierto' });
  let closed = 0;
  for (const entry of openEntries) {
    if (!canAutoClose(entry, now)) continue;
    try {
      await autoCloseEntry(base44, entry);
      closed++;
    } catch (e) {
      console.error(`Error cerrando fichaje ${entry.id}:`, e.message);
    }
  }
  return closed;
}
