import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireCronSecret } from '../../shared/cronAuth.ts';
import { runCronTracked } from '../../shared/cronMonitor.ts';

// Borrado automático de datos de geolocalización con más de 2 meses
// (recomendación de la APDA para datos de geolocalización de trabajadores).
// - Fichajes (TimeEntry): se ponen a null las coordenadas de entrada/salida y su
//   precisión. Las horas y fechas del fichaje NO se tocan.
// - EmployeeLocation: se eliminan los registros cuya última actualización tenga
//   más de 2 meses (se vuelven a crear solos en el siguiente fichaje).
// Se ejecuta a diario, así ningún dato supera los 2 meses.
const MAX_UPDATES = 3000;

function cutoffDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d;
}

Deno.serve(async (req) => {
  const unauthorized = await requireCronSecret(req);
  if (unauthorized) return unauthorized;
  const base44 = createClientFromRequest(req);
  return await runCronTracked(base44, 'purgeOldLocations', async () => {
    const cut = cutoffDate();
    const cutYmd = cut.toISOString().slice(0, 10);
    let cleaned = 0;

    // 1) Coordenadas en fichajes antiguos
    const old = await base44.asServiceRole.entities.TimeEntry.filter({ date: { $lt: cutYmd } }, 'date', 2000);
    for (const e of old) {
      if (cleaned >= MAX_UPDATES) break;
      const has = e.clock_in_lat != null || e.clock_in_lng != null || e.clock_out_lat != null || e.clock_out_lng != null
        || e.clock_in_accuracy != null || e.clock_out_accuracy != null;
      if (!has) continue;
      await base44.asServiceRole.entities.TimeEntry.update(e.id, {
        clock_in_lat: null, clock_in_lng: null, clock_in_accuracy: null,
        clock_out_lat: null, clock_out_lng: null, clock_out_accuracy: null,
      });
      cleaned++;
    }

    // 2) Última ubicación guardada por empleado
    let removedLocations = 0;
    const locs = await base44.asServiceRole.entities.EmployeeLocation.list('last_update', 500);
    for (const l of locs) {
      const t = l.last_update ? new Date(l.last_update).getTime() : 0;
      if (t < cut.getTime()) {
        await base44.asServiceRole.entities.EmployeeLocation.delete(l.id);
        removedLocations++;
      }
    }

    return Response.json({ success: true, cutoff: cutYmd, timeEntriesCleaned: cleaned, locationsRemoved: removedLocations });
  });
});
