/**
 * Teste standalone da próxima aplicação (bloco-112, decisão da Kelly de 13/10/2026).
 * Roda com `node src/lib/protocoloProximoCiclo.teste.mjs`, sem framework, na raiz do repo.
 * Sem rede e sem banco. Datas e números fictícios.
 *
 * Regra: a linha do tempo só mostra como "próximo" uma data CADASTRADA E
 * CONFIRMADA. Sem confirmação: "Próxima aplicação: aguardando confirmação",
 * sem data — nem a calculada, nem a cadastrada. Aplicação realizada: data real.
 *
 * O fuso é fixado ANTES do import, como nos outros testes. protocoloCiclo.js
 * importa o JSON sem atributo; o hook só acrescenta `type: 'json'`.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const P = await import('./protocoloCiclo.js');
const { proximaAplicacao, pontaFinalProxima, linhaDoTempoPaciente, marcosEfeitoAplicacao, getProtocolo } = P;

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const ler = rel => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r/g, '');
const lerRaiz = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r/g, '');
const AGUARDANDO = { d: null, label: 'Próxima aplicação', desc: 'aguardando confirmação', fase: 'quimio', semData: true };

// ── Caso do incidente (fictício): C1–C3 realizados, C4–C6 cadastrados no futuro ──
const HOJE = '2026-10-13';
const linha = (n, d, conf = false) => ({ numero_ciclo: n, aplicacao_no_ciclo: 1, data_quimio: d, agendamento_confirmado_em: conf ? '2026-10-13T13:00:00Z' : null });
const base = (c4 = false, c5 = false) => [
  linha(1, '2026-08-31'), linha(2, '2026-09-21'), linha(3, '2026-10-13'),
  linha(4, '2026-11-02', c4), linha(5, '2026-11-23', c5), linha(6, '2026-12-14'),
];

t('C4 não confirmado → aguardando, sem data', proximaAplicacao({ ciclos: base(), hoje: HOJE, totalCiclos: 6 }), { tipo: 'aguardando' });
const conf4 = proximaAplicacao({ ciclos: base(true), hoje: HOJE, totalCiclos: 6 });
t('C4 confirmado → confirmada em 02/11 (a data cadastrada)', conf4, { tipo: 'confirmada', d: '2026-11-02', numero_ciclo: 4, aplicacao: 1 });
t('C4 confirmado → nunca 03/11 (13/10 + 21)', conf4.d !== '2026-11-03', true);
t('C5 confirmado e C4 não → aguardando (não pula a linha em aberto)', proximaAplicacao({ ciclos: base(false, true), hoje: HOJE, totalCiclos: 6 }), { tipo: 'aguardando' });
t('ordem da lista não importa', proximaAplicacao({ ciclos: base(true).slice().reverse(), hoje: HOJE, totalCiclos: 6 }), conf4);
t('aplicação de HOJE é realizada, não futura (C3 em 13/10)',
  proximaAplicacao({ ciclos: [linha(3, HOJE, true), linha(4, '2026-11-02')], hoje: HOJE, totalCiclos: 6 }), { tipo: 'aguardando' });

// ── Sem linha futura ──
t('sem futura, último realizado = total → encerrado',
  proximaAplicacao({ ciclos: base().slice(0, 3).concat(linha(6, '2026-10-01')), hoje: HOJE, totalCiclos: 6 }), { tipo: 'encerrado' });
t('sem futura, último realizado acima do total → encerrado',
  proximaAplicacao({ ciclos: [linha(7, '2026-10-01')], hoje: HOJE, totalCiclos: 6 }), { tipo: 'encerrado' });
t('sem futura, ciclo < total → aguardando', proximaAplicacao({ ciclos: base().slice(0, 3), hoje: HOJE, totalCiclos: 6 }), { tipo: 'aguardando' });
t('sem futura, total nulo → aguardando', proximaAplicacao({ ciclos: base().slice(0, 3), hoje: HOJE, totalCiclos: null }), { tipo: 'aguardando' });
t('sem futura, total em texto ("3") não conta como número → aguardando',
  proximaAplicacao({ ciclos: base().slice(0, 3), hoje: HOJE, totalCiclos: '3' }), { tipo: 'aguardando' });
t('entrada vazia/lixo não quebra → aguardando',
  [proximaAplicacao(), proximaAplicacao({ ciclos: null, hoje: HOJE }), proximaAplicacao({ ciclos: [null, {}, { data_quimio: 5 }], hoje: HOJE, totalCiclos: 6 })],
  [{ tipo: 'aguardando' }, { tipo: 'aguardando' }, { tipo: 'aguardando' }]);

// ── Estruturado (D1/D8/D15): a próxima é a D8 do mesmo ciclo ──
const H2 = '2026-10-09';
const app = (n, a, d, conf = false) => ({ numero_ciclo: n, aplicacao_no_ciclo: a, data_quimio: d, agendamento_confirmado_em: conf ? '2026-10-09T13:00:00Z' : null });
const estr = (d8conf) => [app(2, 1, '2026-10-06'), app(2, 2, '2026-10-13', d8conf), app(2, 3, '2026-10-20', true), app(3, 1, '2026-10-27', true)];
t('estruturado: D8 confirmada → usa a linha da D8', proximaAplicacao({ ciclos: estr(true), hoje: H2, totalCiclos: 4 }),
  { tipo: 'confirmada', d: '2026-10-13', numero_ciclo: 2, aplicacao: 2 });
t('estruturado: D8 não confirmada → aguardando (D15 confirmada não é a próxima)', proximaAplicacao({ ciclos: estr(false), hoje: H2, totalCiclos: 4 }), { tipo: 'aguardando' });

// ── Ponta final ──
t('ponta: confirmada, não estruturado → "Próximo" / "Próximo ciclo" na data cadastrada',
  pontaFinalProxima(conf4, false), [{ d: '2026-11-02', label: 'Próximo', desc: 'Próximo ciclo', fase: 'quimio' }]);
t('ponta: confirmada, estruturado → "Próxima" / "Próxima aplicação"',
  pontaFinalProxima({ tipo: 'confirmada', d: '2026-10-13', numero_ciclo: 2, aplicacao: 2 }, true), [{ d: '2026-10-13', label: 'Próxima', desc: 'Próxima aplicação', fase: 'quimio' }]);
t('ponta: encerrado → sem ponta', pontaFinalProxima({ tipo: 'encerrado' }, false), []);
t('ponta: aguardando, ausente ou desconhecido → sem data',
  [pontaFinalProxima({ tipo: 'aguardando' }, false), pontaFinalProxima(undefined, true), pontaFinalProxima({ tipo: 'xyz' }, false)],
  [[AGUARDANDO], [AGUARDANDO], [AGUARDANDO]]);

// ── linhaDoTempoPaciente ──
const D1 = '2026-10-01';
const ciclo = { numero_ciclo: 3, data_quimio: D1 };
const APLICACAO = { d: D1, label: 'D1', desc: 'Quimio', fase: 'quimio' };
const CONF = { tipo: 'confirmada', d: '2026-10-23', numero_ciclo: 4, aplicacao: 1 };
t('pendente → só a bolinha (sem semData, sem "Próximo"), mesmo com data confirmada',
  linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-mini-CHOP', hoje: '2026-10-09', pendente: true, proxima: CONF }),
  { emJanela: false, rotuloJanela: '', marcos: [APLICACAO] });
t('pendente R-CHOP (com e sem data confirmada) → um marco só, sem semData, sem banner',
  [undefined, CONF].map(px => (r => [r.marcos.length, r.marcos.some(m => m.semData), r.emJanela])(
    linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-CHOP', hoje: '2026-10-09', pendente: true, proxima: px }))),
  [[1, false, false], [1, false, false]]);
t('R-mini-CHOP confirmado + data agendada → sem banner/marcos, ponta na data cadastrada',
  linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-mini-CHOP', hoje: '2026-10-09', proxima: CONF }),
  { emJanela: false, rotuloJanela: '', marcos: [APLICACAO, { d: '2026-10-23', label: 'Próximo', desc: 'Próximo ciclo', fase: 'quimio' }] });
t('R-mini-CHOP sem `proxima` → ponta aguardando sem data',
  linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-mini-CHOP', hoje: '2026-10-09' }),
  { emJanela: false, rotuloJanela: '', marcos: [APLICACAO, AGUARDANDO] });
t('R-mini-CHOP encerrado → só a aplicação, sem ponta',
  linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-mini-CHOP', hoje: '2026-10-09', proxima: { tipo: 'encerrado' } }).marcos, [APLICACAO]);

// Realizada: a data da aplicação e os marcos do ciclo não dependem da ponta.
const rchop = getProtocolo('R-CHOP');
const semPonta = r => ({ ...r, marcos: r.marcos.slice(0, -1) });
const rAus = linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-CHOP', hoje: '2026-10-09' });
const rConf = linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-CHOP', hoje: '2026-10-09', proxima: CONF });
const rEnc = linhaDoTempoPaciente({ ultimoCiclo: ciclo, protocoloNome: 'R-CHOP', hoje: '2026-10-09', proxima: { tipo: 'encerrado' } });
t('realizada: marcos do ciclo iguais com ponta ausente, confirmada e encerrada', [semPonta(rAus), semPonta(rConf)], [rEnc, rEnc]);
t('realizada: marcos do ciclo = data real + deslocamentos do catálogo',
  rEnc.marcos.map(m => m.d), marcosEfeitoAplicacao(rchop, D1).map(m => m.data));
t('realizada: banner R-CHOP em D9 segue ligado', [rAus.emJanela, rConf.emJanela, rEnc.emJanela], [true, true, true]);

// Nunca soma: em todas as fichas do catálogo, sem confirmação a ponta é sem data.
const catalogo = JSON.parse(ler('data/protocolos_efeitos.json'));
const nomes = catalogo.protocolos.map(p => p.nome);
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
t(`todas as ${nomes.length} fichas, confirmado sem data agendada: ponta = aguardando (d nulo)`,
  nomes.filter(n => JSON.stringify(linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: n, hoje: '2026-10-09' }).marcos.at(-1)) !== JSON.stringify(AGUARDANDO)), []);
t('todas as fichas: nenhuma ponta final em data_quimio + 21',
  nomes.filter(n => linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: n, hoje: '2026-10-09' }).marcos.at(-1).d === addDias(D1, 21)), []);

// ── Fonte ──
const lib = ler('lib/protocoloCiclo.js');
const nutri = ler('app/nutri/_TratamentoOncologico.jsx');
const pac = ler('app/paciente/MonitoramentoOncologico.jsx');
t('protocoloCiclo.js: sem a soma da ponta final (iv / cadenciaDias a partir de uc.data_quimio)',
  [/addDaysISO\(uc\.data_quimio, iv\)/.test(lib), /addDaysISO\(uc\.data_quimio, proto\.estruturaCiclo\.cadenciaDias\)/.test(lib), /const iv = intervalo/.test(lib)], [false, false, false]);
t('nutri: sem a soma da ponta final (+ duracaoCiclo / + cadenciaDias)',
  [/addDays\(uc\.data_quimio, duracaoCiclo\)/.test(nutri), /addDays\(ucApp\.data_quimio, proto\.estruturaCiclo\.cadenciaDias\)/.test(nutri), /const duracaoCiclo =/.test(nutri)], [false, false, false]);
t('textos literais nas telas',
  [pac.includes('Próxima aplicação: aguardando confirmação'), nutri.includes('Próxima aplicação: aguardando confirmação'),
   nutri.includes('Confirmar data'), nutri.includes('Desfazer confirmação'), nutri.includes('>Prevista<'),
   nutri.includes('Confirmar data da aplicação'),
   nutri.includes('Confirme só depois de conferir esta data com a equipe ou o hospital. A data confirmada passa a aparecer para a paciente como próxima aplicação.')],
  [true, true, true, true, true, true, true]);
t('paciente: lê a próxima linha (> hoje, asc, 1) com a confirmação e total_ciclos',
  [/\.gt\('data_quimio', hoje\)\s*\.order\('data_quimio', \{ ascending: true \}\)\s*\.limit\(1\)/.test(pac),
   pac.includes("'numero_ciclo,aplicacao_no_ciclo,data_quimio,agendamento_confirmado_em'"), /select\('total_ciclos,protocolo,registro_pendente'\)/.test(pac),
   pac.includes('proximaAplicacao(')], [true, true, true, true]);
t('paciente: nada de dataBR(m.d) para marco sem data', /\{!m\.semData && \(\s*<div[^>]*>\{dataBR\(m\.d\)\}<\/div>/.test(pac), true);

// Gravações do código novo: só por/fonte em ciclos_quimio; nunca _em nem data_quimio.
const updatesCiclo = [...nutri.matchAll(/from\('ciclos_quimio'\)\s*\.update\(([^)]*)\)/g)].map(m => m[1].trim());
t('nutri: os updates em ciclos_quimio gravam só por/fonte',
  updatesCiclo, [
    '{ agendamento_confirmado_por: v.valores.por, agendamento_confirmado_fonte: v.valores.fonte }',
    '{ agendamento_confirmado_por: null, agendamento_confirmado_fonte: null }',
  ]);
t('nutri: nenhum update de ciclos_quimio com data_quimio ou agendamento_confirmado_em',
  updatesCiclo.some(u => /data_quimio|agendamento_confirmado_em/.test(u)), false);
t('nutri: continua um único update em tratamentos_oncologicos',
  nutri.split(/from\('tratamentos_oncologicos'\)\s*\.update\(/).length - 1, 1);

// Por conteúdo, não por git diff (independe do working tree). A confirmação
// não usa diálogo do navegador: na nutri só os dois window.confirm antigos.
const dialogos = s => s.match(/window\.(confirm|alert|prompt)\([^)]*\)/g) ?? [];
t('sem window.confirm/alert/prompt além dos dois antigos da nutri',
  [dialogos(lerRaiz('src/lib/protocoloCiclo.js')), dialogos(lerRaiz('src/app/paciente/MonitoramentoOncologico.jsx')), dialogos(nutri)],
  [[], [], ["window.confirm('Remover este ciclo?')", "window.confirm('Remover este exame?')"]]);
// O Início e as funções de push/lembrete nunca falam de próxima aplicação.
const PROXIMA = /proximaAplicacao|pontaFinalProxima|agendamento_confirmado|Próxima aplicação|aguardando confirmação/;
t('Inicio.jsx, lembretes-consulta, aniversarios e send-push sem próxima aplicação',
  ['src/app/paciente/Inicio.jsx', 'netlify/functions/lembretes-consulta.js', 'netlify/functions/aniversarios.js', 'netlify/functions/send-push.js'].map(f => PROXIMA.test(lerRaiz(f))),
  [false, false, false, false]);

// ── Migração e DESFAZER ──
const sql = lerRaiz('supabase/migrations/2026-10-13_ciclos_agendamento_confirmado.sql');
const desf = lerRaiz('supabase/desfazer/2026-10-13_ciclos_agendamento_confirmado_DESFAZER.sql');
t('migração: 3 colunas, check, função e gatilho before insert or update',
  [/add column if not exists agendamento_confirmado_em timestamptz/.test(sql), /add column if not exists agendamento_confirmado_por text/.test(sql),
   /add column if not exists agendamento_confirmado_fonte text/.test(sql), /add constraint ciclos_quimio_agendamento_conferencia_chk check/.test(sql),
   /between 5 and 120/.test(sql) && /between 5 and 300/.test(sql), /create or replace function public\.ciclos_agendamento_auditoria\(\)/.test(sql),
   /set search_path to 'public'/.test(sql), /create trigger trg_ciclos_agendamento_auditoria\s+before insert or update on public\.ciclos_quimio/.test(sql)],
  [true, true, true, true, true, true, true, true]);
t('migração: casos do gatilho (insert, data mudou, desfazer, mantém confirmada, confirma com now())',
  [/tg_op = 'INSERT'/.test(sql), /new\.data_quimio is distinct from old\.data_quimio/.test(sql),
   /nullif\(btrim\(new\.agendamento_confirmado_por\), ''\) is null\s+and nullif\(btrim\(new\.agendamento_confirmado_fonte\), ''\) is null/.test(sql),
   /old\.agendamento_confirmado_em is not null/.test(sql) && /new\.agendamento_confirmado_em := old\.agendamento_confirmado_em/.test(sql),
   /new\.agendamento_confirmado_em := now\(\)/.test(sql)], [true, true, true, true, true]);
t('migração: aviso no topo e comentários de coluna',
  [sql.startsWith('-- Executar APÓS revisão. O front novo lê estas colunas: aplicar a migração ANTES de publicar o front.'),
   (sql.match(/Data confirmada com equipe\/hospital; preenchida pelo gatilho; nula = prevista \(não confirmada\)/g) ?? []).length,
   sql.includes("'Nome e registro profissional de quem conferiu a data com a equipe/hospital; digitado na confirmação.'"),
   sql.includes("'Fonte da conferência da data (contato com a equipe, agendamento do hospital); digitada na confirmação.'")], [true, 1, true, true]);
const semComentario = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
t('migração e DESFAZER: nenhum update/delete/insert de dados',
  [/\b(update\s+public\.|delete\s+from|insert\s+into)/i.test(semComentario(sql)), /\b(update\s+public\.|delete\s+from|insert\s+into)/i.test(semComentario(desf))], [false, false]);
t('migração: sem "not valid"', /not valid/i.test(sql), false);
t('DESFAZER: remove gatilho, função, check e as 3 colunas, com aviso',
  [/drop trigger if exists trg_ciclos_agendamento_auditoria on public\.ciclos_quimio/.test(desf), /drop function if exists public\.ciclos_agendamento_auditoria\(\)/.test(desf),
   /drop constraint if exists ciclos_quimio_agendamento_conferencia_chk/.test(desf),
   ['agendamento_confirmado_em', 'agendamento_confirmado_por', 'agendamento_confirmado_fonte'].every(c => desf.includes(`drop column if exists ${c}`)),
   /apaga as confirmações/.test(desf)], [true, true, true, true, true]);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
