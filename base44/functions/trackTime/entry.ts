import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';

// Ajusta este offset si Andorra está en horario de invierno (+01:00) vs verano (+02:00)
const LOCAL_UTC_OFFSET = '+02:00';
const LOCAL_UTC_OFFSET_HOURS = 2;

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

async function upsertLocation(base44, empId, empName, isActive, lat, lng) {
  try {
    const locs = await base44.asServiceRole.entities.EmployeeLocation.filter({ employee_id: empId });
    const locData = {
      employee_id: empId, employee_name: empName,
      latitude: lat, longitude: lng,
      is_active: isActive, last_update: new Date().toISOString()
    };
    if (locs.length > 0) {
      await base44.asServiceRole.entities.EmployeeLocation.update(locs[0].id, locData);
    } else {
      await base44.asServiceRole.entities.EmployeeLocation.create(locData);
    }
  } catch { /* silent */ }
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation } = body;

    // ── OPERACIÓN DE SISTEMA: llamada por el scheduled task, sin usuario detrás ──
    // No requiere callerEmployeeId porque la dispara el cron de Base44, no una persona.
    if (operation === 'autoCloseAll') {
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
      return Response.json({ success: true, closedCount: closed });
    }

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
        const { lat, lng } = body;
        // La hora de entrada, la fecha y si llega tarde se calculan aquí con el reloj
        // del servidor — nunca a partir de lo que envíe el cliente (el móvil de un
        // trabajador podría tener la hora adelantada/atrasada para evitar una falta).
        const now = new Date();
        if (isBreakTime(now)) {
          return Response.json({ error: 'No se puede fichar durante el descanso (12:30 - 13:00)' }, { status: 400 });
        }
        const clockIn = now.toISOString();
        const { hour, minutes, dateStr: date } = getLocalParts(now);
        const isLate = hour > 8 || (hour === 8 && minutes > 15);
        const localTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const lateDescription = `Fichó entrada a las ${localTime} (límite 8:15)`;

        const todayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: empId, date });
        const absenceEntry = todayEntries.find(e => e.status === 'ausencia_injustificada');
        const openEntry = todayEntries.find(e => e.status === 'abierto');

        // Already has an open entry today — don't create a duplicate
        if (openEntry) {
          await upsertLocation(base44, empId, empName, true, lat, lng);
          return Response.json({ success: true, alreadyClockedIn: true, clockIn: openEntry.clock_in, isLate: false });
        }

        if (absenceEntry) {
          await base44.asServiceRole.entities.TimeEntry.update(absenceEntry.id, {
            clock_in: clockIn, clock_in_lat: lat, clock_in_lng: lng, status: 'abierto'
          });
        } else {
          await base44.asServiceRole.entities.TimeEntry.create({
            employee_id: empId, employee_name: empName,
            clock_in: clockIn, date, clock_in_lat: lat, clock_in_lng: lng, status: 'abierto'
          });
        }

        await upsertLocation(base44, empId, empName, true, lat, lng);

        if (isLate) {
          await base44.asServiceRole.entities.Incumplimiento.create({
            employee_id: empId, employee_name: empName,
            date, type: 'entrada_tardia', description: lateDescription
          });
        }
        return Response.json({ success: true, clockIn, isLate });
      }

      case 'clockOut': {
        const { entryId, lat, lng } = body;
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
          clock_out: clockOut, clock_out_lat: lat, clock_out_lng: lng,
          total_hours: regularHours, overtime_hours: overtimeHours, status: 'cerrado'
        });
        await upsertLocation(base44, empId, empName, false, lat, lng);
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

        if (isAdmin && body.targetEmployeeId && body.targetEmployeeId !== empId) {
          const targets = await base44.asServiceRole.entities.Employee.filter({ id: body.targetEmployeeId });
          if (targets.length > 0) {
            targetEmpId = targets[0].id;
            targetEmpName = targets[0].full_name;
            targetPrecioHora = targets[0].precioHora || 0;
          }
        }

        const total = parseFloat((duration * targetPrecioHora * multiplier).toFixed(2));
        const payload = {
          employee_id: targetEmpId, employee_name: targetEmpName,
          date, start_time: startTime, end_time: endTime,
          duration: parseFloat(duration.toFixed(2)),
          obra_motivo: obraMotivo,
          precio_hora: targetPrecioHora, multiplier,
          total, status: status || 'pendiente'
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

      case 'listAllEntries': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { limit } = body;
        const data = await base44.asServiceRole.entities.TimeEntry.list('-date', limit || 200);
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

      case 'listActiveLocations': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        // Durante el descanso no se consulta la geolocalización de nadie, aunque
        // su registro siga marcado is_active (última posición de antes de comer).
        if (isBreakTime(new Date())) {
          return Response.json({ success: true, locations: [], onBreak: true });
        }
        const data = await base44.asServiceRole.entities.EmployeeLocation.filter({ is_active: true });
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

      default:
        return Response.json({ error: 'Operación no válida' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});