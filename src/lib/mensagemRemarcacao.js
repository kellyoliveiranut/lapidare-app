/**
 * Aviso de remarcação por WhatsApp (pedido de 2026-11-24): a consulta precisa
 * mudar e a equipe entra em contato depois com a nova data. Não cita motivo —
 * o motivo é da Kelly. `quando`: "amanhã, 25/11", "quinta-feira, 26/11"…
 */
export function mensagemRemarcacao({ nome, quando, hora }) {
  const primeiro = String(nome ?? '').trim();
  const saudacao = primeiro ? `Olá, ${primeiro}!` : 'Olá!';
  const consulta = [quando, hora ? `às ${hora}` : null].filter(Boolean).join(' ');
  return `${saudacao} Tudo bem? Aqui é da equipe da Dra. Kelly Oliveira. `
    + `Precisamos remarcar a sua consulta${consulta ? ` de ${consulta}` : ''}, e pedimos desculpas pelo imprevisto. `
    + 'Entraremos em contato em breve com a nova data. Obrigada pela compreensão!';
}
