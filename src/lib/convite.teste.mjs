/**
 * Teste standalone de convitePendenteVencido() (convite.js).
 * Roda com `node src/lib/convite.teste.mjs`, sem framework e sem banco.
 */
const { convitePendenteVencido } = await import('./convite.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = obtido === esperado;
  passou ? ok++ : falhou++;
  console.log(`  ${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`        esperado: ${esperado}\n        obtido:   ${obtido}`);
}

const AGORA = Date.UTC(2026, 9, 9, 15, 0, 0);          // 2026-10-09T15:00:00Z, fixo
const iso = ms => new Date(ms).toISOString();

t('null → false',                    convitePendenteVencido(null, AGORA), false);
t('undefined → false',               convitePendenteVencido(undefined, AGORA), false);
t('string vazia → false',            convitePendenteVencido('', AGORA), false);
t('string inválida → false',         convitePendenteVencido('nao-e-data', AGORA), false);
t('futuro (+1 min) → false',         convitePendenteVencido(iso(AGORA + 60000), AGORA), false);
t('futuro (+7 dias) → false',        convitePendenteVencido(iso(AGORA + 7 * 86400000), AGORA), false);
t('passado (−1 min) → true',         convitePendenteVencido(iso(AGORA - 60000), AGORA), true);
t('passado (−8 dias) → true',        convitePendenteVencido(iso(AGORA - 8 * 86400000), AGORA), true);
t('exatamente agora → false',        convitePendenteVencido(iso(AGORA), AGORA), false);
t('1 ms depois → true',              convitePendenteVencido(iso(AGORA - 1), AGORA), true);
t('timestamptz com offset (Belém)',  convitePendenteVencido('2026-10-09T11:59:00-03:00', AGORA), true);
t('sem "agora" usa Date.now(): passado distante', convitePendenteVencido('2000-01-01T00:00:00Z'), true);

console.log(`\n${ok} passaram, ${falhou} falharam, ${ok + falhou} no total`);
if (falhou) process.exit(1);
