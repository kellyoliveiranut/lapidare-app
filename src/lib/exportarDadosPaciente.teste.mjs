import assert from 'node:assert/strict';
import { semSegredos, nomeArquivoDados, montarExportacao, TABELAS_PACIENTE } from './exportarDadosPaciente.js';

assert.deepEqual(semSegredos({ a: 1, push_token: 'x', n: { senha_hash: 'y', ok: [{ endpoint: 'e', v: 2 }] } }), { a: 1, n: { ok: [{ v: 2 }] } });
assert.equal(nomeArquivoDados('Maria da Conceição Souza', '2026-10-30'), 'dados-maria-da-conceicao-souza-2026-10-30.json');
assert.equal(nomeArquivoDados('', '2026-10-30'), 'dados-paciente-2026-10-30.json');
const x = montarExportacao({ paciente: { id: 1, nome: 'A', push_subscription: 'zz' }, tabelas: { consultas: [{ id: 1, token_x: 1, data: 'd' }] }, avisos: ['t: erro'], geradoEm: 'agora' });
assert.deepEqual(x.paciente, { id: 1, nome: 'A' });
assert.deepEqual(x.tabelas.consultas, [{ id: 1, data: 'd' }]);
assert.deepEqual(x.avisos, ['t: erro']);
assert.equal(new Set(TABELAS_PACIENTE).size, TABELAS_PACIENTE.length);
console.log('exportarDadosPaciente ok');
