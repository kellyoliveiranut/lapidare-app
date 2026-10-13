/**
 * Teste standalone de novidadesNutri.js e do src/data/novidades.json.
 * Roda com `node src/lib/novidadesNutri.teste.mjs`, na raiz do repo. Sem banco.
 */
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { selecionarNovidades, mostrarConviteNotificacoes, partesDoTitulo, dispensada, marcarDispensada, valeAqui, ROTULO_PADRAO } =
  await import('./novidadesNutri.js');
const novidades = JSON.parse(readFileSync(new URL('../data/novidades.json', import.meta.url), 'utf8'));

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}
const ids = l => l.map(n => n.id);

// ── seleção ──
const ITENS = [
  { id: 1, rota: '/nutri/chat', texto: 'a' }, { id: 2, rota: '/nutri/pacientes', texto: 'b' }, { id: 3, rota: '/nutri/protocolos', texto: 'c' },
  { id: 4, rota: null, texto: 'd' }, { id: 5, rota: '/nutri/visao', texto: 'e' }, { id: 6, rota: null, texto: 'f' }, { id: 7, rota: null, texto: 'g' },
];
t('item de outra rota não aparece; global aparece', ids(selecionarNovidades({ itens: ITENS, rotaAtual: '/nutri/agenda', vistas: {} })), [7, 6, 4]);
t('mais novo primeiro', ids(selecionarNovidades({ itens: [ITENS[3], ITENS[6], ITENS[5]], rotaAtual: '/x', vistas: {} })), [7, 6, 4]);
const todosGlobais = ITENS.map(n => ({ ...n, rota: null }));
t('max 3: com 7 itens saem os 3 mais novos', ids(selecionarNovidades({ itens: todosGlobais, rotaAtual: '/nutri/visao', vistas: {} })), [7, 6, 5]);
t('max configurável (1) e 0', [ids(selecionarNovidades({ itens: todosGlobais, rotaAtual: '/', vistas: {}, max: 1 })), selecionarNovidades({ itens: todosGlobais, rotaAtual: '/', max: 0 })], [[7], []]);
t('sub-rota vale (prefixo + "/"); /nutri/chatbot não casa com /nutri/chat',
  [valeAqui(ITENS[1], '/nutri/pacientes/abc'), valeAqui(ITENS[0], '/nutri/chatbot')], [true, false]);
t('dispensado por id (formato novo) some e os outros ficam',
  ids(selecionarNovidades({ itens: ITENS, rotaAtual: '/nutri/visao', vistas: marcarDispensada({}, { id: 7 }) })), [6, 5, 4]);
t('marcarDispensada grava "#id" com o id em texto e não perde o resto', marcarDispensada({ '*': '4' }, { id: 6 }), { '*': '4', '#6': '6' });
// Quem dispensou os 5 antigos no formato de hoje (um id por balde) vê só 6 e 7.
const VISTAS_ANTIGAS = { '/nutri/chat': '1', '/nutri/pacientes': '2', '/nutri/protocolos': '3', '*': '4', '/nutri/visao': '5' };
for (const rota of ['/nutri/chat', '/nutri/pacientes/xyz', '/nutri/protocolos', '/nutri/visao', '/nutri/agenda']) {
  t(`formato antigo em ${rota}: dispensou os 5 → vê só 7 e 6`, ids(selecionarNovidades({ itens: ITENS, rotaAtual: rota, vistas: VISTAS_ANTIGAS })), [7, 6]);
}
t('formato antigo: id antigo do balde global esconde os globais até ele, não os mais novos', [dispensada({ id: 4, rota: null }, { '*': '4' }), dispensada({ id: 6, rota: null }, { '*': '4' })], [true, false]);
t('vistas vazio, nulo, lixo ou array não quebram', [null, undefined, 'x', [1], 5].map(v => ids(selecionarNovidades({ itens: [ITENS[6]], rotaAtual: '/', vistas: v }))), [[7], [7], [7], [7], [7]]);
t('itens vazio/nulo/sem campos novos não quebram', [selecionarNovidades({ itens: [] }), selecionarNovidades({ itens: null }), selecionarNovidades(),
  ids(selecionarNovidades({ itens: [{ id: 9, texto: 'só o básico' }, null, { texto: 'sem id' }], rotaAtual: '/a' }))], [[], [], [], [9]]);

// ── partesDoTitulo ──
t('um trecho forte', partesDoTitulo('Novo: **Panorama** da paciente'), [{ texto: 'Novo: ', forte: false }, { texto: 'Panorama', forte: true }, { texto: ' da paciente', forte: false }]);
t('dois trechos fortes', partesDoTitulo('**A** e **B**'), [{ texto: 'A', forte: true }, { texto: ' e ', forte: false }, { texto: 'B', forte: true }]);
t('sem marcador', partesDoTitulo('texto simples'), [{ texto: 'texto simples', forte: false }]);
t('marcador sem par vira texto normal', partesDoTitulo('a **b'), [{ texto: 'a **b', forte: false }]);
t('um par e um marcador sem par', partesDoTitulo('**x** y **z'), [{ texto: 'x', forte: true }, { texto: ' y **z', forte: false }]);
t('<b>x</b> continua texto (nada de HTML)', partesDoTitulo('<b>x</b>'), [{ texto: '<b>x</b>', forte: false }]);
t('vazio, nulo e indefinido → []', [partesDoTitulo(''), partesDoTitulo(null), partesDoTitulo(undefined)], [[], [], []]);

// ── convite de notificações ──
const AGORA = Date.UTC(2026, 9, 12, 12);
const base = { suportado: true, permissao: 'default', temInscricao: false, sonecaAte: 0, agora: AGORA };
t('suportado + default + sem inscrição → mostra', mostrarConviteNotificacoes(base), true);
t('granted sem inscrição → mostra', mostrarConviteNotificacoes({ ...base, permissao: 'granted' }), true);
t('denied → não', mostrarConviteNotificacoes({ ...base, permissao: 'denied' }), false);
t('com inscrição → não', mostrarConviteNotificacoes({ ...base, permissao: 'granted', temInscricao: true }), false);
t('inscrição ainda desconhecida (null) → não', mostrarConviteNotificacoes({ ...base, temInscricao: null }), false);
t('sem suporte → não', mostrarConviteNotificacoes({ ...base, suportado: false }), false);
t('dentro da soneca → não', mostrarConviteNotificacoes({ ...base, sonecaAte: AGORA + 1000 }), false);
t('depois da soneca → mostra', mostrarConviteNotificacoes({ ...base, sonecaAte: AGORA - 1000 }), true);
t('sem argumentos → não', mostrarConviteNotificacoes(), false);

// ── o JSON ──
const i6 = novidades.find(n => n.id === 6), i7 = novidades.find(n => n.id === 7);
t('item 6 com os textos exatos', i6 && [i6.data, i6.rota, i6.rotulo, i6.titulo, i6.apoio, i6.icone, i6.destino],
  ['2026-10-12', null, 'NOVIDADE NA SUA ÁREA', 'Novo: **Panorama do tratamento** da paciente',
   'Defina a etapa (1 a 6) na aba Oncologia da ficha e a paciente vê a estrada do acompanhamento — clica aqui pra abrir as pacientes', 'road', '/nutri/pacientes']);
t('item 7 com os textos exatos', i7 && [i7.data, i7.rota, i7.rotulo, i7.titulo, i7.apoio, i7.icone, i7.destino],
  ['2026-10-12', null, 'NOVIDADE NA SUA ÁREA', 'Novo: **avisos de check-in** e de alerta oncológico',
   'Você recebe aviso (e push, se estiver ativado) quando a paciente responde o check-in e quando há sinal de alerta — clica aqui pra ver os avisos', 'bell', '/nutri/avisos']);
t('todo destino do JSON começa com "/"', novidades.filter(n => n.destino != null && !String(n.destino).startsWith('/')).map(n => n.id), []);
t('ids únicos e os 5 antigos sem mudança de texto', [new Set(novidades.map(n => n.id)).size === novidades.length, novidades.filter(n => n.id <= 5).map(n => n.texto.slice(0, 20))],
  [true, ['No Chat, o nome da p', 'Na aba Oncologia, a ', 'O botão Lâmina da pa', 'Nova tela Protocolos', 'Quem nunca ativou as']]);
t('rótulo padrão', ROTULO_PADRAO, 'NOVIDADE NA SUA ÁREA');
t('nenhum texto com promessa ou "antes e depois"', novidades.filter(n => /cura|antes e depois|garant/i.test(JSON.stringify(n))).length, 0);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
