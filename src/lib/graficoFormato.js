/* ============================================================
   FORMATAÇÃO DOS GRÁFICOS DE ÁREA

   Arquivo separado do componente por exigência do react-refresh: um .jsx
   que exporta componente E função perde o hot reload. Estas duas funções
   também são usadas FORA do gráfico — fmtVal nos badges de variação de
   PacientePerfil —, então elas nunca foram só do gráfico mesmo.
   ============================================================ */

/** Número curto para rótulo: uma casa decimal, sem o ",0" inútil. */
export function fmtVal(v) {
  if (v == null) return '—';
  return Number(v).toFixed(1).replace(/\.0$/, '');
}

const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Rótulo do eixo X a partir de uma data 'YYYY-MM-DD'.
 * O 'T12:00' é obrigatório: sem ele, `new Date('2026-09-01')` é lido como
 * UTC e vira 31/08 no Brasil. Vale para toda coluna `date` do app.
 */
export function xLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00');
  const m = MESES_ABR[d.getMonth()];
  const anoAtual = new Date().getFullYear();
  return d.getFullYear() === anoAtual ? m : `${m}/${String(d.getFullYear()).slice(2)}`;
}
