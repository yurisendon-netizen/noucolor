import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { runCronTracked } from '../../shared/cronMonitor.ts';

// Cierre automático de fichajes abiertos — misma lógica que
// shared/timeEntryAutoClose.ts (usada por trackTime/autoCloseAll), duplicada
// aquí porque las funciones con automatización programada (ver
// function.jsonc) no pueden importar archivos fuera de su propia carpeta.
//
// Reglas (Llei 31/2018, art. 59 — el compte d'hores debe reflejar la realidad):
// - Solo se cierran fichajes de días anteriores o, del día de hoy, a partir de
//   las 21:00 hora de Andorra (quien hace horas extra ficha su salida real).
// - Salida a las 16:00 sin horas extra, marcado auto_closed, y queda en el
//   historial de cambios (FichajeHistorial).
// - Hora de Andorra con horario de verano/invierno (no offset fijo).
const AUTO_CLOSE_FROM_HOUR = 21;

function andorraOffsetMinutes(instant) {
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

function andorraLocalToUtc(dateStr, timeStr) {
  const hhmm = String(timeStr).padStart(5, '0');
  const naive = new Date(`${dateStr}T${hhmm}:00.000Z`);
  const offset = andorraOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60000);
}

function andorraNowParts(now = new Date()) {
  const shifted = new Date(now.getTime() + andorraOffsetMinutes(now) * 60000);
  return { dateStr: shifted.toISOString().split('T')[0], hour: shifted.getUTCHours() };
}

function canAutoClose(entry, now = new Date()) {
  const { dateStr, hour } = andorraNowParts(now);
  if (entry.date < dateStr) return true;
  return entry.date === dateStr && hour >= AUTO_CLOSE_FROM_HOUR;
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

async function autoCloseEntry(base44, entry) {
  const clockIn = new Date(entry.clock_in);
  const clockOut = andorraLocalToUtc(entry.date, '16:00');

  let totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  totalHours = parseFloat(Math.min(Math.max(totalHours, 0), 8).toFixed(2));

  await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
    clock_out: clockOut.toISOString(),
    total_hours: totalHours,
    overtime_hours: 0,
    status: 'cerrado',
    auto_closed: true
  });
  try {
    await base44.asServiceRole.entities.FichajeHistorial.create({
      entry_id: entry.id, employee_id: entry.employee_id, employee_name: entry.employee_name,
      date: entry.date, action: 'cierre_automatico', changed_by_id: '', changed_by_name: 'Sistema',
      before: JSON.stringify({ clock_in: entry.clock_in, clock_out: null, status: entry.status }),
      after: JSON.stringify({ clock_out: clockOut.toISOString(), total_hours: totalHours, status: 'cerrado' }),
      motivo: 'Salida no fichada: se cierra a las 16:00 (horario ordinario), sin horas extra'
    });
  } catch (e) { console.error('FichajeHistorial', e?.message); }
  await deactivateLocation(base44, entry.employee_id);
}

async function autoCloseAllOpenEntries(base44) {
  const now = new Date();
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

// ── OPERACIÓN DE SISTEMA: disparada por un cron de Base44 (19:05 y 20:05 UTC =
// 21:05 hora de Andorra en verano o en invierno; la ejecución que cae antes de
// las 21:00 no cierra nada de hoy). Cierra los fichajes que sigan abiertos y
// desactiva su geolocalización.
Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);
  return await runCronTracked(base44, 'autoCloseTimeEntries', async () => {
    const closed = await autoCloseAllOpenEntries(base44);
    return Response.json({ success: true, closedCount: closed });
  });
});
