export async function callAnthropic(messages, { model = 'claude-sonnet-4-6', maxTokens = 2048 } = {}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY não configurada no .env');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message ?? body.error?.type ?? res.statusText ?? 'sem detalhes';
    const err = new Error(`${res.status}: ${msg}`);
    err.status = res.status;
    const ra = parseInt(res.headers.get('retry-after') ?? '', 10);
    if (Number.isFinite(ra)) err.retryAfter = ra; // segundos
    throw err;
  }

  const data = await res.json();
  return data.content[0].text;
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
