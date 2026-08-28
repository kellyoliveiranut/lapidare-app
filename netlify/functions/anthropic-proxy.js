const { createClient } = require('@supabase/supabase-js');

// Proxy da Anthropic. Existe para a chave NUNCA aparecer no navegador: antes
// desta function o front chamava api.anthropic.com direto, com a chave embutida
// no bundle pelo Vite (VITE_ANTHROPIC_API_KEY) e o header
// anthropic-dangerous-direct-browser-access. Qualquer visitante do site podia
// ler a chave no JS publicado.
//
// Chamado por src/lib/anthropic.js -> callAnthropic(). Hoje serve SEIS telas da
// nutri: leitura do PDF do Shaped (PacientePerfil), análise de avaliação,
// relatório de evolução, tratamento oncológico, nova paciente rápida e import
// de plano de treino por PDF (_Treinos).

// O cliente PODE escolher o modelo, mas só dentro da allowlist. O motivo do
// modelo fixo continua valendo — uma sessão válida não pode pedir QUALQUER
// modelo — e a lista é o que preserva isso enquanto libera a escolha.
//
// Haiku 4.5 entrou por causa do import de plano de treino por PDF: a chamada
// levava 32,2s e voltava 504. O tempo de LEITURA do PDF é 3,8s (medido), ou
// seja a geração é que domina — e Haiku gera mais rápido. Só _Treinos.jsx pede
// Haiku; todo o resto omite `model` e continua no padrão.
const MODELO_PADRAO = 'claude-sonnet-4-6';
const MODELOS_PERMITIDOS = new Set(['claude-sonnet-4-6', 'claude-haiku-4-5']);
const MAX_TOKENS_TETO = 8192;   // maior uso atual (chamarShaped, leitura do PDF)

// Calibrado para o LOTE, não para a chamada avulsa: a importação em lote roda
// runPool com 3 PDFs em paralelo (~15-25s cada), ou seja ~9-12 chamadas/min.
// 20/min cobre um lote de 12 com folga para os reprocessamentos, e corta um
// loop acidental em segundos.
const JANELA_SEG = 60;
const LIMITE_JANELA = 20;

const LIMPEZA_MS = 3600 * 1000; // descarta o histórico com mais de 1 hora

const json = (statusCode, obj, headers = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...headers },
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

    // 1) Valida token da nutri (mesmo padrão do enviar-farmacia / send-push)
    const authHeader = event.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return json(401, { error: 'Token ausente.', status: 401 });
    }

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return json(401, { error: 'Token inválido ou expirado.', status: 401 });
    }

    // 2) Só nutri. A paciente também tem token válido, e a IA não é ferramenta
    //    dela — sem esta checagem qualquer login do app gastaria a chave.
    const { data: nutri, error: nutriErr } = await supabase
      .from('nutris').select('id').eq('id', caller.id).maybeSingle();
    if (nutriErr) return json(500, { error: nutriErr.message, status: 500 });
    if (!nutri)   return json(403, { error: 'Sem permissão.', status: 403 });

    // 3) Body
    let body;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return json(400, { error: 'Body JSON inválido.', status: 400 });
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json(400, { error: 'messages é obrigatório.', status: 400 });
    }
    const maxTokens = Number(body.maxTokens) || 2048;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_TETO) {
      return json(400, { error: `maxTokens deve estar entre 1 e ${MAX_TOKENS_TETO}.`, status: 400 });
    }

    // Modelo fora da lista responde 400 em vez de cair no padrão calado: um
    // typo que voltasse ao Sonnet sem avisar deixaria o 504 acontecendo e a
    // causa invisível. Omitir o campo continua sendo o caminho normal.
    const model = body.model ?? MODELO_PADRAO;
    if (!MODELOS_PERMITIDOS.has(model)) {
      return json(400, { error: `model não permitido: ${model}`, status: 400 });
    }

    // 4) Rate-limit por nutri, janela deslizante. Limpeza oportunista primeiro:
    //    mantém a tabela pequena sem depender de job agendado.
    await supabase.from('ia_chamadas').delete()
      .eq('nutri_id', caller.id)
      .lt('criada_em', new Date(Date.now() - LIMPEZA_MS).toISOString());

    const desde = new Date(Date.now() - JANELA_SEG * 1000).toISOString();
    const { count, error: cntErr } = await supabase.from('ia_chamadas')
      .select('id', { count: 'exact', head: true })
      .eq('nutri_id', caller.id)
      .gte('criada_em', desde);
    if (cntErr) return json(500, { error: cntErr.message, status: 500 });

    if ((count ?? 0) >= LIMITE_JANELA) {
      // retry_after no corpo E no header: o callAnthropicComRetry do cliente
      // respeita e espera, em vez de estourar o erro na cara da nutri.
      // Rejeição NÃO grava linha — não se pune quem já foi barrado.
      return json(429, {
        error: 'Muitas chamadas de IA seguidas. Aguarde alguns segundos.',
        status: 429,
        retry_after: JANELA_SEG,
      }, { 'Retry-After': String(JANELA_SEG) });
    }

    // Grava ANTES de chamar: uma chamada que estoura o timeout da function
    // também custou dinheiro e precisa contar.
    const { error: insErr } = await supabase.from('ia_chamadas').insert({ nutri_id: caller.id });
    if (insErr) return json(500, { error: insErr.message, status: 500 });

    // 5) Anthropic — UMA tentativa só. O retry vive no cliente de propósito: o
    //    backoff (até 4 tentativas) comeria o timeout de 60s da function.
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const msg = errBody.error?.message ?? errBody.error?.type ?? resp.statusText ?? 'sem detalhes';
      const ra = parseInt(resp.headers.get('retry-after') ?? '', 10);
      console.error('anthropic error:', resp.status, msg);
      // Espelha o status da Anthropic: é o que o cliente usa para decidir se
      // repete (429/529 transientes) ou desiste.
      return json(resp.status, {
        error: msg,
        status: resp.status,
        retry_after: Number.isFinite(ra) ? ra : null,
      });
    }

    const data = await resp.json();
    return json(200, { text: data.content[0].text });

  } catch (err) {
    console.error('anthropic-proxy unhandled error:', err);
    return json(500, { error: err.message ?? 'Erro interno.', status: 500 });
  }
};
