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

/** Só aceita chaves do catálogo; null (nunca escolhido) = todos. */
export function chavesAtivas(salvas, campos) {
  const todas = campos.map(c => c.key);
  if (!Array.isArray(salvas)) return todas;
  const set = new Set(salvas);
  return todas.filter(k => set.has(k));
}

const CHAVES_REF = ['min', 'max', 'baixo', 'critico', 'alto', 'criticoAlto'];

/** Limpa o que a nutri digitou: só chaves conhecidas, só números finitos. */
export function normalizarRefs(refs) {
  const saida = {};
  for (const [campo, r] of Object.entries(refs ?? {})) {
    const lim = {};
    for (const k of CHAVES_REF) {
      const n = numeroDe(r?.[k]);
      if (n != null) lim[k] = n;
    }
    if (Object.keys(lim).length) saida[campo] = lim;
  }
  return saida;
}

/** Junta as faixas da nutri ao catálogo no formato que nivelExame/textoRef entendem. */
export function aplicarReferencias(campos, refs) {
  return campos.map(c => {
    const r = refs?.[c.key];
    if (!r) return c;
    const ref = {};
    if (r.min != null) ref.min = r.min;
    if (r.max != null) ref.max = r.max;
    const alerta = {};
    for (const k of ['baixo', 'critico', 'alto', 'criticoAlto']) if (r[k] != null) alerta[k] = r[k];
    return {
      ...c,
      ...(Object.keys(ref).length ? { ref } : {}),
      ...(Object.keys(alerta).length ? { alerta } : {}),
    };
  });
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
