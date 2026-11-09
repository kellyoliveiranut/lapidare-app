import assert from 'node:assert/strict';
import { nomeDaRua, numeroNaFaixa, filtrarCandidatos } from './cepBusca.js';

assert.equal(nomeDaRua('Rua Mundurucus'), 'Mundurucus');
assert.equal(nomeDaRua('Av. Nazaré'), 'Nazaré');
assert.equal(nomeDaRua('Travessa Quintino Bocaiúva'), 'Quintino Bocaiúva');
assert.equal(nomeDaRua('Mundurucus'), 'Mundurucus');

assert.equal(numeroNaFaixa('', 2481), true);
assert.equal(numeroNaFaixa('de 1 a 999', 2481), false);
assert.equal(numeroNaFaixa('de 1.000 a 2.500', 2481), true);
assert.equal(numeroNaFaixa('até 2000', 2481), false);
assert.equal(numeroNaFaixa('de 2.001/2.002 ao fim', 2481), true);
assert.equal(numeroNaFaixa('de 2.001/2.002 ao fim', 1999), false);
assert.equal(numeroNaFaixa('- lado par', 2481), false);
assert.equal(numeroNaFaixa('- lado ímpar', 2481), true);
assert.equal(numeroNaFaixa('de 100 a 3000 - lado par', 2481), false);
assert.equal(numeroNaFaixa('Edifício Alfa', 2481), true);
assert.equal(numeroNaFaixa('de 1 a 99', 's/n'), true);

const l = [
  { cep: '11111-000', complemento: 'até 2000', bairro: 'A' },
  { cep: '22222-000', complemento: 'de 2.001 ao fim', bairro: 'B' },
  { cep: '22222-000', complemento: 'de 2.001 ao fim', bairro: 'B' },
  { cep: '333', complemento: '', bairro: 'C' },
];
assert.deepEqual(filtrarCandidatos(l, { numero: 2481 }).map(d => d.cep), ['22222-000']);
assert.equal(filtrarCandidatos(l, {}).length, 2);
assert.deepEqual(filtrarCandidatos(l, { bairro: 'a' }).map(d => d.cep), ['11111-000']);
// faixa que descarta tudo não zera a lista: mantém as opções para a nutri escolher
assert.equal(filtrarCandidatos([l[0]], { numero: 9999 }).length, 1);
console.log('cepBusca ok');
