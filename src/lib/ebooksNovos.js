/**
 * "O que era novo na entrada" da tela de E-books, sobrevivendo a um reload.
 *
 * No Android, com o app aberto, o toque na notificação navega duas vezes: a
 * primeira montagem de /paciente/ebooks?novos=1 fotografa os não vistos e grava
 * visto_em; a segunda (após o reload) não acha mais nenhum. A primeira guarda
 * a fotografia no sessionStorage e a segunda a reaproveita, dentro do TTL.
 */

export const TTL_NOVOS_MS = 2 * 60 * 1000;

function guardadoValido(guardado, agora, ttl) {
  if (!guardado || typeof guardado !== 'object') return false;
  const { ids, t } = guardado;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) return false;
  if (typeof t !== 'number' || !Number.isFinite(t)) return false;
  const idade = agora - t;
  return idade >= 0 && idade <= ttl;
}

/**
 * `guardado`: o que veio do sessionStorage ({ ids, t }), possivelmente
 * corrompido. `atuais`: Set ou array dos ebook_id sem visto_em agora.
 * Devolve { ids: Set, gravar, t } — `gravar` só quando há atuais (a montagem
 * que só reaproveita o guardado não regrava, e o TTL conta da 1ª fotografia).
 */
export function combinarNovos(guardado, atuais, agora = Date.now(), ttl = TTL_NOVOS_MS) {
  const valido = guardadoValido(guardado, agora, ttl);
  const listaAtuais = [...(atuais ?? [])];
  const ids = new Set([...(valido ? guardado.ids : []), ...listaAtuais]);
  return {
    ids,
    gravar: listaAtuais.length > 0,
    t: valido ? guardado.t : agora,
  };
}
