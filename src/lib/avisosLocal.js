/**
 * Avisos que acompanham o endereço na mensagem de lembrete/confirmação.
 *
 * O Ed. Village Millenium não tem estacionamento rotativo para clientes
 * (pedido da Kelly, 2026-11-10: paciente desistiu da consulta por não achar vaga).
 * A regra é pelo NOME do local, como cadastrado em locais_atendimento; para
 * incluir outro prédio, acrescente o trecho do nome na lista.
 */
const SEM_ESTACIONAMENTO = [/village/i];

export const AVISO_SEM_ESTACIONAMENTO =
  'Atenção: o prédio não tem estacionamento rotativo para clientes.';

export function avisoDoLocal(nomeLocal) {
  const nome = String(nomeLocal ?? '');
  return SEM_ESTACIONAMENTO.some(re => re.test(nome)) ? AVISO_SEM_ESTACIONAMENTO : '';
}
