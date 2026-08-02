/**
 * Lista canônica de objetivos da paciente, e normalização de texto livre.
 *
 * A lista existia em três cópias — Cadastrar.jsx, o select de edição do
 * PacientePerfil.jsx e SignupPaciente.jsx — e as duas últimas NÃO tinham
 * 'Preparo pré-cirúrgico'. Uma paciente cadastrada com esse objetivo o perdia
 * em silêncio ao salvar o formulário do perfil: o select caía para vazio e o
 * update gravava null. Por isso a lista mora aqui, num lugar só.
 */
export const OBJETIVOS = [
  'Emagrecimento',
  'Hipertrofia',
  'Reeducação alimentar',
  'Saúde geral',
  'Performance esportiva',
  'Oncologia',
  'Preparo pré-cirúrgico',
  'Outro',
];

// 'Reeducação  alimentar' -> 'reeducacao alimentar'. Sem acento, sem caixa e
// com espaço colapsado: planilha exportada de outro sistema costuma trazer
// espaço duplo.
const chave = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');

const POR_CHAVE = new Map(OBJETIVOS.map(o => [chave(o), o]));

/**
 * Devolve o valor canônico da lista, ou null se não reconhecer.
 *
 * Existe por causa da importação por CSV, que aceita texto livre: uma planilha
 * com 'oncologia' minúsculo criaria uma paciente que NÃO recebe a orientação
 * de tratamento na mensagem de convite — lib/mensagemAcesso.js compara por
 * 'Oncologia' estrito, e é estrito de propósito (foi o padrão frouxo que fez
 * uma paciente de 'Reeducação alimentar' receber texto de quimioterapia).
 *
 * Devolve null em vez do texto solto: melhor um campo vazio, que a nutri vê e
 * corrige, do que um valor que parece preenchido e se comporta como 'Outro'.
 * Quem chama deve avisar o que descartou — ver _ImportarCsv.jsx.
 */
export function normalizarObjetivo(texto) {
  return POR_CHAVE.get(chave(texto)) ?? null;
}
