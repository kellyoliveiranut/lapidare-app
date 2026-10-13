/**
 * Teste standalone de etapasJornada.js (bloco-117). Roda com
 * `node src/lib/etapasJornada.teste.mjs`, sem framework. Sem rede e sem banco.
 *
 * As jornadas saem de montarJornada com linhas no formato das queries de
 * useJornada.js (consultas: id, tipo, status, data_hora, encerrada_em,
 * created_at; contratos_essentia: id, aceito_em, created_at; planos:
 * publicado_em). Ids e datas fictícios.
 */
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { montarJornada } = await import('./jornada.js');
const { etapasDaJornada } = await import('./etapasJornada.js');
const { estadoDaEtapaNaJornada, rotuloEtapaNaJornada, estadoDaEtapa, rotuloEtapa } = await import('./panoramaFases.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// Pacote gravado num insert só: as seis com o mesmo created_at (jornada.js).
const CRIADA = '2026-09-01T13:00:00.123456+00:00';
const TIPOS = ['primeira', 'consulta_2', 'consulta_3', 'consulta_4', 'consulta_5', 'consulta_6'];
// status por slot: R realizada, A agendada, C cancelada, - sem linha.
const STATUS = { R: 'realizada', A: 'agendada', C: 'cancelada' };
function pacote(mapa, { deslocaDias = 0 } = {}) {
  return mapa.split('').flatMap((s, i) => {
    if (s === '-') return [];
    const dia = new Date(Date.UTC(2026, 8, 3 + i * 21 + deslocaDias, 13, 0));
    const dataHora = dia.toISOString().replace('Z', '+00:00');
    return [{
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      tipo: TIPOS[i],
      status: STATUS[s],
      data_hora: dataHora,
      encerrada_em: s === 'R' ? dataHora : null,
      created_at: CRIADA,
    }];
  });
}
const CONTRATOS = [{ id: 'c0000000-0000-4000-8000-000000000001', aceito_em: '2026-09-01T12:00:00+00:00', created_at: '2026-09-01T11:00:00+00:00' }];
const jornadaDe = (mapa, opc) => montarJornada({ consultas: pacote(mapa, opc), contratos: CONTRATOS, planoPublicadoEm: '2026-09-05T15:00:00+00:00' });
const etapas = (mapa, opc) => etapasDaJornada(jornadaDe(mapa, opc));
const VAZIO = { atual: null, concluidas: [], todas: false };

// ── Sem jornada ──
t('jornada nula (erro ou sem carga)', etapasDaJornada(null), VAZIO);
t('jornada undefined', etapasDaJornada(undefined), VAZIO);
t('jornada vazia (sem consulta de pacote)',
  [jornadaDe('------').vazia, etapasDaJornada(jornadaDe('------'))], [true, VAZIO]);
t('só consultas fora do pacote (avulsa/retorno) = vazia',
  etapasDaJornada(montarJornada({ consultas: [{ id: 'x', tipo: 'avulsa', status: 'realizada', data_hora: null, encerrada_em: null, created_at: CRIADA }], contratos: [], planoPublicadoEm: null })),
  VAZIO);

// ── Avanço ──
t('só a consulta 1 marcada: atual 1, nenhuma concluída', etapas('A-----'), { atual: 1, concluidas: [], todas: false });
t('pacote de 6 agendado, nada feito: atual 1', etapas('AAAAAA'), { atual: 1, concluidas: [], todas: false });
t('consulta 1 realizada: concluída [1], atual 2', etapas('RAAAAA'), { atual: 2, concluidas: [1], todas: false });
t('1 e 2 realizadas, 3 cancelada: a 3 não fica verde; atual = 4 (a jornada pula a cancelada)',
  [estadosConsultas(jornadaDe('RRCAAA')), etapas('RRCAAA')],
  [['feito', 'feito', 'cancelada', 'atual', 'futuro', 'futuro'], { atual: 4, concluidas: [1, 2], todas: false }]);
t('1, 2 e 4 realizadas, 3 sem linha (pulada): a 3 não fica verde; atual 5',
  [estadosConsultas(jornadaDe('RR-RAA')), etapas('RR-RAA')],
  [['feito', 'feito', 'pulado', 'feito', 'atual', 'futuro'], { atual: 5, concluidas: [1, 2, 4], todas: false }]);
t('5 realizadas: atual 6', etapas('RRRRRA'), { atual: 6, concluidas: [1, 2, 3, 4, 5], todas: false });
t('6 realizadas: todas, nenhuma atual',
  [jornadaDe('RRRRRR').situacao, etapas('RRRRRR')], ['concluido', { atual: null, concluidas: [1, 2, 3, 4, 5, 6], todas: true }]);
t('pacote encerrado sem concluir (1 e 2 realizadas, 3..6 canceladas): só as realizadas, sem atual',
  [jornadaDe('RRCCCC').situacao, etapas('RRCCCC')], ['encerrado', { atual: null, concluidas: [1, 2], todas: false }]);
t('concluído com uma cancelada no meio: não é "todas"; sem atual',
  [jornadaDe('RRCRRR').situacao, etapas('RRCRRR')], ['concluido', { atual: null, concluidas: [1, 2, 4, 5, 6], todas: false }]);

// ── Sem datas ──
t('mesmo resultado com as datas deslocadas 400 dias',
  ['A-----', 'RRCAAA', 'RRRRRA', 'RRRRRR'].map(m => JSON.stringify(etapas(m, { deslocaDias: 400 })) === JSON.stringify(etapas(m))),
  [true, true, true, true]);
const fonte = readFileSync(new URL('./etapasJornada.js', import.meta.url), 'utf8');
t('etapasJornada.js não lê data nem relógio',
  [/\bDate\b|data_hora|encerrada_em|created_at|publicado_em|aceito_em|toLocale|Intl\./.test(fonte.replace(/^\s*\/\/.*$/gm, ''))], [false]);

// ── Estados e rótulos da estrada (panoramaFases.js) ──
const e = etapas('RR-RAA');
t('estado por etapa (1,2,4 concluídas; 3 pulada; 5 atual; 6 próxima)',
  [1, 2, 3, 4, 5, 6].map(n => estadoDaEtapaNaJornada(n, e)), ['percorrida', 'percorrida', null, 'percorrida', 'atual', 'proxima']);
t('rótulos reaproveitam os textos de rotuloEtapa',
  [rotuloEtapaNaJornada(1, e), rotuloEtapaNaJornada(3, e), rotuloEtapaNaJornada(5, e), rotuloEtapaNaJornada(6, e)],
  [rotuloEtapa(1, 2), rotuloEtapa(3, null), rotuloEtapa(5, 5), rotuloEtapa(6, 5)]);
t('sem jornada: nenhuma etapa com estado (como sem fase definida)',
  [1, 2, 3, 4, 5, 6].map(n => estadoDaEtapaNaJornada(n, VAZIO)), [1, 2, 3, 4, 5, 6].map(n => estadoDaEtapa(n, null)));
t('todas: as 6 percorridas', [1, 2, 3, 4, 5, 6].map(n => estadoDaEtapaNaJornada(n, etapas('RRRRRR'))), Array(6).fill('percorrida'));

function estadosConsultas(j) {
  return j.passos.filter(p => p.chave.startsWith('consulta_')).map(p => p.estado);
}

console.log(`\nTZ = ${process.env.TZ}\n`);
console.log(`${ok} PASS, ${falhou} FALHA`);
if (falhou) process.exit(1);
