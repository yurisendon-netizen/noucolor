import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';
import { autoCloseAllOpenEntries, autoCloseEntry } from '../../shared/timeEntryAutoClose.ts';
import { notifyAdminsPush } from '../../shared/cronMonitor.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// Ajusta este offset si Andorra está en horario de invierno (+01:00) vs verano (+02:00)
const LOCAL_UTC_OFFSET = '+02:00';
const LOCAL_UTC_OFFSET_HOURS = 2;

// Fichaje PRECISO obligatorio: una lectura con más margen de error que esto es
// por red/IP (p. ej. Chrome en Android con "ubicación aproximada" da ±2000 m),
// no GPS. No se ficha y queda una incidencia para que un admin la revise.
const GPS_MAX_ACCEPT_M = 200;
function impreciseMsg(acc) {
  return acc >= 1000
    ? `Tu móvil da una ubicación aproximada (±${acc} m), no la exacta. No se ha fichado. Activa la ubicación precisa: Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → activa "Usar ubicación precisa". Después vuelve a fichar.`
    : `Tu ubicación no es precisa (±${acc} m). No se ha fichado. Sal al exterior o acércate a una ventana, espera unos segundos y vuelve a fichar.`;
}
// Coordenadas fijas que ponía la versión antigua de la app cuando fallaba el GPS
// (respaldo del "taller"). Nunca son una lectura real: se rechazan siempre.
const LEGACY_BACKUP = { lat: 42.46768, lng: 1.49327 };
const OUTDATED_MSG = 'Tu app está desactualizada. Ciérrala del todo, vuelve a abrirla y ficha de nuevo.';

function isLegacyBackup(lat, lng) {
  return Math.abs(Number(lat) - LEGACY_BACKUP.lat) < 0.00001 && Math.abs(Number(lng) - LEGACY_BACKUP.lng) < 0.00001;
}

// Registra (una vez al día) que el fichaje se hizo con ubicación aproximada.
async function logImpreciseLocation(base44, empId, empName, stage, acc) {
  try {
    const { dateStr: date, hour, minutes } = getLocalParts(new Date());
    const hhmm = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const description = `Intentó fichar ${stage === 'out' ? 'la salida' : 'la entrada'} a las ${hhmm} con ubicación aproximada (±${acc} m). NO se ha fichado.`;
    // Una sola incidencia por trabajador/día/tramo: se actualiza con el último intento.
    const existing = await base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: empId, date, type: 'gps_sin_senal' });
    const same = existing.find(i => (i.description || '').includes(stage === 'out' ? 'la salida' : 'la entrada'));
    if (same) {
      await base44.asServiceRole.entities.Incumplimiento.update(same.id, { description, status: 'pendiente' });
      return;
    }
    await base44.asServiceRole.entities.Incumplimiento.create({
      employee_id: empId, employee_name: empName, date, type: 'gps_sin_senal', status: 'pendiente', description
    });
  } catch (e) { console.error('logImpreciseLocation', e); }
}

// Hora/fecha "de pared" en Andorra a partir de un instante UTC — calculado en el
// servidor para que ningún cliente pueda fichar con la hora de su propio móvil.
function getLocalParts(utcDate) {
  const shifted = new Date(utcDate.getTime() + LOCAL_UTC_OFFSET_HOURS * 3600000);
  return {
    hour: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    dateStr: shifted.toISOString().split('T')[0],
  };
}

// Pausa de descanso 12:30-13:00 hora de Andorra: no se ficha salida/entrada
// ni se escribe o consulta geolocalización durante este tramo.
function isBreakTime(utcDate) {
  const { hour, minutes } = getLocalParts(utcDate);
  const totalMinutes = hour * 60 + minutes;
  return totalMinutes >= 750 && totalMinutes < 780; // 12:30 (750) .. 13:00 (780)
}

// Offset en minutos de Europe/Andorra para un instante dado (maneja DST de
// verano/invierno). Usado por admin_open_entry para convertir la hora "de pared"
// elegida por el admin a UTC, sin asumir un offset fijo.
function andorraOffsetMinutes(instant) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Andorra', timeZoneName: 'longOffset'
    }).formatToParts(instant);
    const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+00:00';
    const m = tz.match(/([+-])(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  } catch { return 120; }
}

// Convierte una hora "de pared" de Andorra (YYYY-MM-DD + HH:mm) a ISO UTC.
function andorraLocalToUtcIso(dateStr, timeStr) {
  const hhmm = String(timeStr).padStart(5, '0');
  const naive = new Date(`${dateStr}T${hhmm}:00.000Z`);
  const offset = andorraOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60000).toISOString();
}

async function upsertLocation(base44, empId, empName, isActive, lat, lng, accuracy = null) {
  try {
    const locs = await base44.asServiceRole.entities.EmployeeLocation.filter({ employee_id: empId });
    const locData = {
      employee_id: empId, employee_name: empName,
      latitude: lat, longitude: lng, accuracy,
      is_active: isActive, last_update: new Date().toISOString()
    };
    if (locs.length > 0) {
      await base44.asServiceRole.entities.EmployeeLocation.update(locs[0].id, locData);
    } else {
      await base44.asServiceRole.entities.EmployeeLocation.create(locData);
    }
  } catch { /* silent */ }
}

// Aplica el cambio de fichaje derivado de una SolicitudCorreccion aprobada.
// Misma lógica que admin_open_entry para olvido_entrada (reabre/crea entrada,
// resuelve la falta de ese día). Para el resto de tipos ajusta clock_in/out.
// Marca el TimeEntry con corregido_por_solicitud + el id de la solicitud.
async function applyCorreccion(base44, sol, adminId) {
  const proposedIso = sol.hora_propuesta ? andorraLocalToUtcIso(sol.fecha, sol.hora_propuesta) : null;
  const lat = sol.lat ?? null;
  const lng = sol.lng ?? null;
  const mark = { corregido_por_solicitud: true, solicitud_correccion_id: sol.id };

  const dayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: sol.employee_id, date: sol.fecha });
  const entry = dayEntries[0];

  if (sol.tipo === 'olvido_entrada') {
    if (entry && entry.status === 'ausencia_injustificada') {
      await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
        clock_in: proposedIso, clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false,
        status: 'abierto', opened_by_admin: true, opened_by: adminId, ...mark
      });
    } else if (entry) {
      await base44.asServiceRole.entities.TimeEntry.update(entry.id, { clock_in: proposedIso, ...mark });
    } else {
      await base44.asServiceRole.entities.TimeEntry.create({
        employee_id: sol.employee_id, employee_name: sol.employee_name,
        clock_in: proposedIso, date: sol.fecha,
        clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false,
        status: 'abierto', opened_by_admin: true, opened_by: adminId, ...mark
      });
    }
  } else if (sol.tipo === 'olvido_salida') {
    if (entry) {
      await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
        clock_out: proposedIso, status: 'cerrado', ...mark
      });
    }
  } else if (sol.tipo === 'salida_por_error') {
    // El trabajador fichó salida por error: se elimina y se reabre la jornada.
    if (entry) {
      await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
        clock_out: null, total_hours: null, overtime_hours: 0,
        status: 'abierto', auto_closed: false, ...mark
      });
    }
  } else if (sol.tipo === 'hora_incorrecta') {
    if (entry) {
      if (entry.clock_out) {
        await base44.asServiceRole.entities.TimeEntry.update(entry.id, { clock_out: proposedIso, ...mark });
      } else {
        await base44.asServiceRole.entities.TimeEntry.update(entry.id, { clock_in: proposedIso, ...mark });
      }
    }
  }
  // 'otro' → no modifica el fichaje, solo queda registrada como aprobada.

  // Resolver la incidencia de falta (sin_fichar) de ese día, igual que admin_open_entry.
  const incs = await base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: sol.employee_id, date: sol.fecha });
  for (const inc of incs) {
    if (inc.type === 'sin_fichar' && inc.status !== 'resuelto') {
      await base44.asServiceRole.entities.Incumplimiento.update(inc.id, { status: 'resuelto' });
    }
  }
}

// Una coordenada es valida solo si viene del GPS del movil: numeros finitos,
// dentro de rango y distinta de 0,0. Sin ubicacion real no se puede fichar.
function isValidCoord(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const la = Number(lat), ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
}

function toAccuracy(accuracy) {
  const n = Number(accuracy);
  return accuracy !== null && accuracy !== undefined && Number.isFinite(n) ? Math.round(n) : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation } = body;

    const { sessionToken } = body;

    // Verify caller identity via session token (not client-supplied employeeId)
    const session = await verifySession(base44, sessionToken);
    if (!session) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const caller = session.employee;
    const empId = caller.id;
    const empName = caller.full_name;
    const isAdmin = session.isAdmin;

    switch (operation) {
      case 'clockIn': {
        const { lat, lng, accuracy } = body;
        if (!isValidCoord(lat, lng)) {
          return Response.json({ error: 'Ubicación obligatoria para fichar. Activa el GPS y la ubicación exacta y vuelve a intentarlo.' }, { status: 400 });
        }
        const acc = toAccuracy(accuracy);
        // Sin margen de error o con el respaldo fijo del taller = versión antigua de la app.
        if (acc === null || isLegacyBackup(lat, lng)) {
          return Response.json({ error: OUTDATED_MSG }, { status: 400 });
        }
        if (acc > GPS_MAX_ACCEPT_M) {
          await logImpreciseLocation(base44, empId, empName, 'in', acc);
          return Response.json({ error: impreciseMsg(acc) }, { status: 400 });
        }
        // Un empleado marcado como de baja o de vacaciones no puede fichar la
        // entrada — se valida en el servidor, no solo en el frontend.
        if (caller.estado_laboral === 'baja' || caller.estado_laboral === 'vacaciones') {
          return Response.json({ error: `No puedes fichar: estás marcado como de ${caller.estado_laboral}. Contacta con tu encargado.` }, { status: 403 });
        }
        // La hora de entrada, la fecha y si llega tarde se calculan aquí con el reloj
        // del servidor — nunca a partir de lo que envíe el cliente (el móvil de un
        // trabajador podría tener la hora adelantada/atrasada para evitar una falta).
        const now = new Date();
        if (isBreakTime(now)) {
          return Response.json({ error: 'No se puede fichar durante el descanso (12:30 - 13:00)' }, { status: 400 });
        }
        const clockIn = now.toISOString();
        const { hour, minutes, dateStr: date } = getLocalParts(now);
        const totalMinutes = hour * 60 + minutes;
        // Ventana de fichaje de entrada: 7:45 (465) – 8:30 (510). Fuera de este
        // tramo no se puede fichar la entrada.
        if (totalMinutes < 465) {
          return Response.json({ error: 'El fichaje de entrada abre a las 7:45' }, { status: 400 });
        }
        if (totalMinutes > 510) {
          return Response.json({ error: 'El fichaje de entrada se cerró a las 8:30. Contacta con tu encargado.' }, { status: 400 });
        }
        const isLate = hour > 8 || (hour === 8 && minutes > 15);
        const localTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const lateDescription = `Fichó entrada a las ${localTime} (límite 8:15)`;

        const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: empId, date });
        const absenceEntry = todayEntries.find(e => e.status === 'ausencia_injustificada');
        const openEntry = todayEntries.find(e => e.status === 'abierto');

        // Already has an open entry today — don't create a duplicate
        if (openEntry) {
          await upsertLocation(base44, empId, empName, true, lat, lng, acc);
          return Response.json({ success: true, alreadyClockedIn: true, clockIn: openEntry.clock_in, isLate: false });
        }

        if (absenceEntry) {
          await base44.asServiceRole.entities.TimeEntry.update(absenceEntry.id, {
            clock_in: clockIn, clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false, clock_in_accuracy: acc, status: 'abierto'
          });
        } else {
          await base44.asServiceRole.entities.TimeEntry.create({
            employee_id: empId, employee_name: empName,
            clock_in: clockIn, date, clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false, clock_in_accuracy: acc, status: 'abierto'
          });
        }

        await upsertLocation(base44, empId, empName, true, lat, lng, acc);

        if (isLate) {
          await base44.asServiceRole.entities.Incumplimiento.create({
            employee_id: empId, employee_name: empName,
            date, type: 'entrada_tardia', description: lateDescription
          });
        }
        return Response.json({ success: true, clockIn, isLate });
      }

      case 'reportLocationFailure': {
        // El movil no pudo dar la ubicacion al fichar: no se ficha y se registra
        // una incidencia para que la revise un admin (no es falta automatica).
        // Ubicación aproximada detectada ya en el móvil: misma incidencia que la del servidor.
        if (body.kind === 'imprecise' && Number.isFinite(Number(body.accuracy))) {
          await logImpreciseLocation(base44, empId, empName, body.stage === 'out' ? 'out' : 'in', Math.round(Number(body.accuracy)));
          return Response.json({ success: true });
        }
        const kind = body.kind === 'denied' ? 'ubicacion_denegada' : 'gps_sin_senal';
        const stage = body.stage === 'out' ? 'la salida' : 'la entrada';
        const ua = String(body.userAgent || '').slice(0, 200);
        const codeNames = { 1: 'permiso denegado', 2: 'posición no disponible', 3: 'tiempo agotado' };
        const errInfo = body.errorCode != null
          ? ` Error: ${codeNames[body.errorCode] || body.errorCode}${body.errorMessage ? ` (${String(body.errorMessage).slice(0, 120)})` : ''}.`
          : '';
        const { dateStr: date, hour, minutes } = getLocalParts(new Date());
        const hhmm = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const existing = await base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: empId, date, type: kind });
        if (existing.length > 0) {
          return Response.json({ success: true, duplicated: true });
        }
        const description = kind === 'ubicacion_denegada'
          ? `Intentó fichar ${stage} a las ${hhmm} con el permiso de ubicación desactivado. Dispositivo: ${ua}`
          : `Intentó fichar ${stage} a las ${hhmm} sin obtener señal GPS.${errInfo} Dispositivo: ${ua}`;
        await base44.asServiceRole.entities.Incumplimiento.create({
          employee_id: empId, employee_name: empName, date, type: kind, description, status: 'pendiente'
        });
        await notifyAdminsPush(base44, '⚠️ Fichaje sin ubicación',
          `${empName} ha intentado fichar ${stage} sin ubicación (${kind === 'ubicacion_denegada' ? 'permiso desactivado' : 'sin señal GPS'})`,
          { target_url: '/control-horario' });
        return Response.json({ success: true });
      }

      case 'clockOut': {
        const { entryId, lat, lng, accuracy } = body;
        if (!isValidCoord(lat, lng)) {
          return Response.json({ error: 'Ubicación obligatoria para fichar. Activa el GPS y la ubicación exacta y vuelve a intentarlo.' }, { status: 400 });
        }
        const acc = toAccuracy(accuracy);
        // Sin margen de error o con el respaldo fijo del taller = versión antigua de la app.
        if (acc === null || isLegacyBackup(lat, lng)) {
          return Response.json({ error: OUTDATED_MSG }, { status: 400 });
        }
        if (acc > GPS_MAX_ACCEPT_M) {
          await logImpreciseLocation(base44, empId, empName, 'out', acc);
          return Response.json({ error: impreciseMsg(acc) }, { status: 400 });
        }
        // Verify the entry belongs to the caller
        const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entryId });
        if (entries.length === 0 || entries[0].employee_id !== empId) {
          return Response.json({ error: 'No autorizado' }, { status: 403 });
        }
        const entry = entries[0];

        // Horas trabajadas y horas extra calculadas aquí con la hora real del
        // servidor y la hora de entrada ya guardada — nunca con lo que mande el
        // cliente, que podría inflar totalHours/overtimeHours a mano.
        const now = new Date();
        if (isBreakTime(now)) {
          return Response.json({ error: 'No se puede fichar salida durante el descanso (12:30 - 13:00). Es una pausa, no un fichaje de salida.' }, { status: 400 });
        }
        const clockOut = now.toISOString();
        const clockInDate = new Date(entry.clock_in);
        const sixteenLocal = new Date(`${entry.date}T16:00:00${LOCAL_UTC_OFFSET}`);
        const isAfter16 = now > sixteenLocal;
        let regularHours, overtimeHours;
        if (isAfter16) {
          regularHours = (sixteenLocal.getTime() - clockInDate.getTime()) / 3600000;
          overtimeHours = 2;
        } else {
          regularHours = (now.getTime() - clockInDate.getTime()) / 3600000;
          overtimeHours = 0;
        }
        regularHours = parseFloat(Math.min(Math.max(regularHours, 0), 8).toFixed(2));

        await base44.asServiceRole.entities.TimeEntry.update(entryId, {
          clock_out: clockOut, clock_out_lat: lat, clock_out_lng: lng, clock_out_fallback: false, clock_out_accuracy: acc,
          total_hours: regularHours, overtime_hours: overtimeHours, status: 'cerrado'
        });
        await upsertLocation(base44, empId, empName, false, lat, lng, acc);
        return Response.json({ success: true, clockOut, totalHours: regularHours, overtimeHours });
      }

      case 'autoClose': {
        const { entryId } = body;
        const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entryId });
        if (entries.length === 0 || entries[0].employee_id !== empId) {
          return Response.json({ error: 'No autorizado' }, { status: 403 });
        }
        // Misma lógica que el cierre automático por cron (autoCloseEntry): salida
        // fija a las 16:00 hora de Andorra, horas calculadas por el servidor.
        await autoCloseEntry(base44, entries[0]);
        return Response.json({ success: true });
      }

      // Cierre masivo: solo administradores autenticados. El cron real vive en
      // la función autoCloseTimeEntries (service role), no en este endpoint público.
      case 'autoCloseAll': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const closed = await autoCloseAllOpenEntries(base44);
        return Response.json({ success: true, closedCount: closed });
      }

      case 'registerAbsence': {
        const { clockIn, date, description } = body;
        await base44.asServiceRole.entities.TimeEntry.create({
          employee_id: empId, employee_name: empName,
          clock_in: clockIn, date, status: 'ausencia_injustificada'
        });
        await base44.asServiceRole.entities.Incumplimiento.create({
          employee_id: empId, employee_name: empName,
          date, type: 'sin_fichar', description
        });
        return Response.json({ success: true });
      }

      case 'approveOvertime': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { overtimeId, status } = body;
        if (!['aprobado', 'rechazado', 'pendiente'].includes(status)) {
          return Response.json({ error: 'Estado no válido' }, { status: 400 });
        }
        const records = await base44.asServiceRole.entities.OvertimeHour.filter({ id: overtimeId });
        if (records.length === 0) {
          return Response.json({ error: 'Registro no encontrado' }, { status: 404 });
        }
        await base44.asServiceRole.entities.OvertimeHour.update(overtimeId, { status });
        return Response.json({ success: true });
      }

      case 'saveOvertime': {
        const { overtimeId, date, startTime, endTime, duration, obraMotivo, multiplier, status } = body;
        // For non-admins, force employee_id to caller's own; admins can target another employee
        let targetEmpId = empId;
        let targetEmpName = empName;
        let targetPrecioHora = caller.precioHora || 0;
        let targetPrecioExtra = caller.precioHoraExtra || 0;

        if (isAdmin && body.targetEmployeeId && body.targetEmployeeId !== empId) {
          const targets = await base44.asServiceRole.entities.Employee.filter({ id: body.targetEmployeeId });
          if (targets.length > 0) {
            targetEmpId = targets[0].id;
            targetEmpName = targets[0].full_name;
            targetPrecioHora = targets[0].precioHora || 0;
            targetPrecioExtra = targets[0].precioHoraExtra || 0;
          }
        }

        // Non-admins cannot approve their own overtime or inflate the multiplier.
        const effectiveMultiplier = isAdmin ? multiplier : 1.4;
        const effectiveStatus = isAdmin ? (status || 'pendiente') : 'pendiente';
        // El importe usa el precio de hora extra de la ficha del trabajador (hoja de
        // nóminas, ya neto). Solo si no lo tiene se usa precio/hora × multiplicador.
        const extraPrice = targetPrecioExtra > 0
          ? targetPrecioExtra
          : Math.round(targetPrecioHora * effectiveMultiplier * 100) / 100;
        const total = Math.round(Math.round(duration * 100) / 100 * extraPrice * 100) / 100;
        const payload = {
          employee_id: targetEmpId, employee_name: targetEmpName,
          date, start_time: startTime, end_time: endTime,
          duration: parseFloat(duration.toFixed(2)),
          obra_motivo: obraMotivo,
          precio_hora: targetPrecioHora, multiplier: effectiveMultiplier,
          total, status: effectiveStatus
        };

        if (overtimeId) {
          // Verify ownership for non-admins
          if (!isAdmin) {
            const existing = await base44.asServiceRole.entities.OvertimeHour.filter({ id: overtimeId });
            if (existing.length === 0 || existing[0].employee_id !== empId) {
              return Response.json({ error: 'No autorizado' }, { status: 403 });
            }
          }
          await base44.asServiceRole.entities.OvertimeHour.update(overtimeId, payload);
        } else {
          await base44.asServiceRole.entities.OvertimeHour.create(payload);
        }
        return Response.json({ success: true });
      }

      // ── Lecturas vía service role: las entidades TimeEntry/EmployeeLocation/Incumplimiento
      // usan RLS basado en {{user.id}} de la plataforma Base44, pero esta app autentica
      // empleados con su propio sistema (Employee + localStorage), así que ese id nunca
      // coincide. Sin pasar por aquí, el cliente no puede leer sus propios fichajes.
      case 'listEntries': {
        const { limit } = body;
        const data = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: empId }, '-date', limit || 50);
        return Response.json({ success: true, entries: data });
      }

      // Registro mensual de días fichados: todo lo del mes en una sola llamada
      // (trabajadores, fichajes, justificantes aprobados e incumplimientos).
      case 'registroMensual': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const month = String(body.month || '');
        if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Mes no válido' }, { status: 400 });
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const from = `${month}-01`;
        const to = `${month}-${String(lastDay).padStart(2, '0')}`;
        const db = base44.asServiceRole.entities;
        const inMonth = (d) => typeof d === 'string' && d.slice(0, 7) === month;
        const [emps, allEntries, justs, allIncs] = await Promise.all([
          db.Employee.list('full_name', 500),
          db.TimeEntry.list('-date', 5000),
          db.Justificante.list('-date_from', 2000),
          db.Incumplimiento.list('-date', 3000),
        ]);
        const entries = allEntries.filter(t => inMonth(t.date));
        const incs = allIncs.filter(i => inMonth(i.date));
        const employees = emps
          .filter(e => e.role !== 'jefe' && !/tester/i.test(e.full_name || ''))
          .filter(e => e.is_active !== false || entries.some(t => t.employee_id === e.id))
          .map(e => ({ id: e.id, full_name: e.full_name, role: e.role, position: e.position || '', is_active: e.is_active !== false, estado_laboral: e.estado_laboral || 'activo' }));
        return Response.json({
          success: true,
          month, from, to,
          employees,
          entries: entries.map(t => ({
            id: t.id, employee_id: t.employee_id, date: t.date, clock_in: t.clock_in, clock_out: t.clock_out,
            total_hours: t.total_hours || 0, overtime_hours: t.overtime_hours || 0, status: t.status,
            auto_closed: !!t.auto_closed, opened_by_admin: !!t.opened_by_admin,
            clock_in_accuracy: t.clock_in_accuracy ?? null, has_location: t.clock_in_lat != null,
          })),
          justificantes: justs
            .filter(j => j.status === 'aprobado' && j.date_from && String(j.date_from) <= to && String(j.date_to || j.date_from) >= from)
            .map(j => ({ employee_id: j.employee_id, type: j.type, date_from: j.date_from, date_to: j.date_to || j.date_from, reason: j.reason || '' })),
          incumplimientos: incs.map(i => ({ employee_id: i.employee_id, date: i.date, type: i.type, status: i.status, description: i.description || '' })),
        });
      }

      case 'listAllEntries': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { limit, employeeId: filterEmployeeId } = body;
        // Con employeeId se devuelven SOLO los fichajes de ese trabajador (para
        // nóminas): así nunca se pierden días por el límite de registros.
        const data = filterEmployeeId
          ? await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: filterEmployeeId }, '-date', limit || 1000)
          : await base44.asServiceRole.entities.TimeEntry.list('-date', limit || 200);
        return Response.json({ success: true, entries: data });
      }

      case 'countEntriesByDate': {
        const { date } = body;
        if (!date) return Response.json({ error: 'Falta date' }, { status: 400 });
        const data = await base44.asServiceRole.entities.TimeEntry.filter({ date });
        return Response.json({ success: true, count: data.length });
      }

      case 'listIncumplimientos': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { limit } = body;
        const data = await base44.asServiceRole.entities.Incumplimiento.list('-date', limit || 200);
        return Response.json({ success: true, incumplimientos: data });
      }

      case 'amonestarIncumplimiento': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { incumplimientoId } = body;
        if (!incumplimientoId) return Response.json({ error: 'Falta incumplimientoId' }, { status: 400 });
        await base44.asServiceRole.entities.Incumplimiento.update(incumplimientoId, { status: 'amonestado' });
        return Response.json({ success: true });
      }

      // ── Partes de trabajo. Los operarios entran con usuario+PIN propios (no son
      // admins de Base44), así que crear/editar/borrar se hace aquí con el rol
      // de servicio y validando quién es cada uno.
      case 'createWorkOrder': {
        const f = body.workOrder || {};
        const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
        const title = str(f.title, 200);
        const client_name = str(f.client_name, 200);
        const date = str(f.date, 10);
        if (!title || !client_name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json({ error: 'Faltan datos: obra, cliente y fecha son obligatorios.' }, { status: 400 });
        }
        const priority = ['baja', 'media', 'alta'].includes(f.priority) ? f.priority : 'media';

        // Horas trabajadas: una fila por trabajador (0,25 h a 24 h).
        const rawHoras = Array.isArray(f.horas_trabajadas) ? f.horas_trabajadas : [];
        const horas_trabajadas = rawHoras
          .map(h => ({
            employee_id: typeof h?.employee_id === 'string' ? h.employee_id : '',
            employee_name: str(h?.employee_name, 200),
            horas: Math.round((parseFloat(String(h?.horas ?? '').replace(',', '.')) || 0) * 100) / 100,
          }))
          .filter(h => h.employee_name && h.horas > 0 && h.horas <= 24);
        if (horas_trabajadas.length === 0) {
          return Response.json({ error: 'Indica las horas trabajadas de al menos un trabajador.' }, { status: 400 });
        }
        const total_horas = Math.round(horas_trabajadas.reduce((s, h) => s + h.horas, 0) * 100) / 100;

        // Firma: se sube como imagen; si la subida falla se guarda la propia
        // imagen (data URL) para no perder nunca el parte.
        let firma = null;
        const dataUrl = typeof body.firmaDataUrl === 'string' ? body.firmaDataUrl : '';
        if (dataUrl.startsWith('data:image/') && dataUrl.length < 1500000) {
          firma = dataUrl;
          try {
            const b64 = dataUrl.split(',')[1];
            const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const file = new File([bin], 'firma_encargado.png', { type: 'image/png' });
            const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            if (up?.file_url) firma = up.file_url;
          } catch (e) { console.error('upload firma', e); }
        }

        // Obra del balance (opcional): solo se guarda si existe.
        let obra_id = null;
        if (typeof f.obra_id === 'string' && f.obra_id) {
          const ob = await base44.asServiceRole.entities.Obra.filter({ id: f.obra_id });
          if (ob.length > 0) obra_id = ob[0].id;
        }

        const created = await base44.asServiceRole.entities.WorkOrder.create({
          title, client_name, date, priority, obra_id,
          description: str(f.description),
          materials: str(f.materials),
          notes: str(f.notes),
          encargado_obra: str(f.encargado_obra, 200) || empName,
          encargado_firma: firma,
          horas_trabajadas,
          total_horas,
          assigned_to: empId,
          assigned_name: empName,
          status: 'pendiente',
        });
        return Response.json({ success: true, workOrder: created });
      }

      // Lista de trabajadores activos (id + nombre) para el formulario de partes.
      case 'listWorkers': {
        const all = await base44.asServiceRole.entities.Employee.list('full_name', 200);
        const workers = all
          .filter(e => e.is_active !== false && e.role !== 'jefe' && e.estado_laboral !== 'baja' && !/tester/i.test(e.full_name || ''))
          .map(e => ({ id: e.id, full_name: e.full_name }));
        // Trabajadores de otras empresas (p. ej. ARMO) que trabajan en obras de
        // Noucolor: solo salen en los partes, no tienen acceso a la app.
        try {
          const externos = await base44.asServiceRole.entities.TrabajadorExterno.list('full_name', 200);
          externos
            .filter(x => x.is_active !== false)
            .forEach(x => workers.push({ id: x.id, full_name: x.full_name, externo: true, empresa: x.empresa || '' }));
        } catch (e) { console.error('listWorkers externos', e); }
        return Response.json({ success: true, workers });
      }

      case 'updateWorkOrderStatus': {
        const { workOrderId, status } = body;
        if (!['pendiente', 'en_progreso', 'completado'].includes(status)) {
          return Response.json({ error: 'Estado no válido' }, { status: 400 });
        }
        const found = await base44.asServiceRole.entities.WorkOrder.filter({ id: workOrderId });
        if (found.length === 0) return Response.json({ error: 'Parte no encontrado' }, { status: 404 });
        if (!isAdmin && found[0].assigned_to !== empId) return Response.json({ error: 'No autorizado' }, { status: 403 });
        await base44.asServiceRole.entities.WorkOrder.update(workOrderId, { status });
        return Response.json({ success: true });
      }

      case 'deleteWorkOrder': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { workOrderId } = body;
        if (!workOrderId) return Response.json({ error: 'Falta workOrderId' }, { status: 400 });
        await base44.asServiceRole.entities.WorkOrder.delete(workOrderId);
        return Response.json({ success: true });
      }

      case 'listActiveLocations': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        // Durante el descanso no se consulta la geolocalización de nadie, aunque
        // su registro siga marcado is_active (última posición de antes de comer).
        if (isBreakTime(new Date())) {
          return Response.json({ success: true, locations: [], onBreak: true });
        }
        // Solo ubicaciones del día actual (hora de Andorra): is_active puede
        // quedar "pegado" en true si un fichaje de un día anterior no se
        // desactivó (clock-out/autoClose), y entonces el mapa mostraría
        // posiciones de hace días en vez de los fichajes de hoy. Ordenamos por
        // recencia para que el centro del mapa y las tarjetas sean las más nuevas.
        const today = getLocalParts(new Date()).dateStr;
        const all = await base44.asServiceRole.entities.EmployeeLocation.filter({ is_active: true }, '-last_update');
        const data = all.filter(loc => loc.last_update && getLocalParts(new Date(loc.last_update)).dateStr === today);
        return Response.json({ success: true, locations: data });
      }

      // Payroll usa el mismo RLS ({{user.id}}) roto que TimeEntry — mismo motivo, mismo arreglo.
      case 'listPayrolls': {
        const { limit } = body;
        const data = isAdmin
          ? await base44.asServiceRole.entities.Payroll.list('-created_date', limit || 200)
          : await base44.asServiceRole.entities.Payroll.filter({ employee_id: empId }, '-created_date', limit || 50);
        return Response.json({ success: true, payrolls: data });
      }

      case 'createPayroll': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { payroll } = body;
        if (!payroll || !payroll.employee_id) return Response.json({ error: 'Faltan datos de la nómina' }, { status: 400 });
        const created = await base44.asServiceRole.entities.Payroll.create(payroll);
        return Response.json({ success: true, payroll: created });
      }

      case 'deletePayroll': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { payrollId } = body;
        if (!payrollId) return Response.json({ error: 'Falta payrollId' }, { status: 400 });
        await base44.asServiceRole.entities.Payroll.delete(payrollId);
        return Response.json({ success: true });
      }

      case 'signPayroll': {
        const { payrollId, signatureName, signatureUrl } = body;
        if (!payrollId) return Response.json({ error: 'Falta payrollId' }, { status: 400 });
        const records = await base44.asServiceRole.entities.Payroll.filter({ id: payrollId });
        if (records.length === 0) return Response.json({ error: 'Nómina no encontrada' }, { status: 404 });
        if (records[0].employee_id !== empId) return Response.json({ error: 'No autorizado' }, { status: 403 });
        const sigDate = new Date().toISOString();
        const updated = await base44.asServiceRole.entities.Payroll.update(payrollId, {
          worker_signature_name: signatureName,
          worker_signature_date: sigDate,
          worker_signature_url: signatureUrl,
        });
        return Response.json({ success: true, payroll: updated });
      }

      case 'listOvertimeByEmployee': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { targetEmployeeId, limit } = body;
        if (!targetEmployeeId) return Response.json({ error: 'Falta targetEmployeeId' }, { status: 400 });
        const data = await base44.asServiceRole.entities.OvertimeHour.filter({ employee_id: targetEmployeeId }, '-date', limit || 200);
        return Response.json({ success: true, overtime: data });
      }

      // ── Apertura manual de fichaje por un admin/jefe: para los operarios que se
      // olvidan de fichar. El admin elige trabajador(es), fecha, hora y ubicación
      // (punto en el mapa). El servidor valida permisos, que el trabajador existe
      // y está activo, y que no tenga ya una entrada abierta ese día (no duplica).
      case 'admin_open_entry': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { employeeIds, date, time, lat, lng } = body;
        if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
          return Response.json({ error: 'Selecciona al menos un trabajador' }, { status: 400 });
        }
        if (!date || !time || lat == null || lng == null) {
          return Response.json({ error: 'Faltan datos (fecha, hora o ubicación)' }, { status: 400 });
        }

        const allEmployees = await base44.asServiceRole.entities.Employee.list('-created_date', 500);
        const byId = new Map(allEmployees.map(e => [e.id, e]));
        const targetIds = employeeIds.filter(id => byId.has(id));

        if (targetIds.length === 0) {
          return Response.json({ error: 'Los trabajadores seleccionados no existen' }, { status: 400 });
        }

        // Validar que están activos.
        const inactive = targetIds.filter(id => byId.get(id).is_active === false);
        if (inactive.length > 0) {
          const names = inactive.map(id => byId.get(id).full_name).join(', ');
          return Response.json({ error: `Trabajadores inactivos: ${names}` }, { status: 400 });
        }

        const clockInIso = andorraLocalToUtcIso(date, time);

        const opened = [];
        const skippedOpen = [];
        const skippedAbsent = [];

        for (const id of targetIds) {
          const emp = byId.get(id);
          const dayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: id, date });
          const openEntry = dayEntries.find(e => e.status === 'abierto');

          if (openEntry) {
            skippedOpen.push(emp.full_name);
            continue;
          }

          const absenceEntry = dayEntries.find(e => e.status === 'ausencia_injustificada');
          if (absenceEntry) {
            // Si había una falta registrada ese día, la convertimos en entrada
            // abierta en vez de crear un duplicado.
            await base44.asServiceRole.entities.TimeEntry.update(absenceEntry.id, {
              clock_in: clockInIso,
              clock_in_lat: lat, clock_in_lng: lng,
              clock_in_fallback: false,
              status: 'abierto',
              opened_by_admin: true, opened_by: empId
            });
            skippedAbsent.push(emp.full_name);
          } else {
            await base44.asServiceRole.entities.TimeEntry.create({
              employee_id: id, employee_name: emp.full_name,
              clock_in: clockInIso, date,
              clock_in_lat: lat, clock_in_lng: lng,
              clock_in_fallback: false,
              status: 'abierto',
              opened_by_admin: true, opened_by: empId
            });
          }

          // Resolver la incidencia/aviso de falta por no fichar ese día.
          const incs = await base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: id, date });
          for (const inc of incs) {
            if (inc.type === 'sin_fichar' && inc.status !== 'resuelto') {
              await base44.asServiceRole.entities.Incumplimiento.update(inc.id, { status: 'resuelto' });
            }
          }

          opened.push(emp.full_name);
        }

        return Response.json({
          success: true,
          date, clockIn: clockInIso,
          opened, skippedOpen, skippedAbsent
        });
      }

      // ── Solicitudes de corrección de fichaje (feature B).
      // El trabajador crea solicitudes propias; validamos en servidor que es
      // suya y que no tiene ya una pendiente del mismo tipo para ese día.
      case 'createCorreccion': {
        const { fecha, tipo, horaPropuesta, lat, lng, motivo } = body;
        const validTypes = ['olvido_entrada', 'olvido_salida', 'salida_por_error', 'hora_incorrecta', 'otro'];
        if (!validTypes.includes(tipo)) return Response.json({ error: 'Tipo no válido' }, { status: 400 });
        if (!fecha || !motivo) return Response.json({ error: 'Fecha y motivo son obligatorios' }, { status: 400 });

        const pendientes = await base44.asServiceRole.entities.SolicitudCorreccion.filter({
          employee_id: empId, fecha, estado: 'pendiente'
        });
        if (pendientes.some(s => s.tipo === tipo)) {
          return Response.json({ error: 'Ya tienes una solicitud pendiente de este tipo para ese día' }, { status: 409 });
        }

        const created = await base44.asServiceRole.entities.SolicitudCorreccion.create({
          employee_id: empId, employee_name: empName,
          fecha, tipo,
          hora_propuesta: horaPropuesta || null,
          lat: lat ?? null, lng: lng ?? null,
          motivo, estado: 'pendiente'
        });

        await notifyAdminsPush(
          base44,
          'Nueva solicitud de corrección',
          `${empName} solicitó corregir su fichaje del ${fecha}.`,
          { target_url: '/control-horario' }
        );

        return Response.json({ success: true, solicitud: created });
      }

      case 'listCorrecciones': {
        const { onlyPending } = body;
        let data;
        if (isAdmin) {
          data = onlyPending
            ? await base44.asServiceRole.entities.SolicitudCorreccion.filter({ estado: 'pendiente' }, '-created_date', 200)
            : await base44.asServiceRole.entities.SolicitudCorreccion.list('-created_date', 200);
        } else {
          data = await base44.asServiceRole.entities.SolicitudCorreccion.filter({ employee_id: empId }, '-created_date', 100);
        }
        return Response.json({ success: true, solicitudes: data });
      }

      // Solo admins/jefes pueden aprobar/rechazar (403 si no). Al aprobar se
      // aplica el cambio con applyCorreccion (marca el TimeEntry) y se avisa al
      // trabajador por push del resultado.
      case 'resolveCorreccion': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { solicitudId, accion, comentario } = body;
        if (!solicitudId) return Response.json({ error: 'Falta solicitudId' }, { status: 400 });
        if (!['aprobar', 'rechazar'].includes(accion)) return Response.json({ error: 'Acción no válida' }, { status: 400 });

        const recs = await base44.asServiceRole.entities.SolicitudCorreccion.filter({ id: solicitudId });
        if (recs.length === 0) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });
        const sol = recs[0];
        if (sol.estado !== 'pendiente') return Response.json({ error: 'La solicitud ya fue resuelta' }, { status: 400 });

        if (accion === 'aprobar') {
          await applyCorreccion(base44, sol, empId);
        }

        await base44.asServiceRole.entities.SolicitudCorreccion.update(solicitudId, {
          estado: accion === 'aprobar' ? 'aprobada' : 'rechazada',
          resuelta_por: empName,
          fecha_resolucion: new Date().toISOString(),
          comentario_admin: comentario || null
        });

        // Push al trabajador (best-effort).
        await sendOneSignalPush({
          externalUserIds: sol.employee_id,
          heading: accion === 'aprobar' ? 'Solicitud aprobada' : 'Solicitud rechazada',
          content: accion === 'aprobar'
            ? `Tu solicitud de corrección del ${sol.fecha} ha sido aprobada.`
            : `Tu solicitud de corrección del ${sol.fecha} ha sido rechazada.`,
          data: { target_url: '/control-horario' }
        });

        return Response.json({ success: true, estado: accion === 'aprobar' ? 'aprobada' : 'rechazada' });
      }

      default:
        return Response.json({ error: 'Operación no válida' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
