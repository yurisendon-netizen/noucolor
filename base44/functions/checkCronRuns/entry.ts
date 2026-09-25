import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { runCronTracked, notifyAdminsPush, EXPECTED_CRON_TASKS, todayLocalDate } from '../../shared/cronMonitor.ts';

// ── VIGILANTE DIARIO: disparado por cron a final de jornada (después del
// cierre automático de fichajes), lunes a viernes, zona Europe/Andorra.
// Comprueba que hoy existe al menos un CronRun (cualquier estado) de cada
// tarea automática esperada. Si alguna NO se ejecutó en absoluto (ni ok ni
// error), avisa por push a admins/jefes. Las tareas que ejecutaron pero
// fallaron ya avisaron ellas mismas al fallar (runCronTracked), así que aquí
// no se duplica: solo se alerta lo que "ni llegó a ejecutarse".
Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);

  let body = {};
  try { body = await req.clone().json(); } catch { /* sin body */ }
  const dryRun = !!body.dry_run;

  return await runCronTracked(base44, 'checkCronRuns', async () => {
    const today = todayLocalDate();
    const runs = await base44.asServiceRole.entities.CronRun.filter({ fecha: today });

    const missing = [];
    for (const task of EXPECTED_CRON_TASKS) {
      const hasRun = runs.some(r => r.nombre_tarea === task);
      if (!hasRun) missing.push(task);
    }

    if (missing.length > 0) {
      await notifyAdminsPush(
        base44,
        '⚠️ Tareas automáticas sin ejecutar',
        `Hoy no se ejecutaron: ${missing.join(', ')}. Revisa el panel de tareas automáticas.`,
        { target_url: '/perfil' },
        { dryRun }
      );
    }

    return Response.json({
      success: true,
      date: today,
      checked: EXPECTED_CRON_TASKS.length,
      missing,
      dryRun
    });
  });
});