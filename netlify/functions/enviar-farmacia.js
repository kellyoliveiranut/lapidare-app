const { createClient } = require('@supabase/supabase-js');

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
    const nutriNome = (nutri?.nome ?? '').trim() || 'Nutricionista';
    const contato = [
      `Nome: ${paciente.nome}`,
      paciente.telefone ? `Telefone: ${paciente.telefone}` : null,
    ].filter(Boolean).join('\n');

    const textContent =
`Olá${nutri?.farmacia_nome ? ', ' + nutri.farmacia_nome.trim() : ''}!

Segue uma prescrição de fórmula para manipulação.

── FÓRMULA ──
${formula}

── PACIENTE (para entrega) ──
${contato}

Atenciosamente,
${nutriNome}
(enviado pelo app Essentia)`;

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlContent =
`<div style="font-family:Arial,sans-serif;font-size:14px;color:#3A3A3A;line-height:1.5">
  <p>Olá${nutri?.farmacia_nome ? ', ' + esc(nutri.farmacia_nome.trim()) : ''}!</p>
  <p>Segue uma prescrição de fórmula para manipulação.</p>
  <h3 style="margin:18px 0 6px">Fórmula</h3>
  <pre style="white-space:pre-wrap;font-family:inherit;background:#FDFBF8;padding:12px;border-radius:8px;margin:0">${esc(formula)}</pre>
  <h3 style="margin:18px 0 6px">Paciente (para entrega)</h3>
  <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(contato)}</pre>
  <p style="margin-top:18px">Atenciosamente,<br>${esc(nutriNome)}<br>
    <span style="color:#9A7B3F">enviado pelo app Essentia</span></p>
</div>`;

    // 6) Envia via Brevo (REST — sem dependência nova; fetch global do Node 18+)
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NOME || 'Essentia' },
        to: [{ email: farmaciaEmail, name: nutri?.farmacia_nome?.trim() || undefined }],
        replyTo: { email: process.env.EMAIL_FROM, name: nutriNome },
        subject: `Fórmula de manipulação — ${paciente.nome}`,
        textContent,
        htmlContent,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('brevo error:', resp.status, detail);
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
