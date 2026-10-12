/**
 * Teste standalone de panoramaFases.js. Roda com `node src/lib/panoramaFases.teste.mjs`. Sem banco.
 * Os itens esperados saem do texto aprovado (bloco-100), separado por "; ",
 * com a primeira letra maiúscula e sem ponto final — independente de como o
 * módulo escreveu as listas.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { FASES_PANORAMA, TOTAL_FASES_PANORAMA, faseValida, textoEstado, estadoDaEtapa, rotuloEtapa } = await import('./panoramaFases.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// Texto aprovado pela Kelly (bloco-100, seção "Fases"), literal.
const APROVADO = [
  ['Diagnóstico Nutricional de Alta Precisão', 'anamnese clínica e metabólica; composição corporal; risco de desnutrição; sintomas que afetam a ingestão; exames laboratoriais; alinhamento com a conduta médica.'],
  ['Estratégia Alimentar Terapêutica', 'plano alinhado ao tratamento; proteínas para preservar músculo; glicemia e inflamação; intestino e imunidade; suplementação; rotina prática.'],
  ['Blindagem Metabólica', 'intervenção na perda de peso; protocolos para dias críticos (ex.: pós-quimioterapia); ajustes conforme os efeitos colaterais; texturas adaptadas quando necessário.'],
  ['Manejo de Sintomas', 'náuseas e vômitos; alterações de paladar; boca seca; constipação ou diarreia; saciedade precoce.'],
  ['Reconstrução Metabólica', 'recuperar massa muscular; reorganizar o metabolismo; nutrição para cicatrização e regeneração; integração com exercício (quando liberado); reeducação do apetite; saúde intestinal.'],
  ['Longevidade e Prevenção de Recidivas', 'plano anti-inflamatório; proteção metabólica; controle de composição corporal; educação alimentar; novos marcadores de saúde; planejamento do próximo ciclo de vida.'],
];
const LINHAS = [['Diagnóstico Nutricional', 'de Alta Precisão'], ['Estratégia Alimentar', 'Terapêutica'], ['Blindagem', 'Metabólica'],
  ['Manejo', 'de Sintomas'], ['Reconstrução', 'Metabólica'], ['Longevidade e Prevenção', 'de Recidivas']];
const itensDe = s => s.replace(/\.$/, '').split('; ').map(x => x[0].toUpperCase() + x.slice(1));

t('6 fases', [FASES_PANORAMA.length, TOTAL_FASES_PANORAMA], [6, 6]);
t('números 1..6 em ordem', FASES_PANORAMA.map(f => f.numero), [1, 2, 3, 4, 5, 6]);
t('títulos exatamente os aprovados', FASES_PANORAMA.map(f => f.titulo), APROVADO.map(a => a[0]));
t('itens por fase: 6, 6, 4, 5, 6, 6', FASES_PANORAMA.map(f => f.itens.length), [6, 6, 4, 5, 6, 6]);
t('itens = texto aprovado (primeira letra maiúscula, sem ponto final)', FASES_PANORAMA.map(f => f.itens), APROVADO.map(a => itensDe(a[1])));
t('nenhum item termina com ponto', FASES_PANORAMA.flatMap(f => f.itens).filter(i => i.endsWith('.')), []);
t('linhas do título na estrada', FASES_PANORAMA.map(f => f.linhas), LINHAS);
t('linhas juntas = título', FASES_PANORAMA.map(f => f.linhas.join(' ') === f.titulo), [true, true, true, true, true, true]);
t('sem promessa de cura nem "antes e depois"', FASES_PANORAMA.filter(f => /cura|antes e depois|garant/i.test(JSON.stringify(f))).length, 0);

t('faseValida aceita 1..6', [1, 2, 3, 4, 5, 6].map(faseValida), [true, true, true, true, true, true]);
t('faseValida rejeita 0, 7, 2.5, "3", null, undefined, NaN, -1, Infinity',
  [0, 7, 2.5, '3', null, undefined, NaN, -1, Infinity].map(faseValida), [false, false, false, false, false, false, false, false, false]);

t('textoEstado sem etapa', [textoEstado(null), textoEstado('3'), textoEstado(0)],
  ['Sua nutricionista vai indicar em que etapa você está.', 'Sua nutricionista vai indicar em que etapa você está.', 'Sua nutricionista vai indicar em que etapa você está.']);
t('textoEstado na etapa 3', textoEstado(3), 'Você está na etapa 3 de 6: Blindagem Metabólica.');

t('estado das etapas com a atual = 3', [1, 2, 3, 4, 5, 6].map(n => estadoDaEtapa(n, 3)), ['percorrida', 'percorrida', 'atual', 'proxima', 'proxima', 'proxima']);
t('estado das etapas sem etapa definida', [1, 6].map(n => estadoDaEtapa(n, null)), [null, null]);
t('aria-label nos 4 casos', [rotuloEtapa(3, 3), rotuloEtapa(1, 3), rotuloEtapa(4, 3), rotuloEtapa(3, null)],
  ['Etapa 3 de 6: Blindagem Metabólica, etapa atual', 'Etapa 1 de 6: Diagnóstico Nutricional de Alta Precisão, etapa já percorrida',
   'Etapa 4 de 6: Manejo de Sintomas, próxima etapa', 'Etapa 3 de 6: Blindagem Metabólica']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
