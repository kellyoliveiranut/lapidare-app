const { createClient } = require('@supabase/supabase-js');

const GENERICO = { erro: 'Telefone ou senha inválidos.' };
const MAX = 5, BLOQUEIO_MS = 15 * 60 * 1000;

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});
const chavesDe = (ip, telefone) => [`ip:${ip}`, `tel:${String(telefone).replace(/\D/g, '')}`];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let telefone, senha;
  try { ({ telefone, senha } = JSON.parse(event.body ?? '{}')); }
  catch { return json(400, GENERICO); }
  if (!telefone || !senha) return json(400, GENERICO);

  const ip = (event.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || '?';

  // 1) rate-limit (IP + telefone) -> 429 genérico
  if (await bloqueado(admin, ip, telefone)) return json(429, GENERICO);

  // 2) resolve o e-mail NO SERVIDOR (nunca volta pro cliente)
  const { data: email } = await admin.rpc('resolver_email_por_telefone', { p_telefone: telefone });

  // 3) autentica; timing normalizado quando não há e-mail
  let sessao = null;
  if (email) {
    const { data } = await admin.auth.signInWithPassword({ email, password: senha });
    sessao = data?.session ?? null;
  } else {
    await admin.auth
      .signInWithPassword({ email: 'timing@nao-existe.essentia.local', password: senha })
      .catch(() => {});
  }

  // 4) falha SEMPRE idêntica (não revela se o telefone é paciente)
  if (!sessao) { await registrarFalha(admin, ip, telefone); return json(400, GENERICO); }

  await limpar(admin, ip, telefone);
  return json(200, { access_token: sessao.access_token, refresh_token: sessao.refresh_token });
};

async function bloqueado(admin, ip, telefone) {
  const agora = Date.now();
  const { data } = await admin.from('login_tentativas')
    .select('bloqueado_ate').in('chave', chavesDe(ip, telefone));
  return (data ?? []).some(r => r.bloqueado_ate && new Date(r.bloqueado_ate).getTime() > agora);
}

async function registrarFalha(admin, ip, telefone) {
  for (const chave of chavesDe(ip, telefone)) {
    const { data: row } = await admin.from('login_tentativas')
      .select('tentativas').eq('chave', chave).maybeSingle();
    const tentativas = (row?.tentativas ?? 0) + 1;
    await admin.from('login_tentativas').upsert({
      chave, tentativas,
      bloqueado_ate: tentativas >= MAX ? new Date(Date.now() + BLOQUEIO_MS).toISOString() : null,
      atualizado_em: new Date().toISOString(),
    });
  }
}

async function limpar(admin, ip, telefone) {
  await admin.from('login_tentativas').delete().in('chave', chavesDe(ip, telefone));
}
