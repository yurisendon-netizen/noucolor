// Helper compartido para enviar notificaciones push vía la API REST de OneSignal.
// Usado por las funciones programadas de fichaje (onesignalClockInReminder y
// registerClockInAbsence). El id del empleado se vincula en la app nativa con
// window.median.onesignal.setExternalUserId(id) tras el login, y aquí se usa
// como include_external_user_ids para dirigir el push solo a ese empleado.
import { secrets } from 'base44:runtime';

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

// Devuelve { sent, recipients?, id?, error? }. Nunca lanza: el fallo de un push
// no debe romper el resto del procesamiento del cron.
export async function sendOneSignalPush({ externalUserIds, heading, content, data }) {
  const appId = secrets.get('ONESIGNAL_APP_ID');
  const restKey = secrets.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !restKey) {
    return { sent: false, error: 'Faltan ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY' };
  }

  const ids = (Array.isArray(externalUserIds) ? externalUserIds : [externalUserIds])
    .filter(id => id != null && String(id).length > 0);
  if (ids.length === 0) {
    return { sent: false, error: 'Sin destinatarios' };
  }

  const body = {
    app_id: appId,
    include_external_user_ids: ids,
    headings: { en: heading, es: heading },
    contents: { en: content, es: content },
    data: data || {}
  };

  try {
    const resp = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${restKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { sent: false, error: `OneSignal ${resp.status}: ${text}` };
    }

    const json = await resp.json().catch(() => ({}));
    return {
      sent: true,
      recipients: json.recipients,
      id: json.id,
      errors: json.errors
    };
  } catch (err) {
    return { sent: false, error: err?.message || String(err) };
  }
}