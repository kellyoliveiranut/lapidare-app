const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const { agruparPorNutri } = require('./montar.js');

// Push para a nutri quando a paciente responde o check-in diário do
// Tratamento (aviso checkin_diario) ou ele traz sinal de alerta
// (alerta_oncologico). Os avisos nascem no banco (gatilho em
// monitoramento_oncologico); esta função agendada só leva o push.
//
// reservar_avisos_para_push marca push_enviado_em ANTES do envio (reserva
// atômica, `for update skip locked`): duas execuções seguidas nunca mandam o
// mesmo aviso duas vezes. O preço é que um envio que falhar não é repetido —
// o aviso continua na página Avisos e no número do menu.
//
// Formulário respondido (checkin_respondido) NÃO passa por aqui: o push dele
// continua saindo do app (avisarNutri em Checkin.jsx).
exports.handler = async (event) => {
  // Mesma segurança de lembretes-consulta e aniversarios: aceita a chamada
  // agendada do Netlify (body contém next_run) ou invocação manual com header
  // x-cron-secret correto.
  let isNetlifyCron = false;
  try {
    const b = JSON.parse(event.body || '{}');
    isNetlifyCron = !!b.next_run;
  } catch {
    // corpo não-JSON = não é invocação agendada; segue com isNetlifyCron false
  }

  if (!isNetlifyCron) {
    const secret = process.env.CRON_SECRET;
    const provided = event.headers['x-cron-secret'];
    if (!secret || provided !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // Só contagens no log: nada de nome, id ou sintoma.
  let reservados = 0, enviados = 0, falhas = 0, removidos = 0;
  const resposta = () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservados, enviados, falhas, removidos }),
  });

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // RPC pela chave de serviço (POST /rest/v1/rpc/reservar_avisos_para_push).
    // Antes de o SQL ser aplicado a função não existe: termina sem exceção.
    const { data: avisos, error: rpcErr } = await supabase.rpc('reservar_avisos_para_push', { p_limite: 50 });
    if (rpcErr) {
      console.log(`avisos-checkin-push: reserva indisponível (${rpcErr.code ?? 'sem código'}); reservados 0, enviados 0, falhas 0`);
      return resposta();
    }
    reservados = avisos?.length ?? 0;

    const grupos = agruparPorNutri(avisos);
    for (const [nutriId, payloads] of Object.entries(grupos)) {
      const { data: rows, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, subscription')
        .eq('user_id', nutriId);
      if (subErr) { falhas += payloads.length; continue; }
      if (!rows?.length) continue; // nutri sem notificação ativada: o aviso fica só na página

      for (const payload of payloads) {
        // Erro numa assinatura não derruba as outras.
        await Promise.all(rows.map(async (row) => {
          try {
            await webpush.sendNotification(row.subscription, JSON.stringify(payload));
            enviados++;
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
              removidos++;
            } else {
              falhas++;
            }
          }
        }));
      }
    }

    console.log(`avisos-checkin-push: reservados ${reservados}, enviados ${enviados}, falhas ${falhas}, removidos ${removidos}`);
    return resposta();
  } catch (err) {
    console.log(`avisos-checkin-push: erro (${err?.name ?? 'Error'}); reservados ${reservados}, enviados ${enviados}, falhas ${falhas}`);
    return resposta();
  }
};
