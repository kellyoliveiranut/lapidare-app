import assert from 'node:assert/strict';
import { avisoDoLocal, AVISO_SEM_ESTACIONAMENTO } from './avisosLocal.js';
assert.equal(avisoDoLocal('Ed Village Millenium'), AVISO_SEM_ESTACIONAMENTO);
assert.equal(avisoDoLocal('ED. VILLAGE MILLENIUM'), AVISO_SEM_ESTACIONAMENTO);
assert.equal(avisoDoLocal('CTO'), '');
assert.equal(avisoDoLocal(''), '');
assert.equal(avisoDoLocal(null), '');
console.log('avisosLocal ok');
