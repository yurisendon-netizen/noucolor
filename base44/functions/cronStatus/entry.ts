import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';
import { EXPECTED_CRON_TASKS, todayLocalDate } from '../../shared/cronMonitor.ts';

// Devuelve el estado de la última ejecución de cada tarea automática (para la
// tarjeta "Estado de tareas automáticas" del Perfil de admin/jefe). Solo
// admins/jefes. Lee los CronRun del día de hoy (Europe/Andorra) y, si hoy no
// hay ninguno para una tarea, usa el último histórico disponible.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { /* sin body */ }

    const session = await verifySession(base44, body.sessionToken);
    if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
    if (!session.isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });

    const today = todayLocalDate();
    // Últimos 200 registros ordenados por recencia bastan para hoy + histórico.
    const all = await base44.asServiceRole.entities.CronRun.list('-created_date', 200);
    const todayRuns = all.filter(r => r.fecha === today);

    const byRecency = (a, b) => String(b.created_date || '').localeCompare(String(a.created_date || ''));

    const tasks = EXPECTED_CRON_TASKS.map(name => {
      const todays = todayRuns.filter(r => r.nombre_tarea === name).sort(byRecency);
      const lastToday = todays[0] || null;
      const overallLast = all.filter(r => r.nombre_tarea === name).sort(byRecency)[0] || null;
      const ref = lastToday || overallLast;

      let todayStatus = 'sin_ejecutar';
      if (lastToday) todayStatus = lastToday.estado === 'ok' ? 'ok' : 'error';

      return {
        name,
        todayStatus,
        lastRunAt: ref?.created_date || null,
        durationMs: ref?.duracion_ms ?? null,
        lastError: ref?.estado === 'error' ? ref.mensaje_error : null,
      };
    });

    return Response.json({ success: true, date: today, tasks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});