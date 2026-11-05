import assert from 'node:assert/strict';
import { nomeArquivoEbook, extensaoDoArquivo, nomesUnicos } from './baixarEmSequencia.js';
assert.equal(extensaoDoArquivo('a/b/guia.PDF'), 'pdf');
assert.equal(extensaoDoArquivo('a/b/guia'), 'pdf');
assert.equal(extensaoDoArquivo('x/livro.epub'), 'epub');
assert.equal(nomeArquivoEbook('Receitas Fáceis & Rápidas!', 'p/1.pdf'), 'receitas-faceis-rapidas.pdf');
assert.equal(nomeArquivoEbook('', 'p/1.pdf'), 'material.pdf');
assert.deepEqual(nomesUnicos(['a.pdf', 'b.pdf', 'a.pdf', 'a.pdf']), ['a.pdf', 'b.pdf', 'a-2.pdf', 'a-3.pdf']);
console.log('ok baixarEmSequencia');
