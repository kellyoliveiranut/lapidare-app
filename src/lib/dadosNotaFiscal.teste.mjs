import assert from 'node:assert/strict';
import { formatarCep, cpfValido, faltandoParaNota, montarPayloadNota, formatarCpf, enderecoEmUmaLinha, textoNota, vendasSemNota } from './dadosNotaFiscal.js';

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

assert.equal(formatarCpf('52998224725'), '529.982.247-25');
assert.equal(formatarCpf('123'), '123');
assert.equal(
  enderecoEmUmaLinha({ ...completa, end_complemento: 'Apto 2' }),
  'Rua A, 10 - Apto 2 - Centro - Belém/PA - CEP 66010-000',
);
assert.equal(enderecoEmUmaLinha({ endereco: ' Rua antiga, 5 ' }), 'Rua antiga, 5');
assert.equal(enderecoEmUmaLinha({}), '');

const t = textoNota({
  paciente: { ...completa, nome: 'Maria Souza', email: 'm@x.com', telefone: '91999998888' },
  venda: { servico: 'Essentia', valor_total: 2700, data_venda: '2026-10-29' },
});
assert.match(t, /^Tomador: Maria Souza\nCPF: 529\.982\.247-25\nEndereço: Rua A, 10 - Centro - Belém\/PA - CEP 66010-000/);
assert.match(t, /Serviço: Essentia/);
assert.match(t, /Valor: R\$\s?2\.700,00/);
assert.match(t, /Data da venda: 29\/10\/2026/);
assert.match(textoNota({ paciente: {} }), /CPF: —/);

const vendas = [
  { id: 1, paciente_id: 'p', nf_emitida: false },
  { id: 2, paciente_id: 'p', nf_emitida: true },
  { id: 3, paciente_id: null, nf_emitida: false },
  { id: 4, paciente_id: 'p', nf_emitida: false },
];
const ps = { 1: [{ status: 'pago' }], 2: [{ status: 'pago' }], 3: [{ status: 'pago' }], 4: [{ status: 'pendente' }] };
assert.deepEqual(vendasSemNota(vendas, ps).map(v => v.id), [1]);
assert.deepEqual(vendasSemNota(undefined, undefined), []);
console.log('dadosNotaFiscal: ok');
