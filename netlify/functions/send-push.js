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
        prescricao:       { title: 'Essentia', body: 'Sua nutri enviou uma nova prescrição de suplementos', url: '/paciente/suplementos' },
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

      // GRAVA ANTES DO PUSH. O push é aviso; a LINHA é o dado. Nesta ordem, um
      // push que não sai (60 das 93 pacientes não têm assinatura), uma
      // notificação dispensada ou deslizada não perdem mais o link: ele fica de
      // pé na tela inicial dela até ser preenchido.
      //
      // Por que não `upsert`: o alvo do conflito é o ÍNDICE PARCIAL
      // avaliacao_envios_pendente_unq, e inferir índice parcial no Postgres
      // exige repetir o `where preenchido_em is null` no ON CONFLICT — que o
      // on_conflict do PostgREST não emite (erro 42P10, "no unique or exclusion
      // constraint matching"). Então: insert e, se bater no índice, update do
      // pendente. Reenvio atualiza a linha, nunca cria uma segunda.
      const agora = new Date().toISOString();
      const { error: insErro } = await supabase
        .from('avaliacao_envios')
        .insert({ paciente_id, nutri_id: caller.id, url: urlOk, enviado_em: agora });

      if (insErro && insErro.code === '23505') {
        const { error: updErro } = await supabase
          .from('avaliacao_envios')
          .update({ url: urlOk, enviado_em: agora, nutri_id: caller.id })
          .eq('paciente_id', paciente_id)
          .is('preenchido_em', null);
        if (updErro) {
          return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao registrar o link: ' + updErro.message }) };
        }
      } else if (insErro) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao registrar o link: ' + insErro.message }) };
      }

      // Corpo sem nome nem dado da paciente — notificação aparece na tela de bloqueio.
      //
      // A url do push é uma rota INTERNA, não o link do Shaped: no iOS o
      // clients.openWindow() do service worker falha em silêncio para outra
      // origem, e o clique não abria nada. /paciente/avaliacao é same-origin,
      // que o WindowClient.navigate() abre, e lá a paciente toca no link.
      //
      // SEM ?link= agora: a tela lê o pendente da tabela. A querystring era o
      // portador do dado e virava um link eterno e compartilhável na barra de
      // endereço; o push só precisa dizer "tem coisa lá".
      const resPush = await enviarParaUsuario(supabase, paciente.user_id, {
        title: 'Essentia',
        body: 'Sua nutricionista te enviou o link para realizar a avaliação física.',
        url: '/paciente/avaliacao',
      });

      // `registrado: true` é o que deixa a tela da nutri parar de tratar
      // enviados:0 como fracasso — sem push o link continua entregue.
      try {
        return { ...resPush, body: JSON.stringify({ ...JSON.parse(resPush.body), registrado: true }) };
      } catch {
        return resPush;
      }
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
        await webpush.sendNotification(row.subscription, JSON.stringify(payload));
        enviados++;
      } catch (err) {
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enviados, removidos, falhas }),
  };
}
