/**
 * Teste standalone do registro_pendente de tratamentos_oncologicos (bloco-78).
 * Roda com `node src/lib/protocoloRegistroPendente.teste.mjs`, sem framework, na raiz do repo.
 *
 * Pendente (true, null ou coluna ausente): a paciente não vê nada CALCULADO a
 * partir da última aplicação — sem banner de janela de risco, sem marcos, sem
 * "Próximo ciclo" e a mensagem do dia cai na genérica. Confirmado (false): tudo
 * exatamente como no commit d1392e9. A referência do "antes" não é cópia: é o
 * trecho da LinhaDoTempoCiclo e a chamada da tela Início tirados do próprio
 * d1392e9 por `git show` e executados aqui.
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

const P = await import('./protocoloCiclo.js');
const { registroPendente, faseDoDiaPaciente, linhaDoTempoPaciente, faseDoDia, getProtocolo } = P;

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const ANTES = 'd1392e9';
const fonteAntes = arq => execSync(`git show ${ANTES}:${arq}`, { maxBuffer: 1e8 }).toString('utf8').replace(/\r/g, '');

// LinhaDoTempoCiclo do d1392e9: da linha `const uc = ciclos[0];` até o
// `return (` do JSX, executada com as mesmas funções da lib.
const monAntes = fonteAntes('src/app/paciente/MonitoramentoOncologico.jsx');
const iniTrecho = monAntes.indexOf('  const uc = ciclos[0];');
const fimTrecho = monAntes.indexOf('  return (\n    <div style={wrapStyle}>\n      {emJanela && (');
const trecho = monAntes.slice(iniTrecho, fimTrecho);
const COR_FASE_PAC = { quimio: '#16a34a', alerta: '#eab308', risco: '#dc2626' };
t('trecho do d1392e9 achado e com a conta da linha do tempo',
  [iniTrecho > 0, fimTrecho > iniTrecho, /janelaRisco\(proto\)/.test(trecho), /Próximo ciclo/.test(trecho)], [true, true, true, true]);
t('COR_FASE_PAC do teste = a do d1392e9',
  monAntes.includes("const COR_FASE_PAC = { quimio: '#16a34a', alerta: '#eab308', risco: '#dc2626' };"), true);
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const linhaAntes = new Function(
  'ciclos', 'intervalo', 'protocoloNome', 'hoje',
  'getProtocolo', 'temEstruturaCiclo', 'janelaRisco', 'rotuloJanelaRisco', 'marcosEfeitoAplicacao', 'addDias', 'COR_FASE_PAC',
  trecho + '\n  return { emJanela, rotuloJanela, marcos };',
);
const antes = (ciclo, intervalo, protocolo, hoje) => linhaAntes([ciclo], intervalo, protocolo, hoje,
  P.getProtocolo, P.temEstruturaCiclo, P.janelaRisco, P.rotuloJanelaRisco, P.marcosEfeitoAplicacao, addDias, COR_FASE_PAC);
// A tela de agora pinta a cor a partir de `fase`; compara com a cor de antes.
const comoTela = r => r && { ...r, marcos: r.marcos.map(({ fase, ...m }) => ({ ...m, cor: COR_FASE_PAC[fase] ?? '#6b7280' })) };

// Chamada da tela Início no d1392e9.
const inicioAntes = fonteAntes('src/app/paciente/Inicio.jsx');
t('Início do d1392e9 chamava faseDoDia(getProtocolo(trat?.protocolo), ciclo?.data_quimio, { hoje, intervaloDias: trat?.intervalo_ciclos })',
  /proto\.faseDoDia\(\s*proto\.getProtocolo\(trat\?\.protocolo\),\s*ciclo\?\.data_quimio,\s*\{ hoje, intervaloDias: trat\?\.intervalo_ciclos \}\s*\)/.test(inicioAntes), true);
const faseAntes = (trat, data, hoje) => faseDoDia(getProtocolo(trat?.protocolo), data, { hoje, intervaloDias: trat?.intervalo_ciclos });

// ── registroPendente ──
t('registroPendente: true → pendente', registroPendente({ registro_pendente: true }), true);
t('registroPendente: false → confirmado', registroPendente({ registro_pendente: false }), false);
t('registroPendente: null → pendente', registroPendente({ registro_pendente: null }), true);
t('registroPendente: ausente (coluna inexistente) → pendente', registroPendente({ protocolo: 'R-CHOP' }), true);
t('registroPendente: undefined explícito → pendente', registroPendente({ registro_pendente: undefined }), true);
t('registroPendente: sem tratamento → false', [registroPendente(null), registroPendente(undefined)], [false, false]);
t('registroPendente: só false exato confirma ("false", 0 contam como pendente)',
  [registroPendente({ registro_pendente: 'false' }), registroPendente({ registro_pendente: 0 })], [true, true]);

// ── Casos: Taxol semanal com última aplicação há 3 dias; R-CHOP (21 dias) ──
const HOJE = '2026-10-10';
const CASOS = [
  { nome: 'Taxol Semanal', intervalo: 7, ciclo: { numero_ciclo: 5, data_quimio: '2026-10-07' } },
  { nome: 'R-CHOP', intervalo: 21, ciclo: { numero_ciclo: 3, data_quimio: '2026-10-07' } },
];
for (const c of CASOS) {
  const confirmado = { protocolo: c.nome, intervalo_ciclos: c.intervalo, registro_pendente: false };
  const ref = antes(c.ciclo, c.intervalo, c.nome, HOJE);
  t(`${c.nome}: referência do d1392e9 tem marcos calculados e "Próximo"`,
    [ref.marcos.length > 1, ref.marcos.some(m => m.label === 'Próximo')], [true, true]);

  // Confirmado: idêntico ao d1392e9, em cada dia de -2 a +25, menos a ponta
  // final — que no bloco-112 deixou de ser a soma (aplicação + intervalo) e,
  // sem data confirmada, é "aguardando confirmação" sem data (conferida abaixo).
  const dias = Array.from({ length: 28 }, (_, i) => addDias(c.ciclo.data_quimio, i - 2));
  const semPonta = r => r && { ...r, marcos: r.marcos.slice(0, -1) };
  const linhaHoje = h => linhaDoTempoPaciente({ ultimoCiclo: c.ciclo, intervalo: c.intervalo, protocoloNome: c.nome, hoje: h, pendente: registroPendente(confirmado) });
  t(`${c.nome}: confirmado → linha do tempo = d1392e9 em 28 dias seguidos (menos a ponta final)`,
    dias.filter(h => JSON.stringify(semPonta(comoTela(linhaHoje(h))))
      !== JSON.stringify(semPonta(antes(c.ciclo, c.intervalo, c.nome, h)))), []);
  t(`${c.nome}: confirmado sem data agendada → ponta final "aguardando confirmação" sem data em 28 dias`,
    dias.filter(h => JSON.stringify(linhaHoje(h).marcos.at(-1))
      !== JSON.stringify({ d: null, label: 'Próxima aplicação', desc: 'aguardando confirmação', fase: 'quimio', semData: true })), []);
  t(`${c.nome}: confirmado → mensagem do dia = d1392e9 em 28 dias seguidos`,
    dias.map(h => faseDoDiaPaciente(confirmado, c.ciclo.data_quimio, { hoje: h })),
    dias.map(h => faseAntes(confirmado, c.ciclo.data_quimio, h)));

  // Pendente: nada calculado, em todas as formas de "pendente".
  for (const [rotulo, trat] of [['true', { protocolo: c.nome, intervalo_ciclos: c.intervalo, registro_pendente: true }],
    ['null', { protocolo: c.nome, intervalo_ciclos: c.intervalo, registro_pendente: null }],
    ['coluna ausente', { protocolo: c.nome, intervalo_ciclos: c.intervalo }],
    ['erro de leitura ({})', {}]]) {
    const r = linhaDoTempoPaciente({ ultimoCiclo: c.ciclo, intervalo: c.intervalo, protocoloNome: c.nome, hoje: HOJE, pendente: registroPendente(trat) });
    t(`${c.nome} pendente (${rotulo}): sem banner, sem rótulo de janela`, [r.emJanela, r.rotuloJanela], [false, '']);
    t(`${c.nome} pendente (${rotulo}): só a bolinha da aplicação registrada, sem marcos nem "Próximo"`,
      r.marcos.map(m => [m.d, m.label]), [[c.ciclo.data_quimio, 'D1']]);
    t(`${c.nome} pendente (${rotulo}): mensagem do dia genérica (null) em 28 dias`,
      dias.map(h => faseDoDiaPaciente(trat, c.ciclo.data_quimio, { hoje: h })).filter(g => g !== null), []);
  }
}

// R-CHOP em 2026-10-15 (Dia 9, dentro da janela D8–D15): banner só com confirmação.
{
  const ciclo = { numero_ciclo: 3, data_quimio: '2026-10-07' };
  const conf = linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: 'R-CHOP', hoje: '2026-10-15', pendente: false });
  const pend = linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: 'R-CHOP', hoje: '2026-10-15', pendente: true });
  t('R-CHOP no Dia 9: banner aceso confirmado, apagado pendente', [conf.emJanela, conf.rotuloJanela, pend.emJanela], [true, 'D8–D15', false]);
  t('R-CHOP no Dia 9: mensagem "risco" confirmado, genérica pendente',
    [faseDoDiaPaciente({ protocolo: 'R-CHOP', intervalo_ciclos: 21, registro_pendente: false }, ciclo.data_quimio, { hoje: '2026-10-15' }),
      faseDoDiaPaciente({ protocolo: 'R-CHOP', intervalo_ciclos: 21, registro_pendente: true }, ciclo.data_quimio, { hoje: '2026-10-15' })],
    ['risco', null]);
}
t('sem ciclo aplicado: linha do tempo null nos dois casos (a tela mostra o aviso de primeiro ciclo)',
  [linhaDoTempoPaciente({ ultimoCiclo: null, pendente: false }), linhaDoTempoPaciente({ ultimoCiclo: null, pendente: true })], [null, null]);
t('sem tratamento: mensagem do dia como antes (null, sem protocolo)',
  [faseDoDiaPaciente(null, '2026-10-07', { hoje: HOJE }), faseAntes(null, '2026-10-07', HOJE)], [null, null]);

// ── Alertas gerais de segurança: independem do status ──
const src = new URL('../', import.meta.url);
const ler = rel => readFileSync(new URL(rel, src), 'utf8').replace(/\r/g, '');
const mon = ler('app/paciente/MonitoramentoOncologico.jsx');
const blocoFebre = mon.slice(mon.indexOf('{febre === true && ('), mon.indexOf('</StepShell>', mon.indexOf('{febre === true && (')));
t('check-in: aviso de febre continua, sem depender de pendente nem da linha do tempo',
  [blocoFebre.includes('Informe sua nutricionista o mais rápido possível.'), /pendente|emJanela|linhaDoTempo/.test(blocoFebre)], [true, false]);
t('check-in: aviso de febre idêntico ao d1392e9', monAntes.includes(blocoFebre), true);
t('sinais_alerta do catálogo iguais com e sem pendência (não passam pelo status)',
  ['Taxol Semanal', 'R-CHOP'].map(n => getProtocolo(n)?.sinais_alerta?.length > 0), [true, true]);

// ── Quem lê e quem grava registro_pendente ──
const nutri = ler('app/nutri/_TratamentoOncologico.jsx');
const salvar = nutri.slice(nutri.indexOf('async function salvarTratamento()'), nutri.indexOf('async function adicionarCiclo()'));
t('salvarTratamento (upsert do formulário) não envia registro_pendente', salvar.includes('registro_pendente'), false);
t('select grande do formulário não lê registro_pendente (fica fora de `dados`)',
  /select\('id,tipo_cancer[^']*registro_pendente/.test(nutri), false);
// bloco-94: o update passou a usar os objetos de registroConferencia.js
// (status + conferência; a data/hora é do gatilho do banco).
const updates = [...nutri.matchAll(/\.update\(([^\n]*)\)\s*\n?\s*\.eq\('id', tratamentoId\)/g)].map(m => m[1].trim());
t('o único update do tratamento grava só o status do registro e a conferência, por id',
  [nutri.split(/from\('tratamentos_oncologicos'\)\s*\.update\(/).length - 1, updates], [1, ['pendente ? gravacaoPendente() : gravacaoConfirmar(conferencia)']]);
t('nutri: sem window.confirm/alert/prompt no fluxo do registro',
  /window\.(confirm|alert|prompt)/.test(nutri.slice(nutri.indexOf('async function carregarStatusRegistro'), nutri.indexOf('async function salvarTratamento()'))), false);
t('telas da paciente leem registro_pendente e usam as funções da lib',
  [mon.includes("registro_pendente"), mon.includes('linhaDoTempoPaciente('), ler('app/paciente/Inicio.jsx').includes('faseDoDiaPaciente(')], [true, true, true]);
t('telas da paciente não gravam em tratamentos_oncologicos',
  ['app/paciente/MonitoramentoOncologico.jsx', 'app/paciente/Inicio.jsx'].map(f => /tratamentos_oncologicos'\)[^;]*\.(insert|update|upsert|delete)\(/.test(ler(f))), [false, false]);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
