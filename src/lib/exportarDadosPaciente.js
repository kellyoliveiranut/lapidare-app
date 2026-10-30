// Exportação dos dados de uma paciente (backup e direito de acesso da LGPD).
// Lê as tabelas por paciente_id, página a página, e monta um único JSON.
import { lerTodasPaginas } from './lerPaginas.js';

// Tabelas com paciente_id. Se uma não existir no banco, entra em "avisos" e o resto segue.
export const TABELAS_PACIENTE = [
  'anamneses', 'peso_registros', 'consultas', 'planos', 'prescricoes', 'dietas_pdf', 'listas_compras',
  'suplementos', 'suplementos_logs', 'habitos', 'habitos_logs',
  'checkin_envios', 'followups', 'avaliacao_envios',
  'tratamentos_oncologicos', 'monitoramento_oncologico',
  'exames_laboratoriais', 'exames_emagrecimento', 'exames_emag_marcadores',
  'metas_cumprimento', 'contratos_essentia', 'ebooks_pacientes', 'mensagens',
];

// Nunca vão para o arquivo: credenciais e tokens de notificação.
const SEGREDO = /(token|senha|password|secret|push_|endpoint|auth_key|p256dh)/i;

/** Remove, em qualquer profundidade, as chaves que parecem credencial. */
export function semSegredos(valor) {
  if (Array.isArray(valor)) return valor.map(semSegredos);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).filter(([k]) => !SEGREDO.test(k)).map(([k, v]) => [k, semSegredos(v)]));
  }
  return valor;
}

/** Nome do arquivo: dados-maria-souza-2026-10-30.json (sem acento nem espaço). */
export function nomeArquivoDados(nome, hojeISO) {
  const slug = String(nome ?? 'paciente').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'paciente';
  return `dados-${slug}-${hojeISO}.json`;
}

/** Monta o objeto final a partir do que foi lido. */
export function montarExportacao({ paciente, tabelas, avisos, geradoEm }) {
  return {
    _leia_me: 'Cópia dos dados desta paciente no Essentia. Cada chave é uma tabela; os valores são as linhas como estão no banco. Documento com dados de saúde: guarde com sigilo (LGPD).',
    gerado_em: geradoEm,
    paciente: semSegredos(paciente),
    tabelas: Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, semSegredos(v)])),
    avisos,
  };
}

/** Lê tudo da paciente. `supabase` é o cliente do app. */
export async function lerDadosPaciente(supabase, pacienteId, aoProgredir = () => {}) {
  const { data: paciente, error: erroP } = await supabase.from('pacientes').select('*').eq('id', pacienteId).maybeSingle();
  if (erroP || !paciente) throw new Error(erroP?.message || 'Paciente não encontrada.');
  const tabelas = {}, avisos = [];
  let feitas = 0;
  for (const t of TABELAS_PACIENTE) {
    let { data, error } = await lerTodasPaginas(() => supabase.from(t).select('*').eq('paciente_id', pacienteId).order('id'));
    // Tabela sem coluna id (ex.: marcadores, chaveada por paciente): lê sem ordem, uma página só.
    if (error && data.length === 0) {
      ({ data, error } = await lerTodasPaginas(() => supabase.from(t).select('*').eq('paciente_id', pacienteId), { maximo: 1 }));
    }
    if (error) avisos.push(`${t}: não foi possível ler (${error.message})`);
    else tabelas[t] = data;
    aoProgredir(++feitas, TABELAS_PACIENTE.length);
  }
  return montarExportacao({ paciente, tabelas, avisos, geradoEm: new Date().toISOString() });
}
