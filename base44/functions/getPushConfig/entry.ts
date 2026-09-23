import { secrets } from 'base44:runtime';

// El App ID de OneSignal es un valor PÚBLICO por diseño (va embebido en el SDK
// web del navegador). Lo sirve el backend solo porque vive como secreto en
// base44; no expone nada sensible. Lo usa el cliente para inicializar OneSignal.
export default async function(req) {
  try {
    const appId = secrets.get('ONESIGNAL_APP_ID');
    return Response.json({ onesignal_app_id: appId || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}