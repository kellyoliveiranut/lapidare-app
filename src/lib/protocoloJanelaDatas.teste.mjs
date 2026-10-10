/**
 * Teste standalone das DATAS reais da janela de risco, com a função real.
 * Roda com `node src/lib/protocoloJanelaDatas.teste.mjs`, sem framework, na raiz do repo.
 *
 * Até aqui só os rótulos eram travados (protocoloVinculo). Este teste trava o
 * calendário: com aplicação em 01/10/2026, em que dias o banner da paciente e
 * da nutri acende. O banner das duas telas é
 *   hoje >= aplicação + janela.inicio  &&  hoje <= aplicação + janela.fim
 * (MonitoramentoOncologico.jsx e _TratamentoOncologico.jsx), e a data de cada
 * marco sai de marcosEfeitoAplicacao().
 *
 * R-CHOP: Dia 8 ao Dia 15 com a aplicação como Dia 1 (decisão da Kelly em
 * 10/10/2026, provisória; não valida o nadir). FOLFIRINOX continua D7–D12.
 * Todos os outros protocolos: marcos idênticos ao commit 4d9d089.
 *
 * O fuso é fixado ANTES do import, como nos outros testes. protocoloCiclo.js
 * importa o JSON sem atributo; o hook só acrescenta `type: 'json'`.
 */
import { register } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const { getProtocolo, janelaRisco, rotuloJanelaRisco, marcosEfeitoAplicacao, faseDoDia } = await import('./protocoloCiclo.js');

const catalogo = JSON.parse(readFileSync(new URL('../data/protocolos_efeitos.json', import.meta.url), 'utf8'));
const anterior = JSON.parse(execSync('git show 4d9d089:src/data/protocolos_efeitos.json', { maxBuffer: 1e8 }).toString('utf8'));

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// Mesma conta de data das telas (meio-dia, para atravessar horário de verão).
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const APL = '2026-10-01';
const banner = (proto, hoje) => { const j = janelaRisco(proto); return !!j && hoje >= addDias(APL, j.inicio) && hoje <= addDias(APL, j.fim); };
const diasComBanner = proto => Array.from({ length: 21 }, (_, i) => addDias(APL, i)).filter(h => banner(proto, h));

const rchop = getProtocolo('R-CHOP');
const j = janelaRisco(rchop);
t('R-CHOP: rótulo da janela D8–D15', rotuloJanelaRisco(rchop), 'D8–D15');
t('R-CHOP: janela de 08/10 a 15/10', [addDias(APL, j.inicio), addDias(APL, j.fim)], ['2026-10-08', '2026-10-15']);
t('R-CHOP: banner acende exatamente de 08/10 a 15/10', diasComBanner(rchop),
  ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
t('R-CHOP: marco de risco na timeline em 08/10, rótulo D8–D15',
  marcosEfeitoAplicacao(rchop, APL).filter(m => m.fase === 'risco').map(m => [m.label, m.data]), [['D8–D15', '2026-10-08']]);
t('R-CHOP: marcos de alerta sem mudança (D1–D5 em 01/10, D2–D4 em 02/10)',
  marcosEfeitoAplicacao(rchop, APL).filter(m => m.fase === 'alerta').map(m => [m.label, m.data]), [['D1–D5', '2026-10-01'], ['D2–D4', '2026-10-02']]);
t('R-CHOP: fase do dia 07/10 = alerta, 08/10 e 15/10 = risco, 16/10 = recuperacao',
  ['2026-10-07', '2026-10-08', '2026-10-15', '2026-10-16'].map(h => faseDoDia(rchop, APL, { hoje: h })), ['alerta', 'risco', 'risco', 'recuperacao']);

const folf = getProtocolo('FOLFIRINOX');
t('FOLFIRINOX: rótulo da janela D7–D12', rotuloJanelaRisco(folf), 'D7–D12');
t('FOLFIRINOX: banner acende exatamente de 07/10 a 12/10', diasComBanner(folf),
  ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);

const mini = getProtocolo('R-MINI-CHOP');
t('R-mini-CHOP: continua D7–D14 (07/10 a 14/10)', [rotuloJanelaRisco(mini), diasComBanner(mini)[0], diasComBanner(mini).at(-1)], ['D7–D14', '2026-10-07', '2026-10-14']);

// Todos os outros protocolos: marcos idênticos ao 4d9d089.
const marcos = cat => Object.fromEntries(cat.protocolos.map(p => [p.nome, p.marcosEfeito ?? null]));
const a = marcos(catalogo), b = marcos(anterior);
t('mesmos protocolos do 4d9d089', Object.keys(a), Object.keys(b));
t('marcos de todos os outros protocolos idênticos ao 4d9d089',
  Object.keys(b).filter(n => n !== 'R-CHOP' && JSON.stringify(a[n]) !== JSON.stringify(b[n])), []);
t('R-CHOP: só o marco de risco mudou (6→7, 13→14)',
  b['R-CHOP'].map((m, i) => JSON.stringify(m) === JSON.stringify(a['R-CHOP'][i]) ? 'igual' : `${m.de}/${m.ate}→${a['R-CHOP'][i].de}/${a['R-CHOP'][i].ate}`),
  ['igual', 'igual', '6/13→7/14']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
