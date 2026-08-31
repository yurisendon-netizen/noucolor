import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';

// Cierre automático de fichajes abiertos — misma lógica que
// shared/timeEntryAutoClose.ts (usada por trackTime/autoCloseAll), duplicada
// aquí porque las funciones con automatización programada (ver
// function.jsonc) no pueden importar archivos fuera de su propia carpeta.
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
async function autoCloseEntry(base44, entry) {
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

async function autoCloseAllOpenEntries(base44) {
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

// ── OPERACIÓN DE SISTEMA: disparada por un cron de Base44 a las 16:35 hora de
// Andorra, sin usuario detrás (igual que notifyMissingClockIn). Cierra
// cualquier fichaje que siga 'abierto' y desactiva su geolocalización, para
// que no dependa de que alguien abra la app pasada la ventana de salida
// (16:00-16:30) — si nadie lo hace, el fichaje se queda abierto y la
// ubicación mostrada en Geolocalización se congela con las coordenadas de
// ese día.
Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  try {
    const base44 = createClientFromRequest(req);
    const closed = await autoCloseAllOpenEntries(base44);
    return Response.json({ success: true, closedCount: closed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});