/**
 * Modelo padrão de Anamnese Clínica — Lapidare
 *
 * Estrutura:
 *  - secoes: array de seções
 *  - cada seção: { id, titulo, perguntas: [...] }
 *  - cada pergunta: { id, tipo, pergunta, ... specs }
 *
 * Tipos de pergunta:
 *  - texto:   resposta livre (opcional rows)
 *  - numero:  valor numérico (opcional unidade)
 *  - single:  uma opção (radio)
 *  - multi:   várias opções (checkbox)
 */

export const ANAMNESE_LAPIDARE = {
  nome: 'Anamnese Clínica Essentia',
  descricao: 'Modelo completo padrão Essentia',
  estrutura: {
    secoes: [
      {
        id: 'historia_peso',
        titulo: '1. História de peso',
        perguntas: [
          { id: 'peso_atual',    tipo: 'numero', pergunta: 'Peso atual',                                                                  unidade: 'kg' },
          { id: 'peso_infancia', tipo: 'texto',  pergunta: 'Peso na infância/adolescência (era acima, normal ou abaixo do peso?)',         rows: 2 },
          { id: 'peso_max',      tipo: 'texto',  pergunta: 'Peso máximo na vida (quando e por quanto tempo?)',                             rows: 2 },
          { id: 'peso_min',      tipo: 'texto',  pergunta: 'Peso mínimo na vida (quando e por quanto tempo?)',                             rows: 2 },
          { id: 'flutuacoes',    tipo: 'texto',  pergunta: 'Flutuações de peso nos últimos anos (períodos, variações e causas)',           rows: 4 },
        ],
      },
      {
        id: 'habitos_gerais',
        titulo: '2. Hábitos alimentares gerais',
        perguntas: [
          { id: 'n_refeicoes',   tipo: 'numero', pergunta: 'Número de refeições por dia',           unidade: 'refeições' },
          { id: 'lanches',       tipo: 'single', pergunta: 'Faz lanche entre as refeições?',         opcoes: ['Sim', 'Não'] },
          { id: 'nunca_faz',     tipo: 'multi',  pergunta: 'Refeições que NUNCA faz',                opcoes: ['Café da manhã', 'Almoço', 'Café da tarde', 'Jantar', 'Ceia'] },
          { id: 'local_come',    tipo: 'multi',  pergunta: 'Onde você geralmente come?',             opcoes: ['Em casa', 'No trabalho', 'Restaurante/Lanchonete', 'Marmita/Quentinha', 'Outro'] },
        ],
      },
      {
        id: 'padrao_alimentar',
        titulo: '3. Padrão alimentar',
        perguntas: [
          { id: 'classifica',    tipo: 'single', pergunta: 'Como você classifica sua alimentação atual?',
            opcoes: ['Muito saudável', 'Saudável', 'Normal/Equilibrada', 'Pouco saudável', 'Muito pouco saudável'] },
          { id: 'gosta_muito',   tipo: 'texto',  pergunta: 'Alimentos que GOSTA muito',                                                  rows: 2 },
          { id: 'nao_gosta',     tipo: 'texto',  pergunta: 'Alimentos que NÃO GOSTA',                                                    rows: 2 },
          { id: 'nao_consegue',  tipo: 'texto',  pergunta: 'Alimentos que NÃO CONSEGUE comer (textura, sabor, dificuldade de mastigar)', rows: 2 },
          { id: 'alergias',      tipo: 'texto',  pergunta: 'Alergias ou intolerâncias alimentares',                                      rows: 2 },
        ],
      },
      {
        id: 'comportamento',
        titulo: '4. Comportamento alimentar',
        perguntas: [
          { id: 'fome',          tipo: 'single', pergunta: 'Você tem:',                              opcoes: ['Fome aumentada', 'Fome normal', 'Fome reduzida', 'Fome variável'] },
          { id: 'comportamentos', tipo: 'multi', pergunta: 'Apresenta alguns desses comportamentos?',
            opcoes: ['Come rápido (sem mastigar bem)', 'Come enquanto faz outras atividades (TV, celular, trabalho)',
                     'Come até ficar muito cheio', 'Come quando ansiosa/triste/estressada (comer emocional)',
                     'Pula refeições', 'Belisca durante o dia'] },
        ],
      },
      {
        id: 'digestao',
        titulo: '5. Digestão e função intestinal',
        perguntas: [
          { id: 'digestao',      tipo: 'single', pergunta: 'Como é sua digestão?',
            opcoes: ['Ótima (sem sintomas)', 'Boa (sintomas ocasionais)', 'Ruim (sintomas frequentes)', 'Muito ruim (sintomas diários)'] },
          { id: 'sintomas',      tipo: 'multi',  pergunta: 'Presença de sintomas digestivos:',       opcoes: ['Inchaço/Gases', 'Azia/Refluxo', 'Dor abdominal', 'Náusea', 'Nenhum'] },
          { id: 'intestino',     tipo: 'single', pergunta: 'Função intestinal:',
            opcoes: ['Evacua diariamente (regular)', 'Prisão de ventre (menos de 3x/semana)', 'Diarreia (mais de 3x/dia ou fezes moles)', 'Variável'] },
        ],
      },
      {
        id: 'agua',
        titulo: '6. Ingestão de água',
        perguntas: [
          { id: 'agua_litros',   tipo: 'numero', pergunta: 'Quanto de água você bebe por dia?',     unidade: 'L' },
        ],
      },
      {
        id: 'observacoes',
        titulo: '7. Observações da nutri',
        perguntas: [
          { id: 'observacoes',   tipo: 'texto',  pergunta: 'Anotações livres, condutas, próximos passos',  rows: 6 },
        ],
      },
    ],
  },
};

/**
 * Modelo padrão de Questionário de Frequência Alimentar (QFA)
 */
const FREQ = ['Nunca', 'Raramente', 'Ocasionalmente', 'Regularmente', 'Frequentemente', 'Diariamente'];

const FREQ_GERAL = [
  'Nunca',
  'Raramente (menos de 1x/semana)',
  'Ocasionalmente (1-3x/semana)',
  'Regularmente (4-5x/semana)',
  'Diariamente',
];

function alimento(id, nome) {
  return { id, tipo: 'single', pergunta: nome, opcoes: FREQ };
}

export const QFA_LAPIDARE = {
  nome: 'Questionário de Frequência Alimentar (QFA)',
  descricao: 'Frequência de consumo por grupo alimentar',
  estrutura: {
    secoes: [
      {
        id: 'cereais',
        titulo: '1. Cereais, pães e tubérculos',
        perguntas: [
          alimento('arroz_branco',     'Arroz branco'),
          alimento('arroz_integral',   'Arroz integral'),
          alimento('pao_branco',       'Pão branco'),
          alimento('pao_integral',     'Pão integral'),
          alimento('cereais_matinais', 'Cereais matinais'),
          alimento('macarrao',         'Macarrão'),
          alimento('batata',           'Batata / Batata-doce'),
        ],
      },
      {
        id: 'proteinas',
        titulo: '2. Proteínas (carnes e similares)',
        perguntas: [
          alimento('carne_vermelha', 'Carne vermelha'),
          alimento('carne_branca',   'Carne branca (frango, peru)'),
          alimento('peixe',          'Peixe'),
          alimento('ovo',            'Ovo'),
          alimento('leguminosa',     'Leguminosas (feijão, lentilha, grão-de-bico)'),
          alimento('processado',     'Carne processada (linguiça, salsicha, presunto)'),
        ],
      },
      {
        id: 'frutas',
        titulo: '3. Frutas',
        perguntas: [
          { id: 'frutas_freq',      tipo: 'single', pergunta: 'Consumo geral de frutas (qualquer tipo, crua ou suco)', opcoes: FREQ_GERAL },
          { id: 'frutas_favoritas', tipo: 'texto',  pergunta: 'Tipos de frutas mais consumidas (cite 3-5)',             rows: 2 },
        ],
      },
      {
        id: 'hortalicas',
        titulo: '4. Hortaliças / verduras',
        perguntas: [
          { id: 'hortalicas_freq',     tipo: 'single', pergunta: 'Consumo geral de hortaliças/verduras (qualquer tipo, cru ou cozido)', opcoes: FREQ_GERAL },
          { id: 'hortalicas_favoritas', tipo: 'texto', pergunta: 'Tipos de hortaliças mais consumidas (cite 3-5)',                       rows: 2 },
        ],
      },
      {
        id: 'lacteos',
        titulo: '5. Lácteos',
        perguntas: [
          { id: 'leite_tipo',   tipo: 'single', pergunta: 'Tipo de leite consumido', opcoes: ['Integral', 'Semi-desnatado', 'Desnatado', 'Vegetal (aveia, amêndoas, etc.)', 'Não consome'] },
          { id: 'leite_freq',   tipo: 'single', pergunta: 'Frequência de consumo de leite',     opcoes: FREQ },
          { id: 'iogurte_freq', tipo: 'single', pergunta: 'Frequência de consumo de iogurte',   opcoes: FREQ },
          { id: 'queijo_freq',  tipo: 'single', pergunta: 'Frequência de consumo de queijo',    opcoes: FREQ },
        ],
      },
      {
        id: 'gorduras',
        titulo: '6. Gorduras e óleos',
        perguntas: [
          { id: 'oleo_preparo', tipo: 'multi',  pergunta: 'Óleo(s) usado(s) no preparo dos alimentos', opcoes: ['Azeite', 'Óleo vegetal (soja, milho, girassol)', 'Manteiga', 'Banha', 'Manteiga clarificada / Ghee', 'Outro'] },
          { id: 'fritura_freq', tipo: 'single', pergunta: 'Frequência de consumo de frituras',          opcoes: FREQ },
        ],
      },
      {
        id: 'industrializados',
        titulo: '7. Industrializados e ultraprocessados',
        perguntas: [
          alimento('refrigerante',   'Refrigerante / suco artificial'),
          alimento('biscoito_doce',  'Biscoito recheado / doce'),
          alimento('biscoito_salgado', 'Biscoito salgado'),
          alimento('salgadinho',     'Salgadinho de pacote'),
          alimento('fast_food',      'Fast food'),
          alimento('doces',          'Chocolates, balas e doces'),
        ],
      },
      {
        id: 'bebidas',
        titulo: '8. Bebidas',
        perguntas: [
          alimento('cafe',     'Café'),
          alimento('cha',      'Chá'),
          alimento('alcool',   'Bebida alcoólica'),
          alimento('suco_nat', 'Suco natural'),
        ],
      },
      {
        id: 'obs_qfa',
        titulo: '9. Observações da nutri',
        perguntas: [
          { id: 'observacoes', tipo: 'texto', pergunta: 'Anotações, padrões identificados, prioridades de intervenção', rows: 5 },
        ],
      },
    ],
  },
};


/**
 * Modelo padrão de Recordatório Alimentar de 24h
 *
 * Estrutura: cada refeição é uma seção, com horário (texto curto) + alimentos
 * (textarea detalhada). Final tem observações.
 */
function refeicao(id, titulo, rows = 4) {
  return {
    id,
    titulo,
    perguntas: [
      { id: `${id}_horario`,   tipo: 'texto', pergunta: 'Horário aproximado (ex: 07:30)' },
      { id: `${id}_alimentos`, tipo: 'texto',
        pergunta: 'Alimentos, quantidades e preparações',
        placeholder: 'Ex:\n— 2 colheres de sopa de arroz branco cozido\n— 1 filé de frango grelhado (~150g)\n— Salada de alface, tomate e cenoura com azeite',
        rows },
    ],
  };
}

export const RECORDATORIO_LAPIDARE = {
  nome: 'Recordatório Alimentar 24h',
  descricao: 'Tudo que foi consumido nas últimas 24 horas',
  estrutura: {
    secoes: [
      {
        id: 'meta',
        titulo: 'Dados do recordatório',
        perguntas: [
          { id: 'data_recordatorio', tipo: 'texto', pergunta: 'Data do recordatório (dd/mm/aaaa)' },
          { id: 'instrucao',         tipo: 'texto',
            pergunta: 'Detalhe TUDO que comeu/bebeu nas últimas 24h. Inclua alimentos, bebidas, condimentos, óleos, sal e açúcar. Seja específico nas quantidades (colher, xícara, prato, unidade).',
            placeholder: 'Sem necessidade de preencher — só leia.',
            rows: 1 },
        ],
      },
      refeicao('cafe',        '☕ Café da manhã'),
      refeicao('lanche_manha', '🥪 Lanche da manhã'),
      refeicao('almoco',      '🍽️ Almoço', 5),
      refeicao('lanche_tarde', '🍪 Lanche da tarde'),
      refeicao('jantar',      '🍲 Jantar', 5),
      refeicao('ceia',        '🥛 Lanche noturno / Ceia', 3),
      {
        id: 'observacoes',
        titulo: 'Observações importantes',
        perguntas: [
          { id: 'dia_tipico',     tipo: 'single', pergunta: 'Este dia foi típico (normal pra você)?',
            opcoes: ['Sim', 'Não — foi atípico'] },
          { id: 'dia_atipico_motivo', tipo: 'texto',
            pergunta: 'Se atípico, o que mudou? (ex: viagem, feriado, doente, etc.)',
            rows: 2 },
          { id: 'nao_comeu_hoje', tipo: 'texto',
            pergunta: 'Alimentos que geralmente come mas NÃO comeu neste dia',
            rows: 2 },
          { id: 'sal_temperos',   tipo: 'texto',
            pergunta: 'Uso de sal e temperos (tipos e quantidades)',
            rows: 2 },
          { id: 'esquecidos',     tipo: 'texto',
            pergunta: 'Alimentos/bebidas que frequentemente não foram listados',
            rows: 2 },
        ],
      },
    ],
  },
};


/**
 * Formata uma resposta pra exibição (HTML/texto)
 */
export function formatarRespostaAnamnese(pergunta, valor) {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (pergunta.tipo === 'numero') {
    return `${valor}${pergunta.unidade ? ' ' + pergunta.unidade : ''}`;
  }
  if (pergunta.tipo === 'multi') {
    if (!Array.isArray(valor) || valor.length === 0) return '—';
    return valor.join(', ');
  }
  return String(valor);
}
