// Funções puras dos exames do Emagrecimento (rodam no node; testadas).

/** "1.234,5" / "95,2" / "  7 " → número; vazio ou inválido → null. */
export function numeroDe(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).trim();
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** HOMA-IR = glicemia (mg/dL) × insulina (µUI/mL) / 405. Duas casas; null se faltar dado. */
export function homaIr(glicemia, insulina) {
  const g = numeroDe(glicemia), i = numeroDe(insulina);
  if (g == null || i == null || g <= 0 || i <= 0) return null;
  return Math.round((g * i / 405) * 100) / 100;
}

/** Linha do banco ({data_exame, valores:{}, obs}) → objeto plano usado por tabela e gráficos. */
export function achatarExame(linha) {
  return { id: linha.id, data_exame: linha.data_exame, obs: linha.obs ?? '', ...(linha.valores ?? {}) };
}

/** Só aceita chaves do catálogo; null (nunca escolhido) = o padrão informado (ou todos). */
export function chavesAtivas(salvas, campos, padrao = null) {
  const todas = campos.map(c => c.key);
  if (!Array.isArray(salvas)) {
    if (!padrao) return todas;
    const p = new Set(padrao);
    return todas.filter(k => p.has(k));
  }
  const set = new Set(salvas);
  return todas.filter(k => set.has(k));
}

const CHAVES_LIMITE = ['min', 'max', 'baixo', 'critico', 'alto', 'criticoAlto'];

/** Limpa o que a nutri digitou: só números finitos nos limites e texto curto na fonte. */
export function normalizarRefs(refs) {
  const saida = {};
  for (const [campo, r] of Object.entries(refs ?? {})) {
    const lim = {};
    for (const k of CHAVES_LIMITE) {
      const n = numeroDe(r?.[k]);
      if (n != null) lim[k] = n;
    }
    // A fonte/justificativa só vale junto de uma faixa: sozinha não muda nada.
    const fonte = String(r?.fonte ?? '').trim().slice(0, 300);
    if (Object.keys(lim).length) saida[campo] = fonte ? { ...lim, fonte } : lim;
  }
  return saida;
}

function dentro(ref, v) {
  if (!ref) return null;
  if (ref.min != null && v < ref.min) return false;
  if (ref.max != null && v > ref.max) return false;
  return true;
}

/**
 * Junta ao catálogo a faixa PERSONALIZADA da nutri (quando existe ela substitui a
 * referência orientativa do marcador) e liga a função `nivel(valor, sexo)`:
 *   - com limites de alerta dela: usa o alerta (e ainda marca "fora da referência");
 *   - só com referência: 'normal' dentro, 'atencao' fora (é "fora da referência",
 *     nunca "crítico" nem "deficiência");
 *   - sem referência nenhuma: null (sem cor).
 */
export function aplicarReferencias(campos, refs) {
  return campos.map(c => {
    if (c.tipo === 'texto') {
      return { ...c, personalizada: false, fonte: '', nivel: (valor) => {
        if (valor == null || !c.esperado) return null;
        return c.esperado.includes(semAcento(valor)) ? 'normal' : 'atencao';
      } };
    }
    const r = refs?.[c.key];
    const temFaixa = r && (r.min != null || r.max != null);
    const temAlerta = r && ['baixo', 'critico', 'alto', 'criticoAlto'].some(k => r[k] != null);
    const refEfetiva = temFaixa
      ? { ...(r.min != null ? { min: r.min } : {}), ...(r.max != null ? { max: r.max } : {}) }
      : c.ref;
    const alerta = temAlerta
      ? Object.fromEntries(['baixo', 'critico', 'alto', 'criticoAlto'].filter(k => r[k] != null).map(k => [k, r[k]]))
      : undefined;
    const doSexo = (sexo) => {
      if (!refEfetiva) return null;
      if (refEfetiva.min != null || refEfetiva.max != null) return refEfetiva;
      return refEfetiva[sexo] ?? refEfetiva.feminino ?? null;
    };
    return {
      ...c,
      ...(refEfetiva ? { ref: refEfetiva } : {}),
      ...(alerta ? { alerta } : {}),
      personalizada: !!(temFaixa || temAlerta),
      fonte: r?.fonte ?? '',
      nivel: (valor, sexo) => {
        if (valor == null) return null;
        const faixa = doSexo(sexo);
        if (alerta) {
          const n = nivelAlerta(alerta, Number(valor));
          if (n === 'normal' && faixa && dentro(faixa, Number(valor)) === false) return 'atencao';
          return n;
        }
        const d = dentro(faixa, Number(valor));
        return d == null ? null : (d ? 'normal' : 'atencao');
      },
    };
  });
}

function nivelAlerta(a, n) {
  if ((a.critico != null && n <= a.critico) || (a.criticoAlto != null && n >= a.criticoAlto)) return 'critico';
  if ((a.baixo != null && n <= a.baixo) || (a.alto != null && n >= a.alto)) return 'atencao';
  return 'normal';
}

/** Rótulo da classificação por diretriz (HbA1c, vitamina D, PCR-us); null se o marcador não tem. */
export function rotuloCriterio(campo, valor) {
  if (!campo?.criterio || valor == null) return null;
  const v = Number(valor);
  if (!Number.isFinite(v)) return null;
  for (const c of campo.criterio) {
    if (c.ate == null) return c.rotulo;
    if (c.incl ? v <= c.ate : v < c.ate) return c.rotulo;
  }
  return null;
}

/** Diferença entre dois exames (A mais antigo, B mais novo), só onde os dois têm valor. */
export function compararExames(a, b, campos) {
  const linhas = [];
  for (const c of campos) {
    const va = numeroDe(a?.[c.key]), vb = numeroDe(b?.[c.key]);
    if (va == null || vb == null) continue;
    const dif = vb - va;
    linhas.push({ campo: c, a: va, b: vb, dif, pct: va !== 0 ? (dif / va) * 100 : null });
  }
  return linhas;
}

const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * Texto digitado → valor gravado. Numérico: número (ou null). Texto: string aparada (ou null).
 * Densidade urinária: o laudo traz "1.020" e muita gente digita "1020"; ambos viram 1,020.
 */
export function valorDoCampo(campo, texto) {
  if (campo?.tipo === 'texto') {
    const t = String(texto ?? '').trim().slice(0, 80);
    return t || null;
  }
  let n = numeroDe(texto);
  if (n != null && campo?.densidade && n >= 100) n = n / 1000;
  return n;
}
