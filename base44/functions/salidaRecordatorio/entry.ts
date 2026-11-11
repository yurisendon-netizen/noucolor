import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';
import { runCronTracked } from '../../shared/cronMonitor.ts';

// ── OPERACIÓN DE SISTEMA: recordatorio de FICHAR LA SALIDA (Yuri, 11/11/2026).
// Desde el 12/11/2026 la salida es obligatoria y se ficha en el teléfono de empresa
// (así queda la ubicación de la salida). A las 16:00 hora de Andorra (lun-vie) avisa
// a los teléfonos de empresa de quién sigue con la entrada abierta.
// El cron corre a las 14:00 y 15:00 UTC; solo actúa la ejecución que cae a las 16 h
// de Andorra (vale en invierno y en verano).

function andorraParts() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => (f.find(p => p.type === t) || {}).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);
  let body = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const { date, hour } = andorraParts();
  if (hour !== 16 && !body.force) {
    return Response.json({ success: true, skipped: `Son las ${hour} h en Andorra, no las 16 h` });
  }
  return await runCronTracked(base44, 'salidaRecordatorio', async () => {
    const open = await base44.asServiceRole.entities.TimeEntry.filter({ date, status: 'abierto' });
    const nombres = [...new Set(open.map(e => String(e.employee_name || '').split(' ')[0]).filter(Boolean))]
      .map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
    if (nombres.length === 0) return Response.json({ success: true, date, pendientes: 0 });
    const phones = (await base44.asServiceRole.entities.TelefonoEmpresa.list('nombre', 50)).filter(p => p.activo === true);
    if (phones.length === 0) return Response.json({ success: true, date, pendientes: nombres.length, sent: false, reason: 'sin teléfonos' });
    const push = await sendOneSignalPush({
      externalUserIds: phones.map(p => `terminal_${p.id}`),
      heading: `Hay que fichar la SALIDA (${nombres.length})`,
      content: `Falta fichar la salida en este teléfono: ${nombres.join(', ')}`,
      url: 'https://noucolor.base44.app/terminal',
      data: { target_url: '/terminal' },
    });
    return Response.json({ success: true, date, pendientes: nombres.length, push });
  });
});
