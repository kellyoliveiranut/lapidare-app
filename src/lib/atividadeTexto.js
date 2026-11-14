// Texto para a tela "Atividade da secretária".
const TABELAS = {
  pacientes: 'o cadastro', consultas: 'uma consulta', bloqueios_agenda: 'um bloqueio de agenda',
  contratos_essentia: 'um contrato', planos: 'um plano alimentar', prescricoes: 'uma prescrição',
  dietas_pdf: 'um PDF de dieta', listas_compras: 'uma lista de compras', suplementos: 'a suplementação',
  exames_laboratoriais: 'exames', exames_emagrecimento: 'exames', anamneses: 'a anamnese',
  tratamentos_oncologicos: 'o tratamento oncológico', ciclos_quimio: 'os ciclos de quimio',
  vendas: 'uma venda', parcelas: 'uma parcela', gastos: 'um gasto', mensagens: 'uma mensagem',
  servicos: 'um serviço', ebooks: 'um e-book', locais_atendimento: 'um local de atendimento',
  lembretes_nutri: 'um lembrete',
};
const VERBOS = { criou: 'criou', alterou: 'alterou', excluiu: 'excluiu' };

export function descreverAtividade(a, nomePaciente) {
  if (a.acao === 'abriu_ficha') return `abriu a ficha${nomePaciente ? ` de ${nomePaciente}` : ''}`;
  const o = TABELAS[a.tabela] ?? `dados (${a.tabela})`;
  const quem = nomePaciente && a.tabela !== 'servicos' && a.tabela !== 'locais_atendimento' ? ` de ${nomePaciente}` : '';
  return `${VERBOS[a.acao] ?? a.acao} ${o}${quem}`;
}
