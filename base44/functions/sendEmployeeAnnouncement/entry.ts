import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { sendOneSignalPush } from '../../shared/onesignalPush.ts';

// ── OPERACIÓN DE SISTEMA (protegida con cron_secret): envía un aviso push a uno
// o varios empleados concretos y lo deja también en su centro de notificaciones.
// Se dispara desde un workflow puntual ("Run now"), sin usuario detrás.
// args: { cron_secret, employee_ids: string[], heading, content, target_url? }
Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const args = body.args || body;
    const ids = Array.isArray(args.employee_ids) ? args.employee_ids.filter(Boolean) : [];
    if (ids.length === 0 || !args.heading || !args.content) {
      return Response.json({ error: 'Faltan employee_ids, heading o content' }, { status: 400 });
    }
    const emps = [];
    for (const id of ids) {
      const found = await base44.asServiceRole.entities.Employee.filter({ id });
      if (found[0]) emps.push(found[0]);
    }
    for (const e of emps) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          type: 'aviso_empresa', title: args.heading, message: args.content,
          employee_id: e.id, employee_name: e.full_name, read: false,
        });
      } catch (err) { console.error('Notification', err?.message); }
    }
    const push = await sendOneSignalPush({
      externalUserIds: emps.map(e => e.id),
      heading: args.heading,
      content: args.content,
      data: { target_url: args.target_url || '/control-horario' },
    });
    return Response.json({ success: true, recipients: emps.map(e => e.full_name), push });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
