import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Registra o service worker (push notifications + futuro cache offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Auto-update: quando o app volta do background após ≥5 min, busca o index.html
// fresco e recarrega se uma nova build foi publicada no Netlify.
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (!hiddenAt || Date.now() - hiddenAt < 5 * 60 * 1000) return;
  try {
    const r = await fetch('/', { cache: 'no-store' });
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const serverBuild = doc.querySelector('meta[name="app-build"]')?.content;
    if (serverBuild && serverBuild !== __BUILD_TIME__) window.location.reload();
  } catch { /* offline — ignora */ }
});
