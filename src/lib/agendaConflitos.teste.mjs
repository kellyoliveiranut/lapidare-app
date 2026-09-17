/**
 * Teste standalone das funções puras de agendaConflitos.js.
 * Roda com `node`, sem framework. O módulo não importa supabase no topo,
 * justamente para isto ser possível.
 *
 * O fuso é fixado em process.env.TZ ANTES de qualquer import, porque
 * montarDataHoraISO usa offset -03:00 fixo mas as comparações passam por
 * Date. Fixar aqui prova que o resultado não depende do fuso da máquina.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO, e nao estatico: os imports de ESM sao avaliados ANTES
// de qualquer linha do corpo, e o process.env.TZ acima precisa valer antes
// de o modulo (e o utils.js) carregarem.
const M = await import('./agendaConflitos.js');
const { intervalosSeCruzam, bloqueioCobre, horaMais, intervaloConsulta, hhmm } = M;

let ok = 0, falhou = 0;
const casos = [];

function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// ─── intervalosSeCruzam ──────────────────────────────────────────────
const iv = (d, h, m) => intervaloConsulta(d, h, m);
const D = '2026-09-21';   // segunda-feira comum

t('cruzam', 'idênticos 14:00+45 vs 14:00+45',
  intervalosSeCruzam(iv(D, '14:00', 45), iv(D, '14:00', 45)), true);
t('cruzam', 'ENCOSTAM 14:00+45 vs 14:45+45 (não cruza)',
  intervalosSeCruzam(iv(D, '14:00', 45), iv(D, '14:45', 45)), false);
t('cruzam', 'encavala por 15min: 14:00+60 vs 14:45+45',
  intervalosSeCruzam(iv(D, '14:00', 60), iv(D, '14:45', 45)), true);
t('cruzam', 'longa engole curta: 14:00+120 vs 15:00+30',
  intervalosSeCruzam(iv(D, '14:00', 120), iv(D, '15:00', 30)), true);
t('cruzam', 'ordem inversa dá o mesmo: 15:00+30 vs 14:00+120',
  intervalosSeCruzam(iv(D, '15:00', 30), iv(D, '14:00', 120)), true);
t('cruzam', 'dias diferentes, mesma hora',
  intervalosSeCruzam(iv('2026-09-21', '14:00', 45), iv('2026-09-22', '14:00', 45)), false);
t('cruzam', 'duração zero não cruza nada',
  intervalosSeCruzam(iv(D, '14:00', 0), iv(D, '14:00', 45)), false);
t('cruzam', 'distantes no mesmo dia: 08:00+30 vs 17:00+30',
  intervalosSeCruzam(iv(D, '08:00', 30), iv(D, '17:00', 30)), false);

// ─── bloqueioCobre ───────────────────────────────────────────────────
const diaInteiro = { data: D, hora_inicio: null, hora_fim: null };
const faixa      = { data: D, hora_inicio: '14:00:00', hora_fim: '16:00:00' };
const item = (h, m = 45) => ({ data: D, hora: h, duracaoMin: m });

t('bloqueio', 'dia inteiro pega 08:00',  bloqueioCobre(diaInteiro, item('08:00')), true);
t('bloqueio', 'dia inteiro pega 17:30',  bloqueioCobre(diaInteiro, item('17:30')), true);
t('bloqueio', 'dia inteiro de OUTRA data não pega',
  bloqueioCobre({ ...diaInteiro, data: '2026-09-22' }, item('08:00')), false);
t('bloqueio', 'faixa 14-16 pega 14:00',  bloqueioCobre(faixa, item('14:00')), true);
t('bloqueio', 'faixa 14-16 pega 15:30',  bloqueioCobre(faixa, item('15:30')), true);
t('bloqueio', 'faixa 14-16 NÃO pega 16:00 (fim exclusivo)',
  bloqueioCobre(faixa, item('16:00')), false);
t('bloqueio', 'faixa 14-16 NÃO pega 13:00+45 (termina 13:45)',
  bloqueioCobre(faixa, item('13:00', 45)), false);
t('bloqueio', 'faixa 14-16 PEGA 13:30+45 (entra às 14:15)',
  bloqueioCobre(faixa, item('13:30', 45)), true);
t('bloqueio', 'aceita HH:MM sem segundos',
  bloqueioCobre({ data: D, hora_inicio: '14:00', hora_fim: '16:00' }, item('15:00')), true);
t('bloqueio', 'bloqueio nulo não cobre', bloqueioCobre(null, item('14:00')), false);

// ─── horaMais ────────────────────────────────────────────────────────
t('horaMais', '14:00 + 45',   horaMais('14:00', 45), '14:45');
t('horaMais', '14:30 + 30',   horaMais('14:30', 30), '15:00');
t('horaMais', '17:30 + 60',   horaMais('17:30', 60), '18:30');
t('horaMais', '08:00 + 0',    horaMais('08:00', 0), '08:00');
t('horaMais', '09:05 + 55',   horaMais('09:05', 55), '10:00');
t('horaMais', 'aceita HH:MM:SS na entrada', horaMais('14:00:00', 45), '14:45');
t('horaMais', 'duração nula vira 0',        horaMais('14:00', null), '14:00');
t('horaMais', 'LIMITE CONHECIDO: 23:30+60 passa de 24h', horaMais('23:30', 60), '24:30');

// ─── hhmm ────────────────────────────────────────────────────────────
t('hhmm', 'corta segundos', hhmm('14:00:00'), '14:00');
t('hhmm', 'já curto passa',  hhmm('14:00'), '14:00');
t('hhmm', 'null vira null',  hhmm(null), null);

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
