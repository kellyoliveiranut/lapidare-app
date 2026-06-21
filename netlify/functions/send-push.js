const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Setup VAPID e cliente Supabase (lazy — erros viram 500, não 502)
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

    const { user_id, payload } = body;
    if (!user_id || !payload) {
      return { statusCode: 400, body: JSON.stringify({ error: 'user_id e payload são obrigatórios.' }) };
    }

    // Fase 1: somente envio para si mesmo
    if (user_id !== caller.id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Não autorizado a enviar para outro usuário nesta fase.' }) };
    }

    // Busca subscriptions do usuário
    const { data: rows, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .eq('user_id', user_id);

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
