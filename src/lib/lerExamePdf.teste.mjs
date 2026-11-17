import assert from 'node:assert/strict';
import { montarPedidoExame, interpretarExame } from './lerExamePdf.js';
import { CAMPOS_EXAME, CAMPOS_EXAME_EXTRA } from '../data/exames_referencia.js';

// o pedido lista TODOS os campos do formulário
const pedido = montarPedidoExame();
for (const c of [...CAMPOS_EXAME, ...CAMPOS_EXAME_EXTRA]) assert.ok(pedido.includes(`"${c.key}"`), c.key);
assert.ok(pedido.includes('vitamina_b12') && pedido.includes('vitamina_d'));

const r = interpretarExame({
  data_exame: '2026-11-16', hemoglobina: 10.5, leucocitos: '9170', hematocrito: 31, vcm: '92.0',
  rdw: 17.6, hemacias: '3,37', vitamina_b12: 1504, vitamina_d: 17, plaquetas: null, pcr: 'x',
  com_sinal: { vitamina_b12: '>1504' },
  outros: [{ nome: 'Ferritina', valor: '120 ng/mL' }, { nome: '', valor: '1' }, { nome: 'TSH', valor: '' }],
});
assert.equal(r.dataExame, '2026-11-16');
assert.deepEqual(r.valores, {
  hemoglobina: '10.5', leucocitos: '9170', x_hematocrito: '31', x_hemacias: '3.37',
  x_vcm: '92', x_rdw: '17.6', x_vitamina_b12: '1504', x_vitamina_d: '17',
});
assert.deepEqual(r.comSinal, [{ rotulo: 'Vitamina B12', texto: '>1504' }]);
assert.deepEqual(r.outros, [{ nome: 'Ferritina', valor: '120 ng/mL' }]);
assert.equal(interpretarExame({ data_exame: 'ontem' }).dataExame, null);
assert.deepEqual(interpretarExame(null).valores, {});
console.log('ok');
