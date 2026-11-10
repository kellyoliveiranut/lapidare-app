import assert from 'node:assert/strict';
import { partirComLinks } from './linkificar.js';

const links = (t) => partirComLinks(t).filter(p => p.tipo === 'link').map(p => p.href);
assert.deepEqual(links('veja https://zoom.us/j/123?pwd=abc. Depois'), ['https://zoom.us/j/123?pwd=abc']);
assert.deepEqual(links('(https://a.com/x) e http://b.com'), ['https://a.com/x', 'http://b.com']);
assert.deepEqual(links('sem link aqui'), []);
assert.deepEqual(links('javascript:alert(1) e data:text/html,x'), []);
assert.deepEqual(links('https://'), []);
const p = partirComLinks('a https://x.com/y, b');
assert.equal(p.map(x => x.valor).join(''), 'a https://x.com/y, b');   // nada se perde
assert.equal(partirComLinks('').length, 0);
assert.equal(partirComLinks(null).length, 0);
console.log('linkificar ok');
