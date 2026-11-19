import assert from 'node:assert/strict';
import { gerarParcelasComEntrada, dividirEmParcelas, validarEntrada, restanteACombinar, taxasPorLinha } from './parcelasEntrada.js';

// Cleide: 1900 = 500 + 4 × 350
const c = gerarParcelasComEntrada({ valorTotal: 1900, entrada: 500, dataVenda: '2026-11-18', nRestante: 4 });
assert.equal(c.length, 5);
assert.deepEqual(c.map(p => p.valor), [500, 350, 350, 350, 350]);
assert.equal(c[0].status, 'pago'); assert.equal(c[0].data_pgto, '2026-11-18');
assert.deepEqual(c.slice(1).map(p => p.vencimento), ['2026-12-18', '2027-01-18', '2027-02-18', '2027-03-18']);
assert.ok(c.slice(1).every(p => p.status === 'pendente'));
assert.deepEqual(c.map(p => p.numero), [1, 2, 3, 4, 5]);
assert.equal(restanteACombinar(1900, c), 0);

// Karina: 2700, entrada 1000, a combinar
const k = gerarParcelasComEntrada({ valorTotal: 2700, entrada: 1000, dataVenda: '2026-11-18', nRestante: 0 });
assert.equal(k.length, 1); assert.equal(k[0].valor, 1000);
assert.equal(restanteACombinar(2700, k), 1700);

// centavos: 1000 - 100 = 900 em 7 → última absorve
const d = dividirEmParcelas({ valor: 900, n: 7, primeiroVencimento: '2026-12-31' });
assert.equal(Number(d.reduce((a, p) => a + p.valor, 0).toFixed(2)), 900);
assert.deepEqual(d.slice(0, 3).map(p => p.vencimento), ['2026-12-31', '2027-01-31', '2027-02-28']);

// validações
assert.ok(validarEntrada({ valorTotal: 1000, entrada: 1000, nRestante: 0 }));
assert.ok(validarEntrada({ valorTotal: 1000, entrada: 0, nRestante: 0 }));
assert.ok(validarEntrada({ valorTotal: 1000, entrada: 200, nRestante: 13 }));
assert.equal(validarEntrada({ valorTotal: 1000, entrada: 200, nRestante: 3 }), null);
assert.deepEqual(gerarParcelasComEntrada({ valorTotal: 100, entrada: 100, dataVenda: '2026-11-18', nRestante: 0 }), []);
assert.equal(restanteACombinar(500, [{ valor: 500.004 }]), 0);
// obs da entrada
assert.equal(c[0].obs, 'Entrada no Pix');
assert.equal(gerarParcelasComEntrada({ valorTotal: 1900, entrada: 500, dataVenda: '2026-11-18', nRestante: 4, forma: 'dinheiro' })[0].obs, 'Entrada em dinheiro');

// Karina: entrada 1000 em DINHEIRO + restante 1700 no cartão parcelado em 2x, antecipado
const kc = gerarParcelasComEntrada({ valorTotal: 2700, entrada: 1000, dataVenda: '2026-11-19', nRestante: 2, forma: 'parcelado', formaEntrada: 'dinheiro', antecipado: true });
assert.deepEqual(kc.map(p => p.valor), [1000, 850, 850]);
assert.deepEqual(kc.map(p => p.numero), [1, 2, 3]);
assert.deepEqual(kc.map(p => p.cartao), [false, true, true]);
assert.equal(kc[0].obs, 'Entrada em dinheiro');
assert.ok(kc.every(p => p.status === 'pago'));
assert.deepEqual(kc.slice(1).map(p => p.vencimento), ['2026-11-19', '2026-12-19']);
assert.equal(restanteACombinar(2700, kc), 0);
// sem antecipação: parcelas do cartão ficam sem status (pendente na gravação)
const kn = gerarParcelasComEntrada({ valorTotal: 2700, entrada: 1000, dataVenda: '2026-11-19', nRestante: 2, forma: 'parcelado', formaEntrada: 'pix' });
assert.equal(kn[0].obs, 'Entrada no Pix');
assert.ok(kn.slice(1).every(p => (p.status ?? 'pendente') === 'pendente'));
// taxa só nas parcelas do cartão: 100 de taxa em 2 parcelas → 50 + 50, entrada 0
assert.deepEqual(taxasPorLinha(100, kc), [0, 50, 50]);
assert.deepEqual(taxasPorLinha(0, kc), [0, 0, 0]);
// crédito 1x no restante
const k1 = gerarParcelasComEntrada({ valorTotal: 2700, entrada: 1000, dataVenda: '2026-11-19', nRestante: 1, forma: 'credito1x' });
assert.deepEqual(k1.map(p => p.valor), [1000, 1700]);
// regras do cartão
assert.ok(validarEntrada({ valorTotal: 2700, entrada: 1000, nRestante: 1, forma: 'parcelado' }));
assert.ok(validarEntrada({ valorTotal: 2700, entrada: 1000, nRestante: 3, forma: 'credito1x' }));
assert.equal(validarEntrada({ valorTotal: 2700, entrada: 1000, nRestante: 0, forma: 'parcelado' }), null);
console.log('ok');
