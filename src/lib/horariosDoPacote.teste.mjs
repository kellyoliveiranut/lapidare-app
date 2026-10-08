/**
 * Teste standalone de horariosDoPacote() (horariosDoPacote.js).
 * Roda com `node src/lib/horariosDoPacote.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes:
 * a grade é relógio de Belém (montarDataHoraISO usa -03:00 fixo) e o
 * cruzamento passa por Date. Rodar com TZ_TESTE em outros fusos prova que a
 * lista não depende do fuso da máquina.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { horariosDoPacote } = await import('./horariosDoPacote.js');
const { montarDataHoraISO, HORARIOS_CONSULTA } = await import('./utils.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

const D1 = '2026-11-03';   // terça
const D2 = '2026-11-18';   // quarta
const G = HORARIOS_CONSULTA;
const vazio = { consultas: [], bloqueios: [], falhou: false };
const cons = (data, hora, dur = 30, extra = {}) =>
  ({ id: `${data}-${hora}`, data_hora: montarDataHoraISO(data, hora), duracao_min: dur, status: 'agendada', ...extra });
const roda = (linhas, ocupacaoPorData, duracao = 30) =>
  horariosDoPacote({ linhas, duracao, ocupacaoPorData, preferidoPadrao: '14:00' });
const valores = r => r.map(x => x.valor);

// ─── independência entre dias ────────────────────────────────────────
{
  const r = roda([{ data: D1, hora: '10:00' }, { data: D2, hora: '10:00' }], { [D1]: vazio, [D2]: vazio });
  t('dias', 'linhas em dias diferentes não se influenciam (mesma hora fica)', valores(r), ['10:00', '10:00']);
  t('dias', '... e nenhuma vem ajustada', r.map(x => x.ajustada), [false, false]);
}

// ─── o pacote contra ele mesmo ───────────────────────────────────────
{
  const r = roda([{ data: D1, hora: '10:00' }, { data: D1, hora: '10:00' }], { [D1]: vazio });
  t('pacote', 'mesmo dia e hora: a 2ª pula para o próximo livre', valores(r), ['10:00', '10:30']);
  t('pacote', '... e vem ajustada; a 1ª não', r.map(x => x.ajustada), [false, true]);
  t('pacote', 'a 2ª não oferece o horário da 1ª', r[1].opcoes.some(o => o.valor === '10:00'), false);
  t('pacote', 'a 1ª oferece o horário dela mesmo com a 2ª lá', r[0].opcoes.some(o => o.valor === '10:00'), true);
}
{
  // A 1ª nunca é afetada pela 2ª: com ou sem a 2ª, a 1ª é idêntica.
  const so1 = roda([{ data: D1, hora: '10:00' }], { [D1]: vazio });
  const com2 = roda([{ data: D1, hora: '10:00' }, { data: D1, hora: '09:30' }], { [D1]: vazio });
  t('pacote', 'a 1ª nunca é afetada pela 2ª', com2[0], so1[0]);
}
{
  const linhas = Array.from({ length: 6 }, () => ({ data: D1, hora: '10:00' }));
  const r = roda(linhas, { [D1]: vazio });
  t('pacote', 'as 6 no mesmo dia: horários diferentes, em ordem',
    valores(r), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
  t('pacote', '... todas menos a 1ª ajustadas', r.map(x => x.ajustada), [false, true, true, true, true, true]);
}
{
  // Duração 50: a 1ª às 10:00 ocupa até 10:50 — a 2ª não pode ser 10:30.
  const r = roda([{ data: D1, hora: '10:00' }, { data: D1, hora: '10:30' }], { [D1]: vazio }, 50);
  t('pacote', 'duração 50 entre linhas: a 2ª não cabe às 10:30, vai a 11:00', valores(r), ['10:00', '11:00']);
}

// ─── o banco ─────────────────────────────────────────────────────────
{
  const oc = { [D1]: { consultas: [cons(D1, '10:00', 30, { paciente_id: 'outra' })], bloqueios: [], falhou: false } };
  const r = roda([{ data: D1, hora: '10:00' }], oc);
  t('banco', 'consulta de outra paciente ocupa o horário', r[0].opcoes.some(o => o.valor === '10:00'), false);
  t('banco', '... e a linha pula, ajustada', [r[0].valor, r[0].ajustada], ['10:30', true]);
}
{
  const oc = { [D1]: { consultas: [], bloqueios: [{ data: D1, hora_inicio: '09:00:00', hora_fim: '11:00:00' }], falhou: false } };
  const r = roda([{ data: D1, hora: '09:00' }], oc);
  t('banco', 'bloqueio do dia ocupa (09:00-11:00 some)',
    ['09:00', '09:30', '10:00', '10:30'].some(h => r[0].opcoes.some(o => o.valor === h)), false);
  t('banco', '... e a linha vai para 11:00', r[0].valor, '11:00');
}
{
  const oc = { [D1]: { consultas: [], bloqueios: [{ data: D1, hora_inicio: null, hora_fim: null }], falhou: false } };
  const r = roda([{ data: D1, hora: '10:00' }], oc);
  t('banco', 'dia inteiro bloqueado: semHorario e desabilitado',
    [r[0].semHorario, r[0].desabilitado, r[0].valor], [true, true, null]);
}
{
  // Duração 50 contra o banco: consulta às 10:00-10:30, a de 50 às 09:30 não cabe.
  const oc = { [D1]: { consultas: [cons(D1, '10:00', 30)], bloqueios: [], falhou: false } };
  const r = roda([{ data: D1, hora: '09:30' }], oc, 50);
  t('banco', 'duração 50: 09:30 não cabe antes da consulta das 10:00', r[0].opcoes.some(o => o.valor === '09:30'), false);
  t('banco', 'duração 50: 09:00 cabe (09:00-09:50)', r[0].opcoes.some(o => o.valor === '09:00'), true);
}
{
  const oc = { [D1]: { consultas: [cons(D1, '15:00')], bloqueios: [], falhou: false } };
  const r = roda([{ data: D1, hora: '10:00' }], oc);
  t('banco', 'hora do estado livre: fica, sem ajuste', [r[0].valor, r[0].ajustada], ['10:00', false]);
}

// ─── leitura ─────────────────────────────────────────────────────────
{
  const r = roda([{ data: D1, hora: '10:00' }], {});
  t('leitura', 'ocupação ausente: carregando e desabilitado',
    [r[0].desabilitado, r[0].placeholder, r[0].valor], [true, 'Carregando horários…', null]);
}
{
  const oc = { [D1]: { consultas: [], bloqueios: [], falhou: true } };
  const r = roda([{ data: D1, hora: '10:00' }, { data: D1, hora: '10:00' }], oc);
  t('leitura', 'falhou: a 1ª vê a grade inteira', r[0].opcoes.map(o => o.valor), G);
  t('leitura', 'falhou: a 2ª vê a grade menos a 1ª', r[1].opcoes.map(o => o.valor), G.filter(h => h !== '10:00'));
  t('leitura', 'falhou vem marcado nas duas', r.map(x => x.falhou), [true, true]);
}
{
  const r = roda([{ data: D1, hora: '10:00' }, { data: D2, hora: '10:00' }], { [D1]: vazio });
  t('leitura', 'um dia carregando não trava o outro', [r[0].valor, r[1].desabilitado], ['10:00', true]);
}

// ─── sem data ────────────────────────────────────────────────────────
{
  const r = roda([{ data: '', hora: '10:00' }, { data: D1, hora: '10:00' }], { [D1]: vazio });
  t('sem data', 'linha sem data: desabilitada com "Escolha a data"',
    [r[0].desabilitado, r[0].placeholder, r[0].valor, r[0].ajustada], [true, 'Escolha a data', null, false]);
  t('sem data', '... e não ocupa a seguinte', [r[1].valor, r[1].ajustada], ['10:00', false]);
}
{
  t('sem data', 'lista vazia: nada', roda([], {}), []);
}

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
