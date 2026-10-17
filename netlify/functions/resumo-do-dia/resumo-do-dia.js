const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const { montarResumo, limitesDoDia } = require('./montar.js');

// Resumo do dia para a nutri, todo dia às 7h de Belém (cron `0 10 * * *` em
// UTC, ver netlify.toml): consultas de hoje, bloqueios da agenda e lembretes.
// Só LÊ o banco (consultas, bloqueios_agenda, lembretes_nutri) e só manda push
// para quem é nutri e tem notificação ativada. Não grava nada.
//
// Não há trava de duplicidade: uma segunda execução no mesmo dia manda de novo.
// O cron do Netlify roda uma vez por dia; invocação manual (x-cron-secret)
// reenvia de propósito.
exports.handler = async (event) => {
  // Mesma segurança de lembretes-consulta e avisos-checkin-push: chamada
  // agendada do Netlify (body com next_run) ou header x-cron-secret correto.
  let isNetlifyCron = false;
  try {
    const b = JSON.parse(event.body || '{}');
    isNetlifyCron = !!b.next_run;
  } catch {
    // corpo não-JSON = não é invocação agendada
  }

  if (!isNetlifyCron) {
    const secret = process.env.CRON_SECRET;
    const provided = event.headers['x-cron-secret'];
    if (!secret || provided !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // Só contagens no log: nada de nome, texto de lembrete ou id.
  let nutris = 0, enviados = 0, falhas = 0, removidos = 0;
  const resposta = (statusCode = 200) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nutris, enviados, falhas, removidos }),
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

    const { hojeISO, inicioUTC, fimUTC } = limitesDoDia(Date.now());

    const { data: listaNutris, error: nErr } = await supabase.from('nutris').select('id, nome');
    if (nErr) throw nErr;
    const ids = (listaNutris ?? []).map((n) => n.id);
    if (!ids.length) { console.log('resumo-do-dia: nutris 0, enviados 0, falhas 0, removidos 0'); return resposta(); }

    // Só quem tem notificação ativada recebe (e só então lemos o resto).
    const { data: subs, error: sErr } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, subscription')
      .in('user_id', ids);
    if (sErr) throw sErr;
    const subsPorNutri = {};
    for (const s of subs ?? []) (subsPorNutri[s.user_id] ??= []).push(s);
    const alvo = (listaNutris ?? []).filter((n) => subsPorNutri[n.id]?.length);
    nutris = alvo.length;
    if (!alvo.length) { console.log('resumo-do-dia: nutris 0, enviados 0, falhas 0, removidos 0'); return resposta(); }
    const alvoIds = alvo.map((n) => n.id);

    const [cons, blq, lem] = await Promise.all([
      supabase
        .from('consultas')
        .select('nutri_id, data_hora, status, modalidade, local:locais_atendimento(nome), paciente:pacientes(nome)')
        .in('nutri_id', alvoIds)
        .eq('status', 'agendada')
        .gte('data_hora', inicioUTC)
        .lt('data_hora', fimUTC),
      supabase
        .from('bloqueios_agenda')
        .select('nutri_id, data, hora_inicio, hora_fim, motivo')
        .in('nutri_id', alvoIds)
        .eq('data', hojeISO),
      // Mesma regra de Visao.jsx: pendentes de hoje, atrasados e sem data.
      supabase
        .from('lembretes_nutri')
        .select('nutri_id, texto, data, hora, concluido_em')
        .in('nutri_id', alvoIds)
        .is('concluido_em', null)
        .or(`data.is.null,data.lte.${hojeISO}`),
    ]);
    if (cons.error) throw cons.error;
    if (blq.error) throw blq.error;
    if (lem.error) throw lem.error;

    const por = (linhas, id) => (linhas ?? []).filter((l) => l.nutri_id === id);

    for (const n of alvo) {
      const payload = montarResumo({
        nutriNome: n.nome,
        hojeISO,
        consultas: por(cons.data, n.id),
        bloqueios: por(blq.data, n.id),
        lembretes: por(lem.data, n.id),
      });

      // Erro numa assinatura não derruba as outras. TTL de 4 h: se o aparelho
      // estiver desligado de manhã, o resumo velho não chega à tarde.
      await Promise.all(subsPorNutri[n.id].map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify(payload), { TTL: 4 * 60 * 60 });
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

    console.log(`resumo-do-dia: nutris ${nutris}, enviados ${enviados}, falhas ${falhas}, removidos ${removidos}`);
    return resposta();
  } catch (err) {
    console.log(`resumo-do-dia: erro (${err?.name ?? 'Error'}); nutris ${nutris}, enviados ${enviados}, falhas ${falhas}`);
    return resposta(500);
  }
};
