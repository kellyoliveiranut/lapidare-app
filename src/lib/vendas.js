import { gerarParcelas } from './utils.js';

/**
 * Cria uma venda e suas parcelas de forma atômica (com rollback manual da
 * venda caso a inserção das parcelas falhe).
 *
 * Fonte única compartilhada entre o modal "Nova venda" (Financeiro) e o
 * cadastro de paciente (Cadastrar). Não trata do estado de UI — apenas grava.
 *
 * @param supabase  cliente supabase
 * @param dados     {
 *   nutriId, pacienteId, servicoId, servico, valorTotal (number),
 *   forma, dataVenda, nParcelas, nMeses, diaVenc, obs
 * }
 * @returns {{ venda: {id}|null, parcelas: number, error: string|null }}
 */
export async function criarVendaComParcelas(supabase, {
  nutriId, pacienteId, servicoId, servico, valorTotal,
  forma, dataVenda, nParcelas, nMeses, diaVenc, obs,
}) {
  // Regra de nº de parcelas por forma — idêntica ao preview do modal.
  const n_parcelas = forma === 'asaas' ? nMeses
                   : ['pix', 'dinheiro', 'parcelado'].includes(forma) ? nParcelas
                   : 1;

  const linhasPreview = gerarParcelas({
    forma_pgto: forma,
    valor_total: valorTotal,
    data_venda: dataVenda,
    n_parcelas,
    dia_venc: diaVenc,
  });

  const { data: venda, error: vErr } = await supabase
    .from('vendas')
    .insert({
      nutri_id: nutriId,
      paciente_id: pacienteId || null,
      servico_id: servicoId || null,
      servico: servico.trim(),
      valor_total: valorTotal,
      forma_pgto: forma,
      data_venda: dataVenda,
      obs: obs?.trim() || null,
    })
    .select('id')
    .single();
  if (vErr) {
    return { venda: null, parcelas: 0, error: 'Erro ao salvar venda: ' + vErr.message };
  }

  const linhas = linhasPreview.map(p => ({
    venda_id: venda.id,
    nutri_id: nutriId,
    numero: p.numero,
    valor: p.valor,
    vencimento: p.vencimento,
    status: p.status ?? 'pendente',
    data_pgto: p.data_pgto ?? null,
  }));
  const { error: pErr } = await supabase.from('parcelas').insert(linhas);
  if (pErr) {
    // rollback da venda para não deixar venda sem parcelas
    await supabase.from('vendas').delete().eq('id', venda.id);
    return { venda: null, parcelas: 0, error: 'Erro ao gerar parcelas: ' + pErr.message };
  }

  return { venda, parcelas: linhas.length, error: null };
}
