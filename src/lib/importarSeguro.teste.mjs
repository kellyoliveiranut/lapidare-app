import assert from 'node:assert/strict';
import { importarSeguro, ehErroDeChunk, MSG_APP_ATUALIZADO } from './importarSeguro.js';

assert.equal(ehErroDeChunk(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js')), true);
assert.equal(ehErroDeChunk(new Error('Importing a module script failed.')), true);
assert.equal(ehErroDeChunk(new Error('outra coisa')), false);
assert.equal(await importarSeguro(async () => 42), 42);
await assert.rejects(importarSeguro(async () => { throw new Error('Failed to fetch dynamically imported module: x'); }),
  { message: MSG_APP_ATUALIZADO });
await assert.rejects(importarSeguro(async () => { throw new Error('erro de verdade'); }), { message: 'erro de verdade' });
console.log('importarSeguro ok');
