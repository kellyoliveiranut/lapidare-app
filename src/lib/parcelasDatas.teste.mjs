import assert from 'node:assert/strict';
import { gerarParcelas } from './utils.js';

const venc = (data, forma, n) =>
  gerarParcelas({ forma_pgto: forma, valor_total: 3000, data_venda: data, n_parcelas: n }).map(p => p.vencimento);

// Fim de mês: a parcela cai no último dia do mês, sem pular nenhum mês.
assert.deepEqual(venc('2026-01-31', 'parcelado', 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
assert.deepEqual(venc('2026-10-31', 'parcelado', 3), ['2026-10-31', '2026-11-30', '2026-12-31']);
assert.deepEqual(venc('2028-01-31', 'pix', 3), ['2028-01-31', '2028-02-29', '2028-03-31']); // ano bissexto
assert.deepEqual(venc('2026-08-30', 'pix', 3), ['2026-08-30', '2026-09-30', '2026-10-30']);
// Dia comum: continua igual ao que sempre foi.
assert.deepEqual(venc('2026-03-15', 'parcelado', 3), ['2026-03-15', '2026-04-15', '2026-05-15']);
// Virada de ano.
assert.deepEqual(venc('2026-11-10', 'parcelado', 3), ['2026-11-10', '2026-12-10', '2027-01-10']);
// A soma das parcelas continua batendo com o total.
const soma = gerarParcelas({ forma_pgto: 'parcelado', valor_total: 1000, data_venda: '2026-01-31', n_parcelas: 3 })
  .reduce((a, p) => a + p.valor, 0);
assert.equal(Number(soma.toFixed(2)), 1000);
console.log('parcelasDatas: ok');
