// Validación de origen para endpoints de sistema disparados por cron de
// Base44. Estos endpoints se ejecutan con asServiceRole y no tienen un usuario
// detrás, así que cualquier persona podría llamarlos públicamente. Exigimos un
// secreto compartido (CRON_SECRET) en la cabecera 'x-automation-secret' que
// solo la automatización programada conoce.
export function requireCronSecret(req) {
  const provided = req.headers.get('x-automation-secret');
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || !provided || provided !== expected) {
    return Response.json(
      { error: 'No autorizado' },
      { status: 401 }
    );
  }
  return null;
}