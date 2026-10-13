// Etapas da estrada da Minha jornada (Oncologia) a partir da jornada do
// pacote — cálculo PURO, sem supabase, sem React e sem datas.
//
// Regra (bloco-117, a validar pela Kelly): uma etapa por consulta do pacote.
// Consulta N = etapa N. Realizada = etapa concluída; a etapa atual é o slot
// que montarJornada (jornada.js) marca como 'atual', a próxima consulta do
// pacote. Pulada e cancelada não viram concluída nem atual.

import { TOTAL_CONSULTAS_PACOTE } from './jornada.js';

const PREFIXO = 'consulta_';

/**
 * @param {object|null} jornada  retorno de montarJornada (ou null: sem carga / erro)
 * @returns {{ atual: number|null, concluidas: number[], todas: boolean }}
 *   todas = as 6 realizadas: nenhuma atual e as 6 concluídas.
 */
export function etapasDaJornada(jornada) {
  const vazio = { atual: null, concluidas: [], todas: false };
  if (!jornada || jornada.vazia || !Array.isArray(jornada.passos)) return vazio;

  const consultas = jornada.passos
    .filter(p => typeof p?.chave === 'string' && p.chave.startsWith(PREFIXO))
    .map(p => ({ numero: Number(p.chave.slice(PREFIXO.length)), estado: p.estado }))
    .filter(p => Number.isInteger(p.numero) && p.numero >= 1 && p.numero <= TOTAL_CONSULTAS_PACOTE);

  const concluidas = consultas.filter(p => p.estado === 'feito').map(p => p.numero).sort((a, b) => a - b);
  const todas = concluidas.length === TOTAL_CONSULTAS_PACOTE;
  const atual = todas ? null : (consultas.find(p => p.estado === 'atual')?.numero ?? null);
  return { atual, concluidas, todas };
}
