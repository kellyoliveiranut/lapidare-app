import assert from 'node:assert/strict';
import { separarEndereco } from './separarEndereco.js';

// o caso real da tela: tem CEP, bairro com a palavra "bairro", sem cidade/UF
assert.deepEqual(
  separarEndereco('Travessa Curuzu, 430, apartamento 1403, Edifício Maiatá III, bairro da Pedreira, CEP 66085110'),
  { end_cep: '66085110', end_logradouro: 'Travessa Curuzu', end_numero: '430',
    end_complemento: 'apartamento 1403, Edifício Maiatá III', end_bairro: 'Pedreira', end_cidade: '', end_uf: '' });

// ordem do prompt da extração: Rua, número, complemento, bairro, cidade, UF, CEP
assert.deepEqual(
  separarEndereco('Rua das Flores, 220, ap 302, Umarizal, Belém, PA, 66050-000'),
  { end_cep: '66050000', end_logradouro: 'Rua das Flores', end_numero: '220',
    end_complemento: 'ap 302', end_bairro: 'Umarizal', end_cidade: 'Belém', end_uf: 'PA' });

// número colado na rua; "nº"
assert.equal(separarEndereco('Rua das Flores 220, Umarizal, Belém').end_numero, '220');
assert.equal(separarEndereco('Rua das Flores 220, Umarizal, Belém').end_logradouro, 'Rua das Flores');
assert.equal(separarEndereco('Av. Nazaré, nº 500, Nazaré').end_numero, '500');
assert.equal(separarEndereco('Av. Nazaré, s/n, Nazaré').end_numero, 's/n');

// na dúvida, vazio: com CEP e uma só sobra, não chuta bairro
const d = separarEndereco('Rua A, 10, Centro, CEP 66000-000');
assert.equal(d.end_bairro, '');
assert.equal(d.end_cep, '66000000');
// vazio
assert.deepEqual(Object.values(separarEndereco('')).filter(Boolean), []);
assert.deepEqual(Object.values(separarEndereco(null)).filter(Boolean), []);
console.log('ok separarEndereco');
