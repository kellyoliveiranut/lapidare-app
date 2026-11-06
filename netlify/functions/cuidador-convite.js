const { createClient } = require('@supabase/supabase-js');

// Convite do cuidador, do lado do servidor (service_role).
//   GET  ?token=<uuid>           -> confere o convite e devolve o que a tela mostra
//   POST { token, senha }        -> cria o login do cuidador e liga à paciente
//
// Por que aqui e não no cadastro normal: o trigger handle_new_user cria uma FICHA
// DE PACIENTE para quem se cadastra com role 'paciente'. O cuidador não pode ter
// ficha própria — ele entra na ficha da paciente (pacientes.cuidador_user_id).
// O login é criado com role 'cuidador', que o trigger ignora.

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_DIAS = 7;

exports.handler = async (event) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let token;
    let senha;
    if (event.httpMethod === 'GET') {
      token = event.queryStringParameters?.token;
    } else if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body ?? '{}'); } catch { return json(400, { error: 'Body JSON inválido.' }); }
      token = body.token;
      senha = String(body.senha ?? '');
    } else {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!token || !UUID_RE.test(token)) return json(404, { error: 'Convite inválido.' });

    const { data: pac, error: pacErr } = await supabase
      .from('pacientes')
      .select('id, nome, nutri_id, cuidador_nome, cuidador_email, cuidador_user_id, cuidador_convidado_em')
      .eq('cuidador_token', token)
      .maybeSingle();
    if (pacErr) return json(500, { error: 'Não consegui consultar o convite.' });
    if (!pac || pac.cuidador_user_id) return json(404, { error: 'Convite inválido ou já usado.' });

    const convidadoEm = pac.cuidador_convidado_em ? new Date(pac.cuidador_convidado_em).getTime() : 0;
    if (!convidadoEm || Date.now() - convidadoEm > VALIDADE_DIAS * 86400000) {
      return json(410, { error: 'Este convite venceu. Peça à nutricionista um novo link.' });
    }

    const email = String(pac.cuidador_email ?? '').trim().toLowerCase();
    if (!email) return json(400, { error: 'O convite está sem e-mail. Peça à nutricionista para corrigir.' });

    if (event.httpMethod === 'GET') {
      return json(200, {
        cuidador_nome: pac.cuidador_nome ?? '',
        paciente_primeiro_nome: String(pac.nome ?? '').split(' ')[0],
        email,
      });
    }

    // POST: cria o login
    if (senha.length < 6) return json(400, { error: 'A senha precisa de pelo menos 6 caracteres.' });

    const { data: criado, error: criarErr } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { role: 'cuidador', nome: pac.cuidador_nome ?? null, paciente_id: pac.id },
    });
    if (criarErr || !criado?.user) {
      const msg = String(criarErr?.message ?? '');
      if (/already|registered|exists/i.test(msg)) {
        return json(409, { error: 'Este e-mail já tem cadastro no app. Peça à nutricionista para usar outro e-mail.' });
      }
      console.error('cuidador createUser:', msg);
      return json(500, { error: 'Não consegui criar o acesso. Tente novamente.' });
    }

    // Liga à paciente. O filtro por token + cuidador_user_id nulo garante uso único,
    // mesmo com dois cliques ao mesmo tempo.
    const { data: ligado, error: ligarErr } = await supabase
      .from('pacientes')
      .update({
        cuidador_user_id: criado.user.id,
        cuidador_token: null,
        cuidador_ativado_em: new Date().toISOString(),
      })
      .eq('id', pac.id)
      .eq('cuidador_token', token)
      .is('cuidador_user_id', null)
      .select('id');
    if (ligarErr || !ligado || ligado.length !== 1) {
      await supabase.auth.admin.deleteUser(criado.user.id).catch(() => {});
      return json(409, { error: 'Este convite já foi usado.' });
    }

    return json(200, { ok: true, email });
  } catch (err) {
    console.error('cuidador-convite unhandled error:', err);
    return json(500, { error: 'Erro interno.' });
  }
};
