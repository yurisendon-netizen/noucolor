import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initOneSignalWeb } from '@/lib/onesignal';

// Inicializa OneSignal web (push) lo antes posible. No bloquea: en la app
// nativa (median) se ignora automáticamente.
initOneSignalWeb();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)