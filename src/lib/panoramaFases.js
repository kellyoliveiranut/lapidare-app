/**
 * "Panorama do tratamento": as 6 etapas do acompanhamento nutricional
 * oncológico, com o texto aprovado pela Kelly em 12/10/2026 (bloco-100),
 * palavra por palavra. A etapa atual da paciente fica em panorama_fases e só
 * a nutri muda; nada aqui avança sozinho.
 *
 * Puro (sem React, sem banco) para ser testado no Node.
 */
export const TOTAL_FASES_PANORAMA = 6;

export const FASES_PANORAMA = [
  {
    numero: 1,
    titulo: 'Diagnóstico Nutricional de Alta Precisão',
    linhas: ['Diagnóstico Nutricional', 'de Alta Precisão'],
    itens: [
      'Anamnese clínica e metabólica',
      'Composição corporal',
      'Risco de desnutrição',
      'Sintomas que afetam a ingestão',
      'Exames laboratoriais',
      'Alinhamento com a conduta médica',
    ],
  },
  {
    numero: 2,
    titulo: 'Estratégia Alimentar Terapêutica',
    linhas: ['Estratégia Alimentar', 'Terapêutica'],
    itens: [
      'Plano alinhado ao tratamento',
      'Proteínas para preservar músculo',
      'Glicemia e inflamação',
      'Intestino e imunidade',
      'Suplementação',
      'Rotina prática',
    ],
  },
  {
    numero: 3,
    titulo: 'Blindagem Metabólica',
    linhas: ['Blindagem', 'Metabólica'],
    itens: [
      'Intervenção na perda de peso',
      'Protocolos para dias críticos (ex.: pós-quimioterapia)',
      'Ajustes conforme os efeitos colaterais',
      'Texturas adaptadas quando necessário',
    ],
  },
  {
    numero: 4,
    titulo: 'Manejo de Sintomas',
    linhas: ['Manejo', 'de Sintomas'],
    itens: [
      'Náuseas e vômitos',
      'Alterações de paladar',
      'Boca seca',
      'Constipação ou diarreia',
      'Saciedade precoce',
    ],
  },
  {
    numero: 5,
    titulo: 'Reconstrução Metabólica',
    linhas: ['Reconstrução', 'Metabólica'],
    itens: [
      'Recuperar massa muscular',
      'Reorganizar o metabolismo',
      'Nutrição para cicatrização e regeneração',
      'Integração com exercício (quando liberado)',
      'Reeducação do apetite',
      'Saúde intestinal',
    ],
  },
  {
    numero: 6,
    titulo: 'Longevidade e Prevenção de Recidivas',
    linhas: ['Longevidade e Prevenção', 'de Recidivas'],
    itens: [
      'Plano anti-inflamatório',
      'Proteção metabólica',
      'Controle de composição corporal',
      'Educação alimentar',
      'Novos marcadores de saúde',
      'Planejamento do próximo ciclo de vida',
    ],
  },
];

/** Etapa válida: inteiro de 1 a 6 (número de verdade, não texto). */
export function faseValida(n) {
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_FASES_PANORAMA;
}

/** Frase de estado mostrada abaixo do título da tela. */
export function textoEstado(fase) {
  if (!faseValida(fase)) return 'Sua nutricionista vai indicar em que etapa você está.';
  return `Você está na etapa ${fase} de ${TOTAL_FASES_PANORAMA}: ${FASES_PANORAMA[fase - 1].titulo}.`;
}

/** Estado de uma etapa em relação à atual: 'percorrida' | 'atual' | 'proxima', ou null sem etapa definida. */
export function estadoDaEtapa(numero, fase) {
  if (!faseValida(fase)) return null;
  if (numero < fase) return 'percorrida';
  if (numero === fase) return 'atual';
  return 'proxima';
}

const SUFIXO_ESTADO = { percorrida: ', etapa já percorrida', atual: ', etapa atual', proxima: ', próxima etapa' };

/** aria-label da estação: "Etapa 3 de 6: Blindagem Metabólica, etapa atual" (sem estado quando não há etapa definida). */
export function rotuloEtapa(numero, fase) {
  const f = FASES_PANORAMA[numero - 1];
  return `Etapa ${numero} de ${TOTAL_FASES_PANORAMA}: ${f?.titulo ?? ''}${SUFIXO_ESTADO[estadoDaEtapa(numero, fase)] ?? ''}`;
}

/**
 * Estado de uma etapa na Minha jornada, quando as etapas vêm das consultas
 * (etapasJornada.js) e não de uma fase única: concluída = 'percorrida',
 * a atual = 'atual', depois da atual = 'proxima'. Pulada/cancelada (não
 * concluída e antes da atual), ou sem atual e não concluída: null, sem estado.
 */
export function estadoDaEtapaNaJornada(numero, { atual = null, concluidas = [] } = {}) {
  if (Array.isArray(concluidas) && concluidas.includes(numero)) return 'percorrida';
  if (faseValida(atual) && numero === atual) return 'atual';
  if (faseValida(atual) && numero > atual) return 'proxima';
  return null;
}

/** aria-label da estação na Minha jornada: os mesmos textos de rotuloEtapa. */
export function rotuloEtapaNaJornada(numero, etapas) {
  const f = FASES_PANORAMA[numero - 1];
  return `Etapa ${numero} de ${TOTAL_FASES_PANORAMA}: ${f?.titulo ?? ''}${SUFIXO_ESTADO[estadoDaEtapaNaJornada(numero, etapas)] ?? ''}`;
}
