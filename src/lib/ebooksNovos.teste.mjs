/**
 * Teste standalone de combinarNovos() (ebooksNovos.js).
 * Roda com `node src/lib/ebooksNovos.teste.mjs`, sem framework e sem banco.
 */
const { combinarNovos, TTL_NOVOS_MS } = await import('./ebooksNovos.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  const passou = a === b;
  passou ? ok++ : falhou++;
  console.log(`  ${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`        esperado: ${b}\n        obtido:   ${a}`);
}
// Resultado em forma comparável: ids ordenados.
const r = res => ({ ids: [...res.ids].sort(), gravar: res.gravar, t: res.t });

const AGORA = Date.UTC(2026, 9, 9, 15, 0, 0);          // 2026-10-09T15:00:00Z, fixo
const TTL = TTL_NOVOS_MS;

t('TTL = 2 min', TTL, 120000);

// 1. sem guardado, 2 atuais
t('1. sem guardado, 2 atuais', r(combinarNovos(null, ['a', 'b'], AGORA)),
  { ids: ['a', 'b'], gravar: true, t: AGORA });

// 2. guardado válido, atuais vazio (segunda montagem)
const g2 = { ids: ['a', 'b'], t: AGORA - 5000 };
t('2. guardado válido, atuais vazio', r(combinarNovos(g2, [], AGORA)),
  { ids: ['a', 'b'], gravar: false, t: AGORA - 5000 });

// 3. guardado válido (A) + atuais (B)
t('3. união A+B, t do guardado', r(combinarNovos({ ids: ['A'], t: AGORA - 1000 }, ['B'], AGORA)),
  { ids: ['A', 'B'], gravar: true, t: AGORA - 1000 });

// 4. vencido + atuais vazio
t('4. vencido + vazio', r(combinarNovos({ ids: ['A'], t: AGORA - TTL - 1 }, [], AGORA)),
  { ids: [], gravar: false, t: AGORA });

// 5. vencido + atuais (B)
t('5. vencido + B → só B, t = agora', r(combinarNovos({ ids: ['A'], t: AGORA - TTL - 1 }, ['B'], AGORA)),
  { ids: ['B'], gravar: true, t: AGORA });

// 6. t no futuro
t('6. t no futuro → ignorado', r(combinarNovos({ ids: ['A'], t: AGORA + 1 }, [], AGORA)),
  { ids: [], gravar: false, t: AGORA });

// 7. corrompidos
const corrompidos = [
  ['null', null], ['undefined', undefined], ['string', 'x'], ['número', 42], ['{}', {}],
  ["{ids:'x',t:1}", { ids: 'x', t: 1 }], ['{ids:[1,2],t:agora}', { ids: [1, 2], t: AGORA }],
  ["{ids:['a'],t:NaN}", { ids: ['a'], t: NaN }],
];
for (const [nome, g] of corrompidos) {
  let res;
  try { res = r(combinarNovos(g, [], AGORA)); } catch (e) { res = 'LANÇOU ' + e.message; }
  t(`7. corrompido ${nome} → ignorado`, res, { ids: [], gravar: false, t: AGORA });
}

// 8. array e Set dão o mesmo
t('8. array ≡ Set',
  r(combinarNovos({ ids: ['A'], t: AGORA }, ['B', 'C'], AGORA)),
  r(combinarNovos({ ids: ['A'], t: AGORA }, new Set(['B', 'C']), AGORA)));

// 9. não altera as entradas
const g9 = { ids: ['A'], t: AGORA - 10 };
const a9 = ['B'];
const s9 = new Set(['C']);
const antes = JSON.stringify([g9, a9, [...s9]]);
combinarNovos(g9, a9, AGORA);
combinarNovos(g9, s9, AGORA);
t('9. entradas intactas', JSON.stringify([g9, a9, [...s9]]), antes);

// 10. borda do TTL
t('10. idade = ttl → válido', r(combinarNovos({ ids: ['A'], t: AGORA - TTL }, [], AGORA)),
  { ids: ['A'], gravar: false, t: AGORA - TTL });
t('10. idade = ttl+1 → inválido', r(combinarNovos({ ids: ['A'], t: AGORA - TTL - 1 }, [], AGORA)),
  { ids: [], gravar: false, t: AGORA });

// 11. duas montagens com sessionStorage falso (mesmo caminho do Ebooks.jsx)
const armazem = {};
const storage = {
  getItem: k => (k in armazem ? armazem[k] : null),
  setItem: (k, v) => { armazem[k] = String(v); },
};
const CHAVE = 'ebooks-novos:pac-1';
function montar(atuais, agora) {
  let guardado = null;
  try { guardado = JSON.parse(storage.getItem(CHAVE)); } catch { guardado = null; }
  const { ids, gravar, t: tt } = combinarNovos(guardado, atuais, agora);
  if (gravar) storage.setItem(CHAVE, JSON.stringify({ ids: [...ids], t: tt }));
  return [...ids].sort();
}
t('11. montagem 1 (atuais {X}) → {X}', montar(new Set(['X']), AGORA), ['X']);
t('11. montagem 1 gravou', JSON.parse(armazem[CHAVE]), { ids: ['X'], t: AGORA });
t('11. montagem 2 (∅) → {X}', montar(new Set(), AGORA + 3000), ['X']);
t('11. montagem 2 não regravou', JSON.parse(armazem[CHAVE]), { ids: ['X'], t: AGORA });
t('11. montagem 3 após ttl+1 → ∅', montar(new Set(), AGORA + TTL + 1), []);

console.log(`\n${ok} passaram, ${falhou} falharam, ${ok + falhou} no total`);
if (falhou) process.exit(1);
