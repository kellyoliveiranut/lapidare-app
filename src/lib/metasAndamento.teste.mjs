import assert from 'node:assert/strict';
import { segundaDaSemana, ultimasSemanas, andamentoDaMeta, textoAndamento } from './metasAndamento.js';

assert.equal(segundaDaSemana('2026-10-30'), '2026-10-26');   // sexta
assert.equal(segundaDaSemana('2026-10-26'), '2026-10-26');   // segunda
assert.equal(segundaDaSemana('2026-11-01'), '2026-10-26');   // domingo
assert.equal(segundaDaSemana('x'), null);
assert.deepEqual(ultimasSemanas('2026-10-30', 3), ['2026-10-12', '2026-10-19', '2026-10-26']);

const regs = [
  { meta_id: 'geral_agua', semana: '2026-10-26' },
  { meta_id: 'geral_agua', semana: '2026-10-12' },
  { meta_id: 'geral_plano', semana: '2026-10-26' },
  { meta_id: 'geral_agua', semana: '2026-01-05' },        // fora da janela
];
const a = andamentoDaMeta(regs, 'geral_agua', '2026-10-30', 4);
assert.equal(a.cumpridas, 2); assert.equal(a.de, 4); assert.equal(a.estaSemana, true);
assert.equal(textoAndamento(a), 'Marcada como cumprida em 2 das últimas 4 semanas');
const b = andamentoDaMeta(regs, 'geral_checkin', '2026-10-30', 4);
assert.equal(b.cumpridas, 0); assert.equal(textoAndamento(b), null); assert.equal(b.estaSemana, false);
console.log('metasAndamento ok');
