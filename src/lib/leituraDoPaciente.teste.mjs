import assert from 'node:assert/strict';
import { valoresParaLeitor, sexoDoLeitor } from './leituraDoPaciente.js';
import { EX } from '../data/maylab_exames.js';
import { leitorDe, calculos } from './leitorExames.js';

const ids = new Set(EX.map(e => e.id));

// Emagrecimento: mesma unidade passa direto; unidades diferentes convertem.
const e = valoresParaLeitor('emagrecimento', { glicemia_jejum: '94', insulina_jejum: 11, vitamina_a: 50, vitamina_e: 10, estradiol: 120, folato_eritrocitario: 300, shbg: 40, pcr: 4, hemoglobina: '12,5' });
assert.equal(e.glic, 94); assert.equal(e.ins, 11); assert.equal(e.hb, 12.5);
assert.equal(e.ret, 1.745); assert.equal(e.vite, 23.22); assert.equal(e.e2, 12); assert.equal(e.folE, 679.8);
assert.equal('shbg' in e, false); assert.equal(e.pcr, undefined, 'PCR convencional não entra');
assert.deepEqual(valoresParaLeitor('emagrecimento', { glicemia_jejum: '' }), {});
assert.deepEqual(valoresParaLeitor('emagrecimento', null), {});

// Oncologia: contagem absoluta vira %, extras entram.
const o = valoresParaLeitor('oncologia', { hemoglobina: 11, leucocitos: 5000, neutrofilos: 3000, linfocitos: 1500, plaquetas: 200000, pcr: 8, albumina: 3.4, valores_extra: { vitamina_d: 25, eosinofilos: 100 } });
assert.equal(o.hb, 11); assert.equal(o.neut, 60); assert.equal(o.linf, 30); assert.equal(o.eos, 2); assert.equal(o.vitd, 25);
assert.equal(o.pcr, undefined); assert.equal(o.albumina, undefined);
assert.equal(calculos(leitorDe(o)).find(c => c.n.includes('neutrófilos')).v, '2');
const semLeuco = valoresParaLeitor('oncologia', { neutrofilos: 3000 });
assert.equal(semLeuco.neut, undefined, 'sem leucócitos não dá para converter');

// todos os ids gerados existem no leitor
for (const id of Object.keys({ ...e, ...o })) assert.ok(ids.has(id), id);
assert.equal(sexoDoLeitor('masculino'), 'M'); assert.equal(sexoDoLeitor(null), 'F'); assert.equal(sexoDoLeitor('feminino'), 'F');
console.log('leituraDoPaciente ok');
