/**
 * Teste standalone de pacientesComCancelada() (agendaListas.js).
 * Roda com `node src/lib/agendaListas.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes.
 * A função compara ISO em string, então não deveria depender do fuso — rodar
 * com TZ_TESTE em outros fusos prova isso. O "agora" é fixo: nada aqui lê o
 * relógio da máquina.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { pacientesComCancelada } = await import('./agendaListas.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// Mesma forma do `agora` da Agenda: new Date().toISOString().
const AGORA = '2026-10-08T13:00:00.000Z';
const PASSADA = '2026-09-01T13:00:00+00:00';   // forma que o Postgres devolve
const FUTURA = '2026-11-01T13:00:00+00:00';

const pac = (id, nome) => ({ id, nome });
const cons = (paciente, status, data_hora) => ({ status, data_hora, paciente });
const ids = lista => lista.map(p => p.paciente_id);

const ANA = pac('a', 'Ana');
const BRUNA = pac('b', 'Bruna');

// ─── quem entra ──────────────────────────────────────────────────────
t('entra', 'só cancelada: aparece',
  pacientesComCancelada([cons(ANA, 'cancelada', FUTURA)], AGORA),
  [{ paciente_id: 'a', nome: 'Ana' }]);
t('entra', 'cancelada + agendada JÁ PASSADA: aparece',
  ids(pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(ANA, 'agendada', PASSADA)], AGORA)), ['a']);
t('entra', 'cancelada + realizada: aparece',
  ids(pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(ANA, 'realizada', PASSADA)], AGORA)), ['a']);
t('entra', 'cancelada sem data: aparece (não é "a definir", está cancelada)',
  ids(pacientesComCancelada([cons(ANA, 'cancelada', null)], AGORA)), ['a']);
t('entra', 'paciente_id direto, sem o join: aparece',
  pacientesComCancelada([{ status: 'cancelada', data_hora: PASSADA, paciente_id: 'z' }], AGORA),
  [{ paciente_id: 'z', nome: 'Paciente sem nome' }]);

// ─── quem não entra ──────────────────────────────────────────────────
t('não entra', 'cancelada + agendada futura: não aparece',
  pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(ANA, 'agendada', FUTURA)], AGORA), []);
t('não entra', 'cancelada + agendada sem data ("a definir"): não aparece',
  pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(ANA, 'agendada', null)], AGORA), []);
t('não entra', 'agendada exatamente no "agora" conta como futura (>=)',
  pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(ANA, 'agendada', AGORA)], AGORA), []);
t('não entra', 'sem cancelada (só realizada e agendada passada): não aparece',
  pacientesComCancelada([cons(ANA, 'realizada', PASSADA), cons(ANA, 'agendada', PASSADA)], AGORA), []);
t('não entra', 'a agendada futura de OUTRA paciente não tira esta da lista',
  ids(pacientesComCancelada([cons(ANA, 'cancelada', PASSADA), cons(BRUNA, 'agendada', FUTURA)], AGORA)), ['a']);
t('não entra', 'linha sem paciente é ignorada',
  pacientesComCancelada([{ status: 'cancelada', data_hora: PASSADA }], AGORA), []);

// ─── uma linha por paciente ──────────────────────────────────────────
t('agrupa', 'várias canceladas da mesma paciente: uma linha',
  pacientesComCancelada([
    cons(ANA, 'cancelada', PASSADA), cons(ANA, 'cancelada', FUTURA), cons(ANA, 'cancelada', null),
  ], AGORA),
  [{ paciente_id: 'a', nome: 'Ana' }]);

// ─── ordem ───────────────────────────────────────────────────────────
t('ordem', 'acentos: "Ágata" antes de "Bruna"',
  pacientesComCancelada([cons(BRUNA, 'cancelada', PASSADA), cons(pac('g', 'Ágata'), 'cancelada', PASSADA)], AGORA)
    .map(p => p.nome),
  ['Ágata', 'Bruna']);
t('ordem', 'sem diferenciar maiúscula: "ana" antes de "Bruna"',
  pacientesComCancelada([cons(BRUNA, 'cancelada', PASSADA), cons(pac('x', 'ana'), 'cancelada', PASSADA)], AGORA)
    .map(p => p.nome),
  ['ana', 'Bruna']);
t('ordem', 'sem nome: no fim, como "Paciente sem nome"',
  pacientesComCancelada([
    cons(pac('s', null), 'cancelada', PASSADA), cons(BRUNA, 'cancelada', PASSADA), cons(ANA, 'cancelada', PASSADA),
  ], AGORA),
  [{ paciente_id: 'a', nome: 'Ana' }, { paciente_id: 'b', nome: 'Bruna' }, { paciente_id: 's', nome: 'Paciente sem nome' }]);

// ─── entradas vazias ─────────────────────────────────────────────────
t('vazio', 'array vazio: lista vazia', pacientesComCancelada([], AGORA), []);
t('vazio', 'null: lista vazia', pacientesComCancelada(null, AGORA), []);

// ─── saída ───────────────────────────────────────────────────────────
let grupoAtual = '';
for (const c of casos) {
  if (c.grupo !== grupoAtual) { grupoAtual = c.grupo; console.log(`\n── ${grupoAtual} ──`); }
  const marca = c.passou ? 'PASS' : 'FALHA';
  const det = c.passou ? '' : `   (esperado ${JSON.stringify(c.esperado)}, obteve ${JSON.stringify(c.obtido)})`;
  console.log(`  ${marca}  ${c.nome}${det}`);
}
console.log(`\nTZ = ${process.env.TZ} | offset real = ${new Date().getTimezoneOffset()}`);
console.log(`${ok} passaram, ${falhou} falharam, ${casos.length} no total`);
process.exit(falhou ? 1 : 0);
