const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

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

    // 1) Valida token da nutri (mesmo padrão do send-push)
    const authHeader = event.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return json(401, { error: 'Token ausente.' });
    }

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return json(401, { error: 'Token inválido ou expirado.' });
    }

    // 2) Body
    let body;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return json(400, { error: 'Body JSON inválido.' });
    }

    const paciente_id = body.paciente_id;
    const formula = (body.formula ?? '').trim();
    if (!paciente_id) return json(400, { error: 'paciente_id é obrigatório.' });
    if (!formula)     return json(400, { error: 'A fórmula está vazia.' });
    if (formula.length > 8000) return json(400, { error: 'Fórmula muito longa.' });

    // 3) Ownership: a paciente tem que ser desta nutri.
    //    O servidor resolve o contato — o frontend nunca passa dados arbitrários.
    const { data: paciente, error: pacErr } = await supabase
      .from('pacientes')
      .select('nome, telefone')
      .eq('id', paciente_id)
      .eq('nutri_id', caller.id)
      .maybeSingle();

    if (pacErr)        return json(500, { error: pacErr.message });
    if (!paciente)     return json(403, { error: 'Paciente não encontrada ou sem vínculo.' });

    // 4) Config da farmácia (server-side, da própria nutri)
    const { data: nutri, error: nutriErr } = await supabase
      .from('nutris')
      .select('nome, farmacia_email, farmacia_nome')
      .eq('id', caller.id)
      .maybeSingle();

    if (nutriErr)              return json(500, { error: nutriErr.message });
    const farmaciaEmail = (nutri?.farmacia_email ?? '').trim();
    if (!farmaciaEmail) {
      return json(400, { error: 'E-mail da farmácia não configurado. Defina em Personalização.' });
    }

    // 5) Monta o e-mail
    // Enfeite mínimo de propósito: a fórmula é a carga útil e o assunto já diz
    // do que se trata. O telefone fica na mesma linha do nome — é o dado de
    // entrega, não cabe cortar junto com o cabeçalho antigo.
    const nutriNome = (nutri?.nome ?? '').trim() || 'Nutricionista';
    const tel = (paciente.telefone ?? '').trim();
    // farmacia_nome é opcional em Personalização ("deixe vazio se preferir") e
    // a trava do botão cobre só farmacia_email — vazio aqui é rotina, não
    // exceção. Sem este fallback a saudação sairia "Olá!" seco.
    const saudacao = (nutri?.farmacia_nome ?? '').trim() || 'equipe da farmácia';

    const textContent =
`Olá, ${saudacao}!

${paciente.nome}${tel ? ' — ' + tel : ''}
Uso Oral

${formula}

${nutriNome} · pelo app Essentia`;

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlContent =
`<div style="font-family:Arial,sans-serif;font-size:14px;color:#3A3A3A;line-height:1.5">
  <p>Olá, ${esc(saudacao)}!</p>
  <p style="margin:18px 0 2px"><strong style="font-size:18px">${esc(paciente.nome)}</strong>${tel ? ` <span style="color:#6B6B6B">— ${esc(tel)}</span>` : ''}</p>
  <p style="margin:0 0 10px;font-weight:bold">Uso Oral</p>
  <pre style="white-space:pre-wrap;font-family:inherit;background:#FDFBF8;padding:12px;border-radius:8px;margin:0">${esc(formula)}</pre>
  <p style="margin-top:18px">${esc(nutriNome)}<br>
    <span style="color:#9A7B3F">pelo app Essentia</span></p>
</div>`;

    // 6) Envia via SMTP do Gmail (nodemailer — dependência na raiz, como web-push)
    // O transporter nasce DENTRO do handler: um Lambda reciclado guardaria a
    // conexão SMTP aberta entre invocações e ela morre sem aviso do outro lado.
    const gmailUser = (process.env.GMAIL_USER ?? '').trim();
    // O Google entrega a senha de app em 4 blocos de 4 separados por espaço, que
    // são decorativos. Colada com os espaços, a autenticação falha com uma
    // mensagem que não explica nada — então tira aqui e o problema não existe.
    const gmailPass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    try {
      await transporter.sendMail({
        // O Gmail sobrescreve o remetente com a conta autenticada: pôr outro
        // endereço aqui não dá erro, é só ignorado. O nome de exibição vale.
        // Sem replyTo — ele seria igual ao from, que já é a caixa da nutri.
        from: `"${process.env.EMAIL_FROM_NOME || 'Essentia'}" <${gmailUser}>`,
        to: farmaciaEmail,
        subject: `Fórmula de manipulação — ${paciente.nome}`,
        text: textContent,
        html: htmlContent,
      });
    } catch (mailErr) {
      // nodemailer LANÇA em vez de devolver !resp.ok. A resposta para a tela é
      // a mesma de antes, de propósito: o 502 e o texto não mudam.
      console.error('gmail smtp error:', mailErr?.code ?? '', mailErr?.message);
      return json(502, { error: 'Falha ao enviar o e-mail. Tente novamente.' });
    }

    // 7) Só grava o histórico DEPOIS do envio confirmado
    const { error: insErr } = await supabase.from('envios_farmacia').insert({
      paciente_id,
      nutri_id: caller.id,
      formula,
      farmacia_email: farmaciaEmail,
    });
    // Se o insert falhar, o e-mail já saiu — não devolve erro, só loga.
    if (insErr) console.error('envios_farmacia insert falhou (e-mail já enviado):', insErr.message);

    return json(200, { ok: true, farmacia_email: farmaciaEmail });

  } catch (err) {
    console.error('enviar-farmacia unhandled error:', err);
    return json(500, { error: err.message ?? 'Erro interno.' });
  }
};
