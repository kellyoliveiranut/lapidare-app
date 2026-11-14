const { createClient } = require('@supabase/supabase-js');

// Convite da secretária (service_role).
//   GET  ?token=<uuid>      -> confere e devolve nome/e-mail
//   POST { token, senha }   -> cria o login (role 'secretaria') e liga à nutri
// O trigger handle_new_user só cria ficha para role 'nutri'/'paciente'; role
// 'secretaria' não gera ficha (mesmo caminho do cuidador).

const json = (statusCode, obj) => ({
  statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_DIAS = 7;

exports.handler = async (event) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });

    let token, senha;
    if (event.httpMethod === 'GET') {
      token = event.queryStringParameters?.token;
    } else if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body ?? '{}'); } catch { return json(400, { error: 'Body JSON inválido.' }); }
      token = body.token; senha = String(body.senha ?? '');
    } else return { statusCode: 405, body: 'Method Not Allowed' };

    if (!token || !UUID_RE.test(token)) return json(404, { error: 'Convite inválido.' });

    const { data: sec, error: secErr } = await supabase.from('secretarias')
      .select('id, nome, email, nutri_id, user_id, convidado_em, ativo').eq('token', token).maybeSingle();
    if (secErr) return json(500, { error: 'Não consegui consultar o convite.' });
    if (!sec || !sec.ativo || sec.user_id) return json(404, { error: 'Convite inválido ou já usado.' });

    const em = sec.convidado_em ? new Date(sec.convidado_em).getTime() : 0;
    if (!em || Date.now() - em > VALIDADE_DIAS * 86400000) {
      return json(410, { error: 'Este convite venceu. Peça à nutricionista um novo.' });
    }
    const email = String(sec.email ?? '').trim().toLowerCase();

    if (event.httpMethod === 'GET') return json(200, { nome: sec.nome ?? '', email });

    if (senha.length < 6) return json(400, { error: 'A senha precisa de pelo menos 6 caracteres.' });

    const { data: criado, error: criarErr } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      user_metadata: { role: 'secretaria', nome: sec.nome ?? null },
    });
    if (criarErr || !criado?.user) {
      if (/already|registered|exists/i.test(String(criarErr?.message ?? ''))) {
        return json(409, { error: 'Este e-mail já tem cadastro no app. Peça à nutricionista para usar outro e-mail.' });
      }
      console.error('secretaria createUser:', criarErr?.message);
      return json(500, { error: 'Não consegui criar o acesso. Tente novamente.' });
    }

    const { data: ligado, error: ligarErr } = await supabase.from('secretarias')
      .update({ user_id: criado.user.id, token: null, ativada_em: new Date().toISOString() })
      .eq('id', sec.id).eq('token', token).is('user_id', null).select('id');
    if (ligarErr || !ligado || ligado.length !== 1) {
      await supabase.auth.admin.deleteUser(criado.user.id).catch(() => {});
      return json(409, { error: 'Este convite já foi usado.' });
    }
    return json(200, { ok: true, email });
  } catch (err) {
    console.error('secretaria-convite unhandled error:', err);
    return json(500, { error: 'Erro interno.' });
  }
};
