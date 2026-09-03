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

  // Guardado antes do subscribe(): distingue "o navegador devolveu a inscrição
  // que já existia" de "criei uma agora". Sem isso, uma reativação que apenas
  // atualiza a linha antiga é indistinguível de uma que cria linha nova — e foi
  // exatamente essa dúvida que travou o diagnóstico do created_at parado.
  let subscription = await registration.pushManager.getSubscription();
  const reaproveitada = !!subscription;
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

  const { error, count } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint', count: 'exact' }
  );
  if (error) throw new Error('Erro ao salvar assinatura: ' + error.message);
  // count === 0 é gravação bloqueada sem erro. count === null é só o header de
  // contagem ausente: não prova nada, e tratar como falha daria alarme falso.
  if (count === 0) {
    throw new Error(
      'A assinatura não foi gravada (0 linhas). Verifique as permissões da tabela push_subscriptions.'
    );
  }

  return { subscription, reaproveitada };
}

/**
 * Desativa o push neste aparelho e devolve o que REALMENTE aconteceu no banco:
 * { via: 'endpoint' | 'user_id', removidas: number | null }.
 *
 * O silêncio aqui era o bug: um DELETE barrado por RLS volta 200, sem erro e
 * sem linhas, idêntico a um sucesso. Por isso a contagem é exata e o resultado
 * sobe para a tela em vez de virar um "Notificações desativadas." presumido.
 *
 * removidas === 0 significa "não apagou nada" (já não havia linha, ou a
 * exclusão foi bloqueada); null significa que o header de contagem não veio.
 */
export async function desativarNotificacoes() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador não gerencia notificações push.');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  // A identidade vem antes do ramo: é ela que permite limpar o banco mesmo
  // quando o navegador já não tem inscrição para nos dar o endpoint.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Usuário não autenticado.');

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const { error, count } = await supabase
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .eq('endpoint', endpoint);
    if (error) throw new Error('Erro ao remover assinatura: ' + error.message);
    return { via: 'endpoint', removidas: count ?? null };
  }

  // Sem inscrição local — é o caso do iOS, que derruba a inscrição por fora do
  // app. Sem endpoint para casar, a identidade é a única chave que sobra, e ela
  // não distingue aparelhos: isto apaga as assinaturas de TODOS os aparelhos
  // desta conta. Quem chama precisa dizer isso na tela.
  const { error, count } = await supabase
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('user_id', user.id);
  if (error) throw new Error('Erro ao remover assinaturas: ' + error.message);
  return { via: 'user_id', removidas: count ?? null };
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

/**
 * Avisa a paciente (fire-and-forget — nunca bloqueia a UI).
 * Mesma regra de ordem do avisarNutri: a tokenPush tem que vir do topo da
 * função, antes do primeiro await de Supabase.
 *
 * A mesma promise pode alimentar vários avisos — é o caso da Biblioteca, que
 * atribui um material a N pacientes de uma vez e não precisa de N getSession.
 */
export function avisarPaciente(tokenPush, pacienteId, kind) {
  tokenPush.then(accessToken => {
    if (!accessToken || !pacienteId) return;
    fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'notify_paciente', paciente_id: pacienteId, kind }),
    }).catch(() => {});
  });
}
