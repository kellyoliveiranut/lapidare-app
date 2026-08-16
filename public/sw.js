// Essentia — Service Worker
// Handles push notifications and notification click routing.

// Sem isto, um sw.js novo fica parado em "waiting" até TODAS as janelas do app
// fecharem — e um PWA no iPhone em segundo plano não fecha. Na prática qualquer
// correção aqui só entrava depois de matar o app pelo app switcher.
// Seguro enquanto este worker não tiver handler de 'fetch': ele não serve nem
// cacheia asset nenhum, então não há risco de servir cache novo pra página
// antiga. Se um dia entrar cache offline, esta linha precisa ser reavaliada
// junto com um clients.claim().
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text?.() ?? '' };
  }

  const title = data.title || 'Essentia';
  const options = {
    body: data.body || 'Você tem uma nova notificação.',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/nutri/visao' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/paciente/inicio';

  // Link externo (Shaped): WindowClient.navigate() rejeita com TypeError fora
  // da própria origem, e matchAll() nem enxerga janela de outro site. Tentar o
  // caminho de baixo faria o clique não abrir nada quando o app já está aberto.
  // O '/' no fim da origem evita casar com 'lapidareapp.netlify.app.algo.com'.
  if (/^https?:\/\//i.test(url) && !url.startsWith(self.location.origin + '/')) {
    event.waitUntil(clients.openWindow(url));
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Prefere janela já na URL correta
        const exact = windowClients.find((c) => c.url === url);
        if (exact && 'focus' in exact) return exact.focus();
        // Navega a primeira janela aberta para a URL
        if (windowClients.length > 0) {
          const first = windowClients[0];
          return first.focus().then(() => {
            if ('navigate' in first) return first.navigate(url);
          });
        }
        // Nenhuma janela aberta — abre uma nova
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
