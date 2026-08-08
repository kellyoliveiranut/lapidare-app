/**
 * Link de primeiro acesso e mensagem de convite de uma paciente pendente.
 *
 * Existia só dentro do Cadastrar.jsx, como duas funções locais. Passou a ser
 * módulo quando a Agenda ganhou o cadastro rápido e precisou da mesma faixa de
 * convite — e o encodeURIComponent, que o comentário original fazia questão de
 * manter num lugar só, teria virado duas cópias.
 */
import { mensagemAcesso } from './mensagemAcesso.js';

/** URL onde a paciente cria a senha. O token vive na linha de pacientes_pendentes. */
export function linkConvite(nutriId, pendente) {
  return `${window.location.origin}/signup-paciente/${nutriId}/${pendente.token}`;
}

/**
 * Texto do convite JÁ CODIFICADO para entrar na URL do wa.me.
 *
 * lib/mensagemAcesso.js devolve texto PURO de propósito; todos os pontos de uso
 * interpolam direto no href, então o encodeURIComponent mora aqui, num lugar só.
 *
 * temConta é sempre false: quem chama está sempre lidando com pendente não
 * ativado, e linkConvite() monta justamente o link de criar senha.
 */
export function mensagemConviteEncoded(nutriId, pendente) {
  return encodeURIComponent(mensagemAcesso({
    primeiroNome: pendente.nome.split(' ')[0],
    objetivo: pendente.objetivo,
    link: linkConvite(nutriId, pendente),
    temConta: false,
  }));
}
