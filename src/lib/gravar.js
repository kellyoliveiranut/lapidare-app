/* ============================================================
   GRAVAR E CONFERIR — update/delete que diz se mudou alguma coisa

   bloco-26, 2026-10-08. Um update barrado pelo RLS, ou com um id que não
   existe mais, volta SEM erro e com zero linhas: sem conferir, a tela fecha
   como se tivesse gravado. Este helper pede `.select('id')`, confere o erro e
   a quantidade, e devolve uma mensagem pronta. Nunca lança.

   Uso:
     const r = await gravar(
       supabase.from('consultas').update(payload).eq('id', id),
       { rotulo: 'salvar a consulta' },
     );
     if (!r.ok) { setErro(r.msg); return; }

   Mesmo desenho que já existia em Agenda.jsx (mandarParaADefinir) e em
   PacientePerfil.jsx (salvarDataConsulta).
   ============================================================ */

/**
 * `consulta`: a query do Supabase ainda SEM .select() (update/delete/insert).
 * `esperado`: quantas linhas devem mudar (1 por padrão); null = não conferir.
 * `rotulo`: o que a tela estava tentando fazer, para a mensagem ("salvar a
 * consulta" → "Não consegui salvar a consulta: …").
 *
 * Devolve { ok: true, data } ou { ok: false, msg }.
 */
export async function gravar(consulta, { esperado = 1, rotulo = 'salvar' } = {}) {
  let data, error;
  try {
    ({ data, error } = await consulta.select('id'));
  } catch (e) {
    return { ok: false, msg: `Não consegui ${rotulo}: ${e?.message ?? 'falha de rede'}` };
  }
  if (error) return { ok: false, msg: `Não consegui ${rotulo}: ${error.message}` };

  const n = Array.isArray(data) ? data.length : 0;
  if (esperado != null && n !== esperado) {
    return {
      ok: false,
      msg: n === 0
        ? `Não consegui ${rotulo}: nenhuma linha foi alterada. Recarregue e tente de novo.`
        : `Não consegui ${rotulo} com segurança: ${n} linhas foram alteradas, e o esperado era ${esperado}. Recarregue e confira.`,
    };
  }
  return { ok: true, data };
}
