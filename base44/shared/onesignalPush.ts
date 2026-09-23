// Helper compartido para enviar notificaciones push vía la nueva API REST de
// OneSignal (api.onesignal.com/notifications). Usado por las funciones
// programadas de fichaje (onesignalClockInReminder y registerClockInAbsence).
// El id del empleado se vincula como external_id (web y nativa) tras el login,
// y aquí se dirige con include_aliases { external_id } + target_channel "push".
import { secrets } from 'base44:runtime';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

// Devuelve { sent, recipients?, id?, error? }. Nunca lanza: el fallo de un push
// no debe romper el resto del procesamiento del cron.
export async function sendOneSignalPush({ externalUserIds, heading, content, data, url }) {
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
    include_aliases: { external_id: ids },
    target_channel: 'push',
    headings: { en: heading, es: heading },
    contents: { en: content, es: content },
    url: url || 'https://noucolor.base44.app/control-horario',
    data: data || {}
  };

  try {
    const resp = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Key ${restKey}`
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