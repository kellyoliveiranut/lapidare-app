import { telefoneWhatsapp } from './painelNotificacoes.js';

/**
 * Mensagem para a contabilidade com os dados de uma ou mais notas. `textos` são
 * os blocos de textoNota() (tomador, CPF, endereço, serviço, valor…). Texto puro.
 * Sem conteúdo clínico: só dado de emissão da nota.
 */
export function mensagemContabilidade(textos) {
  const lista = (textos ?? []).map(t => String(t ?? '').trim()).filter(Boolean);
  if (lista.length === 0) return '';
  const abertura = lista.length === 1
    ? 'Olá! Segue o dado para emissão de 1 nota fiscal:'
    : `Olá! Seguem os dados para emissão de ${lista.length} notas fiscais:`;
  const corpo = lista.length === 1
    ? lista[0]
    : lista.map((t, i) => `${i + 1}) ${t.replace(/\n/g, '\n   ')}`).join('\n\n');
  return `${abertura}\n\n${corpo}\n\nObrigada!`;
}

/** Link do wa.me para o número da contabilidade, ou null se não houver número. */
export function linkWhatsContabilidade(numero, texto) {
  const tel = telefoneWhatsapp(numero);
  if (!tel || !texto) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

/** Colunas de pacientes para montar a nota, com a cadeia de fallback das migrações. */
const BASE = 'id, nome, email, telefone, cpf, endereco';
const NF = ', nf_outra_pessoa, nf_nome, nf_cpf';
const END = ', end_cep, end_logradouro, end_numero, end_complemento, end_bairro, end_cidade, end_uf';
export async function carregarPacientesParaNota(supabase, ids) {
  if (!ids.length) return {};
  let r = await supabase.from('pacientes').select(BASE + END + NF).in('id', ids);
  if (r.error) r = await supabase.from('pacientes').select(BASE + END).in('id', ids);
  if (r.error) r = await supabase.from('pacientes').select(BASE).in('id', ids);
  if (r.error) return {};
  return Object.fromEntries((r.data ?? []).map(p => [p.id, p]));
}
