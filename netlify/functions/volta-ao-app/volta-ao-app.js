const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const { deveLembrar, enviosDaAusencia, textoPush } = require('./decidir.js');

// Push para a paciente que está há dias sem abrir o app, pedindo que volte.
// Regras em decidir.js. Só entra quem tem notificação ativada; sem inscrição
// push nada é marcado (continua elegível se ativar depois). Log só com
// contagens: nada de nome, id ou dado de saúde.
exports.handler = async (event) => {
  // Mesma segurança de aniversarios: chamada agendada do Netlify (body com
  // next_run) ou invocação manual com x-cron-secret.
  let isNetlifyCron = false;
  try {
    isNetlifyCron = !!JSON.parse(event.body || '{}').next_run;
  } catch {
    // corpo não-JSON = não é invocação agendada
  }
  if (!isNetlifyCron) {
    const secret = process.env.CRON_SECRET;
    if (!secret || event.headers['x-cron-secret'] !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  let candidatas = 0, enviados = 0, sem_inscricao = 0, falhas = 0;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const agora = Date.now();
    const { data: pacientes, error: qErr } = await supabase
      .from('pacientes')
      .select('id, nome, user_id, tipo_plano, status_paciente, acesso_pausado, ultimo_acesso, volta_app_enviado_em, volta_app_envios')
      .eq('status_paciente', 'ativo')
      .not('user_id', 'is', null)
      .not('ultimo_acesso', 'is', null);
    if (qErr) throw qErr;

    for (const p of pacientes ?? []) {
      if (!deveLembrar(p, agora)) continue;
      candidatas++;

      const { data: rows, error: subErr } = await supabase
        .from('push_subscriptions').select('endpoint, subscription').eq('user_id', p.user_id);
      if (subErr) { falhas++; continue; }
      if (!rows?.length) { sem_inscricao++; continue; }

      // Marca ANTES de enviar: se o envio falhar, não repete amanhã (preferível
      // a mandar duas vezes).
      const { error: updErr } = await supabase.from('pacientes')
        .update({ volta_app_enviado_em: new Date(agora).toISOString(), volta_app_envios: enviosDaAusencia(p) + 1 })
        .eq('id', p.id);
      if (updErr) { falhas++; continue; }

      const payload = JSON.stringify(textoPush(p.nome, enviosDaAusencia(p)));
      let algum = false;
      await Promise.all(rows.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          algum = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          } else {
            console.error('push error:', err.statusCode);
          }
        }
      }));
      if (algum) enviados++; else falhas++;
    }

    console.log(`volta-ao-app: ${candidatas} candidatas, ${enviados} enviados, ${sem_inscricao} sem inscrição push, ${falhas} falhas`);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidatas, enviados, sem_inscricao, falhas }) };
  } catch (err) {
    console.error('volta-ao-app error:', err?.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message ?? 'Erro interno.' }) };
  }
};
