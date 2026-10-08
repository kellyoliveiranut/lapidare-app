/**
 * Teste standalone de janelasDaVisao() (visaoJanelas.js).
 * Roda com `node src/lib/visaoJanelas.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes.
 * O "agora" de cada caso é montado com COMPONENTES LOCAIS (new Date(2026, 9,
 * 11, 23, 30)), então o esperado é o mesmo nos 5 fusos: o dia é o do aparelho.
 * Os instantes (isoSegunda, isoDomingo) são conferidos contra o mesmo instante
 * local montado aqui — eles mudam de fuso para fuso, e o teste acompanha.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { janelasDaVisao } = await import('./visaoJanelas.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

const J = (...c) => janelasDaVisao(new Date(...c));
const so = (j, ...k) => k.map(x => j[x]);

// ─── semana ──────────────────────────────────────────────────────────
{
  const j = J(2026, 9, 11, 23, 30);   // domingo 11/10/2026 23:30
  t('semana', 'domingo 11/10 23:30: segunda 05/10 e domingo 11/10', so(j, 'dataSegunda', 'dataDomingo'), ['2026-10-05', '2026-10-11']);
  t('semana', 'domingo 11/10 23:30: isoDomingo é 11/10 23:59:59.999 local',
    j.isoDomingo, new Date(2026, 9, 11, 23, 59, 59, 999).toISOString());
  t('semana', 'domingo 11/10 23:30: isoSegunda é 05/10 00:00 local',
    j.isoSegunda, new Date(2026, 9, 5, 0, 0, 0, 0).toISOString());
}
{
  const j = J(2026, 9, 5, 0, 10);      // segunda 05/10/2026 00:10
  t('semana', 'segunda 05/10 00:10: a semana começa nela', j.dataSegunda, '2026-10-05');
  t('semana', 'segunda 05/10 00:10: isoSegunda é 05/10 00:00:00.000 local',
    j.isoSegunda, new Date(2026, 9, 5, 0, 0, 0, 0).toISOString());
}
{
  const j = J(2027, 0, 1, 23, 30);     // sexta 01/01/2027 23:30
  t('semana', 'sexta 01/01/2027 23:30: semana atravessa o ano',
    so(j, 'dataSegunda', 'dataDomingo', 'dias7atras'), ['2026-12-28', '2027-01-03', '2026-12-25']);
}

// ─── 7 dias atrás ────────────────────────────────────────────────────
t('7 dias', 'quinta 08/10 22:00 → 01/10', J(2026, 9, 8, 22, 0).dias7atras, '2026-10-01');
t('7 dias', 'quinta 08/10 00:05 → 01/10', J(2026, 9, 8, 0, 5).dias7atras, '2026-10-01');

// ─── mês ─────────────────────────────────────────────────────────────
t('mês', 'sábado 31/10 22:00: início e fim do mês', so(J(2026, 9, 31, 22, 0), 'inicioMes', 'fimMes'), ['2026-10-01', '2026-10-31']);
t('mês', 'quinta 31/12 22:00: fim do ano e 7 dias atrás', so(J(2026, 11, 31, 22, 0), 'fimMes', 'dias7atras'), ['2026-12-31', '2026-12-24']);
t('mês', 'fevereiro bissexto 15/02/2028 12:00 → fim 29/02', J(2028, 1, 15, 12, 0).fimMes, '2028-02-29');

// ─── instantes ───────────────────────────────────────────────────────
{
  const agora = new Date(2026, 9, 8, 22, 0);
  t('instantes', 'dias30atras é agora − 30 dias, como instante',
    janelasDaVisao(agora).dias30atras, new Date(agora.getTime() - 30 * 86_400_000).toISOString());
}
t('instantes', 'devolve exatamente as 8 chaves', Object.keys(J(2026, 9, 8, 12, 0)).sort(),
  ['dataDomingo', 'dataSegunda', 'dias30atras', 'dias7atras', 'fimMes', 'inicioMes', 'isoDomingo', 'isoSegunda']);

// ─── saída ───────────────────────────────────────────────────────────
let grupoAtual = '';
for (const c of casos) {
  if (c.grupo !== grupoAtual) { grupoAtual = c.grupo; console.log(`\n── ${grupoAtual} ──`); }
  const marca = c.passou ? 'PASS' : 'FALHA';
  const det = c.passou ? '' : `   (esperado ${JSON.stringify(c.esperado)}, obteve ${JSON.stringify(c.obtido)})`;
  console.log(`  ${marca}  ${c.nome}${det}`);
}
console.log(`\nTZ = ${process.env.TZ} | offset real = ${new Date().getTimezoneOffset()}`);
console.log(`${ok} passaram, ${falhou} falharam, ${casos.length} no total`);
process.exit(falhou ? 1 : 0);
