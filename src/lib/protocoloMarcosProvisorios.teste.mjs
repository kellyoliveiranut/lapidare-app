/**
 * Teste standalone dos marcos provisórios do R-mini-CHOP (bloco-96).
 * Roda com `node src/lib/protocoloMarcosProvisorios.teste.mjs`, sem framework, na raiz do repo.
 *
 * Decisão da Kelly (12/10/2026): a janela D7–D14 do R-mini-CHOP é referência
 * interna provisória. A nutri vê (marcosDoProtocolo, janelaRisco,
 * rotuloJanelaRisco); a paciente não vê banner, marcos nem mensagem do dia
 * por fase. Com o registro confirmado ela continua vendo a bolinha da
 * aplicação e o "Próximo ciclo"; pendente vence (só a bolinha).
 *
 * R-CHOP e BEP têm de sair idênticos ao commit 37f9906: o protocoloCiclo.js
 * dele é tirado por `git show`, gravado numa pasta temporária com os imports
 * apontando para o catálogo e o utils.js daqui, e executado lado a lado.
 *
 * O fuso é fixado ANTES do import, como nos outros testes. protocoloCiclo.js
 * importa o JSON sem atributo; o hook só acrescenta `type: 'json'`.
 */
import { register } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const P = await import('./protocoloCiclo.js');
const { marcosProvisorios, faseDoDiaPaciente, linhaDoTempoPaciente, getProtocolo, marcosDoProtocolo, janelaRisco, rotuloJanelaRisco } = P;
const catalogo = JSON.parse(execSync('git show HEAD:src/data/protocolos_efeitos.json', { maxBuffer: 1e8 }).toString('utf8'));
const catalogoAtual = (await import('../data/protocolos_efeitos.json')).default;

// protocoloCiclo.js do 37f9906, com os imports relativos trocados por URLs absolutas.
const ANTES = '37f9906';
const pasta = mkdtempSync(join(tmpdir(), 'marcos-provisorios-'));
let A;
try {
  const fonte = execSync(`git show ${ANTES}:src/lib/protocoloCiclo.js`, { maxBuffer: 1e8 }).toString('utf8')
    .replace("'../data/protocolos_efeitos.json'", `'${new URL('../data/protocolos_efeitos.json', import.meta.url).href}'`)
    .replace("'./utils.js'", `'${new URL('./utils.js', import.meta.url).href}'`);
  const arq = join(pasta, 'protocoloCiclo.antes.mjs');
  writeFileSync(arq, fonte);
  A = await import(pathToFileURL(arq).href);
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

t(`referência do ${ANTES} carregada (sem marcosProvisorios)`, [typeof A.linhaDoTempoPaciente, typeof A.marcosProvisorios], ['function', 'undefined']);
t('catálogo de HEAD e o do working tree têm as mesmas 80 fichas', [catalogo.protocolos.length, catalogoAtual.protocolos.length], [80, 80]);

// ── marcosProvisorios ──
const NOMES = catalogoAtual.protocolos.map(p => p.nome);
t('marcosProvisorios: true só no R-mini-CHOP', NOMES.filter(n => marcosProvisorios(getProtocolo(n))), ['R-mini-CHOP']);
t('exatamente 1 ficha com o campo marcos_provisorios', catalogoAtual.protocolos.filter(p => 'marcos_provisorios' in p).map(p => p.nome), ['R-mini-CHOP']);
t('marcosProvisorios: só true exato (undefined, null, "true", 1, {} e sem ficha → false)',
  [undefined, null, 'true', 1].map(v => marcosProvisorios({ marcos_provisorios: v })).concat(marcosProvisorios({}), marcosProvisorios(null), marcosProvisorios(undefined)),
  [false, false, false, false, false, false, false]);

// ── Nutri: nada muda no R-mini-CHOP ──
const RMINI = 'R-mini-CHOP';
const ALIASES = ['mini-CHOP', 'R-CHOP dose reduzida', 'rituximabe CHOP dose reduzida'];
t('R-mini-CHOP: marcosDoProtocolo = os mesmos 3 marcos do 37f9906', marcosDoProtocolo(getProtocolo(RMINI)), A.marcosDoProtocolo(A.getProtocolo(RMINI)));
t('R-mini-CHOP: 3 marcos', marcosDoProtocolo(getProtocolo(RMINI)).length, 3);
t('R-mini-CHOP: janelaRisco = {inicio 6, fim 13}', janelaRisco(getProtocolo(RMINI)), { inicio: 6, fim: 13 });
t('R-mini-CHOP: rotuloJanelaRisco = D7–D14', rotuloJanelaRisco(getProtocolo(RMINI)), A.rotuloJanelaRisco(A.getProtocolo(RMINI)));
t('R-mini-CHOP: rotuloJanelaRisco contém D7 e D14', /D7.*D14/.test(rotuloJanelaRisco(getProtocolo(RMINI))), true);
t('aliases resolvem para o R-mini-CHOP', ALIASES.map(a => getProtocolo(a)?.nome), [RMINI, RMINI, RMINI]);

// ── Paciente ──
const D1 = '2026-10-01';
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const DIAS = Array.from({ length: 23 }, (_, i) => addDias(D1, i)); // D1..D23
const ciclo = { numero_ciclo: 2, data_quimio: D1 };
const APLICACAO = { d: D1, label: 'D1', desc: 'Quimio', fase: 'quimio' };
const PROXIMO = { d: addDias(D1, 21), label: 'Próximo', desc: 'Próximo ciclo', fase: 'quimio' };

for (const nome of [RMINI, ...ALIASES]) {
  const conf = { protocolo: nome, intervalo_ciclos: 21, registro_pendente: false };
  t(`${nome} confirmado: faseDoDiaPaciente = null de D1 a D23`, DIAS.map(h => faseDoDiaPaciente(conf, D1, { hoje: h })), DIAS.map(() => null));
  const linhas = DIAS.map(h => linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: nome, hoje: h }));
  t(`${nome} confirmado: linha do tempo de D1 a D23 = sem banner, rótulo vazio, só aplicação + "Próximo ciclo" (D22)`,
    linhas, DIAS.map(() => ({ emJanela: false, rotuloJanela: '', marcos: [APLICACAO, PROXIMO] })));
  t(`${nome} pendente: só a bolinha da aplicação (sem "Próximo ciclo")`,
    linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: nome, hoje: '2026-10-09', pendente: true }),
    { emJanela: false, rotuloJanela: '', marcos: [APLICACAO] });
  t(`${nome} pendente: faseDoDiaPaciente = null`, faseDoDiaPaciente({ ...conf, registro_pendente: true }, D1, { hoje: '2026-10-09' }), null);
}
// No 37f9906 a paciente via a janela: confirma que a mudança é real.
t(`R-mini-CHOP no ${ANTES}: em D9 havia banner e marcos de efeito`,
  (r => [r.emJanela, r.marcos.length > 2])(A.linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: RMINI, hoje: '2026-10-09' })), [true, true]);
t(`R-mini-CHOP no ${ANTES}: em D9 havia fase do dia`,
  A.faseDoDiaPaciente({ protocolo: RMINI, intervalo_ciclos: 21, registro_pendente: false }, D1, { hoje: '2026-10-09' }) !== null, true);

// ── R-CHOP e BEP: idênticos ao 37f9906 ──
for (const [nome, iv] of [['R-CHOP', 21], ['BEP', 21]]) {
  const conf = { protocolo: nome, intervalo_ciclos: iv, registro_pendente: false };
  const intervalo = Array.from({ length: iv + 2 }, (_, i) => addDias(D1, i));
  t(`${nome}: marcos_provisorios ausente`, marcosProvisorios(getProtocolo(nome)), false);
  t(`${nome} confirmado: faseDoDiaPaciente idêntica ao ${ANTES} em todos os dias`,
    intervalo.map(h => faseDoDiaPaciente(conf, D1, { hoje: h })), intervalo.map(h => A.faseDoDiaPaciente(conf, D1, { hoje: h })));
  t(`${nome} confirmado: linhaDoTempoPaciente idêntica ao ${ANTES} em todos os dias`,
    intervalo.map(h => linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: iv, protocoloNome: nome, hoje: h })),
    intervalo.map(h => A.linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: iv, protocoloNome: nome, hoje: h })));
  const r = linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: iv, protocoloNome: nome, hoje: '2026-10-09' });
  t(`${nome} confirmado em D9: tem banner/rótulo e marcos de efeito (a referência não é vazia)`,
    [r.rotuloJanela !== '', r.marcos.length > 2], [true, true]);
}
t('R-CHOP em D9 (dentro de D8–D15): banner ligado', linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: 'R-CHOP', hoje: '2026-10-09' }).emJanela, true);

// ── bloco-97: textos do R-mini-CHOP sem a janela D7–D14, com a frase da Kelly ──
const FRASE_KELLY = 'Mantenha os cuidados de higiene e segurança dos alimentos durante o tratamento. Caso os exames indiquem redução das defesas do organismo, siga as orientações específicas da equipe oncológica.';
const fichaR = catalogoAtual.protocolos.find(p => p.nome === RMINI);
const vezesEm = (obj, s) => JSON.stringify(obj).split(s).length - 1;
t('frase da Kelly: 2 vezes na ficha R-mini-CHOP (conduta_base e manejo da Neutropenia)',
  [vezesEm(fichaR, FRASE_KELLY), fichaR.conduta_base.includes(FRASE_KELLY), fichaR.efeitos.filter(e => e.manejo.includes(FRASE_KELLY)).map(e => e.efeito)],
  [2, true, ['Neutropenia (imunossupressão)']]);
t('frase da Kelly: 0 vezes em qualquer outra ficha',
  catalogoAtual.protocolos.filter(p => p.nome !== RMINI && vezesEm(p, FRASE_KELLY) > 0).map(p => p.nome), []);
t('R-mini-CHOP: 0 "D7", "D14", "D7 a D14", "entre D7 e D14" em conduta_base, efeitos e sinais_alerta',
  ['conduta_base', 'efeitos', 'sinais_alerta'].map(c => ['D7', 'D14', 'D7 a D14', 'entre D7 e D14'].map(s => vezesEm(fichaR[c] ?? '', s))),
  [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
t('R-CHOP: "Dia 8 ao Dia 15" 1 vez no catálogo, na conduta_base do R-CHOP',
  [vezesEm(catalogoAtual, 'Dia 8 ao Dia 15'), catalogoAtual.protocolos.filter(p => vezesEm(p, 'Dia 8 ao Dia 15') > 0).map(p => p.nome)], [1, ['R-CHOP']]);

// ── Todas as outras fichas: idênticas ao 37f9906 ──
const outras = NOMES.filter(n => n !== RMINI);
t(`as outras ${outras.length} fichas: linha do tempo e fase em D9 idênticas ao ${ANTES}`,
  outras.map(n => [linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: n, hoje: '2026-10-09' }),
    faseDoDiaPaciente({ protocolo: n, intervalo_ciclos: 21, registro_pendente: false }, D1, { hoje: '2026-10-09' })]),
  outras.map(n => [A.linhaDoTempoPaciente({ ultimoCiclo: ciclo, intervalo: 21, protocoloNome: n, hoje: '2026-10-09' }),
    A.faseDoDiaPaciente({ protocolo: n, intervalo_ciclos: 21, registro_pendente: false }, D1, { hoje: '2026-10-09' })]));

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
