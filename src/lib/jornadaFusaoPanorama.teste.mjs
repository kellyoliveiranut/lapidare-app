/**
 * Teste standalone da fusão do Panorama na Minha jornada (bloco-115).
 * Roda com `node src/lib/jornadaFusaoPanorama.teste.mjs`, sem framework.
 * Só leitura de fonte: sem git, sem rede, sem banco.
 *
 * A estrada das 6 etapas mora na Minha jornada, só para Oncologia; a tela e
 * os cartões do Panorama saíram; a rota antiga redireciona para a jornada.
 * A tabela panorama_fases, a migração e o DESFAZER ficam como estão.
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

// ── Jornada.jsx ──
const jor = lerRaiz('src/app/paciente/Jornada.jsx');
const TRILHA = '<TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />';
t('Jornada: importa a estrada e as funções do Panorama',
  [jor.includes("import PanoramaEstrada from '../../components/PanoramaEstrada.jsx';"),
    jor.includes("import { faseValida, textoEstado } from '../../lib/panoramaFases.js';")], [true, true]);
t('Jornada: onco = objetivo Oncologia (mesma fonte do Panorama)',
  jor.includes("const onco = profile?.objetivo === 'Oncologia';"), true);
const efeito = jor.slice(jor.indexOf('useEffect(() => {'), jor.indexOf('}, [pacienteId, onco, avulsa]);'));
t('Jornada: leitura de panorama_fases só dentro do efeito, depois da guarda de Oncologia',
  [conta(jor, /from\('panorama_fases'\)/g), efeito.includes("from('panorama_fases')"),
    efeito.indexOf('if (!pacienteId || !onco || avulsa) return;') >= 0
      && efeito.indexOf('if (!pacienteId || !onco || avulsa) return;') < efeito.indexOf("from('panorama_fases')")],
  [1, true, true]);
t('Jornada: só leitura (select + maybeSingle), nenhuma gravação',
  [efeito.includes(".select('fase').eq('paciente_id', pacienteId).maybeSingle()"), /\.(insert|update|upsert|delete)\(/.test(jor)],
  [true, false]);
t('Jornada: erro ou rejeição da leitura = fase nula',
  [efeito.includes('fase: !error && faseValida(data?.fase) ? data.fase : null'),
    efeito.includes('() => { if (vivo) setEtapa({ pronta: true, fase: null }); }')], [true, true]);
const iNaoOnco = jor.indexOf(`if (!onco) return ${TRILHA}`);
t('Jornada: quem não é Oncologia recebe só a trilha, antes de qualquer estrada',
  [iNaoOnco >= 0, iNaoOnco < jor.indexOf('<PanoramaEstrada')], [true, true]);
t('Jornada: Oncologia vê a estrada ACIMA da trilha',
  [conta(jor, /<TrilhaJornada /g), jor.indexOf('<PanoramaEstrada') < jor.lastIndexOf(TRILHA)], [2, true]);
t('Jornada: a trilha não espera a fase (nenhum return condicionado a etapa.pronta)',
  /if \(!?etapa\.pronta\)/.test(jor), false);
t('Jornada: estrada com key pela fase',
  jor.includes("<PanoramaEstrada key={etapa.fase ?? 'sem'} fase={etapa.fase} />"), true);
t('Jornada: título da seção, frase de estado e rodapé informativo',
  [jor.includes('As etapas do seu acompanhamento nutricional.'),
    jor.includes('etapa.pronta && etapa.fase == null') && jor.includes('{textoEstado(null)}'),
    jor.includes('Conteúdo informativo. Seu plano é individual e definido pela sua nutricionista.')],
  [true, true, true]);
t('Jornada: useJornada importado e chamado como antes; Avulsa barrada como antes',
  [jor.includes("import { useJornada } from '../../lib/useJornada.js';"), conta(jor, /useJornada/g),
    jor.includes('useJornada(pacienteId, !!profile && !avulsa)'), jor.includes('if (avulsa) return null;'),
    jor.includes("import { TrilhaJornada } from './_Jornada.jsx';")],
  [true, 3, true, true, true]);

// ── Rota, cabeçalho e telas removidas ──
const app = lerRaiz('src/App.jsx');
t('App: /paciente/panorama redireciona para /paciente/jornada',
  app.includes('<Route path="/paciente/panorama" element={<Navigate to="/paciente/jornada" replace />} />'), true);
t('App: nenhuma importação de PanoramaTratamento', /PanoramaTratamento/.test(app), false);
t('PacienteLayout: sem cabeçalho de /paciente/panorama',
  lerRaiz('src/components/PacienteLayout.jsx').includes("'/paciente/panorama'"), false);
t('src/: ninguém cita CardPanoramaLink, PanoramaTratamento nem navega para /paciente/panorama',
  [com(/CardPanoramaLink/), com(/PanoramaTratamento/), com(/navigate\(\s*['"`]\/paciente\/panorama/)], [[], [], []]);
t('telas removidas não existem',
  [existe('src/app/paciente/PanoramaTratamento.jsx'), existe('src/components/CardPanoramaLink.jsx')], [false, false]);
t('estrada, fases e CSS continuam',
  ['src/lib/panoramaFases.js', 'src/components/PanoramaEstrada.jsx', 'src/styles/panorama.css'].map(existe), [true, true, true]);
t('migração e DESFAZER do panorama_fases continuam',
  ['supabase/migrations/2026-10-12d_panorama_fases.sql', 'supabase/desfazer/2026-10-12d_panorama_fases_DESFAZER.sql'].map(existe), [true, true]);

// ── Seletor da nutri e panorama_fases ──
const sel = lerRaiz('src/app/nutri/_PanoramaEtapaNutri.jsx');
t('nutri: seletor ainda faz upsert em panorama_fases por paciente',
  sel.includes(".from('panorama_fases')\n          .upsert({ paciente_id: pacienteId, nutri_id: nutriId, fase }, { onConflict: 'paciente_id' })"), true);
t('panorama_fases citada em src/ só na Jornada e no seletor da nutri (e no comentário de panoramaFases.js)',
  com(/panorama_fases/),
  ['src/app/nutri/_PanoramaEtapaNutri.jsx', 'src/app/paciente/Jornada.jsx', 'src/lib/panoramaFases.js']);
t('src/: nenhum drop de panorama_fases', com(/drop\s+(table\s+)?(if\s+exists\s+)?(public\.)?panorama_fases/i), []);
// O único delete é o de antes: "Não definida" apaga a linha DA paciente.
t('src/: único delete em panorama_fases é o do seletor, filtrado pela paciente',
  [com(/from\('panorama_fases'\)\.delete\(/), conta(sel, /\.delete\(/g),
    sel.includes("from('panorama_fases').delete().eq('paciente_id', pacienteId)")],
  [['src/app/nutri/_PanoramaEtapaNutri.jsx'], 1, true]);
t('nutri: textos novos do seletor',
  [conta(sel, /Fase da jornada/g), sel.includes('aria-label="Fase da jornada"'),
    sel.includes('A paciente vê esta fase destacada na estrada da Minha jornada. Ela não muda sozinha.'),
    sel.includes('Etapa do Panorama do tratamento')],
  [2, true, true, false]);
t('nutri: botão, mensagens e opção mantidos',
  ["'Salvar etapa'", "'Etapa salva.'", "'Etapa removida.'", '>Não definida<'].map(x => sel.includes(x)), [true, true, true, true]);

console.log(`\nTZ = ${process.env.TZ}\n`);
console.log(`${ok} PASS, ${falhou} FALHA`);
if (falhou) process.exit(1);
