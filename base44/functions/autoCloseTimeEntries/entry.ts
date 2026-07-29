import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { autoCloseAllOpenEntries } from '../../shared/timeEntryAutoClose.ts';

// ── OPERACIÓN DE SISTEMA: disparada por un cron de Base44 a las 16:35 hora de
// Andorra, sin usuario detrás (igual que notifyMissingClockIn). Cierra
// cualquier fichaje que siga 'abierto' y desactiva su geolocalización, para
// que no dependa de que alguien abra la app pasada la ventana de salida
// (16:00-16:30) — si nadie lo hace, el fichaje se queda abierto y la
// ubicación mostrada en Geolocalización se congela con las coordenadas de
// ese día.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const closed = await autoCloseAllOpenEntries(base44);
    return Response.json({ success: true, closedCount: closed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
