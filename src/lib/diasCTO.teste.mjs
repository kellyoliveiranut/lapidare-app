import assert from 'node:assert/strict';
import { ehDiaCTO } from './diasCTO.js';
// 2026-11-02 segunda, 06 sexta, 03 terça, 07 sábado, 01 domingo
assert.equal(ehDiaCTO(new Date(2026, 10, 2)), true);
assert.equal(ehDiaCTO(new Date(2026, 10, 6)), true);
for (const d of [1, 3, 4, 5, 7]) assert.equal(ehDiaCTO(new Date(2026, 10, d)), false);
console.log('ok diasCTO');
