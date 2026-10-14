import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { runCronTracked } from '../../shared/cronMonitor.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// Aviso de fin de día (lun-vie): a quien ha fichado hoy y todavía no ha
// rellenado la línea de hoy en su parte semanal.
function todayAndorra() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Andorra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function mondayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7))).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);
  return await runCronTracked(base44, 'partesDiariosRecordatorio', async () => {
    const today = todayAndorra();
    const week = mondayOf(today);
    const emps = (await base44.asServiceRole.entities.Employee.list('full_name', 200))
      .filter(e => e.is_active !== false && e.role === 'operario' && e.estado_laboral !== 'baja' && !/tester/i.test(e.full_name || ''));
    const entries = await base44.asServiceRole.entities.TimeEntry.filter({ date: today }, 'date', 200);
    const partes = await base44.asServiceRole.entities.ParteSemanal.filter({ week_start: week }, 'week_start', 200);

    const pendientes = [];
    for (const e of emps) {
      const fichó = entries.some(t => t.employee_id === e.id && t.status !== 'ausencia_injustificada');
      if (!fichó) continue;
      const parte = partes.find(p => p.employee_id === e.id);
      const hecho = (parte?.dias || []).some(d => d.date === today);
      if (!hecho) pendientes.push(e);
    }

    let sent = null;
    if (pendientes.length > 0) {
      sent = await sendOneSignalPush({
        externalUserIds: pendientes.map(p => p.id),
        heading: '📝 Parte del día pendiente',
        content: 'Rellena el parte de hoy antes de irte (Partes diarios).',
        data: { target_url: '/partes-diarios' },
      });
    }
    return Response.json({ success: true, date: today, pendientes: pendientes.map(p => p.full_name), push: sent });
  });
});
