import { supabase } from './supabase.js';

// A chave da Anthropic vive só no servidor. Esta função fala com a Netlify
// Function (netlify/functions/anthropic-proxy.js), que autentica a nutri pelo
// Bearer token, aplica rate-limit e chama a Anthropic com a chave de lá.
//
// O `model` deixou de ser parâmetro: é fixado no servidor, para uma sessão
// válida não conseguir pedir qualquer modelo. Nenhum chamador passava model.
export async function callAnthropic(messages, { maxTokens = 2048 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const res = await fetch('/.netlify/functions/anthropic-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, maxTokens }),
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
