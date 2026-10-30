import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession, verifyPhoneSession, hashPin } from '../../shared/employeeAuth.ts';
import { autoCloseAllOpenEntries, autoCloseEntry, canAutoClose, andorraNowParts, andorraLocalToUtc } from '../../shared/timeEntryAutoClose.ts';
import { notifyAdminsPush } from '../../shared/cronMonitor.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// Hora de Andorra: siempre con la zona horaria real (verano +02:00 / invierno
// +01:00), nunca con un offset fijo.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Secretaría (Andrea): única que envía los partes de trabajo a los encargados.
const SECRETARIA_EMAIL = 'secrenoucolor@andorra.ad';
function isSecretaria(emp) {
  return emp?.user === 'andrea' || String(emp?.email || '').toLowerCase() === SECRETARIA_EMAIL;
}

// Token del conector de Gmail de la app, o null si no está conectado.
async function getGmailToken(base44) {
  try {
    const c = base44.asServiceRole.connectors;
    if (typeof c.getConnection === 'function') return (await c.getConnection('gmail'))?.accessToken || null;
    const t = await c.getAccessToken('gmail');
    return (typeof t === 'string' ? t : t?.access_token) || null;
  } catch {
    return null;
  }
}

// Correo MIME (texto + HTML + PDF adjunto) codificado en base64url para la API de Gmail.
function buildMimeMessage({ to, bcc, replyTo, subject, text, html, filename, pdfBase64 }) {
  // UTF-8 → base64 por trozos (un spread de todo el texto desborda con PDFs grandes).
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const wrap = (str) => str.replace(/.{1,76}/g, '$&\r\n');
  const mixed = `mixed_${crypto.randomUUID()}`, alt = `alt_${crypto.randomUUID()}`;
  const mime = [
    `To: ${to}`,
    `Bcc: ${bcc}`,
    `Reply-To: ${replyTo}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(text)),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(html)),
    `--${alt}--`,
    `--${mixed}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    wrap(pdfBase64),
    `--${mixed}--`,
  ].join('\r\n');
  // El mensaje ya es ASCII (cada parte va en base64), así que btoa sirve directamente.
  return btoa(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Horas extra: se cuentan en tramos de 15 minutos completos a partir de las 16:00.
const OVERTIME_STEP_H = 0.25;

async function logHistorial(base44, data) {
  try {
    await base44.asServiceRole.entities.FichajeHistorial.create(data);
  } catch (e) { console.error('FichajeHistorial', e?.message); }
}

// Recalcula horas ordinarias (hasta las 16:00, máx. 8) y extra reales de un fichaje cerrado.
// Horario flexible (p. ej. Andrea, pluriempleo): la jornada son 8 h desde que
// entra; ordinarias = hasta 8 h trabajadas, extra = lo que pase de 8 h.
function computeEntryHours(dateStr, clockInIso, clockOutIso, flexible = false) {
  const inD = new Date(clockInIso);
  const outD = new Date(clockOutIso);
  if (flexible) {
    const worked = Math.max(0, (outD.getTime() - inD.getTime()) / 3600000);
    const regularF = parseFloat(Math.min(worked, 8).toFixed(2));
    const extraF = Math.floor(Math.max(0, worked - 8) / OVERTIME_STEP_H + 1e-9) * OVERTIME_STEP_H;
    return { regular: regularF, overtime: parseFloat(extraF.toFixed(2)) };
  }
  const sixteen = andorraLocalToUtc(dateStr, '16:00');
  const endRegular = outD < sixteen ? outD : sixteen;
  let regular = (endRegular.getTime() - inD.getTime()) / 3600000;
  regular = parseFloat(Math.min(Math.max(regular, 0), 8).toFixed(2));
  const after = Math.max(0, (outD.getTime() - Math.max(sixteen.getTime(), inD.getTime())) / 3600000);
  const overtime = Math.floor(after / OVERTIME_STEP_H + 1e-9) * OVERTIME_STEP_H;
  return { regular, overtime: parseFloat(overtime.toFixed(2)) };
}

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

// Terminal FIJO del taller (p. ej. el portátil): no tiene GPS, así que el fichaje
// se guarda con la ubicación del taller. Para que no se pueda fichar con él desde
// otro sitio, su ubicación aproximada (red/WiFi) tiene que estar cerca del taller.
const TALLER = { lat: 42.46768, lng: 1.49327 };
const TALLER_RADIO_M = 3000;

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
  return andorraNowParts(utcDate);
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
async function applyCorreccion(base44, sol, adminId, adminName = '') {
  const proposedIso = sol.hora_propuesta ? andorraLocalToUtcIso(sol.fecha, sol.hora_propuesta) : null;
  const lat = sol.lat ?? null;
  const lng = sol.lng ?? null;
  const mark = { corregido_por_solicitud: true, solicitud_correccion_id: sol.id };

  const dayEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: sol.employee_id, date: sol.fecha });
  const entry = dayEntries[0];
  const before = entry
    ? { clock_in: entry.clock_in, clock_out: entry.clock_out, total_hours: entry.total_hours, overtime_hours: entry.overtime_hours, status: entry.status }
    : null;

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

  // Recalcular horas si el fichaje queda cerrado (antes se cambiaba la hora
  // pero las horas trabajadas se quedaban con el valor antiguo) y dejar
  // constancia del cambio en el historial.
  if (sol.tipo !== 'otro') {
    const after = (await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: sol.employee_id, date: sol.fecha }))[0];
    let afterData = after ? { clock_in: after.clock_in, clock_out: after.clock_out, status: after.status } : null;
    if (after && after.status === 'cerrado' && after.clock_in && after.clock_out) {
      const empRec = (await base44.asServiceRole.entities.Employee.filter({ id: sol.employee_id }))[0];
      const { regular, overtime } = computeEntryHours(after.date, after.clock_in, after.clock_out, !!empRec?.horario_flexible);
      await base44.asServiceRole.entities.TimeEntry.update(after.id, { total_hours: regular, overtime_hours: overtime, auto_closed: false });
      afterData = { ...afterData, total_hours: regular, overtime_hours: overtime };
    }
    await logHistorial(base44, {
      entry_id: after?.id || entry?.id || '', employee_id: sol.employee_id, employee_name: sol.employee_name,
      date: sol.fecha, action: 'correccion_aprobada', changed_by_id: adminId, changed_by_name: adminName,
      before: JSON.stringify(before), after: JSON.stringify(afterData),
      motivo: `Solicitud del trabajador (${sol.tipo}${sol.hora_propuesta ? ', hora ' + sol.hora_propuesta : ''}): ${sol.motivo || ''}`
    });
  }

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

// Distancia en metros entre dos coordenadas (fórmula de Haversine).
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (Number(x) * Math.PI) / 180;
  const dLat = toRad(lat2) - toRad(lat1);
  const dLng = toRad(lng2) - toRad(lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

// ── Partes diarios semanales ──────────────────────────────────────────────
// Un ParteSemanal por trabajador y semana (lunes); dentro, una línea por día.
// Los partes diarios empiezan a exigirse este día; los anteriores no cuentan.
const PARTES_DESDE = '2026-10-14';
function ymdAdd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function mondayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo
  return ymdAdd(ymd, -((dow + 6) % 7));
}
function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

// Construye la vista de la semana de un trabajador: lunes a viernes siempre;
// sábado y domingo solo si ficharon ese día. El parte es automático: horas,
// entrada/salida y obra salen de los fichajes y la asignación; el trabajador
// solo puede añadir una nota opcional.
async function buildParteSemana(base44, employeeId, weekStart, today) {
  const parte = (await base44.asServiceRole.entities.ParteSemanal.filter({ employee_id: employeeId, week_start: weekStart }))[0] || null;
  const saved = {};
  for (const d of (parte?.dias || [])) saved[d.date] = d;
  const entries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: employeeId, date: { $gte: weekStart, $lte: ymdAdd(weekStart, 6) } }, 'date', 20);
  const asig = (await base44.asServiceRole.entities.Asignacion.filter({ employee_id: employeeId }, '-date', 60));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = ymdAdd(weekStart, i);
    const dow = (i + 1) % 7; // 1=lunes ... 0=domingo
    if (date < PARTES_DESDE) continue;
    const es = entries.filter(e => e.date === date && e.status !== 'ausencia_injustificada');
    const fichado = es.length > 0;
    if (i >= 5 && !fichado && !saved[date]) continue;
    const extra = es.reduce((s, e) => s + (Number(e.overtime_hours) || 0), 0);
    const abierto = es.some(e => e.status === 'abierto');
    const a = asig.find(x => x.date <= date);
    const s = saved[date];
    const ins = es.map(e => e.clock_in).filter(Boolean).sort();
    const outs = es.map(e => e.clock_out).filter(Boolean).sort();
    days.push({
      date, dow, future: date > today, fichado, abierto,
      obra_nombre: (s?.obra_nombre) || a?.obra_nombre || '',
      entrada: ins[0] || null,
      salida: abierto ? null : (outs[outs.length - 1] || null),
      // Cada día fichado cuenta como una jornada de 8 h exactas, más las horas extra.
      horas: fichado && !abierto ? Math.round((8 + extra) * 100) / 100 : null,
      horas_extra: fichado && !abierto ? Math.round(extra * 100) / 100 : null,
      descripcion: s?.descripcion || '',
      materiales: s?.materiales || '',
      done: !!s,
      saved_at: s?.saved_at || null,
    });
  }
  return { parte, days };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation } = body;

    const { sessionToken } = body;

    // Verify caller identity via session token (not client-supplied employeeId)
    const session = await verifySession(base44, sessionToken);
    let kiosk = null; // registro TelefonoEmpresa si se ficha desde un teléfono de empresa
    let fixedLoc = false; // fichaje desde un terminal fijo del taller (ubicación del taller)
    let op = operation;
    let caller, empId, empName, isAdmin;
    if (session) {
      caller = session.employee;
      empId = caller.id;
      empName = caller.full_name;
      isAdmin = session.isAdmin;
    } else {
      // Terminal de fichaje (TelefonoEmpresa): solo puede listar los nombres de los
      // operarios, comprobar un PIN y fichar por ellos. No lee ni toca nada más.
      kiosk = await verifyPhoneSession(base44, sessionToken);
      if (!kiosk) {
        return Response.json({ error: 'No autorizado' }, { status: 401 });
      }
      if (!['kioskWorkers', 'kioskCheckPin', 'kioskClockIn', 'kioskClockOut', 'kioskPartes', 'kioskFirmarParte'].includes(operation)) {
        return Response.json({ error: 'No autorizado' }, { status: 403 });
      }
      const todayStr = getLocalParts(new Date()).dateStr;

      // ── Partes por firmar en el terminal: el encargado de la obra firma con el
      // dedo los partes SIN firma de los últimos 14 días. No puede editar el
      // parte ni cambiar una firma que ya exista.
      const d14 = new Date(`${todayStr}T12:00:00Z`); d14.setUTCDate(d14.getUTCDate() - 14);
      const desdeFirma = d14.toISOString().slice(0, 10);
      const parteSinFirma = (w) => !w.encargado_firma && typeof w.date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && w.date >= desdeFirma && w.date <= todayStr;
      if (operation === 'kioskPartes') {
        const all = await base44.asServiceRole.entities.WorkOrder.filter({ date: { $gte: desdeFirma } }, '-date', 300);
        const partes = all.filter(parteSinFirma).map(w => ({
          id: w.id,
          date: w.date,
          title: w.title || '',
          client_name: w.client_name || '',
          description: w.description || '',
          materials: w.materials || '',
          notes: w.notes || '',
          // Si no se puso encargado, el parte guarda el nombre de quien lo hizo: no se propone
          encargado_obra: w.encargado_obra && w.encargado_obra !== w.assigned_name ? w.encargado_obra : '',
          total_horas: w.total_horas || 0,
          assigned_name: w.assigned_name || '',
          horas_trabajadas: (Array.isArray(w.horas_trabajadas) ? w.horas_trabajadas : [])
            .map(h => ({ employee_name: h.employee_name, horas: h.horas })),
        }));
        return Response.json({ success: true, partes });
      }
      if (operation === 'kioskFirmarParte') {
        const found = body.workOrderId ? await base44.asServiceRole.entities.WorkOrder.filter({ id: String(body.workOrderId) }) : [];
        const w = found[0];
        if (!w) return Response.json({ success: false, error: 'Parte no encontrado' }, { status: 404 });
        if (w.encargado_firma) return Response.json({ success: false, error: 'Este parte ya está firmado.' }, { status: 400 });
        if (!parteSinFirma(w)) return Response.json({ success: false, error: 'Este parte ya no se puede firmar desde el terminal.' }, { status: 400 });
        const dataUrl = typeof body.firmaDataUrl === 'string' ? body.firmaDataUrl : '';
        if (!/^data:image\/(png|jpeg);base64,/.test(dataUrl) || dataUrl.length > 1500000) {
          return Response.json({ success: false, error: 'Firma no válida. Vuelve a firmar.' }, { status: 400 });
        }
        const encargado = typeof body.encargado === 'string' ? body.encargado.trim().slice(0, 200) : '';
        if (!encargado) return Response.json({ success: false, error: 'Pon el nombre del encargado que firma.' }, { status: 400 });
        // Igual que al crear el parte: se sube como imagen y, si falla, se guarda la propia imagen.
        let firma = dataUrl;
        try {
          const isJpeg = dataUrl.startsWith('data:image/jpeg');
          const bin = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
          const file = new File([bin], isJpeg ? 'firma_encargado.jpg' : 'firma_encargado.png', { type: isJpeg ? 'image/jpeg' : 'image/png' });
          const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (up?.file_url) firma = up.file_url;
        } catch (e) { console.error('upload firma terminal', e); }
        await base44.asServiceRole.entities.WorkOrder.update(w.id, { encargado_firma: firma, encargado_obra: encargado });
        return Response.json({ success: true });
      }
      if (operation === 'kioskWorkers') {
        const emps = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
        const entries = await base44.asServiceRole.entities.TimeEntry.filter({ date: todayStr });
        const workers = emps
          .filter(e => e.role === 'operario' && e.user !== 'googletester')
          .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'es'))
          .map(e => {
            const mine = entries.filter(x => x.employee_id === e.id);
            const open = mine.find(x => x.status === 'abierto');
            const closed = mine.find(x => x.status === 'cerrado');
            return {
              id: e.id, full_name: e.full_name, estado_laboral: e.estado_laboral || 'activo',
              pin_set: !!e.pin_hash,
              estado: open ? 'dentro' : (closed ? 'terminado' : 'sin_fichar'),
              entrada: open ? open.clock_in : (closed ? closed.clock_in : null),
            };
          });
        return Response.json({ success: true, phone: kiosk.nombre, ubicacion_fija: kiosk.ubicacion_fija === true, date: todayStr, workers });
      }
      // kioskClockIn / kioskClockOut: el trabajador elige su nombre y mete su PIN.
      const worker = (await base44.asServiceRole.entities.Employee.filter({ id: String(body.employeeId || '') }))[0];
      if (!worker || worker.is_active === false || worker.role !== 'operario') {
        return Response.json({ success: false, error: 'Trabajador no válido' }, { status: 400 });
      }
      if (!worker.pin_hash) {
        return Response.json({ success: false, error: 'Aún no tienes código de seguridad. Créalo en tu usuario personal (Código de seguridad) o pídeselo a un administrador.' });
      }
      const nowMs = Date.now();
      if (worker.pin_lock_until && new Date(worker.pin_lock_until).getTime() > nowMs) {
        const mins = Math.ceil((new Date(worker.pin_lock_until).getTime() - nowMs) / 60000);
        return Response.json({ success: false, locked: true, error: `Demasiados intentos. Vuelve a probar en ${mins} min.` });
      }
      const pinStr = String(body.pin || '');
      const pinOk = /^\d{4}$/.test(pinStr) && (await hashPin(pinStr, String(worker.pin_hash).split(':')[0])) === worker.pin_hash;
      if (!pinOk) {
        const fails = (Number(worker.pin_fails) || 0) + 1;
        if (fails >= 5) {
          await base44.asServiceRole.entities.Employee.update(worker.id, { pin_fails: 0, pin_lock_until: new Date(nowMs + 5 * 60000).toISOString() });
          return Response.json({ success: false, locked: true, error: 'Código incorrecto 5 veces. Bloqueado 5 minutos.' });
        }
        await base44.asServiceRole.entities.Employee.update(worker.id, { pin_fails: fails });
        return Response.json({ success: false, error: `Código incorrecto (${5 - fails} intento${5 - fails === 1 ? '' : 's'} restante${5 - fails === 1 ? '' : 's'})` });
      }
      if (Number(worker.pin_fails) > 0 || worker.pin_lock_until) {
        await base44.asServiceRole.entities.Employee.update(worker.id, { pin_fails: 0, pin_lock_until: '' });
      }
      // PIN correcto: devolver solo el estado de HOY de ese trabajador.
      if (operation === 'kioskCheckPin') {
        const today = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: worker.id, date: todayStr });
        const open = today.find(x => x.status === 'abierto');
        const closed = today.filter(x => x.status === 'cerrado').sort((a, b) => String(b.clock_out).localeCompare(String(a.clock_out)))[0];
        return Response.json({
          success: true,
          estado: open ? 'dentro' : (closed ? 'terminado' : 'fuera'),
          entrada: open ? open.clock_in : (closed ? closed.clock_in : null),
          salida: closed && !open ? closed.clock_out : null,
          estado_laboral: worker.estado_laboral || 'activo',
        });
      }
      caller = worker;
      empId = worker.id;
      empName = worker.full_name;
      isAdmin = false;
      if (kiosk.ubicacion_fija === true) {
        // Terminal fijo: la ubicación aproximada debe estar cerca del taller.
        if (!isValidCoord(body.lat, body.lng)) {
          return Response.json({ success: false, error: 'Este terminal no da su ubicación. Activa la ubicación en Windows y en Chrome y vuelve a probar. No se ha fichado.' });
        }
        const d = distMeters(Number(body.lat), Number(body.lng), TALLER.lat, TALLER.lng);
        if (d > TALLER_RADIO_M) {
          return Response.json({ success: false, error: `Este terminal solo puede fichar en el taller y ahora está a ${(d / 1000).toFixed(1).replace('.', ',')} km. No se ha fichado.` });
        }
        fixedLoc = true;
        body.lat = TALLER.lat;
        body.lng = TALLER.lng;
        body.accuracy = 0;
      }
      if (operation === 'kioskClockOut') {
        const open = (await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: worker.id, status: 'abierto' }, '-clock_in', 5))[0];
        if (!open) {
          return Response.json({ success: false, error: 'No tienes ninguna entrada abierta para cerrar.' });
        }
        body.entryId = open.id;
        op = 'clockOut';
      } else {
        op = 'clockIn';
      }
    }

    // Los operarios SOLO fichan en el terminal del taller, nunca desde su usuario personal.
    // (googletester queda fuera: es la cuenta de revisión de Google Play, no un trabajador.)
    if (!kiosk && (op === 'clockIn' || op === 'clockOut') && caller.role === 'operario' && caller.user !== 'googletester') {
      return Response.json({ error: 'El fichaje se realiza en el terminal del taller.' }, { status: 403 });
    }

    switch (op) {
      case 'clockIn': {
        const { lat, lng, accuracy } = body;
        if (!isValidCoord(lat, lng)) {
          return Response.json({ error: 'Ubicación obligatoria para fichar. Activa el GPS y la ubicación exacta y vuelve a intentarlo.' }, { status: 400 });
        }
        const acc = toAccuracy(accuracy);
        // Sin margen de error o con el respaldo fijo del taller = versión antigua de la app.
        if (!fixedLoc && (acc === null || isLegacyBackup(lat, lng))) {
          return Response.json({ error: OUTDATED_MSG }, { status: 400 });
        }
        if (!fixedLoc && acc > GPS_MAX_ACCEPT_M) {
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
        const flexible = !!caller.horario_flexible;
        // Ventana de fichaje de entrada: 7:45 (465) – 8:30 (510). Fuera de este
        // tramo no se puede fichar la entrada. Con horario flexible: 7:00 – 15:00
        // y nunca cuenta como retraso.
        const openMin = flexible ? 420 : 465;
        const closeMin = flexible ? 900 : 510;
        if (totalMinutes < openMin) {
          return Response.json({ error: `El fichaje de entrada abre a las ${flexible ? '7:00' : '7:45'}` }, { status: 400 });
        }
        if (totalMinutes > closeMin) {
          return Response.json({ error: `El fichaje de entrada se cerró a las ${flexible ? '15:00' : '8:30'}. Contacta con tu encargado.` }, { status: 400 });
        }
        const isLate = !flexible && (hour > 8 || (hour === 8 && minutes > 15));
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
            clock_in: clockIn, clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false, clock_in_accuracy: acc, status: 'abierto',
            origen: kiosk ? 'terminal' : 'personal',
            ...(kiosk ? { fichado_desde_entrada: kiosk.nombre } : {})
          });
        } else {
          await base44.asServiceRole.entities.TimeEntry.create({
            employee_id: empId, employee_name: empName,
            clock_in: clockIn, date, clock_in_lat: lat, clock_in_lng: lng, clock_in_fallback: false, clock_in_accuracy: acc, status: 'abierto',
            origen: kiosk ? 'terminal' : 'personal',
            ...(kiosk ? { fichado_desde_entrada: kiosk.nombre } : {})
          });
        }

        await upsertLocation(base44, empId, empName, true, lat, lng, acc);

        // Control de obra: si el admin le asignó una obra hoy y ficha lejos, avisa por push.
        try {
          // La obra asignada se mantiene día tras día: vale la más reciente de hoy o anterior.
          const asig = (await base44.asServiceRole.entities.Asignacion.filter({ employee_id: empId }, '-date', 50))
            .filter(x => x.date <= date);
          if (asig.length > 0) {
            const a = asig[0];
            const d = distMeters(lat, lng, a.lat, a.lng);
            const radio = Number(a.radio_m) || 300;
            if (d > radio) {
              await notifyAdminsPush(
                base44,
                `📍 ${empName} ha fichado fuera de la obra`,
                `Ha fichado a ${d} m de «${a.obra_nombre}» (máx. ${radio} m).`,
                { target_url: '/registro-fichajes' }
              );
            }
          }
        } catch (e) { console.error('control obra', e); }

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
        if (!fixedLoc && (acc === null || isLegacyBackup(lat, lng))) {
          return Response.json({ error: OUTDATED_MSG }, { status: 400 });
        }
        if (!fixedLoc && acc > GPS_MAX_ACCEPT_M) {
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
        // Horas REALES (Llei 31/2018, art. 59): ordinarias hasta las 16:00 y extra
        // = tiempo real después de las 16:00 en tramos de 15 min completos.
        const flexibleOut = !!caller.horario_flexible;
        const { regular: regularHours, overtime: overtimeHours } = computeEntryHours(entry.date, entry.clock_in, clockOut, flexibleOut);

        await base44.asServiceRole.entities.TimeEntry.update(entryId, {
          clock_out: clockOut, clock_out_lat: lat, clock_out_lng: lng, clock_out_fallback: false, clock_out_accuracy: acc,
          total_hours: regularHours, overtime_hours: overtimeHours, status: 'cerrado',
          origen_salida: kiosk ? 'terminal' : 'personal',
          ...(kiosk ? { fichado_desde_salida: kiosk.nombre } : {})
        });

        // Las horas extra fichadas quedan como "pendiente" en Horas Extras y SOLO
        // se pagan si un admin las aprueba (art. 57.4: la iniciativa de hacer
        // extras es de la empresa). Laborable: lo fichado después de las 16:00.
        // Sábado/domingo: todo lo trabajado ese día.
        const dow = new Date(`${entry.date}T12:00:00Z`).getUTCDay();
        const isWeekendDay = dow === 0 || dow === 6;
        const pendingHours = isWeekendDay
          ? Math.floor(((now.getTime() - new Date(entry.clock_in).getTime()) / 3600000) / OVERTIME_STEP_H + 1e-9) * OVERTIME_STEP_H
          : overtimeHours;
        if (pendingHours > 0) {
          try {
            const { hour: oh, minutes: om } = getLocalParts(now);
            const endTime = `${String(oh).padStart(2, '0')}:${String(om).padStart(2, '0')}`;
            const { hour: ih, minutes: im } = getLocalParts(new Date(entry.clock_in));
            let startTime = isWeekendDay ? `${String(ih).padStart(2, '0')}:${String(im).padStart(2, '0')}` : '16:00';
            if (!isWeekendDay && flexibleOut) {
              const { hour: sh, minutes: sm } = getLocalParts(new Date(new Date(entry.clock_in).getTime() + 8 * 3600000));
              startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
            }
            const precioHora = caller.precioHora || 0;
            const precioExtra = caller.precioHoraExtra > 0 ? caller.precioHoraExtra : Math.round(precioHora * 1.4 * 100) / 100;
            const payload = {
              employee_id: empId, employee_name: empName, date: entry.date,
              start_time: startTime, end_time: endTime, duration: parseFloat(pendingHours.toFixed(2)),
              obra_motivo: isWeekendDay ? `Fichaje: trabajo en fin de semana ${startTime}-${endTime}` : `Fichaje: salida a las ${endTime}`,
              precio_hora: precioHora, multiplier: 1.4,
              total: Math.round(pendingHours * precioExtra * 100) / 100,
              status: 'pendiente'
            };
            const existing = (await base44.asServiceRole.entities.OvertimeHour.filter({ employee_id: empId, date: entry.date }))
              .find(o => (o.obra_motivo || '').startsWith('Fichaje:'));
            if (existing) await base44.asServiceRole.entities.OvertimeHour.update(existing.id, payload);
            else await base44.asServiceRole.entities.OvertimeHour.create(payload);
            await notifyAdminsPush(base44, '⏱️ Horas extra por aprobar',
              `${empName} ha fichado la salida a las ${endTime} (${parseFloat(pendingHours.toFixed(2))} h extra${isWeekendDay ? ', fin de semana' : ''}).`, { target_url: '/horas-extras' });
          } catch (e) { console.error('overtime pendiente', e?.message); }
        }

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
        // a las 16:00 hora de Andorra, horas calculadas por el servidor. Solo a
        // partir de las 21:00 (o días anteriores): antes se puede fichar la salida real.
        if (!canAutoClose(entries[0])) {
          return Response.json({ success: false, skipped: true, reason: 'Todavía se puede fichar la salida real' });
        }
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
        // Con horario flexible no hay falta por no fichar a las 8:30.
        if (caller.horario_flexible) return Response.json({ success: true, skipped: true });
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

      // Horas extras vía service role (el RLS {{user.id}} de Employee/OvertimeHour no
      // coincide con el login propio de la app, así que el cliente las ve vacías).
      case 'listEmployeesAdmin': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const all = await base44.asServiceRole.entities.Employee.list('full_name', 200);
        const employees = all
          .filter(e => e.is_active !== false && e.role !== 'jefe' && e.estado_laboral !== 'baja' && !/tester/i.test(e.full_name || ''))
          .map(e => ({ id: e.id, full_name: e.full_name, precioHora: e.precioHora || 0, precioHoraExtra: e.precioHoraExtra || 0, is_active: e.is_active !== false }));
        return Response.json({ success: true, employees });
      }

      case 'listOvertime': {
        const data = isAdmin
          ? await base44.asServiceRole.entities.OvertimeHour.list('-created_date', 500)
          : await base44.asServiceRole.entities.OvertimeHour.filter({ employee_id: empId }, '-created_date', 200);
        return Response.json({ success: true, overtime: data });
      }

      case 'deleteOvertime': {
        const { overtimeId } = body;
        if (!overtimeId) return Response.json({ error: 'Falta overtimeId' }, { status: 400 });
        const rec = await base44.asServiceRole.entities.OvertimeHour.filter({ id: overtimeId });
        if (rec.length === 0) return Response.json({ error: 'Registro no encontrado' }, { status: 404 });
        if (!isAdmin && (rec[0].employee_id !== empId || rec[0].status !== 'pendiente')) {
          return Response.json({ error: 'No autorizado' }, { status: 403 });
        }
        await base44.asServiceRole.entities.OvertimeHour.delete(overtimeId);
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

      // ── Sanciones (Registro de fichajes → Amonestaciones). Solo admins.
      case 'listSanciones': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const data = await base44.asServiceRole.entities.Sancion.list('-date', 2000);
        return Response.json({ success: true, sanciones: data });
      }

      case 'createSancion': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
        const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 1000) : '';
        const date = typeof body.date === 'string' ? body.date : '';
        if (!employeeId || !motivo || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json({ error: 'Indica trabajador, fecha y motivo.' }, { status: 400 });
        }
        const targets = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
        if (targets.length === 0) return Response.json({ error: 'Trabajador no encontrado' }, { status: 404 });
        const created = await base44.asServiceRole.entities.Sancion.create({
          employee_id: employeeId, employee_name: targets[0].full_name,
          date, motivo, impuesta_por: empName,
        });
        const all = await base44.asServiceRole.entities.Sancion.filter({ employee_id: employeeId });
        return Response.json({ success: true, sancion: created, total: all.length });
      }

      case 'deleteSancion': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { sancionId } = body;
        if (!sancionId) return Response.json({ error: 'Falta sancionId' }, { status: 400 });
        await base44.asServiceRole.entities.Sancion.delete(sancionId);
        return Response.json({ success: true });
      }

      // ── Control de obra del día (Registro de fichajes). Solo admins.
      case 'listControlDia': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : getLocalParts(new Date()).dateStr;
        const db = base44.asServiceRole.entities;
        const [emps, entries, recent] = await Promise.all([
          db.Employee.list('full_name', 500),
          db.TimeEntry.filter({ date }),
          db.Asignacion.list('-date', 500),
        ]);
        // La obra asignada se mantiene día tras día hasta que se cambie: por trabajador
        // vale la asignación más reciente con fecha <= la del día consultado.
        const asigs = [];
        const seenEmp = new Set();
        for (const r of recent) {
          if (r.date <= date && !seenEmp.has(r.employee_id)) { seenEmp.add(r.employee_id); asigs.push(r); }
        }
        const rows = emps
          .filter(e => e.is_active !== false && e.role !== 'jefe' && !/tester/i.test(e.full_name || ''))
          .map(e => {
            const t = entries.find(x => x.employee_id === e.id && x.status !== 'ausencia_injustificada');
            const a = asigs.find(x => x.employee_id === e.id) || null;
            let distancia = null, fuera = false;
            if (t && t.clock_in_lat != null && a) {
              distancia = distMeters(t.clock_in_lat, t.clock_in_lng, a.lat, a.lng);
              fuera = distancia > (Number(a.radio_m) || 300);
            }
            return {
              id: e.id, full_name: e.full_name, estado_laboral: e.estado_laboral || 'activo',
              clock_in: t ? t.clock_in : null, clock_out: t ? t.clock_out : null,
              lat: t ? t.clock_in_lat ?? null : null, lng: t ? t.clock_in_lng ?? null : null,
              accuracy: t ? t.clock_in_accuracy ?? null : null,
              asignacion: a ? { id: a.id, obra_nombre: a.obra_nombre, lat: a.lat, lng: a.lng, radio_m: Number(a.radio_m) || 300, desde: a.date, heredada: a.date !== date } : null,
              distancia, fuera,
            };
          });
        const seen = new Map();
        for (const r of recent) {
          if (r.obra_nombre && !seen.has(r.obra_nombre)) seen.set(r.obra_nombre, { obra_nombre: r.obra_nombre, lat: r.lat, lng: r.lng, radio_m: Number(r.radio_m) || 300 });
        }
        return Response.json({ success: true, date, rows, lugares: Array.from(seen.values()).slice(0, 20) });
      }

      // Parte semanal de un trabajador (el propio; un admin puede pedir el de otro).
      case 'getParteSemana': {
        const target = isAdmin && body.employeeId ? String(body.employeeId) : empId;
        const today = getLocalParts(new Date()).dateStr;
        const ref = isYmd(body.date) ? body.date : today;
        const weekStart = mondayOf(ref);
        const view = await buildParteSemana(base44, target, weekStart, today);
        return Response.json({ success: true, week_start: weekStart, week_end: ymdAdd(weekStart, 6), today, days: view.days });
      }

      // Guarda la nota opcional de un día del parte semanal (las horas salen solas
      // del fichaje). Solo el propio trabajador (o un admin en nombre de otro) y
      // nunca días futuros.
      case 'saveParteDia': {
        const target = isAdmin && body.employeeId ? String(body.employeeId) : empId;
        const today = getLocalParts(new Date()).dateStr;
        const date = body.date;
        if (!isYmd(date)) return Response.json({ error: 'Fecha no válida' }, { status: 400 });
        if (date > today) return Response.json({ error: 'No puedes rellenar el parte de un día futuro' }, { status: 400 });
        if (!isAdmin && date < ymdAdd(today, -14)) return Response.json({ error: 'Ese día ya no se puede editar. Habla con administración.' }, { status: 400 });
        const descripcion = String(body.descripcion || '').trim().slice(0, 2000);
        const obra = String(body.obra_nombre || '').trim().slice(0, 200);
        const materiales = String(body.materiales || '').trim().slice(0, 1000);
        if (!descripcion && !materiales && !obra) return Response.json({ error: 'Escribe una nota' }, { status: 400 });
        const emp = (await base44.asServiceRole.entities.Employee.filter({ id: target }))[0];
        if (!emp) return Response.json({ error: 'Trabajador no encontrado' }, { status: 404 });
        const weekStart = mondayOf(date);
        const line = { date, obra_nombre: obra, descripcion, materiales, saved_at: new Date().toISOString() };
        const existing = (await base44.asServiceRole.entities.ParteSemanal.filter({ employee_id: target, week_start: weekStart }))[0];
        if (existing) {
          const dias = (existing.dias || []).filter(d => d.date !== date).concat([line]).sort((a, b) => a.date.localeCompare(b.date));
          await base44.asServiceRole.entities.ParteSemanal.update(existing.id, { dias, employee_name: emp.full_name });
        } else {
          await base44.asServiceRole.entities.ParteSemanal.create({ employee_id: target, employee_name: emp.full_name, week_start: weekStart, dias: [line] });
        }
        return Response.json({ success: true });
      }

      // Calendario de horas fichadas de un mes. Cada trabajador ve solo lo suyo; un
      // admin ve a toda la plantilla o a un trabajador concreto (employeeId).
      case 'calendarioHoras': {
        const month = String(body.month || '');
        if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Mes no válido' }, { status: 400 });
        const [y, m] = month.split('-').map(Number);
        const from = `${month}-01`;
        const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
        const target = !isAdmin ? empId : (body.employeeId ? String(body.employeeId) : null);
        const range = { date: { $gte: from, $lte: to } };
        const entries = (await base44.asServiceRole.entities.TimeEntry.filter(target ? { ...range, employee_id: target } : range, 'date', target ? 200 : 3000))
          .filter(t => t.status !== 'ausencia_injustificada');
        let employees;
        if (!isAdmin) {
          employees = [{ id: empId, full_name: empName }];
        } else {
          employees = (await base44.asServiceRole.entities.Employee.list('full_name', 500))
            .filter(e => e.role !== 'jefe' && !/tester/i.test(e.full_name || ''))
            .filter(e => e.is_active !== false || entries.some(t => t.employee_id === e.id))
            .map(e => ({ id: e.id, full_name: e.full_name }));
        }
        return Response.json({
          success: true, month, from, to, today: getLocalParts(new Date()).dateStr, employees,
          entries: entries.map(t => ({
            employee_id: t.employee_id, date: t.date, clock_in: t.clock_in || null, clock_out: t.clock_out || null,
            total_hours: Number(t.total_hours) || 0, overtime_hours: Number(t.overtime_hours) || 0, abierto: t.status === 'abierto',
          })),
        });
      }

      // Admin: estado de los partes de toda la plantilla en una semana.
      case 'listPartesSemana': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const today = getLocalParts(new Date()).dateStr;
        const weekStart = mondayOf(isYmd(body.date) ? body.date : today);
        const emps = (await base44.asServiceRole.entities.Employee.list('full_name', 200))
          .filter(e => e.is_active !== false && e.role === 'operario' && e.estado_laboral !== 'baja' && !/tester/i.test(e.full_name || ''));
        const rows = [];
        for (const e of emps) {
          const v = await buildParteSemana(base44, e.id, weekStart, today);
          rows.push({ employee_id: e.id, employee_name: e.full_name, days: v.days });
        }
        return Response.json({ success: true, week_start: weekStart, week_end: ymdAdd(weekStart, 6), today, rows });
      }

      // Aviso de prueba a los admins/jefes: comprueba que el push llega y a cuántos dispositivos.
      case 'testPushAdmins': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const r = await notifyAdminsPush(
          base44,
          '✅ Aviso de prueba',
          'Si ves esto, los avisos de fichaje fuera de obra te llegarán.',
          { target_url: '/registro-fichajes' }
        );
        return Response.json({ success: true, result: r });
      }

      case 'saveAsignaciones': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.filter(x => typeof x === 'string') : [];
        const dates = Array.isArray(body.dates) ? body.dates.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
        const obra = typeof body.obra_nombre === 'string' ? body.obra_nombre.trim().slice(0, 200) : '';
        const lat = Number(body.lat), lng = Number(body.lng);
        const radio = Math.min(2000, Math.max(50, Number(body.radio_m) || 300));
        if (employeeIds.length === 0 || dates.length === 0 || dates.length > 31 || !obra || !isValidCoord(lat, lng)) {
          return Response.json({ error: 'Indica trabajadores, fecha, nombre de la obra y su ubicación.' }, { status: 400 });
        }
        const db = base44.asServiceRole.entities;
        const emps = await db.Employee.list('full_name', 500);
        let saved = 0;
        for (const eid of employeeIds) {
          const emp = emps.find(e => e.id === eid);
          if (!emp) continue;
          for (const d of dates) {
            const existing = await db.Asignacion.filter({ employee_id: eid, date: d });
            const payload = { employee_id: eid, employee_name: emp.full_name, date: d, obra_nombre: obra, lat, lng, radio_m: radio };
            if (existing.length > 0) await db.Asignacion.update(existing[0].id, payload);
            else await db.Asignacion.create(payload);
            saved++;
          }
        }
        return Response.json({ success: true, saved });
      }

      case 'deleteAsignacion': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { asignacionId } = body;
        if (!asignacionId) return Response.json({ error: 'Falta asignacionId' }, { status: 400 });
        await base44.asServiceRole.entities.Asignacion.delete(asignacionId);
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
          encargado_email: EMAIL_RE.test(str(f.encargado_email, 200)) ? str(f.encargado_email, 200).toLowerCase() : '',
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

      // Solo Andrea (secretaría): envía el parte al encargado desde el servidor, con el
      // PDF adjunto. Por orden de preferencia:
      //  0. Conector de Gmail de la app: desde la cuenta de Gmail que lo autorizó.
      //  1. SMTP_HOST/SMTP_USER/SMTP_PASS: desde el buzón real de Andrea (entrega a
      //     cualquier dirección y las respuestas le llegan a ella).
      //  2. RESEND_FROM (remitente de un dominio verificado en Resend): con respuesta y
      //     copia oculta a Andrea.
      //  3. Correo integrado de Base44: solo entrega a usuarios de la app.
      // Si el envío falla se devuelve el enlace al PDF para que pueda enviarlo a mano.
      case 'sendWorkOrderEmail': {
        if (!isSecretaria(caller)) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { workOrderId, pdfBase64 } = body;
        const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 300) : '';
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 10000) : '';
        if (!EMAIL_RE.test(to)) {
          console.warn('sendWorkOrderEmail: correo no válido', to);
          return Response.json({ error: 'El correo del encargado no es válido.' }, { status: 400 });
        }
        if (!subject || !message) return Response.json({ error: 'Faltan el asunto o el mensaje.' }, { status: 400 });
        const found = await base44.asServiceRole.entities.WorkOrder.filter({ id: workOrderId });
        if (found.length === 0) return Response.json({ error: 'Parte no encontrado' }, { status: 404 });
        if (typeof pdfBase64 !== 'string' || !pdfBase64 || pdfBase64.length > 8000000) {
          console.warn('sendWorkOrderEmail: PDF no válido', typeof pdfBase64, pdfBase64?.length);
          return Response.json({ error: 'No se ha podido generar el PDF del parte.' }, { status: 400 });
        }
        const bin = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
        const safe = (found[0].title || 'parte').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
        const filename = `Parte_${safe}.pdf`;
        const up = await base44.asServiceRole.integrations.Core.UploadFile({ file: new File([bin], filename, { type: 'application/pdf' }) });
        const pdfUrl = up?.file_url || null;

        const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">${esc(message).replace(/\n/g, '<br>')}</div>`;
        const resendKey = Deno.env.get('RESEND_API_KEY');
        const resendFrom = Deno.env.get('RESEND_FROM');
        const smtpHost = Deno.env.get('SMTP_HOST');
        const smtpUser = Deno.env.get('SMTP_USER');
        const smtpPass = Deno.env.get('SMTP_PASS');
        let via = '';
        try {
          const gmailToken = await getGmailToken(base44);
          if (gmailToken) {
            const raw = buildMimeMessage({ to, bcc: SECRETARIA_EMAIL, replyTo: SECRETARIA_EMAIL, subject, text: message, html: htmlBody, filename, pdfBase64 });
            const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ raw }),
            });
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              throw new Error(data?.error?.message || `Gmail ${r.status}`);
            }
            via = 'gmail';
          } else if (smtpHost && smtpUser && smtpPass) {
            // Se carga aquí y no arriba: un fallo de la librería no debe tumbar los fichajes.
            const { default: nodemailer } = await import('npm:nodemailer@6.9.16');
            const port = Number(Deno.env.get('SMTP_PORT') || 587);
            const transport = nodemailer.createTransport({
              host: smtpHost, port, secure: port === 465,
              auth: { user: smtpUser, pass: smtpPass },
            });
            await transport.sendMail({
              from: `${Deno.env.get('SMTP_FROM_NAME') || 'Noucolor'} <${smtpUser}>`,
              to, bcc: smtpUser, subject, text: message, html: htmlBody,
              attachments: [{ filename, content: pdfBase64, encoding: 'base64', contentType: 'application/pdf' }],
            });
            via = 'smtp';
          } else if (resendKey && resendFrom) {
            const r = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: resendFrom, to: [to], reply_to: SECRETARIA_EMAIL, bcc: [SECRETARIA_EMAIL],
                subject, text: message, html: htmlBody,
                attachments: [{ filename, content: pdfBase64 }],
              }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data?.message || `Resend ${r.status}`);
            via = 'resend';
          } else {
            const link = pdfUrl ? `<p><a href="${pdfUrl}">Descarregar el parte de treball (PDF)</a></p>` : '';
            await base44.asServiceRole.integrations.Core.SendEmail({ to, from_name: 'Noucolor', subject, body: htmlBody + link });
            via = 'base44';
          }
        } catch (e) {
          console.error('sendWorkOrderEmail', e?.message);
          return Response.json({ error: `No se ha podido enviar el correo: ${e?.message || 'error desconocido'}`, pdfUrl }, { status: 502 });
        }
        await base44.asServiceRole.entities.WorkOrder.update(workOrderId, {
          encargado_email: to, enviado_a: to, enviado_at: new Date().toISOString(),
        });
        return Response.json({ success: true, via, pdfUrl });
      }

      // Andrea ha abierto Gmail con el parte: se deja constancia de a quién se envió.
      case 'markWorkOrderSent': {
        if (!isSecretaria(caller)) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
        if (!EMAIL_RE.test(to)) return Response.json({ error: 'El correo del encargado no es válido.' }, { status: 400 });
        const found = await base44.asServiceRole.entities.WorkOrder.filter({ id: body.workOrderId });
        if (found.length === 0) return Response.json({ error: 'Parte no encontrado' }, { status: 404 });
        await base44.asServiceRole.entities.WorkOrder.update(found[0].id, {
          encargado_email: to, enviado_a: to, enviado_at: new Date().toISOString(),
        });
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
        // Art. 77.3: las nóminas se conservan mínimo 3 años. Una nómina firmada o
        // reclamada por el trabajador ya no se puede borrar.
        const recs = await base44.asServiceRole.entities.Payroll.filter({ id: payrollId });
        if (recs.length === 0) return Response.json({ error: 'Nómina no encontrada' }, { status: 404 });
        if (recs[0].worker_signature_name || recs[0].reclamacion_texto) {
          return Response.json({ error: 'Esta nómina ya está firmada o reclamada por el trabajador y hay que conservarla (mínimo 3 años). No se puede eliminar.' }, { status: 409 });
        }
        await base44.asServiceRole.entities.Payroll.delete(payrollId);
        return Response.json({ success: true });
      }

      // El trabajador no está de acuerdo con su nómina o su compte d'hores (art. 59.2:
      // tiene 7 días naturales para comunicarlo y la empresa debe revisarlo).
      case 'disputePayroll': {
        const { payrollId, texto } = body;
        if (!payrollId || !texto || !String(texto).trim()) return Response.json({ error: 'Explica qué no es correcto' }, { status: 400 });
        const recs = await base44.asServiceRole.entities.Payroll.filter({ id: payrollId });
        if (recs.length === 0) return Response.json({ error: 'Nómina no encontrada' }, { status: 404 });
        if (recs[0].employee_id !== empId) return Response.json({ error: 'No autorizado' }, { status: 403 });
        const updated = await base44.asServiceRole.entities.Payroll.update(payrollId, {
          reclamacion_texto: String(texto).trim().slice(0, 2000),
          reclamacion_fecha: new Date().toISOString(),
          reclamacion_estado: 'pendiente',
        });
        await notifyAdminsPush(base44, '⚠️ Reclamación de nómina',
          `${empName} no está conforme con su nómina ${recs[0].period_month}/${recs[0].period_year}. Revísala.`, { target_url: '/nominas' });
        return Response.json({ success: true, payroll: updated });
      }

      case 'resolveDisputePayroll': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { payrollId, respuesta } = body;
        if (!payrollId || !respuesta) return Response.json({ error: 'Escribe la respuesta' }, { status: 400 });
        const recs = await base44.asServiceRole.entities.Payroll.filter({ id: payrollId });
        if (recs.length === 0) return Response.json({ error: 'Nómina no encontrada' }, { status: 404 });
        const updated = await base44.asServiceRole.entities.Payroll.update(payrollId, {
          reclamacion_estado: 'resuelta',
          reclamacion_respuesta: String(respuesta).trim().slice(0, 2000),
          reclamacion_resuelta_por: empName,
          reclamacion_resuelta_fecha: new Date().toISOString(),
        });
        await sendOneSignalPush({
          externalUserIds: recs[0].employee_id,
          heading: 'Reclamación de nómina revisada',
          content: `Tu reclamación de la nómina ${recs[0].period_month}/${recs[0].period_year} ha sido revisada.`,
          data: { target_url: '/nominas' }
        });
        return Response.json({ success: true, payroll: updated });
      }

      // Historial de cambios de fichajes (quién cambió qué y cuándo). Solo admins.
      case 'listHistorialFichajes': {
        if (!isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });
        const { limit } = body;
        const data = await base44.asServiceRole.entities.FichajeHistorial.list('-created_date', limit || 300);
        return Response.json({ success: true, historial: data });
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
          await logHistorial(base44, {
            entry_id: absenceEntry?.id || '', employee_id: id, employee_name: emp.full_name, date,
            action: 'apertura_admin', changed_by_id: empId, changed_by_name: empName,
            before: JSON.stringify(absenceEntry ? { status: absenceEntry.status, clock_in: absenceEntry.clock_in } : null),
            after: JSON.stringify({ clock_in: clockInIso, status: 'abierto' }),
            motivo: absenceEntry ? 'Entrada abierta por un admin sobre una falta registrada' : 'Entrada abierta por un admin (olvido de fichar)'
          });
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
          await applyCorreccion(base44, sol, empId, empName);
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
        console.warn('trackTime: operación no válida', op);
        return Response.json({ error: 'Operación no válida' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
