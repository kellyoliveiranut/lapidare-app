/* ============================================================
   FALTAS — consulta passada que ficou "agendada" e ninguém resolveu

   Função pura, sem supabase nem React (faltas.teste.mjs).

   A falta é um EIXO PRÓPRIO (consultas.faltou_em), separado de `status`, como
   a confirmação: não mexe nos filtros da Agenda, do relatório de evolução nem
   do banner da paciente. A consulta segue 'agendada' até a nutri resolver.
   Aviso em cima da hora conta como CANCELAMENTO (status 'cancelada'), não
   como falta. Sem cobrança nem reposição.
   ============================================================ */

const DURACAO_PADRAO_MIN = 60;

/**
 * "Para resolver" vale só para consultas NOVAS: as anteriores a esta data (dia
 * em que o recurso entrou no ar, 12/11/2026, horário de Belém) não aparecem,
 * porque a nutri já conduziu aquelas por outros meios e seriam dezenas de
 * pendências falsas. Para mudar o corte, altere só esta constante.
 */
export const PARA_RESOLVER_DESDE = '2026-11-12T00:00:00-03:00';

/** Fim previsto da consulta, em ms. null se não tem data. */
export function fimDaConsulta(c) {
  if (!c?.data_hora) return null;
  const ini = new Date(c.data_hora).getTime();
  if (Number.isNaN(ini)) return null;
  const dur = Number(c.duracao_min) > 0 ? Number(c.duracao_min) : DURACAO_PADRAO_MIN;
  return ini + dur * 60 * 1000;
}

/**
 * Consulta que já terminou e continua 'agendada' sem ninguém ter dito se a
 * paciente veio. `agora` é um Date (ou ms).
 */
export function precisaResolver(c, agora) {
  if (!c || c.status !== 'agendada' || c.faltou_em) return false;
  const fim = fimDaConsulta(c);
  if (fim == null) return false;
  return fim <= new Date(agora).getTime();
}

/** Estava confirmada (e não foi marcada como "não vem"). */
export function confirmouAntes(c) {
  return !!c?.confirmada_em && !c?.nao_confirmada_em;
}

/**
 * Fila "para resolver": consultas passadas ainda agendadas, a partir de
 * PARA_RESOLVER_DESDE. Quem CONFIRMOU vem primeiro (é o caso que importa),
 * depois por data mais antiga.
 */
export function filaParaResolver(consultas, agora, desde = PARA_RESOLVER_DESDE) {
  const corte = new Date(desde).getTime();
  const fila = (consultas ?? []).filter(c =>
    precisaResolver(c, agora) && new Date(c.data_hora).getTime() >= corte);
  return fila.sort((a, b) => {
    const ca = confirmouAntes(a) ? 0 : 1;
    const cb = confirmouAntes(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
  });
}

/**
 * Contadores da ficha de UMA paciente.
 * faltas = marcadas como faltou; confirmouENaoVeio = faltou tendo confirmado.
 */
export function contarFaltas(consultas) {
  let faltas = 0, confirmouENaoVeio = 0;
  for (const c of consultas ?? []) {
    if (!c?.faltou_em) continue;
    faltas++;
    if (c.confirmada_em) confirmouENaoVeio++;
  }
  return { faltas, confirmouENaoVeio };
}
