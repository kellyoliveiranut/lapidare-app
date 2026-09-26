/**
 * Teste standalone de jornada.js. Roda com `node`, sem framework — o módulo
 * é puro, não importa supabase nem React.
 *
 * FERNANDA e JUCINEUSA reproduzem o que a conferência de 2026-09-25 achou no
 * banco: pacote abandonado + slot vazio (Jucineusa, sem linha) e slots
 * cancelados (Fernanda, 2..5 com status cancelada). Os created_at são de
 * fixture, não as linhas reais.
 */
import { montarJornada } from './jornada.js';

let ok = 0, falhou = 0;

function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) {
    console.log(`      esperado ${JSON.stringify(esperado)}`);
    console.log(`      obtido   ${JSON.stringify(obtido)}`);
  }
}

// Uma leva = linhas nascidas no mesmo instante, como o modal do pacote grava.
// Mapa no formato da query de conferência: '1R 3C 6A'
// (R realizada, A agendada, C cancelada).
const STATUS = { R: 'realizada', A: 'agendada', C: 'cancelada' };
const leva = (criada, mapa) => mapa.split(' ').map(s => ({
  tipo: s.slice(0, -1) === '1' ? 'primeira' : `consulta_${s.slice(0, -1)}`,
  status: STATUS[s.slice(-1)],
  created_at: criada,
  data_hora: null,
}));

const rodar = consultas => montarJornada({ consultas, contratos: [], planoPublicadoEm: null });
const estados = j => j.passos.filter(p => p.chave.startsWith('consulta_')).map(p => p.estado);
const slot = (j, n) => j.passos.find(p => p.chave === `consulta_${n}`).consulta;

// ─── Casos reais ─────────────────────────────────────────────────────
{
  const P1 = '2026-03-10T14:00:00.123456+00:00';
  const P2 = '2026-08-03T15:00:00.654321+00:00';
  const j = rodar([...leva(P1, '1R 2R 3R 5R 6R'), ...leva(P2, '1R 2C 3C 4C 5C 6A')]);
  t('FERNANDA: conta só o pacote 2 e desconta as canceladas (1 de 2)',
    [j.realizadas, j.total, j.concluido], [1, 2, false]);
  t('FERNANDA hoje: em andamento, fim futuro',
    [j.situacao, j.passos.at(-1).estado], ['em_andamento', 'futuro']);
  t('título sem "de N": "Consulta 6"',
    j.passos.find(p => p.chave === 'consulta_6').titulo, 'Consulta 6');
  t('FERNANDA: 2..5 canceladas, marcador na 6 agendada',
    estados(j), ['feito', 'cancelada', 'cancelada', 'cancelada', 'cancelada', 'atual']);
  t('FERNANDA: slot 6 é a agendada do pacote 2, não a realizada do 1',
    [slot(j, 6).status, slot(j, 6).created_at], ['agendada', P2]);
}
{
  const j = rodar([
    ...leva('2026-02-02T14:00:00.111111+00:00', '1R'),
    ...leva('2026-05-04T14:00:00.222222+00:00', '1R 3R 4R 5R 6A'),
  ]);
  t('JUCINEUSA: conta só o pacote 2; slot vazio não desconta (4 de 6)',
    [j.realizadas, j.total], [4, 6]);
  t('JUCINEUSA: slot 2 sem linha é pulado, marcador na 6 agendada',
    estados(j), ['feito', 'pulado', 'feito', 'feito', 'feito', 'atual']);
}

// ─── Cancelada ───────────────────────────────────────────────────────
const L = '2026-09-01T12:00:00+00:00';
const L2 = '2026-09-02T12:00:00+00:00';
{
  // Remarcação: a 3 cancelada e uma 3 nova criada depois.
  const j = rodar([...leva(L, '1R 2R 3C 4A 5A 6A'), ...leva(L2, '3A')]);
  t('remarcada: a 3 nova vale, não a cancelada',
    [slot(j, 3).status, estados(j)[2]], ['agendada', 'atual']);
}
t('cancelada ANTES de uma realizada: cancelada, não pulado (1R 2C 3R)',
  estados(rodar(leva(L, '1R 2C 3R 4A 5A 6A'))),
  ['feito', 'cancelada', 'feito', 'atual', 'futuro', 'futuro']);
{
  const j = rodar(leva(L, '1R 2C 3C 4C 5C 6C'));
  t('tudo depois da última feita cancelado: ninguém atual',
    estados(j), ['feito', 'cancelada', 'cancelada', 'cancelada', 'cancelada', 'cancelada']);
  t('tudo depois da 1 cancelado: 1 de 1, ENCERRADO, não concluído',
    [j.realizadas, j.total, j.situacao, j.concluido, j.passos.at(-1).estado],
    [1, 1, 'encerrado', false, 'encerrado']);
}
{
  // Fernanda se a 6 também for cancelada.
  const j = rodar([
    ...leva('2026-03-10T14:00:00+00:00', '1R 2R 3R 5R 6R'),
    ...leva('2026-08-03T15:00:00+00:00', '1R 2C 3C 4C 5C 6C'),
  ]);
  t('FERNANDA se a 6 for cancelada: encerrado',
    [j.realizadas, j.total, j.situacao], [1, 1, 'encerrado']);
}
{
  // Fernanda se a 6 for realizada: correu até o fim.
  const j = rodar(leva(L, '1R 2C 3C 4C 5C 6R'));
  t('FERNANDA se a 6 for realizada: 2 de 2, concluído',
    [j.realizadas, j.total, j.situacao, j.passos.at(-1).estado], [2, 2, 'concluido', 'feito']);
}
{
  const j = rodar(leva(L, '1R 2R 3R 4R 5C 6C'));
  t('parou na 4 com 5 e 6 canceladas: 4 de 4, encerrado',
    [j.realizadas, j.total, j.situacao], [4, 4, 'encerrado']);
}
{
  const j = rodar(leva(L, '1R 2C 3R 4R 5R 6R'));
  t('uma cancelada no meio e a 6 feita: 5 de 5, concluído',
    [j.realizadas, j.total, j.situacao], [5, 5, 'concluido']);
}
{
  const j = rodar(leva(L, '1R 2R 3R 4R 5C 6A'));
  t('5 cancelada e a 6 ainda agendada: em andamento, marcador na 6',
    [j.situacao, estados(j)[5]], ['em_andamento', 'atual']);
}
t('remarcada não desconta: slot com cancelada + nova segue valendo (6)',
  rodar([...leva(L, '1R 2R 3C 4A 5A 6A'), ...leva(L2, '3A')]).total, 6);
t('sem nenhuma consulta: total 6, em andamento, vazia',
  [rodar([]).total, rodar([]).situacao, rodar([]).vazia], [6, 'em_andamento', true]);
t('cancelada depois do marcador continua cancelada (1R 2A 3C)',
  estados(rodar(leva(L, '1R 2A 3C 4A 5A 6A'))),
  ['feito', 'atual', 'cancelada', 'futuro', 'futuro', 'futuro']);
{
  // Cancelada do pacote anterior não vaza para o atual.
  const j = rodar([...leva(L, '1R 2C'), ...leva(L2, '1A')]);
  t('cancelada do pacote 1 não aparece no pacote 2', slot(j, 2), null);
}
{
  // Primeira cancelada mais nova NÃO vira âncora.
  const j = rodar([...leva(L, '1R 2R 3A 4A 5A 6A'), ...leva(L2, '1C')]);
  t('primeira cancelada não abre pacote novo', [j.realizadas, estados(j)[2]], [2, 'atual']);
}

// ─── Regressão ───────────────────────────────────────────────────────
t('sequencial 1R 2R 3A..6A: marcador na 3',
  estados(rodar(leva(L, '1R 2R 3A 4A 5A 6A'))),
  ['feito', 'feito', 'atual', 'futuro', 'futuro', 'futuro']);
t('nenhuma feita: marcador na 1',
  estados(rodar(leva(L, '1A 2A 3A 4A 5A 6A'))),
  ['atual', 'futuro', 'futuro', 'futuro', 'futuro', 'futuro']);
{
  const j = rodar(leva(L, '1R 2R 3R 4R 5R 6R'));
  t('seis feitas: 6 de 6, concluído, fim feito',
    [j.realizadas, j.total, j.situacao, j.concluido, j.passos.at(-1).estado],
    [6, 6, 'concluido', true, 'feito']);
  t('seis feitas: ninguém atual', estados(j).includes('atual'), false);
}
t('vazio DEPOIS da última feita continua sendo o atual (1R 3A)',
  estados(rodar(leva(L, '1R 3A'))),
  ['feito', 'atual', 'futuro', 'futuro', 'futuro', 'futuro']);
t('agendada antiga antes de uma feita é pulada (1R 2A 3R)',
  estados(rodar(leva(L, '1R 2A 3R'))),
  ['feito', 'pulado', 'feito', 'atual', 'futuro', 'futuro']);

// ─── Borda em aberto (fixa o comportamento atual, não uma decisão) ───
{
  const j = rodar(leva(L, '1R 2R 3R 5R 6R'));
  t('última feita é a 6 com a 4 vazia: 4 pulada, sem atual',
    estados(j), ['feito', 'feito', 'feito', 'pulado', 'feito', 'feito']);
  t('última feita é a 6 com a 4 vazia: 5 de 6, em andamento',
    [j.realizadas, j.total, j.situacao], [5, 6, 'em_andamento']);
}

console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
