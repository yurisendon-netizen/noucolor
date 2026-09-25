// Monitor de tareas automáticas (cron): registra cada ejecución en la entidad
// CronRun y avisa por push a admins/jefes cuando una tarea falla o no se ejecuta.
// Usado por las funciones programadas (onesignalClockInReminder,
// notifyMissingClockIn, registerClockInAbsence, autoCloseTimeEntries, checkCronRuns).
import { sendOneSignalPush } from './onesignalPush.ts';

// Tareas automáticas diarias (lun-vie) que el vigilante espera ver ejecutadas.
export const EXPECTED_CRON_TASKS = [
  'onesignalClockInReminder',
  'notifyMissingClockIn',
  'registerClockInAbsence',
  'autoCloseTimeEntries',
];

// Fecha "de pared" en Andorra (YYYY-MM-DD) calculada con la zona horaria real,
// no con un offset fijo: así funciona en invierno (+01:00) y verano (+02:00).
export function todayLocalDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Andorra',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// Registra una ejecución de tarea (ok o error). Best-effort: nunca lanza.
export async function recordCronRun(base44, { taskName, status, error, durationMs }) {
  try {
    await base44.asServiceRole.entities.CronRun.create({
      nombre_tarea: taskName,
      fecha: todayLocalDate(),
      estado: status,
      mensaje_error: error || null,
      duracion_ms: durationMs ?? null,
    });
  } catch { /* best-effort: nunca rompe el cron */ }
}

// Envía push a todos los admins/jefes activos. Reutiliza sendOneSignalPush
// (dirige por external_id = employee.id). dryRun=true no envía (para pruebas).
export async function notifyAdminsPush(base44, heading, content, data, { dryRun = false } = {}) {
  try {
    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
    const admins = employees.filter(e => ['administrador', 'jefe', 'admin'].includes(e.role));
    const ids = admins.map(a => a.id).filter(Boolean);
    if (ids.length === 0) return { sent: false, reason: 'sin admins' };
    if (dryRun) return { sent: false, dryRun: true, recipients: ids.length };
    return await sendOneSignalPush({ externalUserIds: ids, heading, content, data: data || {} });
  } catch { return { sent: false }; }
}

// Envuelve una tarea cron: mide duración, registra CronRun (ok/error) y, si
// falla, avisa por push a los admins. Devuelve siempre un Response (éxito el de
// la tarea, o 500 con el error tras registrar y notificar).
export async function runCronTracked(base44, taskName, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    await recordCronRun(base44, { taskName, status: 'ok', durationMs: Date.now() - start });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = (err?.message || String(err)).slice(0, 500);
    await recordCronRun(base44, { taskName, status: 'error', error: msg, durationMs });
    await notifyAdminsPush(
      base44,
      `⚠️ Falló la tarea ${taskName}`,
      msg,
      { target_url: '/perfil' }
    );
    return Response.json({ error: msg }, { status: 500 });
  }
}