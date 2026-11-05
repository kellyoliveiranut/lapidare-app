import assert from 'node:assert/strict';
import { CAMPOS_EXAME, CAMPOS_EXAME_EXTRA, CHAVES_EXAME_EXTRA, textoRef, foraDaRef } from './exames_referencia.js';

// chaves únicas e sem colisão com as colunas dos 8 campos
assert.equal(new Set(CHAVES_EXAME_EXTRA).size, CHAVES_EXAME_EXTRA.length);
for (const k of CHAVES_EXAME_EXTRA) assert.ok(!CAMPOS_EXAME.some(c => c.key === k), k);
// nenhum extra ganha alerta clínico
for (const c of CAMPOS_EXAME_EXTRA) assert.equal(c.alerta, undefined, c.key);
// faixas são as da tabela da Kelly; contagens absolutas ficam sem faixa
const por = k => CAMPOS_EXAME_EXTRA.find(c => c.key === k);
assert.equal(textoRef(por('vcm')), '80–100');
assert.equal(textoRef(por('hematocrito'), 'masculino'), '41–53');
assert.equal(textoRef(por('hematocrito'), 'feminino'), '36–46');
for (const k of ['eosinofilos', 'basofilos', 'monocitos', 'bastoes']) assert.equal(textoRef(por(k)), null, k);
// fora da referência (sem juízo)
assert.equal(foraDaRef(por('chcm'), 31.6), 'baixo');
assert.equal(foraDaRef(por('vcm'), 90.9), null);
assert.equal(foraDaRef(por('rdw'), 13.2), null);
assert.equal(foraDaRef(por('hematocrito'), 37, 'feminino'), null);
assert.equal(foraDaRef(por('eosinofilos'), 90), null);
assert.equal(foraDaRef(por('vcm'), null), null);
console.log('ok examesExtra');
