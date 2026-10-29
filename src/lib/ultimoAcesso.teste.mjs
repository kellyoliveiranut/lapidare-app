// node src/lib/ultimoAcesso.teste.mjs
import { deveCarimbarAcesso, INTERVALO_MIN } from './ultimoAcesso.js';
let ok = 0, ruim = 0;
const t = (n, o, e) => { const p = o === e; p ? ok++ : ruim++; console.log(`${p ? 'PASS' : 'FALHA'}  ${n}${p ? '' : ` (esperado ${e}, obteve ${o})`}`); };
const AGORA = Date.parse('2026-10-29T15:00:00Z');
const antes = (min) => new Date(AGORA - min * 60000).toISOString();
t('sem carimbo, aba visível → carimba', deveCarimbarAcesso({ ultimoCarimbo: null, agora: AGORA, visivel: true }), true);
t('sem carimbo, aba oculta → não', deveCarimbarAcesso({ ultimoCarimbo: null, agora: AGORA, visivel: false }), false);
t('há 10 min → não', deveCarimbarAcesso({ ultimoCarimbo: antes(10), agora: AGORA, visivel: true }), false);
t('há 179 min → não', deveCarimbarAcesso({ ultimoCarimbo: antes(179), agora: AGORA, visivel: true }), false);
t('há 180 min → carimba', deveCarimbarAcesso({ ultimoCarimbo: antes(180), agora: AGORA, visivel: true }), true);
t('há 2 dias, aba oculta (token renovado em segundo plano) → não', deveCarimbarAcesso({ ultimoCarimbo: antes(2880), agora: AGORA, visivel: false }), false);
t('data inválida → carimba', deveCarimbarAcesso({ ultimoCarimbo: 'x', agora: AGORA, visivel: true }), true);
t('intervalo padrão', INTERVALO_MIN, 180);
console.log(`${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
