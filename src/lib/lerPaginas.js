/**
 * Lê TODAS as linhas de uma consulta do Supabase, página a página.
 *
 * O PostgREST corta em 1000 linhas por resposta, em silêncio: uma lista que
 * cresce além disso passa a vir incompleta e ninguém vê erro. Esta função
 * repete a consulta com .range() até vir uma página menor que o tamanho.
 *
 * `fabrica()` devolve um query builder NOVO a cada chamada, já com a ordem —
 * e a ordem precisa ter desempate único (ex.: .order('id') por último), senão
 * linhas com o mesmo valor podem repetir ou sumir na virada de página.
 *
 * Devolve { data, error } como uma consulta comum. Em erro numa página,
 * devolve o erro e o que já tinha lido, para quem chama tratar como já trata.
 * `maximo` evita laço sem fim se algo estiver errado.
 */
export async function lerTodasPaginas(fabrica, { tamanho = 1000, maximo = 50 } = {}) {
  const todas = [];
  for (let p = 0; p < maximo; p++) {
    const { data, error } = await fabrica().range(p * tamanho, (p + 1) * tamanho - 1);
    if (error) return { data: todas, error };
    todas.push(...(data ?? []));
    if (!data || data.length < tamanho) break;
  }
  return { data: todas, error: null };
}
