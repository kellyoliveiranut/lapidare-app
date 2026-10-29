// node src/lib/lerPaginas.teste.mjs
import { lerTodasPaginas } from './lerPaginas.js';
let ok = 0, ruim = 0;
const t = (n, o, e) => { const p = JSON.stringify(o) === JSON.stringify(e); p ? ok++ : ruim++; console.log(`${p ? 'PASS' : 'FALHA'}  ${n}${p ? '' : ` (esperado ${JSON.stringify(e)}, obteve ${JSON.stringify(o)})`}`); };
const tabela = (n, falhaNaPagina = -1) => {
  const linhas = Array.from({ length: n }, (_, i) => ({ id: i }));
  let chamadas = 0;
  return { chamadas: () => chamadas, fabrica: () => ({ range: async (a, b) => {
    chamadas++;
    if (Math.floor(a / 3) === falhaNaPagina) return { data: null, error: { message: 'boom' } };
    return { data: linhas.slice(a, b + 1), error: null };
  } }) };
};
let x = tabela(0); let r = await lerTodasPaginas(x.fabrica, { tamanho: 3 });
t('tabela vazia', [r.data.length, r.error, x.chamadas()], [0, null, 1]);
x = tabela(2); r = await lerTodasPaginas(x.fabrica, { tamanho: 3 });
t('menos que uma página', [r.data.length, x.chamadas()], [2, 1]);
x = tabela(3); r = await lerTodasPaginas(x.fabrica, { tamanho: 3 });
t('exatamente uma página cheia: pede a próxima, que vem vazia', [r.data.length, x.chamadas()], [3, 2]);
x = tabela(8); r = await lerTodasPaginas(x.fabrica, { tamanho: 3 });
t('8 linhas em páginas de 3: todas, em ordem, sem repetir', [r.data.map(l => l.id), x.chamadas()], [[0,1,2,3,4,5,6,7], 3]);
x = tabela(9); r = await lerTodasPaginas(x.fabrica, { tamanho: 3, maximo: 2 });
t('respeita o máximo de páginas', [r.data.length, x.chamadas()], [6, 2]);
x = tabela(9, 1); r = await lerTodasPaginas(x.fabrica, { tamanho: 3 });
t('erro na 2ª página: devolve o erro e o que já leu', [r.data.length, r.error?.message], [3, 'boom']);
console.log(`${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
