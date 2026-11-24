/**
 * Retenção das fotos do feed de pratos: apagadas 90 dias depois de a paciente
 * ser arquivada (finalizado/óbito). Decisão da Kelly, 2026-11-24.
 * SQL: supabase/migrations/2026-11-24_fotos_pratos_retencao.sql
 */
export const PRAZO_DIAS = 90;
export const LOTE = 100;   // por abertura do Feed; o resto sai na próxima

/** ISO do corte: arquivada antes disto já passou do prazo. */
export function corteRetencao(agora = new Date(), dias = PRAZO_DIAS) {
  return new Date(agora.getTime() - dias * 24 * 3600 * 1000).toISOString();
}

/** Caminhos de storage de uma lista de linhas do feed (sem vazios, sem repetidos). */
export function caminhosParaApagar(linhas) {
  return [...new Set((linhas ?? []).map(l => l?.storage_path).filter(Boolean))];
}

/**
 * Apaga as fotos das pacientes arquivadas há mais de PRAZO_DIAS. Só a nutri
 * dona consegue (RLS). Ordem: linha primeiro (se a policy negar, o arquivo
 * fica), arquivo depois. Qualquer erro devolve { apagadas: 0 } em silêncio —
 * sem a migration a coluna não existe e isto simplesmente não faz nada.
 */
export async function limparFotosEncerradas(supabase, nutriId, agora = new Date()) {
  const vazio = { apagadas: 0 };
  if (!nutriId) return vazio;
  const pac = await supabase.from('pacientes').select('id')
    .eq('nutri_id', nutriId).in('status_paciente', ['finalizado', 'obito'])
    .lt('encerrada_em', corteRetencao(agora));
  if (pac.error || !(pac.data ?? []).length) return vazio;
  const ids = pac.data.map(p => p.id);

  const fotos = await supabase.from('feed_pratos').select('id, storage_path')
    .in('paciente_id', ids).limit(LOTE);
  if (fotos.error || !(fotos.data ?? []).length) return vazio;

  const idsFotos = fotos.data.map(f => f.id);
  const del = await supabase.from('feed_pratos').delete().in('id', idsFotos).select('id');
  if (del.error) return vazio;
  const apagadasIds = new Set((del.data ?? []).map(d => d.id));
  const caminhos = caminhosParaApagar(fotos.data.filter(f => apagadasIds.has(f.id)));
  if (caminhos.length) await supabase.storage.from('fotos_pratos').remove(caminhos).catch(() => {});
  return { apagadas: apagadasIds.size };
}
