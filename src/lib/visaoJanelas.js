/* ============================================================
   JANELAS DE DATA DA VISÃO GERAL

   Função pura (bloco-26, 2026-10-08): recebe o "agora" e NUNCA lê o relógio,
   para o teste fixar o instante. O "dia" é o do APARELHO — o mesmo do hojeISO
   da Visão (dataLocalISO) — e sai sempre de isoLocalDeData, nunca de
   toISOString().slice: este converte para UTC e, em Belém, o domingo 23:59
   vira segunda, e depois das 21:00 "hoje" vira amanhã.
   ============================================================ */

import { isoLocalDeData } from './utils.js';

const MS_DIA = 86_400_000;

/**
 * Devolve:
 *   isoSegunda, isoDomingo  INSTANTES (toISOString) de segunda 00:00:00.000 e
 *                           domingo 23:59:59.999 locais — limites de timestamptz
 *   dias30atras             INSTANTE de agora − 30 dias
 *   inicioMes, fimMes,      'YYYY-MM-DD' do dia LOCAL — para colunas `date`
 *   dataSegunda, dataDomingo
 *   dias7atras              'YYYY-MM-DD' local de 7 dias antes de `agora`
 */
export function janelasDaVisao(agora) {
  // Semana: segunda a domingo.
  const dow = (agora.getDay() + 6) % 7;
  const segunda = new Date(agora); segunda.setDate(agora.getDate() - dow); segunda.setHours(0, 0, 0, 0);
  const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6); domingo.setHours(23, 59, 59, 999);

  return {
    inicioMes:   isoLocalDeData(new Date(agora.getFullYear(), agora.getMonth(), 1)),
    fimMes:      isoLocalDeData(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)),
    dataSegunda: isoLocalDeData(segunda),
    dataDomingo: isoLocalDeData(domingo),
    dias7atras:  isoLocalDeData(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 7)),
    isoSegunda:  segunda.toISOString(),
    isoDomingo:  domingo.toISOString(),
    dias30atras: new Date(agora.getTime() - 30 * MS_DIA).toISOString(),
  };
}
