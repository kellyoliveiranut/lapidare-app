import { supabase } from './supabase.js';

export const VAPID_PUBLIC_KEY =
  'BD-nMECGFJKGXggipzxi9b1RntpoMMI9GoPGojLnnlH1AG7pKjjzk8-P06R1fWZIcs9U1c3F45tUI0H7g1VCbgA';

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function ativarNotificacoes() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications não são suportadas neste dispositivo ou navegador.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Permissão negada. Para ativar, permita notificações nas configurações do navegador.'
    );
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Usuário não autenticado.');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error('Erro ao salvar assinatura: ' + error.message);

  return subscription;
}

export async function desativarNotificacoes() {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/**
 * Começa a resolver o token do push ANTES de qualquer outra chamada ao Supabase.
 *
 * A ordem não é estilo, é o conserto de um bug: getSession() disputa o mesmo
 * lock de auth que toda query do PostgREST usa. Quando era chamado DEPOIS do
 * insert, com outra query saindo logo atrás (o carregar() do feed, o navigate
 * do check-in), o .then() podia nunca resolver — o fetch do push não chegava a
 * ser criado, e não havia erro nenhum para aparecer, nem no cliente nem no log
 * da function. Chat e confirmação de consulta funcionavam só porque nada mais
 * saía depois deles.
 *
 * Chame no topo da função, antes do primeiro await de Supabase, e guarde a
 * promise. Não use await aqui: se esta promise entrar no caminho crítico, uma
 * sessão travada deixa de custar o push e passa a custar o insert.
 */
export function iniciarTokenPush() {
  return supabase.auth.getSession()
    .then(r => r.data.session?.access_token ?? null)
    .catch(() => null);
}

/**
 * Avisa a nutri (fire-and-forget — nunca bloqueia a UI).
 * Recebe a promise devolvida por iniciarTokenPush(), não o token pronto.
 */
export function avisarNutri(tokenPush, kind) {
  tokenPush.then(accessToken => {
    if (!accessToken) return;
    fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'notify_nutri', kind }),
    }).catch(() => {});
  });
}
