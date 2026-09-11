const { createClient } = require('@supabase/supabase-js');
const { randomInt } = require('node:crypto');

// Senha e acesso da paciente, do lado do servidor.
//
// Existe porque o painel do Supabase só oferece "Send password recovery" e
// "Send magic link" — os dois mandam e-mail. Quando o e-mail da paciente mudou
// no cadastro mas não em auth.users, ou quando a conta nasceu sem e-mail real
// (cadastro manual, endereço sintético @essentia.local), nenhum e-mail chega e
// a nutri fica sem caminho. Aqui a senha é gravada direto pela Admin API, que
// só roda com service_role e por isso não pode viver no navegador.
//
// Duas ações no MESMO endpoint de propósito: a tela precisa do diagnóstico
// antes de a nutri escolher o caminho, e um endpoint só mantém a validação de
// vínculo em um lugar. Duas funções seriam duas cópias da mesma checagem.

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

// Alfabeto sem caracteres ambíguos (nada de i/l/1, o/0): esta senha vai ser
// lida de um WhatsApp e digitada num teclado de celular. randomInt e não
// Math.random — é credencial, não sorteio de enfeite.
const ALFA = 'abcdefghjkmnpqrstuvwxyz23456789';
const gerarSenha = () =>
  Array.from({ length: 4 }, () =>
    Array.from({ length: 3 }, () => ALFA[randomInt(ALFA.length)]).join('')
  ).join('-');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1) Valida token da nutri (mesmo padrão do enviar-farmacia / send-push)
    const authHeader = event.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'Token ausente.' });

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) return json(401, { error: 'Token inválido ou expirado.' });

    // 2) Body
    let body;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return json(400, { error: 'Body JSON inválido.' });
    }
    const paciente_id = body.paciente_id;
    const acao = body.acao;
    if (!paciente_id) return json(400, { error: 'paciente_id é obrigatório.' });
    const ACOES = ['diagnostico', 'definir', 'atualizar_email'];
    if (!ACOES.includes(acao)) {
      return json(400, { error: 'Ação inválida.' });
    }

    // 3) Ownership. É esta linha que impede a nutri A de mexer na paciente da
    //    nutri B — e impede uma paciente de chamar isto, porque o id dela nunca
    //    casa com nutri_id. O frontend manda só o paciente_id; quem resolve o
    //    auth_id é o servidor, nunca o cliente.
    const { data: paciente, error: pacErr } = await supabase
      .from('pacientes')
      .select('nome, email, telefone, user_id')
      .eq('id', paciente_id)
      .eq('nutri_id', caller.id)
      .maybeSingle();

    if (pacErr)    return json(500, { error: pacErr.message });
    if (!paciente) return json(403, { error: 'Paciente não encontrada ou sem vínculo.' });
    if (!paciente.user_id) {
      return json(400, { error: 'Esta paciente ainda não tem conta. Use o link de convite.' });
    }

    // 4) O e-mail que REALMENTE entra no app. Roda nas duas ações, para o
    //    diagnóstico e a definição enxergarem exatamente o mesmo estado.
    const { data: alvo, error: getErr } = await supabase.auth.admin.getUserById(paciente.user_id);
    if (getErr || !alvo?.user) {
      return json(500, { error: 'Não consegui ler a conta desta paciente.' });
    }
    const emailLogin = alvo.user.email ?? null;
    // Conta de cadastro manual: o e-mail do auth é derivado do token de convite
    // (ver SignupPaciente.jsx). Nunca recebeu e nunca vai receber e-mail.
    const sintetico = !!emailLogin && emailLogin.endsWith('@essentia.local');
    const divergente = !!emailLogin && !sintetico
      && emailLogin.toLowerCase() !== (paciente.email ?? '').toLowerCase();

    if (acao === 'diagnostico') {
      return json(200, {
        nome: paciente.nome,
        email_cadastro: paciente.email ?? null,
        email_login: emailLogin,
        sintetico,
        divergente,
        tem_telefone: !!(paciente.telefone ?? '').trim(),
      });
    }

    // 5) Alinhar o e-mail de LOGIN ao do cadastro.
    //
    // A Admin API troca o e-mail DIRETO, sem mandar confirmação: o handler do
    // GoTrue chama SetEmail() e pronto, mesmo comportamento do password. Por
    // isso o email_confirm: true vai junto — sem ele a conta pode ficar com
    // e-mail não confirmado e, com "Confirm email" ligado no projeto, a
    // paciente perde o login. Trocar sem confirmar seria trocar para pior.
    //
    // O e-mail NÃO vem do body, de propósito. É lido do cadastro aqui no
    // servidor, igual ao auth_id: se o cliente escolhesse o endereço, um bug na
    // tela viraria caminho de tomada de conta (aponta o auth para um endereço
    // próprio, pede recuperação de senha, entra). Aqui o pior caso é alinhar
    // com o que a nutri digitou no perfil.
    if (acao === 'atualizar_email') {
      const novo = (paciente.email ?? '').trim().toLowerCase();

      if (!novo) {
        return json(400, { error: 'O cadastro desta paciente está sem e-mail. Preencha no perfil primeiro.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo)) {
        return json(400, { error: 'O e-mail do cadastro não parece válido: ' + novo });
      }
      if (novo.endsWith('@essentia.local')) {
        return json(400, { error: 'Esse é um endereço sintético, não um e-mail real.' });
      }
      if (emailLogin && novo === emailLogin.toLowerCase()) {
        return json(200, { nome: paciente.nome, email_login: emailLogin, inalterado: true });
      }

      // Duplicata: o adminUserUpdate do GoTrue NÃO checa (só o adminUserCreate
      // checa). Medido em conta descartável em 2026-09-11: o banco recusa por
      // conta própria, então NÃO é isto que impede duas contas com o mesmo
      // e-mail — a proteção existe uma camada abaixo. O que esta varredura
      // acrescenta é a mensagem: sem ela o retorno é um "Error updating user"
      // opaco, e a nutri não fica sabendo nem que o problema é duplicata, nem
      // de qual endereço. Com ~93 contas a varredura cabe numa chamada só.
      const { data: lista, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return json(500, { error: 'Não consegui conferir se o e-mail já está em uso.' });
      if (lista.users.length >= 1000) {
        return json(500, { error: 'Passou de 1000 contas: a conferência de duplicata ficou incompleta.' });
      }
      const colisao = lista.users.find(
        u => u.id !== paciente.user_id && (u.email ?? '').toLowerCase() === novo,
      );
      if (colisao) {
        return json(409, { error: 'Já existe outra conta usando ' + novo + '.' });
      }

      const anterior = emailLogin;
      const { error: updErr } = await supabase.auth.admin.updateUserById(
        paciente.user_id, { email: novo, email_confirm: true },
      );
      if (updErr) return json(500, { error: updErr.message });

      // Relê em vez de devolver o que mandei: a resposta passa a ser o que o
      // banco tem, e não a minha intenção.
      const { data: depois } = await supabase.auth.admin.getUserById(paciente.user_id);
      return json(200, {
        nome: paciente.nome,
        email_anterior: anterior,
        email_login: depois?.user?.email ?? null,
        confirmado: !!depois?.user?.email_confirmed_at,
      });
    }

    // 6) Definir. SÓ a senha: não encosta no e-mail do auth, e a Admin API não
    //    dispara e-mail nenhum — nem de recuperação, nem de aviso.
    const senha = gerarSenha();
    const { error: updErr } = await supabase.auth.admin.updateUserById(
      paciente.user_id, { password: senha },
    );
    if (updErr) return json(500, { error: updErr.message });

    // A senha volta uma vez e não é gravada em lugar nenhum — nem em log. Se a
    // nutri fechar a tela sem copiar, o caminho é gerar outra.
    return json(200, {
      nome: paciente.nome,
      senha,
      email_login: emailLogin,
      sintetico,
    });
  } catch (err) {
    return json(500, { error: err?.message ?? 'Erro inesperado.' });
  }
};
