/**
 * Teste standalone de semConsultaAgenda.js. Roda com `node src/lib/semConsultaAgenda.teste.mjs`.
 * Sem banco. Nomes fictícios. O resultado tem de ser o mesmo em qualquer TZ_TESTE.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { pacientesSemConsulta, diasDeCalendario, dataNoFuso, linhaSemConsulta } = await import('./semConsultaAgenda.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// "agora" = 12/10/2026 15:00 em Belém (UTC-3) = 18:00Z
const AGORA = new Date('2026-10-12T18:00:00Z');
// Consulta às 10:00 de Belém do dia "d dias atrás" (13:00Z)
const diasAtras = d => new Date(Date.UTC(2026, 9, 12 - d, 13, 0, 0)).toISOString();
const diasDepois = d => new Date(Date.UTC(2026, 9, 12 + d, 13, 0, 0)).toISOString();
const pac = (id, extra = {}) => ({ id, nome: `Paciente ${id}`, status_paciente: 'ativo', tipo_plano: 'essentia', created_at: '2025-01-10T12:00:00Z', ...extra });
const roda = (pacientes, consultas, agora = AGORA) => pacientesSemConsulta({ pacientes, consultas, agora });
const ids = r => r.map(x => x.pacienteId);

t('consulta futura agendada → não entra', ids(roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(90), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasDepois(5), status: 'agendada' }])), []);
t('só cancelada recente: ignora a cancelada e usa a última realizada (40 dias)', roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(40), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasAtras(3), status: 'cancelada' },
  { paciente_id: 'A', data_hora: diasDepois(3), status: 'cancelada' }]).map(x => [x.pacienteId, x.diasSemConsulta, x.semNenhuma]), [['A', 40, false]]);
t('última realizada há 29 dias → não entra', ids(roda([pac('A')], [{ paciente_id: 'A', data_hora: diasAtras(29), status: 'realizada' }])), []);
t('há 30 dias → entra', roda([pac('A')], [{ paciente_id: 'A', data_hora: diasAtras(30), status: 'realizada' }]).map(x => x.diasSemConsulta), [30]);
t('há 31 e há 90 → entram', roda([pac('A'), pac('B')], [
  { paciente_id: 'A', data_hora: diasAtras(31), status: 'realizada' },
  { paciente_id: 'B', data_hora: diasAtras(90), status: 'realizada' }]).map(x => [x.pacienteId, x.diasSemConsulta]), [['B', 90], ['A', 31]]);
t('futura agendada E última há 90 dias → não entra', ids(roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(90), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasDepois(40), status: 'agendada' }])), []);
// bloco-107: 'agendada' que já passou há menos de 30 dias (falta o registro) tira a paciente da lista.
t("'agendada' passada há 10 dias (falta registro) → não entra, mesmo com a última realizada há 60", ids(roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(60), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasAtras(10), status: 'agendada' }])), []);
t("'agendada' passada há 29 dias, sem realizada recente → não entra", ids(roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(60), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasAtras(29), status: 'agendada' }])), []);
t("'agendada' passada há 30 dias → ignorada; entra pela última realizada (60), nunca conta como realizada", roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(60), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasAtras(30), status: 'agendada' }]).map(x => [x.pacienteId, x.diasSemConsulta]), [['A', 60]]);
t("sem nenhuma realizada: 'agendada' passada há 10 dias → não entra", ids(roda([pac('A', { created_at: diasAtras(45) })], [
  { paciente_id: 'A', data_hora: diasAtras(10), status: 'agendada' }])), []);
t("sem nenhuma realizada: 'agendada' passada há 30 dias → entra pelo cadastro (semNenhuma)", roda([pac('A', { created_at: diasAtras(45) })], [
  { paciente_id: 'A', data_hora: diasAtras(30), status: 'agendada' }]).map(x => [x.semNenhuma, x.diasSemConsulta]), [[true, 45]]);
t("'agendada' passada recente de OUTRA paciente não afeta", ids(roda([pac('A'), pac('B')], [
  { paciente_id: 'A', data_hora: diasAtras(60), status: 'realizada' },
  { paciente_id: 'B', data_hora: diasAtras(5), status: 'agendada' }])), ['A']);
t("'cancelada' recente NÃO protege (continua entrando)", ids(roda([pac('A')], [
  { paciente_id: 'A', data_hora: diasAtras(60), status: 'realizada' },
  { paciente_id: 'A', data_hora: diasAtras(5), status: 'cancelada' }])), ['A']);
const velha = [{ paciente_id: 'A', data_hora: diasAtras(90), status: 'realizada' }];
t('avulsa, finalizado, obito e status nulo ficam fora', ids(roda([
  pac('A', { tipo_plano: 'avulsa' }), pac('A2', { status_paciente: 'finalizado' }), pac('A3', { status_paciente: 'obito' }), pac('A4', { status_paciente: null })],
  ['A', 'A2', 'A3', 'A4'].map(id => ({ ...velha[0], paciente_id: id })))), []);
t("plano 'Essentia ' com maiúscula/espaço entra; qualquer objetivo", ids(roda([pac('A', { tipo_plano: ' Essentia ', objetivo: 'Emagrecimento' }), pac('B', { objetivo: 'Oncologia' })],
  [{ ...velha[0] }, { ...velha[0], paciente_id: 'B' }])), ['A', 'B']);
t('sem nenhuma realizada, cadastrada há 29 dias → não entra', ids(roda([pac('A', { created_at: diasAtras(29) })], [])), []);
t('sem nenhuma realizada, cadastrada há 30 dias → entra com semNenhuma', roda([pac('A', { created_at: diasAtras(30) })], []).map(x => [x.semNenhuma, x.ultimaConsulta, x.diasSemConsulta]), [[true, null, 30]]);
t('sem nenhuma e sem created_at → não entra', ids(roda([pac('A', { created_at: null })], [])), []);
t('ordem: mais dias primeiro; empate por nome', roda([pac('C'), pac('B'), pac('A', { created_at: diasAtras(200) })], [
  { paciente_id: 'C', data_hora: diasAtras(45), status: 'realizada' },
  { paciente_id: 'B', data_hora: diasAtras(45), status: 'realizada' }]).map(x => [x.nome, x.diasSemConsulta]),
  [['Paciente A', 200], ['Paciente B', 45], ['Paciente C', 45]]);
t('listas vazias, nulas e entrada vazia', [roda([], []), roda(null, null), pacientesSemConsulta(), pacientesSemConsulta({ pacientes: [pac('A')], consultas: [{ paciente_id: 'A', data_hora: null, status: 'realizada' }], agora: 'x' })], [[], [], [], []]);
t('consulta sem data e linhas nulas são ignoradas', ids(roda([pac('A'), null], [null, { paciente_id: 'A', data_hora: null, status: 'agendada' }, { paciente_id: 'A', data_hora: diasAtras(35), status: 'realizada' }])), ['A']);

// Perto da meia-noite em Belém: 23:30 de 12/10 em Belém = 02:30Z de 13/10.
const QUASE_MEIA_NOITE = new Date('2026-10-13T02:30:00Z');
// Consulta às 00:30 de Belém de 12/09 (03:30Z) → 30 dias de calendário em Belém (12/09 → 12/10)
t('perto da meia-noite: 12/09 00:30 até 12/10 23:30 em Belém = 30 dias', roda([pac('A')], [{ paciente_id: 'A', data_hora: '2026-09-12T03:30:00Z', status: 'realizada' }], QUASE_MEIA_NOITE).map(x => x.diasSemConsulta), [30]);
// Agendada sem registro perto da meia-noite: 13/09 00:30 em Belém (03:30Z) até 12/10 23:30 = 29 dias → protege;
// 12/09 00:30 em Belém (03:30Z) = 30 dias → não protege (a paciente entra pela realizada de 90 dias).
const real90 = { paciente_id: 'A', data_hora: '2026-07-14T13:00:00Z', status: 'realizada' };
t('perto da meia-noite: agendada passada há 29 dias de calendário em Belém → não entra',
  ids(roda([pac('A')], [real90, { paciente_id: 'A', data_hora: '2026-09-13T03:30:00Z', status: 'agendada' }], QUASE_MEIA_NOITE)), []);
t('perto da meia-noite: agendada passada há 30 dias de calendário em Belém → entra',
  ids(roda([pac('A')], [real90, { paciente_id: 'A', data_hora: '2026-09-12T03:30:00Z', status: 'agendada' }], QUASE_MEIA_NOITE)), ['A']);
// 11/09 23:50 em Belém (12/09 02:50Z) → 31 dias de calendário em Belém.
t('perto da meia-noite: 11/09 23:50 (Belém) até 12/10 23:30 = 31 dias, não o dia do UTC', diasDeCalendario(new Date('2026-09-12T02:50:00Z'), QUASE_MEIA_NOITE, 'America/Belem'), 31);
// 12/09 03:30Z → 13/10 02:30Z: em Belém é 12/09 → 12/10 (30); em Lisboa, 12/09 → 13/10 (31). Prova que vale o fuso do parâmetro, não o da máquina.
t('o fuso é o do parâmetro: mesmos instantes dão 30 em Belém e 31 em Lisboa',
  [diasDeCalendario(new Date('2026-09-12T03:30:00Z'), QUASE_MEIA_NOITE, 'America/Belem'), diasDeCalendario(new Date('2026-09-12T03:30:00Z'), QUASE_MEIA_NOITE, 'Europe/Lisbon')], [30, 31]);
t('dias de calendário, não blocos de 24 h: 23:59 → 00:01 do dia seguinte = 1', diasDeCalendario(new Date('2026-10-13T02:59:00Z'), new Date('2026-10-13T03:01:00Z')), 1);

t('data dd/mm/aaaa no fuso de Belém (02:30Z ainda é o dia anterior)', [dataNoFuso('2026-10-13T02:30:00Z'), dataNoFuso(null), dataNoFuso('lixo')], ['12/10/2026', '', '']);
t('texto das linhas', [linhaSemConsulta({ semNenhuma: false, ultimaConsulta: '2026-09-01T13:00:00Z', diasSemConsulta: 41 }),
  linhaSemConsulta({ semNenhuma: true, ultimaConsulta: null, diasSemConsulta: 30 }), linhaSemConsulta({ semNenhuma: true, ultimaConsulta: null, diasSemConsulta: 1 })],
  ['Última consulta em 01/09/2026 · há 41 dias', 'Nenhuma consulta realizada ainda · cadastrada há 30 dias', 'Nenhuma consulta realizada ainda · cadastrada há 1 dia']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
