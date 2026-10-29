import assert from 'node:assert/strict';
import { agruparPorCategoria, mover, resumo, importarSubstituicoes } from './substituicoes.js';

// sem categorias → grupo único sem título
let g = agruparPorCategoria([{ original: 'a' }, { original: 'b' }]);
assert.equal(g.length, 1); assert.equal(g[0].categoria, ''); assert.equal(g[0].itens.length, 2);
// com categorias: ordem da 1ª aparição, case-insensitive, sem categoria no fim como "Outras"
g = agruparPorCategoria([
  { original: 'a', categoria: 'Proteínas' }, { original: 'b', categoria: 'Frutas' },
  { original: 'c' }, { original: 'd', categoria: 'proteínas' },
]);
assert.deepEqual(g.map(x => x.categoria), ['Proteínas', 'Frutas', 'Outras']);
assert.equal(g[0].itens.length, 2);
assert.deepEqual(agruparPorCategoria(null), [{ categoria: '', itens: [] }]);

// mover
const l = [1, 2, 3];
assert.deepEqual(mover(l, 1, -1), [2, 1, 3]);
assert.deepEqual(mover(l, 0, -1), l);
assert.deepEqual(mover(l, 2, 1), l);
assert.deepEqual(l, [1, 2, 3]);

// resumo
assert.deepEqual(resumo([
  { original: 'Arroz', subs: 'batata' }, { original: 'Pão', subs: '  ' },
  { original: '', subs: 'x' }, { original: '', subs: '' },
]), { total: 2, semSubstitutos: 1, semAlimento: 1 });

// importar
let n = 0; const id = () => 'id' + (++n);
const atual = [{ _id: 'x', original: 'Arroz', subs: 'a' }];
const vindas = [{ original: 'arroz', subs: ['b'] }, { original: 'Pão', categoria: 'Carboidratos', subs: [{ nome: 'c' }, 'd'] }, { original: '', subs: 'z' }];
let r = importarSubstituicoes(atual, vindas, 'acrescentar', id);
assert.equal(r.length, 2); assert.equal(r[1].original, 'Pão'); assert.equal(r[1].subs, 'c, d'); assert.equal(r[1].categoria, 'Carboidratos');
r = importarSubstituicoes(atual, vindas, 'substituir', id);
assert.equal(r.length, 2); assert.equal(r[0].subs, 'b');
console.log('ok substituicoes');
