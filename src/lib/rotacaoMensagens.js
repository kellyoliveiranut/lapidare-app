// Rotação semanal e fixação temporária de mensagens motivacionais.
//
// Vale para as DUAS tabelas de mensagem — mensagens_emagrecimento e
// mensagens_ciclo —, que têm colunas de nome diferente (`texto`/`ativa` de um
// lado, `mensagem`/`ativo` do outro). Isto aqui funciona nas duas porque só
// olha `fixada_em`: nada mais do formato da linha importa para decidir QUAL
// mensagem é a da semana.
//
// A regra estava escrita à mão em dois lugares — _MensagemEmagrecimento.jsx e
// paciente/Inicio.jsx —, com o mesmo cálculo copiado. Duas cópias divergem na
// primeira correção feita só de um lado, e a terceira cópia ia nascer agora,
// com as mensagens de ciclo virando lista.

export const TRES_DIAS = 3 * 86_400_000;

// Âncora da rotação: segunda 05/01/2026 à meia-noite de Brasília (UTC-3). É
// dela que sai a contagem de semanas, então a virada acontece toda segunda às
// 00h no horário do Brasil, para qualquer paciente.
export const ANCORA = Date.UTC(2026, 0, 5, 3, 0, 0);

/**
 * A mensagem está fixada AGORA? Precisa de `fixada_em` e de menos de 3 dias
 * desde o carimbo — a fixação expira sozinha, sem ninguém precisar limpar.
 *
 * `agora` existe para teste; em produção ninguém passa.
 */
export function estaFixada(m, agora = Date.now()) {
  return !!m?.fixada_em && agora - new Date(m.fixada_em).getTime() < TRES_DIAS;
}

/** Rótulo "expira em Xd Yh" a partir de fixada_em + 3 dias. */
export function restanteFixada(fixadaEm, agora = Date.now()) {
  const ms = new Date(fixadaEm).getTime() + TRES_DIAS - agora;
  if (ms <= 0) return 'expirada';
  const horas = Math.floor(ms / 3_600_000);
  const d = Math.floor(horas / 24);
  const h = horas % 24;
  return d > 0 ? `expira em ${d}d ${h}h` : `expira em ${h}h`;
}

/**
 * A mensagem que está no ar nesta semana.
 *
 * `lista` já vem FILTRADA (só as ativas) e ORDENADA por `ordem` — quem chama
 * faz isso na própria consulta, que é onde o banco resolve de graça. Devolve
 * null para lista vazia: quem chama cai no fallback (o grupo genérico, ou
 * nenhuma faixa no topo do app) em vez de arriscar um palpite.
 *
 * Uma fixada válida ganha da rotação. O desempate por mais recente parece
 * sobrar em mensagens_ciclo, onde o índice mensagens_ciclo_uma_fixada garante
 * uma só por grupo — mas mensagens_emagrecimento não tem índice equivalente, e
 * sem o desempate a paciente veria uma das duas ao acaso.
 */
export function escolherDaSemana(lista, { agora = Date.now() } = {}) {
  if (!lista?.length) return null;

  const fixada = lista
    .filter(m => estaFixada(m, agora))
    .sort((a, b) => new Date(b.fixada_em) - new Date(a.fixada_em))[0];
  if (fixada) return fixada;

  // Módulo com o ajuste de sinal: antes da âncora `semanas` é negativo, e
  // (-1 % 3) em JavaScript dá -1, que estouraria o array.
  const semanas = Math.floor((agora - ANCORA) / (7 * 86_400_000));
  const idx = ((semanas % lista.length) + lista.length) % lista.length;
  return lista[idx];
}
