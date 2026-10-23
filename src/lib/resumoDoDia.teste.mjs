/**
 * Teste standalone do resumo do dia da nutri
 * (netlify/functions/resumo-do-dia, CommonJS). Roda com
 * `node src/lib/resumoDoDia.teste.mjs`, na raiz do repo. Sem rede e sem banco:
 * a parte pura é chamada direto e o handler roda com supabase/web-push falsos.
 * Nomes e textos são fictícios.
 */
import { createRequire } from 'node:module';
import Module from 'node:module';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const require = createRequire(import.meta.url);
const { montarResumo, limitesDoDia, belem, primeiroNome } =
  require('../../netlify/functions/resumo-do-dia/montar.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const HOJE = '2026-10-17';
// 14:30 em Belém = 17:30 UTC
const c = (horaUTC, nome, extra = {}) => ({
  data_hora: `2026-10-17T${horaUTC}:00.000Z`, status: 'agendada', modalidade: 'online',
  local: null, paciente: { nome }, ...extra,
});
const base = { nutriNome: 'Kelly Oliveira', hojeISO: HOJE, consultas: [], bloqueios: [], lembretes: [] };
const resumo = (o) => montarResumo({ ...base, ...o });

// limites do dia em Belém
t('limitesDoDia: 07h de Belém (10:00 UTC)', limitesDoDia(Date.UTC(2026, 9, 17, 10, 0, 0)),
  { hojeISO: '2026-10-17', inicioUTC: '2026-10-17T03:00:00.000Z', fimUTC: '2026-10-18T03:00:00.000Z' });
t('limitesDoDia: 06h de Belém (09:00 UTC, horário do cron) é o mesmo dia', limitesDoDia(Date.UTC(2026, 9, 17, 9, 0, 0)),
  { hojeISO: '2026-10-17', inicioUTC: '2026-10-17T03:00:00.000Z', fimUTC: '2026-10-18T03:00:00.000Z' });
t('limitesDoDia: 06h de Belém, mesmo com o cron atrasado 15 min', limitesDoDia(Date.UTC(2026, 9, 17, 9, 15, 0)).hojeISO, '2026-10-17');
t('limitesDoDia: 02:59 UTC ainda é o dia anterior em Belém', limitesDoDia(Date.UTC(2026, 9, 17, 2, 59, 0)).hojeISO, '2026-10-16');
t('limitesDoDia: virada de mês/ano', limitesDoDia(Date.UTC(2027, 0, 1, 2, 0, 0)).hojeISO, '2026-12-31');
t('belem(): hora e data', [belem('2026-10-17T17:30:00Z'), belem('2026-10-17T02:59:00Z')],
  [{ data: '2026-10-17', hora: '14:30' }, { data: '2026-10-16', hora: '23:59' }]);

// nome da nutri
t('primeiroNome pula tratamento', [primeiroNome('Dra. Kelly Oliveira'), primeiroNome('Kelly'), primeiroNome(''), primeiroNome(null), primeiroNome('Dra.')],
  ['Kelly', 'Kelly', '', '', '']);

// sem consultas
t('sem consultas', resumo({}), { title: 'Bom dia, Kelly', body: 'Hoje você não tem consultas.', url: '/nutri/visao', icon: '/icon-192.png' });
t('sem nome da nutri → "Bom dia"', resumo({ nutriNome: null }).title, 'Bom dia');

// uma consulta (singular), online
t('uma consulta online', resumo({ consultas: [c('17:30', 'Antônia Fortunato')] }).body,
  'Hoje você tem 1 consulta:\n14:30 Antônia Fortunato (online)');

// várias, fora de ordem; presencial com e sem local; online ignora local
t('várias consultas ordenadas, modalidade e local', resumo({ consultas: [
  c('18:00', 'Beatriz Souza', { modalidade: 'presencial', local: { nome: 'Clínica Central' } }),
  c('17:30', 'Antônia Fortunato'),
  c('19:00', 'Carla Lima', { modalidade: 'presencial', local: null }),
  c('20:00', 'Dora Reis', { modalidade: 'online', local: { nome: 'Clínica Central' } }),
] }).body,
  'Hoje você tem 4 consultas:\n14:30 Antônia Fortunato (online)\n15:00 Beatriz Souza (presencial, Clínica Central)\n16:00 Carla Lima (presencial)\n17:00 Dora Reis (online)');

// exclusões
t('cancelada e realizada não entram', resumo({ consultas: [
  c('17:30', 'Antônia', { status: 'cancelada' }), c('18:00', 'Beatriz', { status: 'realizada' }),
] }).body, 'Hoje você não tem consultas.');
t('consulta de outro dia não entra', resumo({ consultas: [
  { ...c('17:30', 'Antônia'), data_hora: '2026-10-18T17:30:00.000Z' },
  { ...c('17:30', 'Beatriz'), data_hora: '2026-10-16T17:30:00.000Z' },
] }).body, 'Hoje você não tem consultas.');
t('obs da consulta nunca aparece', JSON.stringify(resumo({ consultas: [c('17:30', 'Antônia', { obs: 'SEGREDO CLÍNICO' })] })).includes('SEGREDO'), false);

// fuso: perto da meia-noite de Belém
t('23:30 de Belém (02:30 UTC de amanhã) entra hoje', resumo({ consultas: [
  { ...c('00:00', 'Noturna'), data_hora: '2026-10-18T02:30:00.000Z' },
] }).body, 'Hoje você tem 1 consulta:\n23:30 Noturna (online)');
t('00:30 de Belém (03:30 UTC) entra hoje; 02:59 UTC do mesmo dia (23:59 de ontem) não', resumo({ consultas: [
  { ...c('00:00', 'Madrugada'), data_hora: '2026-10-17T03:30:00.000Z' },
  { ...c('00:00', 'Ontem'), data_hora: '2026-10-17T02:59:00.000Z' },
] }).body, 'Hoje você tem 1 consulta:\n00:30 Madrugada (online)');

// bloqueios
t('bloqueio de dia inteiro', resumo({ bloqueios: [{ data: HOJE, hora_inicio: null, hora_fim: null, motivo: null }] }).body,
  'Hoje você não tem consultas.\nHoje está bloqueado.');
t('bloqueio de dia inteiro com motivo', resumo({ bloqueios: [{ data: HOJE, hora_inicio: null, hora_fim: null, motivo: 'Congresso' }] }).body,
  'Hoje você não tem consultas.\nHoje está bloqueado (Congresso).');
t('bloqueio no meio do dia (HH:MM:SS → HH:MM), ordenado, com e sem motivo', resumo({ bloqueios: [
  { data: HOJE, hora_inicio: '15:00:00', hora_fim: '16:00:00', motivo: null },
  { data: HOJE, hora_inicio: '12:00:00', hora_fim: '13:30:00', motivo: 'Almoço' },
] }).body, 'Hoje você não tem consultas.\nBloqueado 12:00–13:30 (Almoço)\nBloqueado 15:00–16:00');
t('bloqueio de outro dia não entra', resumo({ bloqueios: [{ data: '2026-10-18', hora_inicio: null, hora_fim: null }] }).body, 'Hoje você não tem consultas.');
t('dia inteiro prevalece sobre faixas', resumo({ bloqueios: [
  { data: HOJE, hora_inicio: '12:00:00', hora_fim: '13:00:00' }, { data: HOJE, hora_inicio: null, hora_fim: null },
] }).body, 'Hoje você não tem consultas.\nHoje está bloqueado.');

// lembretes
t('lembretes de hoje (hora primeiro, ordenados), atrasados e sem data em número', resumo({ lembretes: [
  { texto: 'Ligar para o laboratório', data: HOJE, hora: null },
  { texto: 'Revisar exames', data: HOJE, hora: '09:00:00' },
  { texto: 'Antigo', data: '2026-10-10', hora: null },
  { texto: 'Outro antigo', data: '2026-10-01', hora: null },
  { texto: 'Ideia solta', data: null, hora: null },
] }).body,
  'Hoje você não tem consultas.\nLembretes de hoje:\n• 09:00 Revisar exames\n• Ligar para o laboratório\n2 lembretes atrasados · 1 lembrete sem data');
t('lembrete concluído não entra', resumo({ lembretes: [
  { texto: 'Feito', data: HOJE, hora: null, concluido_em: '2026-10-17T09:00:00Z' },
  { texto: 'Atrasado feito', data: '2026-10-01', concluido_em: '2026-10-02T09:00:00Z' },
  { texto: 'Sem data feito', data: null, concluido_em: '2026-10-02T09:00:00Z' },
] }).body, 'Hoje você não tem consultas.');
t('lembrete futuro não entra', resumo({ lembretes: [{ texto: 'Amanhã', data: '2026-10-18' }] }).body, 'Hoje você não tem consultas.');
t('singular: 1 lembrete de hoje, 1 atrasado', resumo({ lembretes: [
  { texto: 'Um', data: HOJE }, { texto: 'Velho', data: '2026-10-01' },
] }).body, 'Hoje você não tem consultas.\nLembrete de hoje:\n• Um\n1 lembrete atrasado');
t('lembrete longo/multilinha → só a primeira linha, cortada', resumo({ lembretes: [
  { texto: 'Linha um\nlinha dois confidencial', data: HOJE },
  { texto: 'x'.repeat(150), data: HOJE },
] }).body.split('\n').slice(2), ['• Linha um', `• ${'x'.repeat(99)}…`]);

// limites de tamanho
const muitas = Array.from({ length: 10 }, (_, i) => c(`${String(10 + i).padStart(2, '0')}:00`, `Paciente ${i}`));
const corpoMuitas = resumo({ consultas: muitas }).body.split('\n');
t('mais de 8 consultas: lista 8 e resume o resto', [corpoMuitas.length, corpoMuitas.at(-1)], [10, '+ 2 consultas']);
const corpoLemb = resumo({ lembretes: Array.from({ length: 7 }, (_, i) => ({ texto: `L${i}`, data: HOJE })) }).body.split('\n');
t('mais de 5 lembretes de hoje: lista 5 e resume o resto', corpoLemb.at(-1), '+ 2 lembretes');

// exemplo completo
console.log('\n--- exemplo completo ---');
const ex = resumo({
  consultas: [c('17:30', 'Antônia Fortunato'), c('18:00', 'Beatriz Souza', { modalidade: 'presencial', local: { nome: 'Clínica Central' } })],
  bloqueios: [{ data: HOJE, hora_inicio: '12:00:00', hora_fim: '13:00:00', motivo: 'Almoço' }],
  lembretes: [{ texto: 'Revisar exames da Carla', data: HOJE, hora: '09:00:00' }, { texto: 'Atrasado', data: '2026-10-10' }],
});
console.log(ex.title + '\n' + ex.body + '\n');

// ---- handler com supabase e web-push falsos ----
const NUTRI = 'n1', OUTRO = 'paciente-user';
const enviosFeitos = [], apagados = [];
const dados = {
  nutris: [{ id: NUTRI, nome: 'Kelly Oliveira' }, { id: 'n2', nome: 'Sem Notificação' }],
  push_subscriptions: [
    { user_id: NUTRI, endpoint: 'e1', subscription: { endpoint: 'e1' } },
    { user_id: NUTRI, endpoint: 'e-morto', subscription: { endpoint: 'e-morto' } },
    { user_id: OUTRO, endpoint: 'e-pac', subscription: { endpoint: 'e-pac' } }, // paciente: nunca recebe
  ],
  consultas: [
    { nutri_id: NUTRI, data_hora: new Date().toISOString(), status: 'agendada', modalidade: 'online', local: null, paciente: { nome: 'Antônia' } },
  ],
  bloqueios_agenda: [], lembretes_nutri: [],
};
const consultasPedidas = [];
const fakeSupabase = {
  createClient: () => ({
    from(tabela) {
      const q = { tabela, filtros: [] };
      const api = {
        select: () => api,
        in: (col, vals) => { q.filtros.push(['in', col, vals]); return api; },
        eq: (col, v) => { q.filtros.push(['eq', col, v]); return api; },
        gte: () => api, lt: () => api, is: () => api, or: () => api,
        delete: () => ({ eq: async (_c, v) => { apagados.push(v); return { error: null }; } }),
        then: (res) => {
          let linhas = dados[tabela] ?? [];
          for (const [tipo, col, v] of q.filtros) {
            if (tipo === 'in') linhas = linhas.filter((l) => v.includes(l[col === 'id' ? 'id' : col]));
          }
          if (tabela === 'consultas') consultasPedidas.push(q.filtros.map((f) => f.join(':')).join('|'));
          return Promise.resolve({ data: linhas, error: null }).then(res);
        },
      };
      return api;
    },
  }),
};
const fakeWebpush = {
  setVapidDetails() {},
  async sendNotification(sub, corpo, opcoes) {
    if (sub.endpoint === 'e-morto') { const e = new Error('gone'); e.statusCode = 410; throw e; }
    enviosFeitos.push({ endpoint: sub.endpoint, payload: JSON.parse(corpo), opcoes });
  },
};
const carregarOriginal = Module._load;
Module._load = function (req, ...r) {
  if (req === '@supabase/supabase-js') return fakeSupabase;
  if (req === 'web-push') return fakeWebpush;
  return carregarOriginal.call(this, req, ...r);
};
const { handler } = require('../../netlify/functions/resumo-do-dia/resumo-do-dia.js');
Module._load = carregarOriginal;

process.env.CRON_SECRET = 'segredo';
process.env.VAPID_SUBJECT = 'mailto:x@example.com';
const semAuth = await handler({ body: '', headers: {} });
t('sem cron nem segredo → 401', semAuth.statusCode, 401);
const errado = await handler({ body: '', headers: { 'x-cron-secret': 'outro' } });
t('segredo errado → 401', errado.statusCode, 401);
const res = await handler({ body: JSON.stringify({ next_run: 'x' }), headers: {} });
t('cron do Netlify → 200', res.statusCode, 200);
t('só a assinatura da nutri recebe (paciente não, nutri sem notificação não)', enviosFeitos.map((e) => e.endpoint), ['e1']);
t('assinatura morta (410) é removida', apagados, ['e-morto']);
t('contagens na resposta', JSON.parse(res.body), { nutris: 1, enviados: 1, falhas: 0, removidos: 1 });
t('payload enviado tem rota e título', [enviosFeitos[0].payload.url, enviosFeitos[0].payload.title], ['/nutri/visao', 'Bom dia, Kelly']);
t('TTL de 4 h', enviosFeitos[0].opcoes, { TTL: 14400 });
t('consultas só pedidas para nutris com assinatura', consultasPedidas.some((s) => s.includes('n2')), false);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
