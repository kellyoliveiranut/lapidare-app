/**
 * Espera uma promessa por no máximo `ms`. Se estourar, REJEITA com
 * Error('limite') — a tela decide o que mostrar. Existe porque no celular de
 * algumas pacientes uma chamada ao Supabase (sessão, rpc) fica pendurada sem
 * erro nem resposta, e a tela de "Validando link…" nunca saía dali.
 * Não cancela a chamada original; só para de esperar por ela.
 */
export function comLimite(promessa, ms) {
  let timer;
  const limite = new Promise((_, rejeita) => {
    timer = setTimeout(() => rejeita(new Error('limite')), ms);
  });
  return Promise.race([Promise.resolve(promessa), limite]).finally(() => clearTimeout(timer));
}
