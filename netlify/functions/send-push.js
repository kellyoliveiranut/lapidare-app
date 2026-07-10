const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

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
        mensagem:   { title: 'Essentia', body: `Nova mensagem de ${primeiroNome}`,      url: '/nutri/chat' },
        foto_prato: { title: 'Essentia', body: `Nova foto do prato de ${primeiroNome}`, url: '/nutri/feed' },
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
        mensagem: { title: 'Essentia', body: 'Sua nutri te enviou uma nova mensagem', url: '/paciente/chat' },
        material: { title: 'Essentia', body: 'Sua nutri compartilhou um novo material', url: '/paciente/ebooks' },
        plano:    { title: 'Essentia', body: 'Seu plano alimentar foi atualizado', url: '/paciente/plano' },
      };

      const payload = PAYLOADS[kind] ?? PAYLOADS.mensagem;
      return await enviarParaUsuario(supabase, paciente.user_id, payload);
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
