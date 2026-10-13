/**
 * Teste standalone de selosMenuNutri.js. Roda com `node src/lib/selosMenuNutri.teste.mjs`. Sem banco.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { contarSelos, tiposParaMarcarAoAbrir, rotuloSelo, TIPOS_COM_SELO, SELO_POR_TIPO } = await import('./selosMenuNutri.js');
const { TIPOS_AVISOS_LISTA } = await import('./avisosNutri.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const so = tipo => contarSelos([{ tipo }]);
t('contrato_assinado só em Avisos', so('contrato_assinado'), { chat: 0, avisos: 1, checkins: 0, oncologia: 0, feed: 0, total: 1 });
t('checkin_respondido só em Check-ins', so('checkin_respondido'), { chat: 0, avisos: 0, checkins: 1, oncologia: 0, feed: 0, total: 1 });
t('checkin_diario só em Check-ins', so('checkin_diario'), { chat: 0, avisos: 0, checkins: 1, oncologia: 0, feed: 0, total: 1 });
t('alerta_oncologico só em Oncologia', so('alerta_oncologico'), { chat: 0, avisos: 0, checkins: 0, oncologia: 1, feed: 0, total: 1 });
t('foto_prato só no Feed', so('foto_prato'), { chat: 0, avisos: 0, checkins: 0, oncologia: 0, feed: 1, total: 1 });
t('tipo desconhecido, null e linha sem tipo não contam', contarSelos([{ tipo: 'xyz' }, null, {}, { tipo: null }]),
  { chat: 0, avisos: 0, checkins: 0, oncologia: 0, feed: 0, total: 0 });
t('lista vazia, null e undefined', [contarSelos([]), contarSelos(null), contarSelos(undefined)].map(x => x.total), [0, 0, 0]);

const mistura = [
  { tipo: 'contrato_assinado' }, { tipo: 'checkin_respondido' }, { tipo: 'checkin_diario' }, { tipo: 'checkin_diario' },
  { tipo: 'alerta_oncologico' }, { tipo: 'foto_prato' }, { tipo: 'foto_prato' }, { tipo: 'foto_prato' }, { tipo: 'xyz' },
];
t('mistura + chat: cada um no seu selo; total = soma sem duplicar', contarSelos(mistura, { chat: 2 }),
  { chat: 2, avisos: 1, checkins: 3, oncologia: 1, feed: 3, total: 10 });
t('chat inválido (negativo, texto, NaN) vira 0', [contarSelos([], { chat: -1 }), contarSelos([], { chat: '3' }), contarSelos([], { chat: NaN })].map(x => x.chat), [0, 0, 0]);
t('feed passado de fora é ignorado (o Feed sai dos avisos foto_prato)', contarSelos([], { chat: 0, feed: 5 }).feed, 0);

t('cada tipo da lista da página Avisos tem selo, e foto_prato também', [TIPOS_AVISOS_LISTA.every(k => SELO_POR_TIPO[k]), TIPOS_COM_SELO.includes('foto_prato'), TIPOS_COM_SELO.length], [true, true, 5]);

t('abrir /nutri/checkins marca formulário e diário', tiposParaMarcarAoAbrir('/nutri/checkins'), ['checkin_respondido', 'checkin_diario']);
t('abrir /nutri/monitoramento-oncologico marca só o diário (o alerta não sai ao abrir tela)', tiposParaMarcarAoAbrir('/nutri/monitoramento-oncologico'), ['checkin_diario']);
t('nenhuma rota marca alerta_oncologico ao abrir', ['/nutri/checkins', '/nutri/monitoramento-oncologico', '/nutri/avisos', '/nutri/feed', '/nutri/visao'].filter(r => tiposParaMarcarAoAbrir(r).includes('alerta_oncologico')), []);
t('outras rotas não marcam nada (Avisos, Feed, Agenda, sub-rota, vazio)',
  ['/nutri/avisos', '/nutri/feed', '/nutri/agenda', '/nutri/checkins/x', '', null, undefined].map(tiposParaMarcarAoAbrir), [[], [], [], [], [], [], []]);
t('rótulo do selo', [rotuloSelo(1), rotuloSelo(3)], ['1 novo', '3 novos']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
