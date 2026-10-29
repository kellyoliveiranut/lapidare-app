import assert from 'node:assert/strict';
import { semanaQueVem, consultasDoPeriodo, conflitosEntreSi, mensagemReagendamento } from './reagendarLote.js';

// 29/10/2026 é quinta → semana que vem: segunda 02/11 a domingo 08/11.
assert.deepEqual(semanaQueVem('2026-10-29'), { de: '2026-11-02', ate: '2026-11-08' });
// Domingo 01/11 → segunda é amanhã. Segunda 02/11 → a próxima segunda é 09/11.
assert.deepEqual(semanaQueVem('2026-11-01'), { de: '2026-11-02', ate: '2026-11-08' });
assert.deepEqual(semanaQueVem('2026-11-02'), { de: '2026-11-09', ate: '2026-11-15' });

// 14:00 em Belém = 17:00Z
const cs = [
  { id: 'a', status: 'agendada', data_hora: '2026-11-03T17:00:00Z' },
  { id: 'b', status: 'cancelada', data_hora: '2026-11-03T18:00:00Z' },
  { id: 'c', status: 'agendada', data_hora: null },
  { id: 'd', status: 'agendada', data_hora: '2026-11-09T17:00:00Z' },
  { id: 'e', status: 'agendada', data_hora: '2026-11-02T11:00:00Z' },
  // 01:30Z do dia 9 é 22:30 do dia 8 em Belém: ainda é domingo 08
  { id: 'f', status: 'agendada', data_hora: '2026-11-09T01:30:00Z' },
];
assert.deepEqual(consultasDoPeriodo(cs, '2026-11-02', '2026-11-08').map(c => c.id), ['e', 'a', 'f']);
assert.deepEqual(consultasDoPeriodo(undefined, '2026-11-02', '2026-11-08'), []);

const itens = [
  { nome: 'Ana', data: '2026-11-10', hora: '09:00', duracaoMin: 30 },
  { nome: 'Bia', data: '2026-11-10', hora: '09:00', duracaoMin: 30 },
  { nome: 'Cléo', data: '2026-11-10', hora: '09:30', duracaoMin: 30 },
  { nome: 'Dani', data: '', hora: '', duracaoMin: 30 },
];
const conf = conflitosEntreSi(itens);
assert.equal(conf.length, 1);
assert.match(conf[0], /Ana e Bia/);
assert.deepEqual(conflitosEntreSi([]), []);

const antes = { data: '2026-11-03', hora: '14:00' };
const m1 = mensagemReagendamento({ nome: 'Maria Souza', antes, depois: { data: '2026-11-12', hora: '15:30' } });
assert.ok(m1.startsWith('Oi, Maria!'));
assert.match(m1, /03\/11\/2026 às 14:00/);
assert.match(m1, /12\/11\/2026 às 15:30/);
const m2 = mensagemReagendamento({ nome: '', antes, depois: null });
assert.ok(m2.startsWith('Oi!'));
assert.match(m2, /Que dia e horário/);
for (const m of [m1, m2]) assert.ok(!/dispon|está por aqui/i.test(m));
console.log('reagendarLote: ok');
