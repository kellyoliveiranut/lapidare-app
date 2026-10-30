// Andamento das metas: "cumpri esta semana", semana a semana. Funções puras (testadas no node).

/** Segunda-feira (YYYY-MM-DD) da semana da data ISO dada. */
export function segundaDaSemana(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dow = (d.getUTCDay() + 6) % 7;            // segunda = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** As últimas `n` segundas (a desta semana é a última), em ordem cronológica. */
export function ultimasSemanas(hojeISO, n = 4) {
  const atual = segundaDaSemana(hojeISO);
  if (!atual) return [];
  const base = new Date(`${atual}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/**
 * registros: [{ meta_id, semana }]. Devolve { cumpridas, de, estaSemana, semanas:[{semana, feita}] }
 * para a meta, nas últimas `n` semanas (incluindo a atual).
 */
export function andamentoDaMeta(registros, metaId, hojeISO, n = 4) {
  const semanas = ultimasSemanas(hojeISO, n);
  const feitas = new Set((registros ?? []).filter(r => r.meta_id === metaId).map(r => String(r.semana).slice(0, 10)));
  const lista = semanas.map(s => ({ semana: s, feita: feitas.has(s) }));
  return {
    cumpridas: lista.filter(x => x.feita).length,
    de: semanas.length,
    estaSemana: lista.length ? lista[lista.length - 1].feita : false,
    semanas: lista,
  };
}

/** Texto neutro do andamento ("Cumprida em 3 das últimas 4 semanas"), ou null se nunca marcada. */
export function textoAndamento(a) {
  if (!a || a.cumpridas === 0) return null;
  return `Marcada como cumprida em ${a.cumpridas} das últimas ${a.de} semanas`;
}
