/**
 * Janela de consultas que a Agenda carrega. Antes vinha TUDO da nutri, sem
 * limite de data: o Supabase corta em 1000 linhas e, na ordem do mais antigo
 * para o mais novo, o corte esconderia as consultas FUTURAS (hoje são ~735).
 *
 * Carrega: de `desde` em diante (sem teto — o futuro é pequeno), as "a definir"
 * (sem data) e TODAS as canceladas (a lista "pacientes com cancelada e sem
 * nova consulta" olha o histórico). `desde` é o mais antigo entre 120 dias
 * atrás e a primeira célula do calendário visível menos 7 dias — navegar para
 * um mês antigo recarrega com a janela maior.
 */
export const DIAS_ATRAS = 120;
const DIA_MS = 24 * 3600 * 1000;

/** gradeDe: 'YYYY-MM-DD' da primeira célula do calendário (ou null). Devolve ISO UTC. */
export function desdeISO({ hoje, gradeDe = null }) {
  const padrao = hoje.getTime() - DIAS_ATRAS * DIA_MS;
  let alvo = padrao;
  if (gradeDe) {
    // Meia-noite em Belém (-03:00), menos uma semana de folga.
    const g = Date.parse(`${gradeDe}T00:00:00-03:00`) - 7 * DIA_MS;
    if (Number.isFinite(g) && g < alvo) alvo = g;
  }
  return new Date(alvo).toISOString();
}

/** Valor para .or(): sem vírgula nem parêntese dentro dos valores. */
export function filtroJanela(desde) {
  return `data_hora.is.null,data_hora.gte.${desde},status.eq.cancelada`;
}
