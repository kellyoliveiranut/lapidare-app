/**
 * Catálogo de exames que a nutri pode solicitar.
 *
 * É .js e não .json de propósito: isto é constante do app, não dado editável
 * pela nutri. Muda por commit, não por tela — diferente de protocolos_efeitos,
 * que é conteúdo clínico revisável.
 *
 * A CHAVE DE SELEÇÃO É O PRÓPRIO TEXTO DO ITEM, não um id sintético. O texto é
 * o que vai para o PDF e para a coluna `nota`; um id separado criaria dois
 * lugares para a mesma verdade e um mapa para reconciliá-los. O custo é que
 * renomear um item invalidaria seleções já feitas — mas não existe rascunho: a
 * seleção vive só enquanto o formulário está aberto.
 *
 * Itens que na prática são PAINÉIS vêm como uma linha só, com o conteúdo entre
 * parênteses. É assim que o laboratório recebe o pedido, e é o que a Kelly
 * confirmou em 2026-09-04: 5 categorias, 31 itens.
 */
export const CATEGORIAS_EXAME = [
  {
    id: 'proteico',
    label: 'Avaliação proteica/nutricional',
    itens: [
      'Hemograma completo',
      'Proteínas totais e frações',
      'Albumina',
      'Pré-albumina (transtirretina)',
      'Transferrina',
      'Proteína ligadora do retinol (RBP)',
      'Índice de creatinina-altura',
      'Balanço nitrogenado (ureia urinária 24h)',
    ],
  },
  {
    id: 'hematologico',
    label: 'Hematológico',
    itens: [
      'Ferritina',
      'Ferro sérico',
      'Saturação de transferrina',
      'Vitamina B12',
      'Ácido fólico',
    ],
  },
  {
    id: 'bioquimico',
    label: 'Bioquímico/metabólico',
    itens: [
      'Glicemia de jejum',
      'Hemoglobina glicada (HbA1c)',
      'Perfil lipídico completo (colesterol total, HDL, LDL, triglicerídeos)',
      'Hepático (TGO/AST, TGP/ALT, gama-GT, fosfatase alcalina, bilirrubinas)',
      'Função renal (ureia, creatinina, taxa de filtração glomerular)',
      'Eletrólitos e minerais séricos (sódio, potássio, cálcio, magnésio, fósforo)',
      'Ácido úrico',
      'TSH',
      'T4 livre',
    ],
  },
  {
    id: 'vitaminas',
    label: 'Vitaminas e minerais',
    itens: [
      'Vitamina D (25-OH)',
      'Zinco',
      'Selênio',
    ],
  },
  {
    id: 'genetico',
    label: 'Genético/nutrigenômica',
    itens: [
      'MTHFR (metabolismo do folato)',
      'FTO (relacionado à obesidade)',
      'APOA2 (metabolismo lipídico)',
      'TCF7L2 (risco de diabetes tipo 2)',
      'Painel de intolerância à lactose (gene LCT/MCM6)',
      'Painel de sensibilidade ao glúten não-celíaca',
    ],
  },
];

/** Total de itens do catálogo — usado no rodapé do formulário. */
export const TOTAL_ITENS_EXAME =
  CATEGORIAS_EXAME.reduce((n, c) => n + c.itens.length, 0);
