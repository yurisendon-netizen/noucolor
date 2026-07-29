// Cierre automático de fichajes abiertos — usado tanto por la operación manual
// trackTime/autoCloseAll (Test Function desde Base44 Studio) como por el cron
// diario en autoCloseTimeEntries. Salida fija a las 16:00 hora de Andorra,
// igual que el cierre automático que dispara el propio cliente al abrir la app
// pasadas las 16:30 (ver ControlHorario.jsx).
const LOCAL_UTC_OFFSET = '+02:00';

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

// Cierra un único fichaje abierto usando la FECHA REAL del fichaje (no la fecha de hoy)
export async function autoCloseEntry(base44, entry) {
  const clockIn = new Date(entry.clock_in);
  const clockOut = new Date(`${entry.date}T16:00:00${LOCAL_UTC_OFFSET}`);

  let totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  totalHours = Math.min(Math.max(totalHours, 0), 8);

  await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
    clock_out: clockOut.toISOString(),
    total_hours: parseFloat(totalHours.toFixed(2)),
    overtime_hours: 0,
    status: 'cerrado',
    auto_closed: true
  });
  await deactivateLocation(base44, entry.employee_id);
}

export async function autoCloseAllOpenEntries(base44) {
  const openEntries = await base44.asServiceRole.entities.TimeEntry.filter({ status: 'abierto' });
  let closed = 0;
  for (const entry of openEntries) {
    try {
      await autoCloseEntry(base44, entry);
      closed++;
    } catch (e) {
      console.error(`Error cerrando fichaje ${entry.id}:`, e.message);
    }
  }
  return closed;
}

