/**
 * Teste standalone do cartão "Chás do meu tratamento" (bloco-125).
 * Roda com `node src/lib/chasProtocolo.teste.mjs`, sem framework, na raiz do repo.
 *
 * Só o mecanismo: o arquivo real de dados está vazio e todo conteúdo aqui é
 * texto de teste. Regras: registro confirmado (só `false` exato), ficha por
 * getProtocolo (nunca inclusão), FOLFIRINOX / grafias de T-AC DD / R-mini-CHOP
 * bloqueados, base e protocolo com `liberado === true`.
 *
 * O fuso é fixado ANTES do import, como nos outros testes. protocoloCiclo.js
 * importa o JSON sem atributo; o hook só acrescenta `type: 'json'`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const { protocoloElegivelParaChas, montarChas, validarDadosChas } = await import('./chasProtocolo.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (passou) ok++; else falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}
// Nunca lança: devolve o resultado ou a string 'EXCECAO'.
const seguro = fn => { try { return fn(); } catch { return 'EXCECAO'; } };

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lerRaiz = f => readFileSync(join(RAIZ, f), 'utf8').replace(/\r/g, '');
const catalogo = JSON.parse(lerRaiz('src/data/protocolos_efeitos.json'));
const dadosReais = JSON.parse(lerRaiz('src/data/chas_protocolos.json'));

// ── Dados de teste ──
const bloco = (letra, extra = {}) => ({
  liberado: true,
  validado_por: 'Revisora de teste',
  validado_em: '2026-01-01',
  secoes: [{ titulo: `Titulo de teste ${letra}`, itens: [`Texto de teste ${letra}1`, `Texto de teste ${letra}2`] }],
  ...extra,
});
const dadosCom = (chaves, { base = bloco('A') } = {}) => ({
  meta: { uso: 'teste', versao: '1' },
  base,
  protocolos: Object.fromEntries(chaves.map(c => [c, bloco('B')])),
});
const confirmado = protocolo => ({ protocolo, registro_pendente: false });
const fluxo = (trat, dados) => montarChas(protocoloElegivelParaChas(trat), dados);

// 1. registro_pendente: só false exato confirma.
t('registro_pendente true / null / undefined / ausente → elegível null',
  [
    protocoloElegivelParaChas({ protocolo: 'TCHP', registro_pendente: true }),
    protocoloElegivelParaChas({ protocolo: 'TCHP', registro_pendente: null }),
    protocoloElegivelParaChas({ protocolo: 'TCHP', registro_pendente: undefined }),
    protocoloElegivelParaChas({ protocolo: 'TCHP' }),
    protocoloElegivelParaChas({ protocolo: 'TCHP', registro_pendente: 'false' }),
    protocoloElegivelParaChas({ protocolo: 'TCHP', registro_pendente: 0 }),
  ], [null, null, null, null, null, null]);

// 2. Grafias de T-AC DD, confirmadas e com dados liberados para todas as chaves possíveis.
const grafiasTac = ['T—AC DD', 'T-AC DD', 'Ac DD', '(T-ddAC),', 'T-ddAC'];
const dadosTac = dadosCom(['tacdd', 'acdd', 'tddac', 'actdosedensa']);
t('T—AC DD, Ac DD, (T-ddAC), etc. → elegível null e montarChas null',
  grafiasTac.map(g => [protocoloElegivelParaChas(confirmado(g)), fluxo(confirmado(g), dadosTac)]),
  grafiasTac.map(() => [null, null]));
t('montarChas recusa chave bloqueada mesmo passada à mão',
  ['tacdd', 'acdd', 'tddac', 'folfirinox'].map(c => montarChas({ chave: c, nome: c }, dadosCom([c]))), [null, null, null, null]);

// 3. FOLFIRINOX, pelo nome e por alias.
const dadosFolfi = dadosCom(['folfirinox']);
t('FOLFIRINOX confirmado com dados liberados → null (nome, caixa baixa e alias)',
  ['FOLFIRINOX', 'folfirinox', 'oxaliplatina irinotecano leucovorina 5-fu']
    .map(n => [protocoloElegivelParaChas(confirmado(n)), fluxo(confirmado(n), dadosFolfi)]),
  [[null, null], [null, null], [null, null]]);

// 4. R-mini-CHOP (marcos_provisorios).
t('R-mini-CHOP confirmado com dados liberados → null (nome e alias)',
  ['R-mini-CHOP', 'mini-CHOP'].map(n => [protocoloElegivelParaChas(confirmado(n)), fluxo(confirmado(n), dadosCom(['rminichop']))]),
  [[null, null], [null, null]]);
t('R-CHOP (sem marcos provisórios) continua elegível', protocoloElegivelParaChas(confirmado('R-CHOP')), { chave: 'rchop', nome: 'R-CHOP' });

// 5. liberado estrito, no protocolo e na base.
const variantes = [false, undefined, 'true', 1, null, 'sim'];
const semLiberado = b => { const c = { ...b }; delete c.liberado; return c; };
t('liberado do protocolo false / ausente / "true" / 1 / null / "sim" → null',
  variantes.map(v => fluxo(confirmado('TCHP'), {
    base: bloco('A'),
    protocolos: { tchp: v === undefined ? semLiberado(bloco('B')) : bloco('B', { liberado: v }) },
  })), variantes.map(() => null));
t('liberado da base false / ausente / "true" / 1 / null / "sim" → null',
  variantes.map(v => fluxo(confirmado('TCHP'), {
    base: v === undefined ? semLiberado(bloco('A')) : bloco('A', { liberado: v }),
    protocolos: { tchp: bloco('B') },
  })), variantes.map(() => null));

// 6. base ausente e estrutura inválida.
const comBase = base => ({ protocolos: { tchp: bloco('B') }, ...(base === 'AUSENTE' ? {} : { base }) });
t('base null ou ausente → null', [fluxo(confirmado('TCHP'), comBase(null)), fluxo(confirmado('TCHP'), comBase('AUSENTE'))], [null, null]);
const ruins = {
  'secoes vazia': { secoes: [] },
  'secoes ausente': { secoes: undefined },
  'itens vazio': { secoes: [{ titulo: 'Titulo de teste', itens: [] }] },
  'item não string': { secoes: [{ titulo: 'Titulo de teste', itens: ['Texto de teste', 3] }] },
  'item vazio': { secoes: [{ titulo: 'Titulo de teste', itens: ['  '] }] },
  'titulo vazio': { secoes: [{ titulo: '', itens: ['Texto de teste'] }] },
  'validado_por vazio': { validado_por: '' },
  'validado_em vazio': { validado_em: '' },
  'validado_por ausente': { validado_por: undefined },
};
for (const [nome, extra] of Object.entries(ruins)) {
  t(`protocolo com ${nome} → null`, fluxo(confirmado('TCHP'), { base: bloco('A'), protocolos: { tchp: bloco('B', extra) } }), null);
  t(`base com ${nome} → null`, fluxo(confirmado('TCHP'), { base: bloco('A', extra), protocolos: { tchp: bloco('B') } }), null);
}

// 7. Entradas ruins: null, sem exceção.
const entradas = [null, undefined, '', 42, 'TCHP', [], {}, { registro_pendente: false }, { protocolo: '', registro_pendente: false },
  { protocolo: 12, registro_pendente: false }, confirmado('Protocolo inexistente de teste'), confirmado('   ')];
t('protocoloElegivelParaChas com entradas ruins → null, sem exceção',
  entradas.map(e => seguro(() => protocoloElegivelParaChas(e))), entradas.map(() => null));
const dadosRuins = [null, undefined, '', 42, [], {}, { base: bloco('A') }, { base: bloco('A'), protocolos: [] }, { base: bloco('A'), protocolos: null }];
t('montarChas com dados ruins → null, sem exceção',
  dadosRuins.map(d => seguro(() => montarChas({ chave: 'tchp', nome: 'TCHP' }, d))), dadosRuins.map(() => null));
t('montarChas com elegível ruim → null, sem exceção',
  [null, undefined, '', 'tchp', {}, { chave: '' }, { chave: 3 }].map(e => seguro(() => montarChas(e, dadosCom(['tchp'])))),
  [null, null, null, null, null, null, null]);
t('chave herdada de Object não conta (constructor, toString)',
  ['constructor', 'toString', '__proto__'].map(c => seguro(() => montarChas({ chave: c, nome: c }, { base: bloco('A'), protocolos: {} }))),
  [null, null, null]);

// 8. Igualdade de chave, nunca inclusão.
const dadosAct = dadosCom(['act']);
t('dados só para AC-T: paciente AC → null', fluxo(confirmado('AC'), dadosAct), null);
t('dados só para AC-T: paciente AC-T → devolve', fluxo(confirmado('AC-T'), dadosAct) !== null, true);
t('dados só para AC-T: AC-T dose densa → null', fluxo(confirmado('AC-T dose densa'), dadosAct), null);
const dadosTchp = dadosCom(['tchp']);
t('dados só para TCHP: paciente TC → null', fluxo(confirmado('TC'), dadosTchp), null);
t('dados só para TCHP: paciente "tchp" (caixa baixa) e alias "TCH+P" → devolve',
  [fluxo(confirmado('tchp'), dadosTchp) !== null, fluxo(confirmado('TCH+P'), dadosTchp) !== null], [true, true]);

// 9. Caminho feliz, sem mutar a entrada.
const trat = confirmado('TCHP');
const dados = dadosCom(['tchp']);
const antesTrat = JSON.stringify(trat), antesDados = JSON.stringify(dados);
const elegivel = protocoloElegivelParaChas(trat);
t('TCHP confirmado → elegível { chave, nome }', elegivel, { chave: 'tchp', nome: 'TCHP' });
const chas = montarChas(elegivel, dados);
t('TCHP: devolve { base, protocolo } com as seções de teste', chas, {
  base: { validado_por: 'Revisora de teste', validado_em: '2026-01-01', secoes: [{ titulo: 'Titulo de teste A', itens: ['Texto de teste A1', 'Texto de teste A2'] }] },
  protocolo: { validado_por: 'Revisora de teste', validado_em: '2026-01-01', secoes: [{ titulo: 'Titulo de teste B', itens: ['Texto de teste B1', 'Texto de teste B2'] }] },
});
t('entrada intacta depois de elegível e montar', [JSON.stringify(trat) === antesTrat, JSON.stringify(dados) === antesDados], [true, true]);
chas.base.secoes[0].itens.push('mutado');
t('o resultado é cópia: mexer nele não muda os dados', JSON.stringify(dados) === antesDados, true);

// 10. validarDadosChas.
t('arquivo real chas_protocolos.json passa (lista vazia)', validarDadosChas(dadosReais, catalogo), []);
t('arquivo real: base null e protocolos vazio', [dadosReais.base, Object.keys(dadosReais.protocolos).length], [null, 0]);
t('dados de teste válidos (TCHP + base) passam', validarDadosChas(dadosCom(['tchp']), catalogo), []);
const temErro = (d, trecho) => validarDadosChas(d, catalogo).some(e => e.includes(trecho));
t('chave que não existe no catálogo → erro', temErro(dadosCom(['naoexistedeteste']), 'protocolos.naoexistedeteste: chave não existe no catálogo'), true);
t('chave de FOLFIRINOX → erro de bloqueio', temErro(dadosCom(['folfirinox']), 'protocolos.folfirinox: chave bloqueada'), true);
t('chave de R-mini-CHOP → erro de marcos provisórios', temErro(dadosCom(['rminichop']), 'protocolos.rminichop: ficha com marcos provisórios'), true);
t('chave de T-AC DD → erro de bloqueio', temErro(dadosCom(['tacdd']), 'protocolos.tacdd: chave bloqueada'), true);
t('chave bloqueada com liberado false continua erro',
  temErro({ base: null, protocolos: { folfirinox: bloco('B', { liberado: false }) } }, 'chave bloqueada'), true);
t('protocolos ausente → erro', temErro({ base: null }, 'protocolos: ausente'), true);
t('base ausente → erro', temErro({ protocolos: {} }, 'base: ausente'), true);
t('base inválida (validado_em fora do formato, secoes vazia) → erros',
  [temErro({ base: bloco('A', { validado_em: '01/01/2026' }), protocolos: {} }, 'base.validado_em'),
   temErro({ base: bloco('A', { secoes: [] }), protocolos: {} }, 'base.secoes')], [true, true]);
t('liberado "true" no arquivo → erro de tipo', temErro({ base: bloco('A', { liberado: 'true' }), protocolos: {} }, 'base.liberado'), true);
t('dados ou catálogo ruins → erro, sem exceção',
  [seguro(() => validarDadosChas(null, catalogo)).length > 0, seguro(() => validarDadosChas(dadosReais, null)).length > 0,
   seguro(() => validarDadosChas([], catalogo)).length > 0], [true, true, true]);

// O catálogo não muda.
const catalogoHead = JSON.parse(execSync('git show HEAD:src/data/protocolos_efeitos.json', { maxBuffer: 1e8 }).toString('utf8'));
t('catálogo com 80 protocolos e idêntico ao HEAD',
  [catalogo.protocolos.length, JSON.stringify(catalogo) === JSON.stringify(catalogoHead)], [80, true]);

// 11. Leitura de fonte.
const ESTE = relative(RAIZ, fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const lib = lerRaiz('src/lib/chasProtocolo.js');
const cartao = lerRaiz('src/components/CartaoChas.jsx');
const json = lerRaiz('src/data/chas_protocolos.json');
const mon = lerRaiz('src/app/paciente/MonitoramentoOncologico.jsx');
t('chasProtocolo.js e CartaoChas.jsx não contêm nota_interna', [lib.includes('nota_interna'), cartao.includes('nota_interna')], [false, false]);
const fontes = readdirSync(join(RAIZ, 'src'), { recursive: true })
  .map(f => ('src/' + f).replace(/\\/g, '/'))
  .filter(f => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith('.teste.mjs') && f !== ESTE);
const ESTATICO = /(^|\n)\s*import\s[^;()]*?['"][^'"]*chas_protocolos\.json['"]|(^|\n)\s*import\s*['"][^'"]*chas_protocolos\.json['"]|require\(\s*['"][^'"]*chas_protocolos/;
t('nenhum arquivo de src/ (fora .teste.mjs) importa chas_protocolos.json de forma estática',
  fontes.filter(f => ESTATICO.test(lerRaiz(f))), []);
t('só o MonitoramentoOncologico.jsx tem o caminho de chas_protocolos.json entre aspas, por import dinâmico',
  [fontes.filter(f => /['"`][^'"`]*chas_protocolos\.json['"`]/.test(lerRaiz(f))), mon.includes("import('../../data/chas_protocolos.json')")],
  [['src/app/paciente/MonitoramentoOncologico.jsx'], true]);
t('MonitoramentoOncologico: decide pela mesma linha da linha do tempo e só então baixa',
  [mon.includes('protocoloElegivelParaChas(erroTrat ? null : trat)'),
   mon.indexOf('if (!elegivel) { setChas(null); return; }') < mon.indexOf("import('../../data/chas_protocolos.json')"),
   (mon.match(/from\('tratamentos_oncologicos'\)/g) ?? []).length], [true, true, 1]);
const PALAVRAS = ['erva', 'fitoter', 'chá verde', 'hipérico', 'cúrcuma', 'toranja', 'grapefruit'];
t('os três arquivos novos não contêm as palavras clínicas da lista',
  [lib, cartao, json].map(s => PALAVRAS.filter(p => s.toLowerCase().includes(p))), [[], [], []]);
t('CartaoChas: único texto próprio é o título',
  cartao.replace(/\/\*\*[\s\S]*?\*\//, '').match(/>\s*([^<>{}]*\p{L}[^<>{}]*?)\s*</gu)?.map(s => s.replace(/[<>]/g, '').trim()) ?? [],
  ['Chás do meu tratamento']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
