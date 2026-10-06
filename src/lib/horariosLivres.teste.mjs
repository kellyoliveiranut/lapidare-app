/**
 * Teste standalone de horariosLivres() (agendaConflitos.js).
 * Roda com `node src/lib/horariosLivres.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como no
 * agendaConflitos.teste.mjs: a grade é relógio de Belém (montarDataHoraISO usa
 * -03:00 fixo) e o cruzamento passa por Date. Rodar com TZ_TESTE em outros
 * fusos prova que a lista não depende do fuso da máquina.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { horariosLivres } = await import('./agendaConflitos.js');
const { montarDataHoraISO, HORARIOS_CONSULTA } = await import('./utils.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

const D = '2026-09-21';   // segunda-feira comum
const G = HORARIOS_CONSULTA;
const cons = (id, hora, dur, extra = {}) =>
  ({ id, data_hora: montarDataHoraISO(D, hora), duracao_min: dur, status: 'agendada', ...extra });
// O que a lista TIRA da grade: mais legível que comparar 21 horários.
const ocupados = (opts) => {
  const livres = horariosLivres({ data: D, ...opts });
  return G.filter(h => !livres.includes(h));
};

// ─── base ────────────────────────────────────────────────────────────
t('base', 'dia vazio: a grade inteira (21 horários, 08:00 a 18:00)',
  horariosLivres({ data: D, duracaoMin: 30 }), G);
t('base', 'grade começa 08:00 e termina 18:00 (último início)', [G[0], G[G.length - 1], G.length], ['08:00', '18:00', 21]);
t('base', '18:00 com 90 min é oferecido (termina 19:30)',
  horariosLivres({ data: D, duracaoMin: 90 }).includes('18:00'), true);
t('base', 'sem data: lista vazia', horariosLivres({ data: '', duracaoMin: 30 }), []);
t('base', 'duração zero: lista vazia', horariosLivres({ data: D, duracaoMin: 0 }), []);
t('base', 'duração como string "50" funciona igual a 50',
  ocupados({ duracaoMin: '50', consultas: [cons('a', '15:00', 45)] }),
  ocupados({ duracaoMin: 50, consultas: [cons('a', '15:00', 45)] }));

// ─── encostar x cruzar ───────────────────────────────────────────────
t('cruzar', 'ENCOSTA sem cruzar: 13:30+30 termina 14:00, livre; só 14:00 sai',
  ocupados({ duracaoMin: 30, consultas: [cons('a', '14:00', 30)] }), ['14:00']);
t('cruzar', 'CRUZA: com 60 min, 13:30 (até 14:30) sai; 13:00 encosta e fica',
  ocupados({ duracaoMin: 60, consultas: [cons('a', '14:00', 30)] }), ['13:30', '14:00']);
t('cruzar', 'consulta legada fora da grade (15:15+30) tira 15:00 e 15:30',
  ocupados({ duracaoMin: 30, consultas: [cons('a', '15:15', 30)] }), ['15:00', '15:30']);

// ─── durações contra uma consulta 15:00-15:45 ────────────────────────
const C1545 = [cons('a', '15:00', 45)];
t('duração', '30 min: 15:00 e 15:30 (14:30 encosta)', ocupados({ duracaoMin: 30, consultas: C1545 }), ['15:00', '15:30']);
t('duração', '45 min: 14:30, 15:00, 15:30',          ocupados({ duracaoMin: 45, consultas: C1545 }), ['14:30', '15:00', '15:30']);
t('duração', '50 min: 14:30, 15:00, 15:30 (14:00 vai até 14:50)',
  ocupados({ duracaoMin: 50, consultas: C1545 }), ['14:30', '15:00', '15:30']);
t('duração', '60 min: 14:00 encosta e fica; saem 14:30, 15:00, 15:30',
  ocupados({ duracaoMin: 60, consultas: C1545 }), ['14:30', '15:00', '15:30']);
t('duração', '90 min: 13:30 encosta e fica; saem 14:00 a 15:30',
  ocupados({ duracaoMin: 90, consultas: C1545 }), ['14:00', '14:30', '15:00', '15:30']);

// ─── bloqueios ───────────────────────────────────────────────────────
const faixa = { data: D, hora_inicio: '14:00:00', hora_fim: '16:00:00' };
t('bloqueio', 'faixa 14-16, 30 min: saem 14:00 a 15:30; 13:30 e 16:00 ficam',
  ocupados({ duracaoMin: 30, bloqueios: [faixa] }), ['14:00', '14:30', '15:00', '15:30']);
t('bloqueio', 'faixa 14-16, 60 min: 13:30 (até 14:30) também sai',
  ocupados({ duracaoMin: 60, bloqueios: [faixa] }), ['13:30', '14:00', '14:30', '15:00', '15:30']);
t('bloqueio', 'dia inteiro: nenhum horário livre',
  horariosLivres({ data: D, duracaoMin: 30, bloqueios: [{ data: D, hora_inicio: null, hora_fim: null }] }), []);
t('bloqueio', 'bloqueio de OUTRA data não tira nada',
  horariosLivres({ data: D, duracaoMin: 30, bloqueios: [{ ...faixa, data: '2026-09-22' }] }), G);

// ─── edição e linhas que não ocupam ──────────────────────────────────
const X = [cons('X', '14:00', 30)];
t('edição', 'sem ignorarIds, a própria consulta ocupa 14:00', ocupados({ duracaoMin: 30, consultas: X }), ['14:00']);
t('edição', 'com ignorarIds, a própria consulta NÃO ocupa', ocupados({ duracaoMin: 30, consultas: X, ignorarIds: ['X'] }), []);
t('edição', 'ignorarIds tira só a própria; a outra continua ocupando',
  ocupados({ duracaoMin: 30, consultas: [...X, cons('Y', '16:00', 30)], ignorarIds: ['X'] }), ['16:00']);
t('não ocupa', 'cancelada não ocupa',
  ocupados({ duracaoMin: 30, consultas: [cons('a', '14:00', 30, { status: 'cancelada' })] }), []);
t('não ocupa', '"a definir" (data_hora null) não ocupa',
  ocupados({ duracaoMin: 30, consultas: [{ id: 'a', data_hora: null, duracao_min: 30, status: 'agendada' }] }), []);
t('não ocupa', 'consulta de outro dia na lista não ocupa',
  ocupados({ duracaoMin: 30, consultas: [{ ...cons('a', '14:00', 30), data_hora: montarDataHoraISO('2026-09-22', '14:00') }] }), []);
t('não ocupa', 'realizada ocupa (só cancelada sai)',
  ocupados({ duracaoMin: 30, consultas: [cons('a', '14:00', 30, { status: 'realizada' })] }), ['14:00']);

// ─── consulta gravada sem duração conta como 30 min ──────────────────
for (const [rotulo, dur] of [['null', null], ['0', 0], ['undefined', undefined]]) {
  t('sem duração', `duracao_min ${rotulo} ocupa 14:00 como 30 min (13:30 e 14:30 ficam)`,
    ocupados({ duracaoMin: 30, consultas: [cons('a', '14:00', dur)] }), ['14:00']);
}
t('sem duração', 'duracao_min ausente do objeto também conta como 30',
  ocupados({ duracaoMin: 30, consultas: [{ id: 'a', data_hora: montarDataHoraISO(D, '14:00'), status: 'agendada' }] }), ['14:00']);
t('sem duração', 'com 60 min, a legada sem duração tira 13:30 e 14:00',
  ocupados({ duracaoMin: 60, consultas: [cons('a', '14:00', null)] }), ['13:30', '14:00']);

// ─── grade injetável ─────────────────────────────────────────────────
t('grade', 'grade própria é respeitada',
  horariosLivres({ data: D, duracaoMin: 30, grade: ['09:00', '14:00'], consultas: [cons('a', '14:00', 30)] }), ['09:00']);

// ─── saída ───────────────────────────────────────────────────────────
let grupoAtual = '';
for (const c of casos) {
  if (c.grupo !== grupoAtual) { grupoAtual = c.grupo; console.log(`\n── ${grupoAtual} ──`); }
  const marca = c.passou ? 'PASS' : 'FALHA';
  const det = c.passou ? '' : `   (esperado ${JSON.stringify(c.esperado)}, obteve ${JSON.stringify(c.obtido)})`;
  console.log(`  ${marca}  ${c.nome}${det}`);
}
console.log(`\nTZ = ${process.env.TZ} | offset real = ${new Date().getTimezoneOffset()}`);
console.log(`${ok} passaram, ${falhou} falharam, ${casos.length} no total`);
process.exit(falhou ? 1 : 0);
