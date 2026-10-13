/**
 * Teste standalone da fusão do Panorama na Minha jornada (bloco-115, revisto
 * no bloco-117). Roda com `node src/lib/jornadaFusaoPanorama.teste.mjs`, sem
 * framework. Só leitura de fonte: sem git, sem rede, sem banco.
 *
 * Para Oncologia a Minha jornada mostra só a estrada das 6 etapas, que avança
 * com as consultas (etapasJornada.js); a trilha fica para os outros
 * objetivos. A tela e os cartões do Panorama e o seletor da nutri saíram; a
 * rota antiga redireciona para a jornada. A tabela panorama_fases, a migração
 * e o DESFAZER ficam como estão — só deixam de ser lidos.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

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

// Todos os .js/.jsx/.mjs/.css de src/, menos este teste (que cita os nomes).
const ESTE = relative(RAIZ, fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const fontes = readdirSync(join(RAIZ, 'src'), { recursive: true })
  .map(f => ('src/' + f).replace(/\\/g, '/'))
  .filter(f => /\.(js|jsx|mjs|css)$/.test(f) && f !== ESTE)
  .map(f => ({ f, s: lerRaiz(f) }));
const com = re => fontes.filter(x => re.test(x.s)).map(x => x.f).sort();
// Sem as linhas de comentário (// e blocos /** */ linha a linha).
const semComentario = s => s.split('\n').filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
const comNoCodigo = re => fontes.filter(x => re.test(semComentario(x.s))).map(x => x.f).sort();

// ── Jornada.jsx ──
const jor = lerRaiz('src/app/paciente/Jornada.jsx');
const trilhaJ = lerRaiz('src/app/paciente/_Jornada.jsx');
const TRILHA = '<TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />';
const NAO_ONCO = `if (!onco) return ${TRILHA}`;
const ramoOnco = jor.slice(jor.indexOf(NAO_ONCO) + NAO_ONCO.length);
t('Jornada: importa a estrada e etapasDaJornada',
  [jor.includes("import PanoramaEstrada from '../../components/PanoramaEstrada.jsx';"),
    jor.includes("import { etapasDaJornada } from '../../lib/etapasJornada.js';")], [true, true]);
t('Jornada: onco = objetivo Oncologia', jor.includes("const onco = profile?.objetivo === 'Oncologia';"), true);
t('Jornada: não lê panorama_fases, não importa panoramaFases/textoEstado, sem useEffect/useState',
  [/panorama_fases/.test(semComentario(jor)), /panoramaFases|textoEstado/.test(jor), /useEffect|useState/.test(jor), /from\('react'\)/.test(jor)],
  [false, false, false, false]);
t('Jornada: ramo não-Oncologia é exatamente o retorno da trilha, antes de qualquer estrada',
  [jor.includes(NAO_ONCO), jor.indexOf(NAO_ONCO) < jor.indexOf('<PanoramaEstrada'), conta(jor, /<TrilhaJornada /g)],
  [true, true, 1]);
t('Jornada: ramo Oncologia sem TrilhaJornada, com a estrada pelas consultas',
  [/TrilhaJornada/.test(ramoOnco), ramoOnco.includes('const etapas = etapasDaJornada(erro ? null : jornada);'),
    ramoOnco.includes('<PanoramaEstrada key={etapas.atual ?? \'sem\'} atual={etapas.atual} concluidas={etapas.concluidas} todas={etapas.todas} />')],
  [false, true, true]);
t('Jornada: carregando e erro reaproveitam os textos da trilha (_Jornada.jsx)',
  ['Carregando sua jornada…', 'Não foi possível carregar sua jornada agora. Tente de novo em instantes.']
    .map(x => [ramoOnco.includes(x), trilhaJ.includes(x)]),
  [[true, true], [true, true]]);
t('Jornada: carregando volta antes da estrada (a estrada não pisca sem destaque)',
  ramoOnco.indexOf('if (carregando)') >= 0 && ramoOnco.indexOf('if (carregando)') < ramoOnco.indexOf('<PanoramaEstrada'), true);
t('Jornada: título da seção e rodapé informativo',
  [ramoOnco.includes('As etapas do seu acompanhamento nutricional.'),
    ramoOnco.includes('Conteúdo informativo. Seu plano é individual e definido pela sua nutricionista.')], [true, true]);
t('Jornada: useJornada importado e chamado como antes; Avulsa barrada como antes',
  [jor.includes("import { useJornada } from '../../lib/useJornada.js';"), conta(jor, /useJornada/g),
    jor.includes('useJornada(pacienteId, !!profile && !avulsa)'), jor.includes('if (avulsa) return null;'),
    jor.includes("import { TrilhaJornada } from './_Jornada.jsx';")],
  [true, 3, true, true, true]);

// ── Estrada ──
const estrada = lerRaiz('src/components/PanoramaEstrada.jsx');
t('PanoramaEstrada: mantém a API antiga fase e aceita atual/concluidas/todas',
  [estrada.includes('export default function PanoramaEstrada({ fase, atual = null, concluidas, todas = false })'),
    estrada.includes('estadoDaEtapa(f.numero, fase)'), estrada.includes('rotuloEtapa(f.numero, fase)')], [true, true, true]);
t('PanoramaEstrada: concluída em token verde existente (--green-soft / --green em tokens.css)',
  [estrada.includes("'var(--green-soft)'"), estrada.includes("'var(--green)'"),
    /--green:\s*#/.test(lerRaiz('src/styles/tokens.css')), /--green-soft:\s*#/.test(lerRaiz('src/styles/tokens.css'))],
  [true, true, true, true]);
t('PanoramaEstrada: "Você está aqui" e painel "Etapa N de 6" continuam',
  [estrada.includes('Você está aqui'), estrada.includes('Etapa {sel.numero} de {N}'), estrada.includes('onClick={escolher}')], [true, true, true]);

// ── Rota, cabeçalho, telas e seletor removidos ──
const app = lerRaiz('src/App.jsx');
t('App: /paciente/panorama redireciona para /paciente/jornada',
  app.includes('<Route path="/paciente/panorama" element={<Navigate to="/paciente/jornada" replace />} />'), true);
t('App: nenhuma importação de PanoramaTratamento', /PanoramaTratamento/.test(app), false);
t('PacienteLayout: sem cabeçalho de /paciente/panorama',
  lerRaiz('src/components/PacienteLayout.jsx').includes("'/paciente/panorama'"), false);
t('src/: ninguém cita CardPanoramaLink, PanoramaTratamento, PanoramaEtapaNutri nem navega para /paciente/panorama',
  [com(/CardPanoramaLink/), com(/PanoramaTratamento/), com(/PanoramaEtapaNutri/), com(/navigate\(\s*['"`]\/paciente\/panorama/)],
  [[], [], [], []]);
t('telas e seletor removidos não existem',
  [existe('src/app/paciente/PanoramaTratamento.jsx'), existe('src/components/CardPanoramaLink.jsx'), existe('src/app/nutri/_PanoramaEtapaNutri.jsx')],
  [false, false, false]);
t('estrada, fases e CSS continuam',
  ['src/lib/panoramaFases.js', 'src/components/PanoramaEstrada.jsx', 'src/styles/panorama.css'].map(existe), [true, true, true]);
t('migração e DESFAZER do panorama_fases continuam',
  ['supabase/migrations/2026-10-12d_panorama_fases.sql', 'supabase/desfazer/2026-10-12d_panorama_fases_DESFAZER.sql'].map(existe), [true, true]);

// ── panorama_fases: deixa de ser lida, nunca apagada ──
t('src/: nenhum .from(\'panorama_fases\') fora de comentário', comNoCodigo(/from\(\s*['"`]panorama_fases['"`]\s*\)/), []);
t('src/: nenhum drop nem delete de panorama_fases',
  [com(/drop\s+(table\s+)?(if\s+exists\s+)?(public\.)?panorama_fases/i), com(/panorama_fases['"`]\s*\)\s*\.delete\(/)], [[], []]);

console.log(`\nTZ = ${process.env.TZ}\n`);
console.log(`${ok} PASS, ${falhou} FALHA`);
if (falhou) process.exit(1);
