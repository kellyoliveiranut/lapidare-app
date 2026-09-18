/**
 * Criação do contrato Essentia pendente — fonte única.
 *
 * Esta lógica morava só dentro do Cadastrar.jsx, e era exatamente por isso que
 * existiam pacientes essentia sem contrato nenhum: mudar o plano pelo perfil
 * gravava `tipo_plano = 'essentia'` e nunca criava contrato. O cadastro sabia
 * fazer, o perfil não — e nada na tela denunciava a diferença.
 *
 * NUNCA LANÇA. Devolve { erro } com frase pronta para a tela, ou { erro: null }.
 * Quem chama sempre prefere manter a paciente salva e apenas avisar: contrato
 * não criado é problema, mas perder o cadastro por causa dele é pior. Mesmo
 * precedente da venda no Cadastrar.
 */

/**
 * "2.700,00" → 2700. Formato brasileiro: ponto é milhar, vírgula é decimal.
 *
 * Veio do Cadastrar.jsx, onde era uma expressão solta. Está aqui para o perfil
 * não precisar reescrevê-la — duas cópias dessa conversão divergiriam no
 * primeiro caso de borda.
 *
 * NÃO é o valorBR() do utils: aquele FORMATA para exibir, este LÊ o que foi
 * digitado. O comentário original no Cadastrar registra que, se um dia os dois
 * forem unificados, é o valorBR que vale — não o contrário.
 */
export function parseValorContrato(texto) {
  return Number(String(texto ?? '').replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Cria o contrato pendente de uma paciente Essentia.
 *
 * @param supabase   cliente já autenticado
 * @param nutriId    dona do contrato; a RLS exige nutri_id = auth.uid()
 * @param pacienteId paciente a quem o contrato pertence
 * @param valor      número já convertido, em reais. O banco exige > 0
 *                   (check valor > 0), então validar aqui dá frase em
 *                   português em vez de erro de constraint.
 */
export async function criarContratoPendente(supabase, { nutriId, pacienteId, valor }) {
  if (!(valor > 0)) {
    return { erro: 'Contrato não gerado — informe o valor do contrato.' };
  }

  // Índice único parcial garante no máximo um template ativo por nutri, então
  // maybeSingle() basta e não precisa de order by.
  const { data: tpl, error: tplErro } = await supabase
    .from('contratos_templates')
    .select('id')
    .eq('nutri_id', nutriId)
    .eq('ativo', true)
    .maybeSingle();

  if (tplErro || !tpl) {
    return {
      erro: 'Contrato não gerado — nenhum template ativo encontrado.'
        + (tplErro ? ` (${tplErro.message})` : ''),
    };
  }

  // texto_html fica FORA do payload: o check contratos_essentia_snapshot_coerente
  // exige que ele seja nulo enquanto aceito_em for nulo. O snapshot do texto só
  // nasce no aceite, e é ele que vira a prova do que foi acordado.
  const { error } = await supabase.from('contratos_essentia').insert({
    paciente_id: pacienteId,
    nutri_id:    nutriId,
    template_id: tpl.id,
    valor,
    aceito_em:   null,
  });

  // 23505 nesta tabela só pode ser o índice parcial
  // contratos_essentia_pendente_unq: já existe um pendente para esta paciente.
  // Isso NÃO é erro — é o estado desejado. Acontece de verdade ao alternar o
  // plano de essentia para avulsa e de volta pelo perfil.
  if (error && error.code !== '23505') {
    return { erro: `Contrato não gerado — ${error.message}` };
  }

  return { erro: null };
}
