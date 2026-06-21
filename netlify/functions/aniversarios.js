const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const MENSAGEM_ANIVERSARIO = (primeiroNome) =>
  `${primeiroNome}, hoje é o seu dia — e eu fiz questão de vir aqui te desejar um feliz aniversário. Que este novo ano seja de leveza, de bons momentos e de muito carinho com você mesma. Hoje é dia de celebrar, no seu ritmo e sem culpa. Você merece. Estou com você.`;

exports.handler = async (event) => {
  // Segurança: aceita invocação agendada do Netlify (body com next_run)
  // ou chamada HTTP manual com header x-cron-secret correto.
  let isNetlifyCron = false;
  try {
    const b = JSON.parse(event.body || '{}');
    isNetlifyCron = !!b.next_run;
  } catch {}

  if (!isNetlifyCron) {
    const secret = process.env.CRON_SECRET;
    const provided = event.headers['x-cron-secret'];
    if (!secret || provided !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

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

    // Hoje em Belém (UTC-3, sem horário de verão)
    const BELEM_OFFSET_MS = 3 * 60 * 60 * 1000;
    const belemNow  = new Date(Date.now() - BELEM_OFFSET_MS);
    const belemYear = belemNow.getUTCFullYear();
    const belemMes  = belemNow.getUTCMonth() + 1; // 1-12
    const belemDia  = belemNow.getUTCDate();

    // Busca todas as pacientes ativas com nascimento e conta (user_id) cadastrados
    const { data: pacientes, error: qErr } = await supabase
      .from('pacientes')
      .select('id, nome, nascimento, nutri_id, user_id, aniversario_felicitado_em')
      .eq('status_paciente', 'ativo')
      .not('nascimento', 'is', null)
      .not('user_id', 'is', null);

    if (qErr) throw qErr;

    let enviados = 0, sem_inscricao = 0, falhas = 0;

    for (const p of pacientes ?? []) {
      // Verifica se o dia e mês de nascimento batem com hoje em Belém.
      // 'T12:00:00' evita desvio de dia por fuso — mesmo padrão de Visao.jsx.
      const nasc = new Date(p.nascimento + 'T12:00:00');
      if (nasc.getUTCMonth() + 1 !== belemMes || nasc.getUTCDate() !== belemDia) continue;

      // Pula se já parabenizou este ano em Belém
      if (p.aniversario_felicitado_em) {
        const felicitBelemDate = new Date(
          new Date(p.aniversario_felicitado_em).getTime() - BELEM_OFFSET_MS
        );
        if (felicitBelemDate.getUTCFullYear() === belemYear) continue;
      }

      const primeiroNome = p.nome.trim().split(/\s+/)[0];

      // a. Insere mensagem no chat, autorada pela nutri
      const { error: msgErr } = await supabase.from('mensagens').insert({
        paciente_id: p.id,
        nutri_id: p.nutri_id,
        de: 'nutri',
        texto: MENSAGEM_ANIVERSARIO(primeiroNome),
      });
      if (msgErr) {
        falhas++;
        console.error(`mensagem aniversário erro (paciente ${p.id}):`, msgErr.message);
        continue;
      }

      // b. Envia push para a paciente
      const { data: rows, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, subscription')
        .eq('user_id', p.user_id);

      if (!subErr && rows?.length) {
        await Promise.all(rows.map(async (row) => {
          try {
            await webpush.sendNotification(row.subscription, JSON.stringify({
              title: 'Essentia',
              body: 'Sua nutri te enviou uma nova mensagem',
              url: '/paciente/chat',
            }));
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
            } else {
              console.error('push error:', err.statusCode, err.body);
            }
          }
        }));
      } else {
        sem_inscricao++;
      }

      // c. Marca como felicitada este ano
      await supabase
        .from('pacientes')
        .update({ aniversario_felicitado_em: new Date().toISOString() })
        .eq('id', p.id);

      enviados++;
    }

    console.log(`aniversarios: ${enviados} enviados, ${sem_inscricao} sem inscrição push, ${falhas} falhas`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enviados, sem_inscricao, falhas }),
    };
  } catch (err) {
    console.error('aniversarios error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erro interno.' }),
    };
  }
};
