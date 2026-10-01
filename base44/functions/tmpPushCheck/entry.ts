import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { getOneSignalUserStatus } from '../../shared/onesignalPush.ts';

// Temporal: revisión puntual del estado push. Se borra tras usarla.
Deno.serve(async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  if (body.k !== 'nc-8f3a71d2c9e44b6a') return Response.json({ error: 'no' }, { status: 401 });
  const base44 = createClientFromRequest(req);
  const emps = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
  const out = [];
  for (const e of emps) {
    const st = await getOneSignalUserStatus(e.id);
    const subs = st.subscriptions || [];
    out.push({
      name: e.full_name, role: e.role, estado: e.estado_laboral || 'activo',
      available: st.available, error: st.error || null,
      subs: subs.map(s => ({ type: s.type, enabled: s.enabled, status: s.notification_types, last_active: s.last_active, device: s.device_model || s.device_os || null }))
    });
  }
  return Response.json({ ok: true, out });
});
