const { nutriEfetiva } = require('./_nutriEfetiva.js');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Envia por e-mail os PDFs do acompanhamento (plano, lista de compras,
// suplementação) para a PACIENTE. O endereço é resolvido AQUI, no servidor, a
// partir do cadastro dela: o frontend nunca escolhe o destinatário.
// Mesmo canal do enviar-farmacia (SMTP do Gmail via nodemailer).

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

const MAX_ARQUIVOS = 4;
const MAX_BYTES_TOTAL = 4.5 * 1024 * 1024;   // o corpo do Netlify aceita ~6 MB, e base64 incha 33%
const NOME_PDF = /^[A-Za-z0-9._-]{1,80}\.pdf$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1) Quem chama: a nutri logada
    const token = (event.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'Token ausente.' });
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) return json(401, { error: 'Token inválido ou expirado.' });
    const donoId = await nutriEfetiva(supabase, caller.id); // secretária ativa = id da nutri

    // 2) Body
    let body;
    try { body = JSON.parse(event.body ?? '{}'); } catch { return json(400, { error: 'Body JSON inválido.' }); }
    const paciente_id = body.paciente_id;
    const arquivos = Array.isArray(body.arquivos) ? body.arquivos : [];
    if (!paciente_id) return json(400, { error: 'paciente_id é obrigatório.' });
    if (arquivos.length === 0) return json(400, { error: 'Nenhum PDF para enviar.' });
    if (arquivos.length > MAX_ARQUIVOS) return json(400, { error: 'PDFs demais.' });

    const anexos = [];
    let total = 0;
    for (const a of arquivos) {
      const nome = String(a?.nome ?? '');
      if (!NOME_PDF.test(nome)) return json(400, { error: 'Nome de arquivo inválido.' });
      const buf = Buffer.from(String(a?.base64 ?? ''), 'base64');
      if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return json(400, { error: `"${nome}" não é um PDF válido.` });
      }
      total += buf.length;
      anexos.push({ filename: nome, content: buf, contentType: 'application/pdf' });
    }
    if (total > MAX_BYTES_TOTAL) {
      return json(413, { error: 'Os PDFs juntos são grandes demais para um e-mail. Envie em duas vezes ou use o WhatsApp.' });
    }

    // 3) A paciente tem que ser desta nutri; o destino vem do cadastro dela
    const { data: paciente, error: pacErr } = await supabase
      .from('pacientes').select('nome, email')
      .eq('id', paciente_id).eq('nutri_id', donoId).maybeSingle();
    if (pacErr) return json(500, { error: pacErr.message });
    if (!paciente) return json(403, { error: 'Paciente não encontrada ou sem vínculo.' });
    const para = String(paciente.email ?? '').trim();
    if (!para || !EMAIL_OK.test(para)) {
      return json(400, { error: 'A paciente não tem e-mail válido cadastrado.' });
    }

    const { data: nutri } = await supabase.from('nutris').select('nome').eq('id', donoId).maybeSingle();
    const nutriNome = (nutri?.nome ?? '').trim() || 'Nutricionista';
    const primeiroNome = String(paciente.nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';

    // 4) Mensagem neutra: só entrega os anexos, sem conteúdo clínico no corpo
    const lista = anexos.map(a => a.filename);
    const text =
`Olá, ${primeiroNome}!

Seguem em anexo os documentos do seu acompanhamento:
${lista.map(n => `- ${n}`).join('\n')}

Qualquer dúvida, é só me chamar.

${nutriNome} · pelo app Essentia`;
    const html =
`<div style="font-family:Arial,sans-serif;font-size:14px;color:#3A3A3A;line-height:1.5">
  <p>Olá, ${esc(primeiroNome)}!</p>
  <p>Seguem em anexo os documentos do seu acompanhamento:</p>
  <ul>${lista.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  <p>Qualquer dúvida, é só me chamar.</p>
  <p style="margin-top:18px">${esc(nutriNome)}<br><span style="color:#9A7B3F">pelo app Essentia</span></p>
</div>`;

    // 5) Envio (transporter dentro do handler, como no enviar-farmacia)
    const gmailUser = (process.env.GMAIL_USER ?? '').trim();
    const gmailPass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    try {
      await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NOME || 'Essentia'}" <${gmailUser}>`,
        to: para,
        subject: 'Seus documentos — Essentia',
        text, html, attachments: anexos,
      });
    } catch (mailErr) {
      console.error('gmail smtp error:', mailErr?.code ?? '', mailErr?.message);
      return json(502, { error: 'Falha ao enviar o e-mail. Tente novamente.' });
    }

    return json(200, { ok: true, para });
  } catch (err) {
    console.error('enviar-pdfs-paciente unhandled error:', err);
    return json(500, { error: err.message ?? 'Erro interno.' });
  }
};
