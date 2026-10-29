import assert from 'node:assert/strict';
import { formatarCep, cpfValido, faltandoParaNota, montarPayloadNota } from './dadosNotaFiscal.js';

assert.equal(formatarCep('66010000'), '66010-000');
assert.equal(formatarCep('660'), '660');
assert.equal(formatarCep('66010-000999'), '66010-000');

assert.equal(cpfValido('529.982.247-25'), true);
assert.equal(cpfValido('52998224725'), true);
assert.equal(cpfValido('111.111.111-11'), false);
assert.equal(cpfValido('529.982.247-24'), false);
assert.equal(cpfValido(''), false);
assert.equal(cpfValido(null), false);

const completa = { cpf: '52998224725', end_cep: '66010000', end_logradouro: 'Rua A', end_numero: '10', end_bairro: 'Centro', end_cidade: 'Belém', end_uf: 'PA' };
assert.deepEqual(faltandoParaNota(completa), []);
assert.deepEqual(faltandoParaNota({}), ['CPF', 'CEP', 'rua', 'número', 'bairro', 'cidade', 'UF']);
assert.deepEqual(faltandoParaNota({ ...completa, end_numero: ' ', end_uf: 'P' }), ['número', 'UF']);
assert.deepEqual(faltandoParaNota(null).length, 7);

const ok = montarPayloadNota({ cpf: '529.982.247-25', end_cep: '66010-000', end_logradouro: ' Rua A ', end_numero: '10', end_complemento: '', end_bairro: 'Centro', end_cidade: 'Belém', end_uf: 'pa' });
assert.equal(ok.payload.cpf, '52998224725');
assert.equal(ok.payload.end_cep, '66010000');
assert.equal(ok.payload.end_logradouro, 'Rua A');
assert.equal(ok.payload.end_complemento, null);
assert.equal(ok.payload.end_uf, 'PA');
assert.match(montarPayloadNota({ cpf: '123' }).erro, /CPF/);
assert.match(montarPayloadNota({ end_cep: '123' }).erro, /CEP/);
assert.match(montarPayloadNota({ end_uf: 'PAR' }).erro, /UF/);
// Tudo em branco é permitido e vira null.
const vazio = montarPayloadNota({});
assert.equal(vazio.payload.cpf, null);
assert.equal(vazio.payload.end_uf, null);
console.log('dadosNotaFiscal: ok');
