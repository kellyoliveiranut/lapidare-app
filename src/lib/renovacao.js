/**
 * RENOVAÇÃO DO ESSENTIA (pedido de 2026-11-26)
 *
 * Renovar = mais um acompanhamento de 6 consultas. As consultas do ciclo novo
 * têm tipos próprios, `renovacao_1` a `renovacao_6` (rótulo "Renovação 1" a
 * "Renovação 6"), para não se confundirem com a 1ª consulta e as Consultas 2 a
 * 6 do ciclo anterior. A numeração recomeça. O contrato é outro: um contrato
 * pendente cujo template é do tipo 'renovacao'.
 *
 * Como o app identifica: a paciente Essentia tem uma venda do serviço
 * "Renovação" e ainda não tem as consultas de renovação → o perfil oferece
 * gerar contrato e consultas. Funções puras, testadas no node.
 */

export const TOTAL_RENOVACAO = 6;
export const TIPOS_RENOVACAO = Array.from({ length: TOTAL_RENOVACAO }, (_, i) => `renovacao_${i + 1}`);

/** 'renovacao_3' → 3; qualquer outro tipo → null. */
export function numeroDaRenovacao(tipo) {
  const m = /^renovacao_(\d+)$/.exec(tipo ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= TOTAL_RENOVACAO ? n : null;
}

export const ehTipoRenovacao = (tipo) => numeroDaRenovacao(tipo) !== null;

/** O serviço da venda é a Renovação? ("Renovação", "renovacao Essentia", …) */
export function ehServicoRenovacao(servico) {
  const s = String(servico ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return /^renova(cao|r)\b/.test(s);
}

/** Alguma consulta (não cancelada) já é do ciclo de renovação? */
export function temConsultasDeRenovacao(consultas) {
  return (consultas ?? []).some(c => c && c.status !== 'cancelada' && ehTipoRenovacao(c.tipo));
}

/**
 * O perfil deve oferecer "gerar renovação"? Só para Essentia ativa, com venda
 * de Renovação registrada e sem as consultas de renovação ainda.
 * Devolve a venda que motivou (a mais recente) ou null.
 */
export function vendaPedindoRenovacao({ ehEssentia, ativa, vendas, consultas }) {
  if (!ehEssentia || !ativa) return null;
  if (temConsultasDeRenovacao(consultas)) return null;
  const candidatas = (vendas ?? []).filter(v => v && ehServicoRenovacao(v.servico));
  if (!candidatas.length) return null;
  const maisRecente = candidatas.slice()
    .sort((a, b) => String(b.created_at ?? b.data_venda ?? '').localeCompare(String(a.created_at ?? a.data_venda ?? '')))[0];
  // Renovação vendida ANTES deste recurso já foi atendida pelo caminho antigo
  // (consultas marcadas depois da venda, com os tipos primeira…consulta_6): se
  // há consulta criada depois da venda, não há o que oferecer.
  const quando = String(maisRecente.created_at ?? '');
  if (quando && (consultas ?? []).some(c => c && c.status !== 'cancelada' && String(c.created_at ?? '') >= quando)) return null;
  return maisRecente;
}
