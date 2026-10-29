import assert from 'node:assert/strict';
import { montarSlots, rotuloTipo, tiposDoPlano, ehPlanoEssentia } from './slotsConsultas.js';

assert.equal(ehPlanoEssentia(' Essentia '), true);
assert.equal(ehPlanoEssentia('avulsa'), false);
assert.equal(ehPlanoEssentia(null), false);
assert.equal(rotuloTipo('consulta_3'), 'Consulta 3');
assert.equal(rotuloTipo('primeira'), '1ª consulta');
assert.equal(rotuloTipo('retorno'), 'Retorno');
assert.deepEqual(tiposDoPlano('avulsa'), ['primeira', 'retorno']);

// Como na tela da Kelly: 1ª, 3, 4, 5, 6 existem; a 2 não. Datas fora de ordem.
const cs = [
  { id: 'c6', tipo: 'consulta_6', status: 'agendada', data_hora: '2027-01-11T18:30:00Z' },
  { id: 'c3', tipo: 'consulta_3', status: 'agendada', data_hora: '2026-11-27T18:00:00Z' },
  { id: 'c1', tipo: 'primeira', status: 'realizada', data_hora: '2026-09-16T13:00:00Z' },
  { id: 'c4', tipo: 'consulta_4', status: 'agendada', data_hora: '2026-12-14T20:30:00Z' },
  { id: 'c5', tipo: 'consulta_5', status: 'agendada', data_hora: null },
  { id: 'cx', tipo: 'consulta_2', status: 'cancelada', data_hora: '2026-10-20T13:00:00Z' },
];
const r = montarSlots('essentia', cs);
assert.deepEqual(r.slots.map(s => s.rotulo), ['1ª consulta', 'Consulta 2', 'Consulta 3', 'Consulta 4', 'Consulta 5', 'Consulta 6']);
assert.deepEqual(r.slots.map(s => s.consulta?.id ?? null), ['c1', null, 'c3', 'c4', 'c5', 'c6']);
assert.deepEqual(r.outras, []);

// Avulsa antiga e retorno no Essentia vão para "outras"; duplicata não some.
const r2 = montarSlots('essentia', [
  { id: 'a', tipo: 'avulsa', status: 'agendada', data_hora: '2026-10-01T13:00:00Z' },
  { id: 'p1', tipo: 'primeira', status: 'realizada', data_hora: '2026-09-01T13:00:00Z' },
  { id: 'p2', tipo: 'primeira', status: 'agendada', data_hora: '2026-10-05T13:00:00Z' },
]);
assert.equal(r2.slots[0].consulta.id, 'p1');
assert.deepEqual(r2.outras.map(c => c.id).sort(), ['a', 'p2']);

// Avulsa: 1ª consulta e Retorno.
const r3 = montarSlots('avulsa', [{ id: 'r', tipo: 'retorno', status: 'agendada', data_hora: '2026-11-01T13:00:00Z' }]);
assert.deepEqual(r3.slots.map(s => [s.rotulo, s.consulta?.id ?? null]), [['1ª consulta', null], ['Retorno', 'r']]);
assert.deepEqual(montarSlots('essentia', undefined).slots.length, 6);
console.log('slotsConsultas: ok');
