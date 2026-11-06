import assert from 'node:assert/strict';
import { emailsFarmacia } from './emailsFarmacia.js';
assert.deepEqual(emailsFarmacia('a@x.com', 'b@x.com'), ['a@x.com', 'b@x.com']);
assert.deepEqual(emailsFarmacia(' a@x.com ', 'A@X.com'), ['a@x.com']);
assert.deepEqual(emailsFarmacia('', null), []);
assert.deepEqual(emailsFarmacia(undefined, 'b@x.com'), ['b@x.com']);
console.log('ok emailsFarmacia');
