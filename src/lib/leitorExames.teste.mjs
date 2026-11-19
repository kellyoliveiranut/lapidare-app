import assert from 'node:assert/strict';
import { EX, EXLIB, TIPS, FORMULAS } from '../data/maylab_exames.js';
import { statusDoExame, leitorDe, calculos, padroes, buscarExames } from './leitorExames.js';

assert.equal(EX.length, 74); assert.equal(EXLIB.length, 24); assert.equal(TIPS.length, 14); assert.equal(Object.keys(FORMULAS).length, 13);
assert.equal(new Set(EX.map(e => e.id)).size, EX.length, 'ids únicos');
const ex = (id) => EX.find(e => e.id === id);

// status
assert.equal(statusDoExame(ex('hb'), 13).classe, 'ok');
assert.equal(statusDoExame(ex('hb'), 10).classe, 'lo');
assert.equal(statusDoExame(ex('hb'), 17).classe, 'hi');
assert.equal(statusDoExame(ex('eos'), 1).classe, 'ok');
assert.equal(statusDoExame(ex('eos'), 3).classe, 'hi');
assert.equal(statusDoExame(ex('b12'), 400).classe, 'ok2');
assert.equal(statusDoExame(ex('b12'), 300).classe, 'lo');
assert.equal(statusDoExame(ex('b12'), 700).classe, 'ok');
assert.equal(statusDoExame(ex('ferr'), 30).classe, 'lo');
assert.equal(statusDoExame(ex('ferr'), 80).classe, 'ok');
assert.equal(statusDoExame(ex('ferr'), 150).classe, 'hi');
assert.match(statusDoExame(ex('ferr'), 300).texto, /194/);
assert.equal(statusDoExame(ex('pcr'), 0.5).classe, 'ok');
assert.equal(statusDoExame(ex('pcr'), 5).texto, 'alto risco');
assert.equal(statusDoExame(ex('lh'), 5).classe, 'na');
assert.equal(statusDoExame(ex('hb'), null).classe, 'na');
assert.equal(statusDoExame(ex('hdl'), 45).classe, 'ok2');

// cálculos
const g = leitorDe({ hb: '12,0', ht: '40', insulina: 'x', ins: '10', glic: '90', ct: '200', hdl: '50', ldl: '120', t3l: '3,0', t3r: '15', t4l: '1,0', neut: '60', linf: '30' });
const c = Object.fromEntries(calculos(g).map(x => [x.n, x]));
assert.equal(c['Hemoconcentração ou hemodiluição'].s.classe, 'lo');
assert.equal(c['Índice de Castelli I'].v, '4');
assert.equal(c['Índice de Castelli II'].s.classe, 'ok');
assert.equal(c['Razão T3 livre / T3 reverso'].v, '20');
assert.equal(c['Razão T3 livre / T4 livre'].s.classe, 'ok');
assert.equal(c['Razão neutrófilos / linfócitos'].v, '2');
assert.equal(c['Razão neutrófilos / linfócitos'].s.classe, 'ok2');
assert.equal(c['HOMA1-IR'].v, '2,22');
assert.equal(c['Colesterol não-HDL'].v, '150 mg/dL');
assert.equal(calculos(leitorDe({})).length, 0);

// padrões
const pt = padroes(leitorDe({ vcm: '78', rdw: '15', ferr: '150', glic: '95', tsh: '3' })).map(x => x.t);
assert.ok(pt.includes('Sinais de deficiência de ferro'));
assert.ok(pt.includes('Ferritina acima do ideal'));
assert.ok(pt.includes('Glicose acima de 92'));
assert.ok(pt.includes('TSH acima de 2,5'));
assert.deepEqual(padroes(leitorDe({})), []);
assert.equal(padroes(leitorDe({ hcy: '15', b12: '300' }))[0].t, 'Homocisteína alta + B12 baixa');

// busca
assert.ok(buscarExames(EX, 'Hemoglobina').some(e => e.id === 'hb'));
assert.ok(buscarExames(EX, 'cansaço').some(e => e.id === 'tsh'));
assert.ok(buscarExames(EX, 'hemacias').some(e => e.id === 'hem'));
assert.equal(buscarExames(EX, '').length, EX.length);
console.log('leitorExames ok');
import { faixaDaFase } from './leitorExames.js';
assert.equal(faixaDaFase(ex('prog'), 'lut'), 'lútea 5,16 a 18,56');
assert.equal(faixaDaFase(ex('prog'), 'g2'), '2º tri 19,41 a 45,30');
assert.equal(faixaDaFase(ex('e2'), 'fol'), 'folicular 1,2 a 23,3');
assert.equal(faixaDaFase(ex('e2'), 'meno'), 'menopausa até 5,5');
assert.equal(faixaDaFase(ex('hb'), 'fol'), null);
console.log('fase ok');
