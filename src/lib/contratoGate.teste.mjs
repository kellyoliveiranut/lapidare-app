/**
 * Teste standalone de decidirGateContrato() (contratoEssentia.js).
 * Roda com `node src/lib/contratoGate.teste.mjs`, sem framework e sem banco.
 */
const { decidirGateContrato, TELAS_LIBERADAS_SEM_CONTRATO } = await import('./contratoEssentia.js');

let ok = 0, falhou = 0;
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`  ${passou ? 'PASS ' : 'FALHA'} [${grupo}] ${nome}`);
  if (!passou) console.log(`        esperado: ${JSON.stringify(esperado)}\n        obtido:   ${JSON.stringify(obtido)}`);
}

const CARREGANDO = { status: 'carregando' };
const ERRO       = { status: 'erro' };
const SEM_LINHA  = { status: 'ok', pendente: false, previa: null };
const COM_TEXTO  = { status: 'ok', pendente: true,  previa: '<p>contrato</p>' };
const SEM_CONS   = { status: 'ok', pendente: true,  previa: null };

const base = { ehEssentia: true, ativa: true, pathname: '/paciente/inicio' };
const d = (o) => decidirGateContrato({ ...base, ...o });

// Essentia ativa
t('ativa', 'carregando não deixa passar',   d({ busca: CARREGANDO }), 'carregando');
t('ativa', 'sem busca ainda = carregando',  d({ busca: undefined }),  'carregando');
t('ativa', 'erro não deixa passar',         d({ busca: ERRO }),       'erro');
t('ativa', 'sem pendente (aceito/sem linha) = app', d({ busca: SEM_LINHA }), 'app');
t('ativa', 'pendente com prévia = contrato', d({ busca: COM_TEXTO }), 'contrato');
t('ativa', 'pendente sem prévia = sem_consulta', d({ busca: SEM_CONS }), 'sem_consulta');
t('ativa', 'prévia string vazia = sem_consulta', d({ busca: { ...COM_TEXTO, previa: '' } }), 'sem_consulta');
t('ativa', 'link direto /paciente/ebooks pendente = contrato',
  d({ pathname: '/paciente/ebooks', busca: COM_TEXTO }), 'contrato');

// Fora do gate
for (const [nome, busca] of [['carregando', CARREGANDO], ['erro', ERRO], ['pendente', COM_TEXTO], ['sem consulta', SEM_CONS]]) {
  t('avulsa',     `plano avulso, ${nome} = app`,     d({ ehEssentia: false, busca }), 'app');
  t('nao-ativa',  `Essentia finalizada, ${nome} = app`, d({ ativa: false, busca }),   'app');
}

// Telas liberadas
t('liberadas', 'constante nasce vazia', TELAS_LIBERADAS_SEM_CONTRATO.size, 0);
t('liberadas', 'rota fora do Set continua no gate',
  d({ pathname: '/paciente/chat', busca: COM_TEXTO }), 'contrato');
const lib = new Set(['/paciente/monitoramento-oncologico']);
t('liberadas', 'rota no Set passa, com pendente',
  d({ pathname: '/paciente/monitoramento-oncologico', liberadas: lib, busca: COM_TEXTO }), 'app');
t('liberadas', 'rota no Set passa, carregando',
  d({ pathname: '/paciente/monitoramento-oncologico', liberadas: lib, busca: CARREGANDO }), 'app');
t('liberadas', 'outra rota com Set preenchido continua no gate',
  d({ pathname: '/paciente/inicio', liberadas: lib, busca: SEM_CONS }), 'sem_consulta');

console.log(`\n${ok} passaram, ${falhou} falharam, ${ok + falhou} no total`);
if (falhou) process.exit(1);
