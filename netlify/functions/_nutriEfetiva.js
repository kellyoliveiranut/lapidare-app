// Quem é a "dona dos dados" para o login que chamou a função: a secretária
// ativa enxerga o id da nutri; qualquer outra pessoa, o próprio id. Mesma
// regra de public.nutri_efetiva() no banco. Use no lugar de `caller.id` onde a
// função confere "é paciente/dado desta nutri".
async function nutriEfetiva(supabase, callerId) {
  const { data } = await supabase.from('secretarias')
    .select('nutri_id').eq('user_id', callerId).eq('ativo', true).maybeSingle();
  return data?.nutri_id ?? callerId;
}

// A secretária ativa deste login (ou null).
async function secretariaDoLogin(supabase, callerId) {
  const { data } = await supabase.from('secretarias')
    .select('id, nutri_id, nome').eq('user_id', callerId).eq('ativo', true).maybeSingle();
  return data ?? null;
}

module.exports = { nutriEfetiva, secretariaDoLogin };
