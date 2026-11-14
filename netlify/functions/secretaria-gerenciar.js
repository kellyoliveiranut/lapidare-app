const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Gerencia a secretária da nutri que chamou (auth: Bearer da nutri).
//   POST { acao: 'convidar', nome, email }  -> cria/renova o convite e manda o e-mail
//   POST { acao: 'revogar' }                -> desativa o acesso e apaga o login
// Só a PRÓPRIA nutri (nutris.id = caller): a secretária não gerencia a secretária.

const json = (statusCode, obj) => ({
  statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });

    const token = (event.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'Token ausente.' });
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) return json(401, { error: 'Token inválido ou expirado.' });

    const { data: nutri } = await supabase.from('nutris').select('id, nome').eq('id', caller.id).maybeSingle();
    if (!nutri) return json(403, { error: 'Só a nutricionista gerencia o acesso da secretária.' });

    let body;
    try { body = JSON.parse(event.body ?? '{}'); } catch { return json(400, { error: 'Body JSON inválido.' }); }

    const { data: atual } = await supabase.from('secretarias')
      .select('id, user_id, email').eq('nutri_id', nutri.id).eq('ativo', true).maybeSingle();

    if (body.acao === 'revogar') {
      if (!atual) return json(200, { ok: true });
      const { error } = await supabase.from('secretarias')
        .update({ ativo: false, token: null, user_id: null }).eq('id', atual.id);
      if (error) return json(500, { error: 'Não consegui revogar o acesso.' });
      if (atual.user_id) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(atual.user_id);
        if (delErr) console.error('secretaria deleteUser:', delErr.message);
      }
      return json(200, { ok: true });
    }

    if (body.acao !== 'convidar') return json(400, { error: 'Ação inválida.' });
    const email = String(body.email ?? '').trim().toLowerCase();
    const nome = String(body.nome ?? '').trim().slice(0, 80);
    if (!EMAIL_RE.test(email)) return json(400, { error: 'E-mail inválido.' });
    if (atual?.user_id) return json(409, { error: 'Já existe uma secretária com acesso ativo. Revogue antes de convidar outra.' });

    const novoToken = (await import('node:crypto')).randomUUID();
    let linha;
    if (atual) {
      const { data, error } = await supabase.from('secretarias')
        .update({ email, nome, token: novoToken, convidado_em: new Date().toISOString() })
        .eq('id', atual.id).select('id').maybeSingle();
      if (error) return json(500, { error: 'Não consegui renovar o convite.' });
      linha = data;
    } else {
      const { data, error } = await supabase.from('secretarias')
        .insert({ nutri_id: nutri.id, email, nome, token: novoToken, convidado_em: new Date().toISOString() })
        .select('id').maybeSingle();
      if (error) return json(500, { error: 'Não consegui criar o convite.' });
      linha = data;
    }

    const base = (process.env.URL || process.env.SITE_URL || '').replace(/\/$/, '');
    const link = `${base}/secretaria/${novoToken}`;

    let enviado = false;
    const gmailUser = (process.env.GMAIL_USER ?? '').trim();
    const gmailPass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
    if (gmailUser && gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gmailUser, pass: gmailPass },
        });
        const quem = nome ? `Olá, ${esc(nome.split(' ')[0])}!` : 'Olá!';
        await transporter.sendMail({
          from: `"${process.env.EMAIL_FROM_NOME || 'Essentia'}" <${gmailUser}>`,
          to: email,
          subject: 'Seu acesso ao app Essentia',
          text: `${nome ? `Olá, ${nome.split(' ')[0]}!` : 'Olá!'}\n\n${nutri.nome ?? 'A nutricionista'} liberou seu acesso de secretária ao app.\nCrie sua senha neste link (vale 7 dias):\n${link}\n`,
          html: `<p>${quem}</p><p>${esc(nutri.nome ?? 'A nutricionista')} liberou seu acesso de secretária ao app.</p><p><a href="${esc(link)}">Criar minha senha</a> (o link vale 7 dias)</p>`,
        });
        enviado = true;
      } catch (e) { console.error('secretaria e-mail:', e?.message); }
    }
    return json(200, { ok: true, enviado, link, id: linha?.id ?? null });
  } catch (err) {
    console.error('secretaria-gerenciar unhandled error:', err);
    return json(500, { error: 'Erro interno.' });
  }
};
