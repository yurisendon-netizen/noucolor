import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Diagnóstico de un solo uso: ¿puede Core.SendEmail (el email integrado y
// gratuito de Base44) entregar a un empleado que YA es un User verificado
// de la plataforma (Andrea), y a uno que NO lo es todavía (Nabil), con y
// sin crear antes su fila en la entidad User?
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const results = [];

    // 1) Andrea ya es User verificado (is_verified: true) — caso de control.
    try {
      const r1 = await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'besoli6@hotmail.com',
        from_name: 'Noucolor',
        subject: 'Prueba 1 — Andrea (ya es User verificado)',
        body: '<p>Prueba de entrega vía Core.SendEmail a un usuario ya verificado.</p>',
      });
      results.push({ test: 'andrea_verified_user', to: 'besoli6@hotmail.com', ok: true, response: r1 });
    } catch (e) {
      results.push({ test: 'andrea_verified_user', to: 'besoli6@hotmail.com', ok: false, error: e.message });
    }

    // 2) Nabil, SIN fila en User todavía — ¿falla?
    try {
      const r2 = await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'nabilzarioh511@gmail.com',
        from_name: 'Noucolor',
        subject: 'Prueba 2 — Nabil (sin fila User)',
        body: '<p>Prueba de entrega vía Core.SendEmail sin fila User previa.</p>',
      });
      results.push({ test: 'nabil_no_user_row', to: 'nabilzarioh511@gmail.com', ok: true, response: r2 });
    } catch (e) {
      results.push({ test: 'nabil_no_user_row', to: 'nabilzarioh511@gmail.com', ok: false, error: e.message });
    }

    // 3) Crear la fila User para Nabil (sin verificar) y reintentar.
    try {
      const existing = await base44.asServiceRole.entities.User.filter({ email: 'nabilzarioh511@gmail.com' });
      if (existing.length === 0) {
        await base44.asServiceRole.entities.User.create({
          email: 'nabilzarioh511@gmail.com',
          full_name: 'Nabil Zarioh Nafei',
          role: 'user',
        });
      }
      const r3 = await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'nabilzarioh511@gmail.com',
        from_name: 'Noucolor',
        subject: 'Prueba 3 — Nabil (con fila User recién creada, sin verificar)',
        body: '<p>Prueba de entrega vía Core.SendEmail con fila User creada pero no verificada.</p>',
      });
      results.push({ test: 'nabil_unverified_user_row', to: 'nabilzarioh511@gmail.com', ok: true, response: r3 });
    } catch (e) {
      results.push({ test: 'nabil_unverified_user_row', to: 'nabilzarioh511@gmail.com', ok: false, error: e.message });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
