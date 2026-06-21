const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Segurança: aceita chamada agendada do Netlify (body contém next_run)
  // ou invocação manual com header x-cron-secret correto.
  // A invocação agendada não pode carregar nosso segredo, então a separamos
  // pelo formato do corpo enviado pelo Netlify Scheduler.
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

    // "Amanhã em Belém" — Belém é UTC-3 fixo, sem horário de verão
    const BELEM_OFFSET_MS = 3 * 60 * 60 * 1000;
    const belemNow = new Date(Date.now() - BELEM_OFFSET_MS);
    const y  = belemNow.getUTCFullYear();
    const mo = belemNow.getUTCMonth();
    const d  = belemNow.getUTCDate();

    // Meia-noite de amanhã em Belém = 03:00 UTC do dia seguinte
    const tomorrowStartUTC = new Date(Date.UTC(y, mo, d + 1, 3, 0, 0));
    const tomorrowEndUTC   = new Date(Date.UTC(y, mo, d + 2, 3, 0, 0));

    // Consultas de amanhã (Belém), agendadas, com lembrete ativo, push ainda não enviado
    const { data: consultas, error: qErr } = await supabase
      .from('consultas')
      .select('id, data_hora, paciente:pacientes(user_id, nome)')
      .eq('status', 'agendada')
      .eq('lembrete_ativo', true)
      .is('push_lembrete_enviado_em', null)
      .gte('data_hora', tomorrowStartUTC.toISOString())
      .lt('data_hora', tomorrowEndUTC.toISOString());

    if (qErr) throw qErr;

    let enviados = 0, sem_inscricao = 0, falhas = 0;

    for (const c of consultas ?? []) {
      const userId = c.paciente?.user_id;
      if (!userId) { sem_inscricao++; continue; }

      // Hora da consulta no fuso de Belém
      const horaBelemDate = new Date(new Date(c.data_hora).getTime() - BELEM_OFFSET_MS);
      const hora = `${String(horaBelemDate.getUTCHours()).padStart(2, '0')}:${String(horaBelemDate.getUTCMinutes()).padStart(2, '0')}`;

      const payload = {
        title: 'Essentia',
        body: `Lembrete: você tem consulta amanhã às ${hora}`,
        url: '/paciente/inicio',
      };

      const { data: rows, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, subscription')
        .eq('user_id', userId);

      if (subErr || !rows?.length) { sem_inscricao++; continue; }

      let algumEnviado = false;
      await Promise.all(rows.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify(payload));
          algumEnviado = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          } else {
            falhas++;
            console.error('push error:', err.statusCode, err.body);
          }
        }
      }));

      if (algumEnviado) {
        await supabase
          .from('consultas')
          .update({ push_lembrete_enviado_em: new Date().toISOString() })
          .eq('id', c.id);
        enviados++;
      }
    }

    console.log(`lembretes-consulta: ${enviados} enviados, ${sem_inscricao} sem inscrição, ${falhas} falhas`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enviados, sem_inscricao, falhas }),
    };
  } catch (err) {
    console.error('lembretes-consulta error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erro interno.' }),
    };
  }
};
