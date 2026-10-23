/**
 * Teste standalone de textoIniciou (utils.js): "Iniciou há N dias".
 * Roda com `node src/lib/textoIniciou.teste.mjs`. O "agora" é fixado trocando
 * globalThis.Date, como em diaLocal.teste.mjs.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const RealDate = Date;
// 23/10/2026 14:12 em Belém (UTC-3) = 17:12 UTC
const AGORA = RealDate.UTC(2026, 9, 23, 17, 12);
globalThis.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(AGORA); }
  static now() { return AGORA; }
};
const { textoIniciou } = await import('./utils.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = obtido === esperado;
  passou ? ok++ : (falhou++, console.log('FALHOU:', nome, '| obtido:', obtido, '| esperado:', esperado));
}
t('hoje (mesmo instante)', textoIniciou('2026-10-23T17:12:00Z'), 'Iniciou hoje');
t('hoje cedo em Belém', textoIniciou('2026-10-23T03:30:00Z'), 'Iniciou hoje');
t('ontem à noite em Belém (00:30 UTC de hoje = 21:30 de ontem)', textoIniciou('2026-10-23T00:30:00Z'), 'Iniciou há 1 dia');
t('1 dia', textoIniciou('2026-10-22T15:00:00Z'), 'Iniciou há 1 dia');
t('2 dias', textoIniciou('2026-10-21T15:00:00Z'), 'Iniciou há 2 dias');
t('90 dias', textoIniciou('2026-07-25T15:00:00Z'), 'Iniciou há 90 dias');
t('futuro vira hoje', textoIniciou('2026-10-25T15:00:00Z'), 'Iniciou hoje');
t('null', textoIniciou(null), null);
t('inválida', textoIniciou('lixo'), null);
console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
