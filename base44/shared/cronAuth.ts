// Validación de origen para endpoints de sistema disparados por cron de
// Base44 (autoCloseTimeEntries, notifyMissingClockIn). Estos endpoints se
// ejecutan con asServiceRole y no tienen un usuario detrás, así que cualquiera
// podría llamarlos públicamente. Exigimos un secreto de automatización que la
// tarea programada entrega en el cuerpo (function_args) de la petición.
//
// El valor es una constante server-side: el atacante externo solo ve el
// endpoint HTTP, nunca el código, y la tarea programada lo envía vía
// function_args en el body. Se acepta también por cabecera o query para
// pruebas manuales.
const AUTOMATION_SECRET = 'ncr_cron_9f3c7a1e8b2d4f6a0c5e9b7d3f1a8c6e4b7d2f0a';

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function requireCronSecret(req) {
  // 1) Cabecera (pruebas manuales)
  const headerSecret = req.headers.get('x-automation-secret');
  if (constantTimeEquals(headerSecret, AUTOMATION_SECRET)) return null;

  // 2) Query param (pruebas manuales)
  try {
    const querySecret = new URL(req.url).searchParams.get('cron_secret');
    if (constantTimeEquals(querySecret, AUTOMATION_SECRET)) return null;
  } catch { /* ignore */ }

  // 3) Cuerpo JSON (canal usado por la automatización programada vía function_args)
  try {
    const body = await req.clone().json();
    if (body && constantTimeEquals(body.cron_secret, AUTOMATION_SECRET)) return null;
  } catch { /* no body o no JSON — ignore */ }

  return Response.json({ error: 'No autorizado' }, { status: 401 });
}