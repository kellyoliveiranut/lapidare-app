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
        console.log('[sw] notificationclick url=', url, 'janelas=', windowClients.length);

        // Prefere janela já na URL correta
        const exact = windowClients.find((c) => c.url === url);
        if (exact && 'focus' in exact) return exact.focus();

        if (windowClients.length > 0) {
          const first = windowClients[0];

          // postMessage primeiro, e fora de qualquer .then: é o único caminho
          // que não passa pelas APIs que o WebKit engole. Se ficasse depois do
          // focus(), um focus() que rejeita levaria o recado junto.
          try {
            first.postMessage({ type: 'navigate', url });
            console.log('[sw] postMessage enviado para', first.url);
          } catch (err) {
            console.log('[sw] postMessage falhou:', err && err.message);
          }

          // Reforço para Chrome/Android, onde navigate() funciona. No iOS
          // falha calado — por isso o catch, que antes não existia e escondia
          // a rejeição dentro do waitUntil.
          return first.focus()
            .then(() => ('navigate' in first ? first.navigate(url) : undefined))
            .then(() => console.log('[sw] navigate ok'))
            .catch((err) => console.log('[sw] focus/navigate falhou:', err && err.message));
        }

        // Nenhuma janela aberta — abre uma nova
        console.log('[sw] sem janela aberta, openWindow');
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
