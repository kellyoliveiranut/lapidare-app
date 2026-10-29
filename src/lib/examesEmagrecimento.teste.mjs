import assert from 'node:assert/strict';
import { numeroDe, homaIr, achatarExame, chavesAtivas, normalizarRefs, aplicarReferencias, compararExames } from './examesEmagrecimento.js';
import { nivelExame, textoRef } from '../data/exames_referencia.js';
import { CAMPOS_EMAG } from '../data/exames_emagrecimento.js';

assert.equal(numeroDe('95,2'), 95.2); assert.equal(numeroDe('1.234,5'), 1234.5);
assert.equal(numeroDe(''), null); assert.equal(numeroDe('abc'), null); assert.equal(numeroDe(7), 7);
assert.equal(homaIr(90, 10), 2.22); assert.equal(homaIr('90', '10,0'), 2.22);
assert.equal(homaIr(null, 10), null); assert.equal(homaIr(0, 10), null);

assert.deepEqual(achatarExame({ id: 1, data_exame: '2026-01-01', valores: { ldl: 100 }, obs: null }),
  { id: 1, data_exame: '2026-01-01', obs: '', ldl: 100 });

const campos = CAMPOS_EMAG.slice(0, 3);
assert.deepEqual(chavesAtivas(null, campos), campos.map(c => c.key));
assert.deepEqual(chavesAtivas(['homa_ir', 'xxx', 'glicemia_jejum'], campos), ['glicemia_jejum', 'homa_ir']);
assert.deepEqual(chavesAtivas([], campos), []);

assert.deepEqual(normalizarRefs({ ldl: { min: '', max: '130,5', alto: 'x' }, tsh: {} , lixo: null }), { ldl: { max: 130.5 } });

// sem referência → sem cor e sem faixa (nunca inventa limite)
const sem = aplicarReferencias(CAMPOS_EMAG, {});
const ldl0 = sem.find(c => c.key === 'ldl');
assert.equal(nivelExame(ldl0, 500), 'normal'); // sem alerta: nada acende
assert.equal(textoRef(ldl0, null), null);
// com referência da nutri
const com = aplicarReferencias(CAMPOS_EMAG, { ldl: { max: 100, alto: 130, criticoAlto: 190 } });
const ldl1 = com.find(c => c.key === 'ldl');
assert.equal(textoRef(ldl1, null), '< 100');
assert.equal(nivelExame(ldl1, 140), 'atencao');
assert.equal(nivelExame(ldl1, 200), 'critico');
assert.equal(nivelExame(ldl1, 90), 'normal');

const cmp = compararExames({ ldl: 100, hdl: 50 }, { ldl: 90, tsh: 2 }, CAMPOS_EMAG);
assert.equal(cmp.length, 1); assert.equal(cmp[0].dif, -10); assert.equal(cmp[0].pct, -10);
import { CATEGORIAS_EXAME } from '../data/exames_solicitacao.js';
import { PEDIDO_EMAGRECIMENTO } from '../data/exames_emagrecimento.js';
const todosItens = new Set(CATEGORIAS_EXAME.flatMap(c => c.itens));
for (const i of PEDIDO_EMAGRECIMENTO) assert.ok(todosItens.has(i), 'item fora do catálogo de solicitação: ' + i);
console.log('ok examesEmagrecimento');
