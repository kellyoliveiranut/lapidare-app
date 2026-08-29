const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// Allowlist fechada de hosts do Shaped. Um push abre no navegador da paciente
// com um toque — a URL nunca pode ser livre. O ponto na frente em '.' + h é o
// que impede 'evilshaped.com.br' de passar por um endsWith solto.
const SHAPED_HOSTS = ['shaped.com.br'];

function normalizarUrlShaped(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;   // barra http, javascript:, data:
  const host = u.hostname.toLowerCase();
  const ok = SHAPED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  return ok ? u.href : null;                  // href normalizado, nunca a string crua
}

// [diag] TEMPORÁRIO — remover depois. Só o host do endpoint, para distinguir
// iPhone (web.push.apple.com) de Chrome (fcm.googleapis.com) sem jogar a URL
// inteira no log: o endpoint é o segredo que autoriza entregar naquele aparelho.
function hostDe(endpoint) {
  try { return new URL(endpoint).host; } catch { return null; }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Valida token do chamador
    const authHeader = event.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token ausente.' }) };
    }

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido ou expirado.' }) };
    }

    let body;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON inválido.' }) };
    }

    // [diag] TEMPORÁRIO — remover depois.
    console.log('[diag] entrada', JSON.stringify({ mode: body.mode ?? null, kind: body.kind ?? null }));

    // === Modo: notify_nutri (paciente → nutri) ===
    // O servidor resolve o nutri_id a partir do token da paciente — o frontend nunca passa user_id arbitrário.
    if (body.mode === 'notify_nutri') {
      const { data: paciente, error: pacienteError } = await supabase
        .from('pacientes')
        .select('nutri_id, nome')
        .eq('user_id', caller.id)
        .maybeSingle();

      if (pacienteError || !paciente?.nutri_id) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Sem vínculo com nutricionista.' }) };
      }

      const primeiroNome = paciente.nome.trim().split(/\s+/)[0];
      const NUTRI_PAYLOADS = {
        mensagem:       { title: primeiroNome, body: 'Nova mensagem',            url: '/nutri/chat' },
        mensagem_foto:  { title: primeiroNome, body: '📷 Nova foto',             url: '/nutri/chat' },
        foto_prato:     { title: primeiroNome, body: 'Nova foto do prato',       url: '/nutri/feed' },
        resposta_prato: { title: primeiroNome, body: 'Nova resposta num prato',  url: '/nutri/feed' },
        consulta_confirmada: { title: primeiroNome, body: 'Confirmou a consulta', url: '/nutri/agenda' },
        checkin_respondido:  { title: primeiroNome, body: 'Respondeu o check-in',  url: '/nutri/checkins' },
      };
      const payload = NUTRI_PAYLOADS[body.kind] ?? NUTRI_PAYLOADS.mensagem;

      return await enviarParaUsuario(supabase, paciente.nutri_id, payload);
    }

    // === Modo: notify_paciente (nutri → paciente) ===
    // Servidor verifica ownership (nutri_id = caller) antes de resolver o user_id da paciente.
    if (body.mode === 'notify_paciente') {
      const { paciente_id, kind } = body;
      if (!paciente_id || !kind) {
        return { statusCode: 400, body: JSON.stringify({ error: 'paciente_id e kind são obrigatórios.' }) };
      }

      const { data: paciente, error: pacienteError } = await supabase
        .from('pacientes')
        .select('user_id')
        .eq('id', paciente_id)
        .eq('nutri_id', caller.id)
        .maybeSingle();

      if (pacienteError || !paciente?.user_id) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Paciente não encontrada ou sem vínculo.' }) };
      }

      const PAYLOADS = {
        mensagem:         { title: 'Essentia', body: 'Sua nutri te enviou uma nova mensagem', url: '/paciente/chat' },
        mensagem_foto:    { title: 'Essentia', body: 'Sua nutri te enviou uma foto', url: '/paciente/chat' },
        material:         { title: 'Essentia', body: 'Sua nutri compartilhou um novo material', url: '/paciente/ebooks' },
        plano:            { title: 'Essentia', body: 'Seu plano alimentar foi atualizado', url: '/paciente/plano' },
        comentario_prato: { title: 'Essentia', body: 'Sua nutri comentou seu prato', url: '/paciente/feed' },
      };

      const payload = PAYLOADS[kind] ?? PAYLOADS.mensagem;
      return await enviarParaUsuario(supabase, paciente.user_id, payload);
    }

    // === Modo: enviar_link_avaliacao (nutri → paciente, link do Shaped) ===
    // Mesmo ownership do notify_paciente. Aqui a URL vem do frontend — por isso
    // passa pela allowlist antes de qualquer coisa, e o que segue para o push é
    // sempre a versão normalizada, nunca a string que chegou.
    if (body.mode === 'enviar_link_avaliacao') {
      const { paciente_id, url } = body;
      if (!paciente_id || !url) {
        return { statusCode: 400, body: JSON.stringify({ error: 'paciente_id e url são obrigatórios.' }) };
      }

      const urlOk = normalizarUrlShaped(url);
      if (!urlOk) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Link inválido — só aceito link do Shaped (https).' }) };
      }

      const { data: paciente, error: pacienteError } = await supabase
        .from('pacientes')
        .select('user_id')
        .eq('id', paciente_id)
        .eq('nutri_id', caller.id)
        .maybeSingle();

      if (pacienteError || !paciente?.user_id) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Paciente não encontrada ou sem vínculo.' }) };
      }

      // Corpo sem nome nem dado da paciente — notificação aparece na tela de bloqueio.
      //
      // A url do push é uma rota INTERNA, não o link do Shaped: no iOS o
      // clients.openWindow() do service worker falha em silêncio para outra
      // origem, e o clique não abria nada. /paciente/avaliacao é same-origin,
      // que o WindowClient.navigate() abre, e lá a paciente toca no link.
      // urlOk (já normalizado pela allowlist) vai como parâmetro e é validado
      // de novo no cliente, em src/lib/shaped.js.
      return await enviarParaUsuario(supabase, paciente.user_id, {
        title: 'Essentia',
        body: 'Sua nutricionista te enviou o link para realizar a avaliação física.',
        url: `/paciente/avaliacao?link=${encodeURIComponent(urlOk)}`,
      });
    }

    // === Modo: self (teste/nutri envia pra si mesma) ===
    const { user_id, payload } = body;
    if (!user_id || !payload) {
      return { statusCode: 400, body: JSON.stringify({ error: 'user_id e payload são obrigatórios.' }) };
    }

    if (user_id !== caller.id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Não autorizado a enviar para outro usuário.' }) };
    }

    return await enviarParaUsuario(supabase, user_id, payload);

  } catch (err) {
    console.error('send-push unhandled error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err.message ?? 'Erro interno.',
        detail: err.body ?? null,
      }),
    };
  }
};

async function enviarParaUsuario(supabase, userId, payload) {
  const { data: rows, error: dbError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .eq('user_id', userId);

  // [diag] TEMPORÁRIO — remover depois. payload.title é o primeiro nome da
  // paciente e fica de fora de propósito: log não é lugar de nome de paciente.
  console.log('[diag] enviarParaUsuario', JSON.stringify({
    userId,
    corpo:   payload?.body ?? null,     // 'Nova foto do prato' vs 'Nova mensagem'
    url:     payload?.url ?? null,
    linhas:  rows?.length ?? 0,
    dbError: dbError?.message ?? null,
  }));

  if (dbError) {
    return { statusCode: 500, body: JSON.stringify({ error: dbError.message }) };
  }

  if (!rows || rows.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enviados: 0, removidos: 0, falhas: 0 }),
    };
  }

  let enviados = 0, removidos = 0, falhas = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        const res = await webpush.sendNotification(row.subscription, JSON.stringify(payload));
        enviados++;
        // [diag] TEMPORÁRIO — remover depois. O statusCode do serviço de push
        // (201 = aceito) é a única prova de que a entrega saiu daqui.
        console.log('[diag] aceito', JSON.stringify({
          host:   hostDe(row.endpoint),
          status: res?.statusCode ?? null,
          body:   res?.body ?? null,
        }));
      } catch (err) {
        // [diag] TEMPORÁRIO — remover depois. Loga o err INTEIRO antes de
        // classificar: se não for um WebPushError, statusCode e body vêm
        // undefined, e a linha permanente lá embaixo imprime "undefined
        // undefined" — que é possivelmente o que escondeu isso até agora.
        console.error('[diag] sendNotification falhou', JSON.stringify({
          host:       hostDe(row.endpoint),
          name:       err?.name ?? null,
          message:    err?.message ?? null,
          statusCode: err?.statusCode ?? null,
          body:       err?.body ?? null,
          stack:      err?.stack ?? null,
        }));
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          removidos++;
        } else {
          falhas++;
          console.error('sendNotification error:', err.statusCode, err.body);
        }
      }
    }),
  );

  // [diag] TEMPORÁRIO — remover depois.
  console.log('[diag] resultado', JSON.stringify({ enviados, removidos, falhas }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enviados, removidos, falhas }),
  };
}
