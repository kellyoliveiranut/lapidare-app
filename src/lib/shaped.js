// Allowlist fechada de hosts do Shaped.
//
// Cópia deliberada de netlify/functions/send-push.js — a function é CommonJS
// rodando no Netlify e não importa de src/. Mudou a regra lá, muda aqui.
//
// Aqui a validação não é redundância do servidor: o ?link= da rota
// /paciente/avaliacao é editável por quem quiser, então sem esta checagem a
// tela vira um open redirect hospedado no nosso domínio.
const SHAPED_HOSTS = ['shaped.com.br'];

export function normalizarUrlShaped(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;   // barra http, javascript:, data:
  const host = u.hostname.toLowerCase();
  const ok = SHAPED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  return ok ? u.href : null;                  // href normalizado, nunca a string crua
}
