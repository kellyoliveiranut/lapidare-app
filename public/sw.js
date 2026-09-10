// Essentia — Service Worker
// Handles push notifications and notification click routing.

// Sem isto, um sw.js novo fica parado em "waiting" até TODAS as janelas do app
// fecharem — e um PWA no iPhone em segundo plano não fecha. Na prática qualquer
// correção aqui só entrava depois de matar o app pelo app switcher.
// Seguro enquanto este worker não RESPONDER a requisição nenhuma. Ele tem um
// handler de 'fetch' (logo abaixo, é o que torna o app instalável), mas aquele
// handler nunca chama respondWith: nada é servido nem cacheado daqui, então não
// há como uma página antiga receber asset novo. Se um dia entrar cache offline
// de verdade, esta linha precisa ser reavaliada junto com um clients.claim().
self.addEventListener('install', () => self.skipWaiting());

// --- Handler de 'fetch' — presença deliberada, ação deliberadamente nenhuma --
//
// Existe por UM motivo: o algoritmo que PROMOVE a instalação do PWA (o "+" na
// barra do Samsung Internet, o prompt do Chrome) ainda exige que o service
// worker tenha um handler de 'fetch'. Sem ele a paciente não recebe opção
// nenhuma de instalar — foi o relato de 2026-09-10 no Samsung Internet.
// Instalar PELO MENU não exige isto desde o Chrome 108; a promoção automática,
// que é o caminho que a paciente enxerga, exige.
//
// A REGRA que mantém isto seguro: NUNCA chamar event.respondWith().
// Sem respondWith, a requisição segue o caminho padrão do navegador. Nenhuma
// resposta passa por aqui e nada é cacheado — por isso o skipWaiting() acima
// continua sem risco.
//
// Se algum dia este handler passar a responder, o skipWaiting() PRECISA ser
// revisto no mesmo commit: o risco mora em responder, não em existir.
self.addEventListener('fetch', (event) => {
  // O corpo não pode ser vazio. Desde o Chromium 112, um worker cujos listeners
  // de 'fetch' são todos no-op é detectado como tal, avisado no console e
  // pulado no caminho da navegação — justamente porque sites escreviam handlers
  // vazios só para parecerem instaláveis. A leitura abaixo não faz trabalho
  // útil, e isso é deliberado: este worker não promete offline.
  if (event.request.method !== 'GET') return;
});

// --- URL pendente -----------------------------------------------------------
// No iPhone o matchAll() não enxerga a janela do app em segundo plano, então o
// postMessage nunca chega. Aqui o SW não tenta falar com ninguém: só deixa a
// URL num lugar que a janela também alcança, e quem lê é o React ao montar ou
// ao voltar do background (consumirPendente, em PushNavigator.jsx).
//
// Cache API e não IndexedDB porque 'caches' existe nos dois contextos — SW e
// window — e resolve em três linhas o que no IndexedDB seria schema, transação
// e callbacks. A Request abaixo é sintética: nunca vai à rede. A Cache API não
// dispara evento de 'fetch', e mesmo que disparasse o handler daqui não
// responde nada.
//
// As duas constantes estão duplicadas em src/components/PushNavigator.jsx —
// sw.js não é importável pelo bundle. Mudou aqui, muda lá.
const PENDING_CACHE = 'essentia-push-pending';
const PENDING_KEY = '/__push_pending';

async function salvarPendente(url) {
  const cache = await caches.open(PENDING_CACHE);
  await cache.put(PENDING_KEY, new Response(
    JSON.stringify({ url, ts: Date.now() }),
    { headers: { 'Content-Type': 'application/json' } },
  ));
}

self.addEventListener('push', (event) => {
  let data;
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
    // Gravar vem PRIMEIRO e dentro do waitUntil: se o navegador encerrar o
    // worker antes do cache.put terminar, a pendência se perde justamente no
    // caso que ela existe para cobrir. O catch mantém os dois mecanismos
    // independentes — falhar aqui não impede o caminho de baixo de tentar.
    salvarPendente(url)
      .catch((err) => console.error('[sw] falha ao gravar pendente:', err && err.message))
      .then(() => clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windowClients) => {
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
          } catch (err) {
            console.error('[sw] postMessage falhou:', err && err.message);
          }

          // Reforço para Chrome/Android, onde navigate() funciona. No iOS
          // falha calado — por isso o catch, que antes não existia e escondia
          // a rejeição dentro do waitUntil.
          return first.focus()
            .then(() => ('navigate' in first ? first.navigate(url) : undefined))
            .catch((err) => console.error('[sw] focus/navigate falhou:', err && err.message));
        }

        // Nenhuma janela aberta — abre uma nova
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
