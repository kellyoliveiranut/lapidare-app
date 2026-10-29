// node src/lib/janelaAgenda.teste.mjs
import { desdeISO, filtroJanela, DIAS_ATRAS } from './janelaAgenda.js';
let ok = 0, ruim = 0;
const t = (n, o, e) => { const p = JSON.stringify(o) === JSON.stringify(e); p ? ok++ : ruim++; console.log(`${p ? 'PASS' : 'FALHA'}  ${n}${p ? '' : ` (esperado ${JSON.stringify(e)}, obteve ${JSON.stringify(o)})`}`); };
const HOJE = new Date('2026-10-29T15:00:00Z');
t('padrão: 120 dias atrás', desdeISO({ hoje: HOJE }), '2026-07-01T15:00:00.000Z');
t('grade recente não amplia', desdeISO({ hoje: HOJE, gradeDe: '2026-10-26' }), '2026-07-01T15:00:00.000Z');
t('grade muito antiga amplia (menos 7 dias, meia-noite de Belém)', desdeISO({ hoje: HOJE, gradeDe: '2026-03-01' }), '2026-02-22T03:00:00.000Z');
t('grade inválida cai no padrão', desdeISO({ hoje: HOJE, gradeDe: 'x' }), '2026-07-01T15:00:00.000Z');
t('filtro inclui sem data, janela e canceladas', filtroJanela('2026-07-01T15:00:00.000Z'), 'data_hora.is.null,data_hora.gte.2026-07-01T15:00:00.000Z,status.eq.cancelada');
t('filtro sem vírgula dentro do valor da data', filtroJanela('2026-07-01T15:00:00.000Z').split(',').length, 3);
t('DIAS_ATRAS', DIAS_ATRAS, 120);
console.log(`${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
