import { supabase } from './supabase.js';

// A chave da Anthropic vive só no servidor. Esta função fala com a Netlify
// Function (netlify/functions/anthropic-proxy.js), que autentica a nutri pelo
// Bearer token, aplica rate-limit e chama a Anthropic com a chave de lá.
//
// O `model` é OPCIONAL e validado no servidor contra uma allowlist: omitir (o
// caso de quase todos os chamadores) usa o padrão de lá; passar um valor fora
// da lista devolve 400, não cai no padrão calado. Só o import de plano de
// treino por PDF pede modelo explícito hoje.
export async function callAnthropic(messages, { maxTokens = 2048, model } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const res = await fetch('/.netlify/functions/anthropic-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    // `model` só entra no corpo quando pedido: sem isso os chamadores que não
    // escolhem modelo mandariam "model": undefined e o JSON mudaria à toa.
    body: JSON.stringify({ messages, maxTokens, ...(model ? { model } : {}) }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // O status do CORPO vem primeiro: é o da Anthropic, e sobrevive mesmo se a
    // borda da Netlify normalizar um código fora do padrão (529).
    const status = body.status ?? res.status;
    const msg = body.error ?? res.statusText ?? 'sem detalhes';
    const err = new Error(`${status}: ${msg}`);
    err.status = status;
    if (Number.isFinite(body.retry_after)) err.retryAfter = body.retry_after; // segundos
    throw err;
  }

  return body.text;
}

// Envolve callAnthropic com retry + backoff exponencial nos erros transientes
// (429 rate limit, 529 overloaded). Erros não-transientes propagam na 1ª falha.
export async function callAnthropicComRetry(messages, opts = {}, { tentativas = 4, baseMs = 1000 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await callAnthropic(messages, opts);
    } catch (err) {
      const transiente = err?.status === 429 || err?.status === 529;
      if (!transiente || i === tentativas - 1) throw err;
      ultimoErro = err;
      const espera = Number.isFinite(err.retryAfter)
        ? err.retryAfter * 1000
        : baseMs * 2 ** i + Math.random() * 300; // backoff + jitter
      await new Promise(r => setTimeout(r, espera));
    }
  }
  throw ultimoErro;
}

// Irmã da urlToBase64, para arquivo escolhido no <input type="file">. Estava
// duplicada como função local do PacientePerfil.jsx; mora aqui porque o import
// de treino por PDF (_Treinos.jsx) precisa da mesma coisa.
export function lerPdfBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function urlToBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
