/**
 * Catálogo de metas que a nutri escolhe para cada paciente (pacientes.metas_evolucao
 * guarda só os CÓDIGOS). RASCUNHO PARA REVISÃO DA NUTRICIONISTA: o texto de cada meta
 * é conteúdo clínico e é dela. Regras do catálogo: só comportamentos e rotinas, sem
 * quantidade, sem prazo, sem promessa de resultado (CFN 856) e sem meta de peso para
 * oncologia. Para editar um texto, mude só o `texto` — o código não muda.
 */
export const MAX_METAS = 5;
export const MAX_TEXTO_AJUSTE = 140;

export const TEMAS = [
  { id: 'oncologia', rotulo: 'Oncologia' },
  { id: 'emagrecimento', rotulo: 'Emagrecimento' },
  { id: 'saude', rotulo: 'Reeducação alimentar e saúde geral' },
  { id: 'performance', rotulo: 'Hipertrofia e performance' },
  { id: 'geral', rotulo: 'Para qualquer paciente' },
];

export const METAS = [
  // Oncologia
  { id: 'onco_alimentar', tema: 'oncologia', texto: 'Manter a alimentação durante o tratamento, no ritmo que o corpo permitir' },
  { id: 'onco_sintomas', tema: 'oncologia', texto: 'Anotar os sintomas no check-in para ajustarmos o plano' },
  { id: 'onco_forca', tema: 'oncologia', texto: 'Acompanhar a força e a disposição nas atividades do dia a dia' },
  { id: 'onco_atividade', ajustavel: true, tema: 'oncologia', texto: 'Fazer atividade física leve nos dias liberados pela equipe médica' },
  { id: 'onco_hidratacao', ajustavel: true, tema: 'oncologia', texto: 'Manter a hidratação ao longo do dia' },
  // Emagrecimento
  { id: 'emag_peso', tema: 'emagrecimento', texto: 'Chegar ao peso combinado na consulta' },
  { id: 'emag_cintura', tema: 'emagrecimento', texto: 'Acompanhar a medida da cintura, no ritmo combinado' },
  { id: 'emag_movimento', tema: 'emagrecimento', texto: 'Movimentar o corpo nos dias combinados' },
  { id: 'emag_diario', tema: 'emagrecimento', texto: 'Registrar as refeições no diário' },
  // Reeducação alimentar e saúde geral
  { id: 'saude_variedade', tema: 'saude', texto: 'Variar os alimentos ao longo da semana' },
  { id: 'saude_prato', tema: 'saude', texto: 'Montar o prato como combinado na consulta' },
  { id: 'saude_horarios', tema: 'saude', texto: 'Respeitar os horários das refeições' },
  // Hipertrofia e performance
  { id: 'perf_massa', tema: 'performance', texto: 'Acompanhar a massa magra ao longo do tempo' },
  { id: 'perf_treino', tema: 'performance', texto: 'Cumprir o treino combinado com a alimentação do plano' },
  // Qualquer paciente
  { id: 'geral_checkin', tema: 'geral', texto: 'Responder o check-in toda semana' },
  { id: 'geral_plano', tema: 'geral', texto: 'Seguir o plano alimentar nos dias combinados' },
  { id: 'geral_agua', tema: 'geral', texto: 'Tomar água ao longo do dia' },
];

const POR_ID = new Map(METAS.map((m) => [m.id, m]));

/** Tema sugerido a partir do objetivo cadastrado (lista canônica de objetivos.js). */
export function temaDoObjetivo(objetivo) {
  switch ((objetivo ?? '').trim()) {
    case 'Oncologia': case 'Preparo pré-cirúrgico': return 'oncologia';
    case 'Emagrecimento': return 'emagrecimento';
    case 'Reeducação alimentar': case 'Saúde geral': return 'saude';
    case 'Hipertrofia': case 'Performance esportiva': return 'performance';
    default: return null;
  }
}

/**
 * Entrada gravada em pacientes.metas_evolucao: "codigo" (texto do catálogo) ou
 * "codigo::texto ajustado pela nutri" (só para metas `ajustavel`, ex.: atividade e
 * hidratação conforme o tratamento da paciente). Sem mudar o banco.
 */
export function lerEntrada(entrada) {
  const [id, ...resto] = String(entrada ?? '').split('::');
  const texto = resto.join('::').trim();
  return { id, texto: texto || null };
}

export function gravarEntrada({ id, texto }) {
  const m = POR_ID.get(id);
  const t = (texto ?? '').trim().slice(0, MAX_TEXTO_AJUSTE);
  return m?.ajustavel && t && t !== m.texto ? `${id}::${t}` : id;
}

/** Metas (objetos) de uma lista de entradas; ignora código desconhecido e repetido.
 *  `texto` já vem com o ajuste da nutri, quando houver. */
export function metasPorCodigos(entradas) {
  const vistos = new Set();
  const out = [];
  for (const e of Array.isArray(entradas) ? entradas : []) {
    const { id, texto } = lerEntrada(e);
    const m = POR_ID.get(id);
    if (m && !vistos.has(id)) { vistos.add(id); out.push(m.ajustavel && texto ? { ...m, texto } : m); }
  }
  return out;
}
