/**
 * Teste standalone do "dia local" de utils.js: dataLocalISO(n) e isoLocalDeData(d).
 * Roda com `node src/lib/diaLocal.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes.
 *
 * dataLocalISO lê o relógio por dentro (new Date()). Para fixar o "agora" sem
 * mexer no código, o teste troca globalThis.Date por uma subclasse cujo
 * construtor SEM argumentos (e Date.now) devolve o instante escolhido; com
 * argumentos, ela é a Date de sempre. O "agora" é montado com COMPONENTES
 * LOCAIS (new Date(2026, 9, 8, 22, 30)), então o esperado é o mesmo nos 5 fusos.
 *
 * Os casos de 30/03/2026 (Lisboa) e 09/03/2026 (Los Angeles) caem logo depois
 * da mudança de horário de verão: "ontem" calculado com 24h em milissegundos
 * sai dois dias atrás nesses fusos — por isso o helper usa setDate.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { dataLocalISO, isoLocalDeData } = await import('./utils.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// ─── relógio simulado ────────────────────────────────────────────────
const DateReal = globalThis.Date;
function comAgora(agora, fn) {
  const fixo = agora.getTime();
  class DateFixa extends DateReal {
    constructor(...a) { if (a.length === 0) super(fixo); else super(...a); }
    static now() { return fixo; }
  }
  globalThis.Date = DateFixa;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
const hojeEm = (agora, ...ns) => comAgora(agora, () => ns.map(n => dataLocalISO(n)));

// O relógio simulado precisa funcionar, senão todo o resto é ilusão.
t('relógio', 'o relógio simulado fixa o "agora" e depois volta ao real',
  [comAgora(new DateReal(2026, 9, 8, 22, 30), () => new Date().getHours()), globalThis.Date === DateReal], [22, true]);

// ─── dataLocalISO(n): hoje, −7, −30, +1 ──────────────────────────────
const N = [0, -7, -30, 1];
t('noite', '08/10/2026 22:30', hojeEm(new DateReal(2026, 9, 8, 22, 30), ...N), ['2026-10-08', '2026-10-01', '2026-09-08', '2026-10-09']);
t('noite', '08/10/2026 23:59', hojeEm(new DateReal(2026, 9, 8, 23, 59), ...N), ['2026-10-08', '2026-10-01', '2026-09-08', '2026-10-09']);
t('madrugada', '08/10/2026 00:05', hojeEm(new DateReal(2026, 9, 8, 0, 5), ...N), ['2026-10-08', '2026-10-01', '2026-09-08', '2026-10-09']);
t('virada de mês', '31/10/2026 22:30', hojeEm(new DateReal(2026, 9, 31, 22, 30), ...N), ['2026-10-31', '2026-10-24', '2026-10-01', '2026-11-01']);
t('virada de mês', '31/10/2026 23:59', hojeEm(new DateReal(2026, 9, 31, 23, 59), ...N), ['2026-10-31', '2026-10-24', '2026-10-01', '2026-11-01']);
t('virada de ano', '31/12/2026 22:30', hojeEm(new DateReal(2026, 11, 31, 22, 30), ...N), ['2026-12-31', '2026-12-24', '2026-12-01', '2027-01-01']);
t('virada de ano', '31/12/2026 23:59', hojeEm(new DateReal(2026, 11, 31, 23, 59), ...N), ['2026-12-31', '2026-12-24', '2026-12-01', '2027-01-01']);
t('virada de ano', '01/01/2027 00:05', hojeEm(new DateReal(2027, 0, 1, 0, 5), ...N), ['2027-01-01', '2026-12-25', '2026-12-02', '2027-01-02']);
t('bissexto', '29/02/2028 22:30', hojeEm(new DateReal(2028, 1, 29, 22, 30), ...N), ['2028-02-29', '2028-02-22', '2028-01-30', '2028-03-01']);
t('bissexto', '29/02/2028 23:59', hojeEm(new DateReal(2028, 1, 29, 23, 59), ...N), ['2028-02-29', '2028-02-22', '2028-01-30', '2028-03-01']);
t('bissexto', '01/03/2028 00:05: ontem é 29/02', hojeEm(new DateReal(2028, 2, 1, 0, 5), 0, -1), ['2028-03-01', '2028-02-29']);

// Logo depois da mudança de horário de verão (Lisboa 29/03/2026, Los Angeles
// 08/03/2026). Nos outros fusos é um dia comum, e o esperado é o mesmo.
t('horário de verão', '30/03/2026 00:30: ontem é 29/03', hojeEm(new DateReal(2026, 2, 30, 0, 30), 0, -1, -7), ['2026-03-30', '2026-03-29', '2026-03-23']);
t('horário de verão', '09/03/2026 00:30: ontem é 08/03', hojeEm(new DateReal(2026, 2, 9, 0, 30), 0, -1, -7), ['2026-03-09', '2026-03-08', '2026-03-02']);

// ─── isoLocalDeData(d): uma Date qualquer, sem ler o relógio ─────────
t('isoLocalDeData', '08/10/2026 23:59 local → 2026-10-08', isoLocalDeData(new DateReal(2026, 9, 8, 23, 59)), '2026-10-08');
t('isoLocalDeData', 'new Date(y, m, d − 7) atravessa o ano', isoLocalDeData(new DateReal(2027, 0, 1 - 7)), '2026-12-25');
t('isoLocalDeData', 'new Date(y, m + 1, 0) = último dia de fevereiro bissexto', isoLocalDeData(new DateReal(2028, 2, 0)), '2028-02-29');
t('isoLocalDeData', 'instante de timestamptz (created_at) vira o dia LOCAL dele',
  isoLocalDeData(new DateReal(new DateReal(2026, 9, 8, 22, 0).toISOString())), '2026-10-08');

// ─── saída ───────────────────────────────────────────────────────────
let grupoAtual = '';
for (const c of casos) {
  if (c.grupo !== grupoAtual) { grupoAtual = c.grupo; console.log(`\n── ${grupoAtual} ──`); }
  const marca = c.passou ? 'PASS' : 'FALHA';
  const det = c.passou ? '' : `   (esperado ${JSON.stringify(c.esperado)}, obteve ${JSON.stringify(c.obtido)})`;
  console.log(`  ${marca}  ${c.nome}${det}`);
}
console.log(`\nTZ = ${process.env.TZ} | offset real = ${new DateReal().getTimezoneOffset()}`);
console.log(`${ok} passaram, ${falhou} falharam, ${casos.length} no total`);
process.exit(falhou ? 1 : 0);
