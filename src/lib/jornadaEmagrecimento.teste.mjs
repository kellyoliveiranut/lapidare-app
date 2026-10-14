/**
 * Teste standalone: Emagrecimento sem "Minha jornada" (bloco-119).
 * Roda com `node src/lib/jornadaEmagrecimento.teste.mjs`, sem framework.
 * Sem rede, sem banco, sem git: lê a fonte e avalia a regra do layout.
 *
 * Regra: tem Minha jornada = não avulsa E objetivo diferente de
 * 'Emagrecimento' (valor canônico de lib/objetivos.js). Objetivo nulo/vazio
 * tem jornada. Oncologia e os demais objetivos continuam como antes.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { ehAvulsa, bloqueadoNoPlano } from './planoPaciente.js';
import { OBJETIVOS } from './objetivos.js';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const lerRaiz = rel => readFileSync(join(RAIZ, rel), 'utf8').replace(/\r/g, '');
const existe = rel => existsSync(join(RAIZ, rel));
const conta = (s, re) => (s.match(re) ?? []).length;
const sha = s => createHash('sha256').update(s).digest('hex');

const layout = lerRaiz('src/components/PacienteLayout.jsx');
const jor = lerRaiz('src/app/paciente/Jornada.jsx');
const inicio = lerRaiz('src/app/paciente/Inicio.jsx');

// ── A regra, avaliada a partir da fonte do layout ──
const mRegra = /const temMinhaJornada = profile => (.+);\n/.exec(layout);
const mSem = /const semJornada = (.+);\n/.exec(layout);
t('layout define temMinhaJornada e semJornada', [!!mRegra, !!mSem], [true, true]);
const temMinhaJornada = new Function('ehAvulsa', `return profile => ${mRegra?.[1]};`)(ehAvulsa);
const semJornada = new Function('ehAvulsa', 'temMinhaJornada', `return profile => ${mSem?.[1]};`)(ehAvulsa, temMinhaJornada);
t('regra: texto exato', mRegra?.[1], "!ehAvulsa(profile) && profile?.objetivo !== 'Emagrecimento'");

const ESS = 'essentia';
t('Emagrecimento (Essentia) não tem jornada', temMinhaJornada({ tipo_plano: ESS, objetivo: 'Emagrecimento' }), false);
t('Avulsa não tem jornada (Emagrecimento, Oncologia, outro, nulo)',
  ['Emagrecimento', 'Oncologia', 'Saúde geral', null].map(objetivo => temMinhaJornada({ tipo_plano: 'avulsa', objetivo })), [false, false, false, false]);
t('Avulsa com grafia solta (" Avulsa") também não', temMinhaJornada({ tipo_plano: ' Avulsa', objetivo: 'Oncologia' }), false);
t('Oncologia (Essentia) tem jornada', temMinhaJornada({ tipo_plano: ESS, objetivo: 'Oncologia' }), true);
t('todos os outros objetivos da lista canônica têm jornada',
  OBJETIVOS.filter(o => o !== 'Emagrecimento').map(objetivo => temMinhaJornada({ tipo_plano: ESS, objetivo })),
  OBJETIVOS.filter(o => o !== 'Emagrecimento').map(() => true));
t('objetivo nulo, vazio ou ausente tem jornada',
  [null, '', undefined].map(objetivo => temMinhaJornada({ tipo_plano: ESS, objetivo })), [true, true, true]);
t('plano nulo (não avulsa) tem jornada', temMinhaJornada({ tipo_plano: null, objetivo: 'Saúde geral' }), true);
t("'Emagrecimento' é o valor canônico (lib/objetivos.js)", OBJETIVOS.includes('Emagrecimento'), true);

// ── Menu ──
t('menu: sem perfil, nada some (semJornada falso)', semJornada(null), false);
t('menu: some só para Emagrecimento não avulsa',
  [semJornada({ tipo_plano: ESS, objetivo: 'Emagrecimento' }), semJornada({ tipo_plano: ESS, objetivo: 'Oncologia' }),
    semJornada({ tipo_plano: ESS, objetivo: null }), semJornada({ tipo_plano: 'avulsa', objetivo: 'Emagrecimento' })],
  [true, false, false, false]);
t('menu: o sheet usa maisItens, filtrado pela regra',
  [layout.includes('const maisItens = semJornada ? MAIS_ITEMS.filter(item => item.path !== ROTA_JORNADA) : MAIS_ITEMS;'),
    layout.includes('{maisItens.map(item => {'), layout.includes('{MAIS_ITEMS.map(')], [true, true, false]);

// ── Redirecionamento (efeito do bloqueio, estendido) ──
const iEf = layout.indexOf('// Bloqueia acesso direto por URL');
const efeito = layout.slice(iEf, layout.indexOf('}, [location.pathname, profile?.tipo_plano, profile?.objetivo]);', iEf));
const ELSE = '} else if (location.pathname === ROTA_JORNADA && !temMinhaJornada(profile)) {';
const ramoAvulsa = efeito.slice(efeito.indexOf('if (isBlocked(location.pathname)) {'), efeito.indexOf(ELSE));
const ramoSemJornada = efeito.slice(efeito.indexOf(ELSE) + ELSE.length, efeito.indexOf('\n    }', efeito.indexOf(ELSE)));
t('redirect: um efeito só, com o perfil já carregado e objetivo nas dependências',
  [iEf >= 0, conta(layout, /\/\/ Bloqueia acesso direto por URL/g), efeito.indexOf('if (!profile) return;') >= 0,
    efeito.indexOf('if (!profile) return;') < efeito.indexOf(ELSE)], [true, 1, true, true]);
t('redirect: sem jornada e na rota da jornada -> Início (replace)',
  ramoSemJornada.includes("navigate('/paciente/inicio', { replace: true });"), true);
t('(c) redirect de Emagrecimento não avulsa NÃO dispara o aviso do cadeado', /setLockToast/.test(ramoSemJornada), false);
t('(b) Avulsa de Emagrecimento continua no bloqueio por plano, com o aviso',
  [bloqueadoNoPlano({ tipo_plano: 'avulsa', objetivo: 'Emagrecimento' }, '/paciente/jornada'),
    ramoAvulsa.includes("navigate('/paciente/inicio', { replace: true });"), ramoAvulsa.includes('setLockToast(true);'),
    efeito.indexOf('if (isBlocked(location.pathname)) {') < efeito.indexOf(ELSE)],
  [true, true, true, true]);
t('(b) o texto do aviso do cadeado continua o mesmo', layout.includes('Esta área está disponível no plano Essentia.'), true);

// ── Jornada.jsx ──
const NAO_ONCO = 'if (!onco) return <TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />;';
const ramoOnco = jor.slice(jor.indexOf(NAO_ONCO) + NAO_ONCO.length);
t('Jornada: Emagrecimento sem carga e sem desenho, como a Avulsa',
  [jor.includes("const emagrecimento = profile?.objetivo === 'Emagrecimento';"),
    jor.includes('useJornada(pacienteId, !!profile && !avulsa && !emagrecimento)'),
    jor.includes('if (avulsa || emagrecimento) return null;'),
    jor.indexOf('if (avulsa || emagrecimento) return null;') < jor.indexOf(NAO_ONCO)], [true, true, true, true]);
t('Jornada: TrilhaJornada só no ramo dos outros objetivos',
  [conta(jor, /<TrilhaJornada /g), jor.includes(NAO_ONCO), /TrilhaJornada/.test(ramoOnco)], [1, true, false]);
t('Jornada: ramo Oncologia com PanoramaEstrada e etapasDaJornada',
  [ramoOnco.includes('etapasDaJornada(erro ? null : jornada)'), ramoOnco.includes('<PanoramaEstrada ')], [true, true]);

// ── Início: cartão "Sua jornada Essentia" ──
t('Início: jornada desligada para Emagrecimento (só Essentia, como antes)',
  inicio.includes("useJornada(pacienteId, ehEssentia(profile) && profile?.objetivo !== 'Emagrecimento')"), true);
t('(a) jornada desligada -> useJornada devolve jornada nula',
  [lerRaiz('src/lib/useJornada.js').includes('const valido = habilitado && !!pacienteId && res?.pacienteId === pacienteId;'),
    lerRaiz('src/lib/useJornada.js').includes('jornada: valido ? res.jornada : null,')], [true, true]);
t('(a) jornada nula -> CardJornadaResumo não desenha nada',
  /export function CardJornadaResumo\(\{ jornada, onAbrir \}\) \{\n {2}if \(!jornada \|\| jornada\.vazia\) return null;/.test(lerRaiz('src/app/paciente/_Jornada.jsx')), true);
t('Início: o cartão continua com o mesmo destino', inicio.includes("<CardJornadaResumo jornada={jornada} onAbrir={() => navigate('/paciente/jornada')} />"), true);

// ── Fora do escopo: intocados ──
const ESTE = relative(RAIZ, fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const semComentario = s => s.split('\n').filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
const fontes = readdirSync(join(RAIZ, 'src'), { recursive: true })
  .map(f => ('src/' + f).replace(/\\/g, '/'))
  .filter(f => /\.(js|jsx|mjs)$/.test(f) && f !== ESTE);
t('src/: nenhuma leitura de panorama_fases (.from) fora de comentário',
  fontes.filter(f => /from\(\s*['"`]panorama_fases['"`]\s*\)/.test(semComentario(lerRaiz(f)))), []);
// sha256 (sem CR) do conteúdo destes arquivos no HEAD a6d0e08.
const HEAD = {
  'src/app/paciente/_Jornada.jsx': '0a1a594f978a8671249abd6614e0991aecba3dc621c74175524c028a3f8e74c1',
  'src/lib/jornada.js': 'e77647be9e62e6c9f113a1cdee444c0d993e09c4d2a3edd4ddbccf141dab9485',
  'src/lib/useJornada.js': '23c505f304c8c5cab66561495b309399d74439db93e9c9a62e37a6d26f3dd25b',
};
t('_Jornada.jsx, jornada.js e useJornada.js existem e iguais ao HEAD a6d0e08',
  Object.entries(HEAD).map(([f, h]) => existe(f) && sha(lerRaiz(f)) === h), [true, true, true]);

console.log(`\nTZ = ${process.env.TZ}\n`);
console.log(`${ok} PASS, ${falhou} FALHA`);
if (falhou) process.exit(1);
