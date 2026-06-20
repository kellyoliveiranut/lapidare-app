// Essentia — Service Worker
// Handles push notifications and notification click routing.

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
