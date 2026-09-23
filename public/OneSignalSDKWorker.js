// Service worker de OneSignal: solo carga el SDK. El propio OneSignal gestiona
// el clic y abre la URL definida en el campo `url` del payload, así evitamos
// abrir dos pestañas con un listener propio.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
