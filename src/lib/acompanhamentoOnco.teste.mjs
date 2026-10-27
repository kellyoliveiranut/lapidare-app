import { constancia, disposicao, movimento, progressoDaMeta } from './acompanhamentoOnco.js';
let ok = 0, falhou = 0;
const eq = (a, b, n) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhou++; console.log('FALHOU', n, a, b); } };
const hoje = '2026-10-27';
const m = [
  { data: '2026-10-27', disposicao: 6, mobilidade: 'caminhei_fora', hidratacao: 3 },
  { data: '2026-10-26', disposicao: 8, mobilidade: 'deitada', hidratacao: 1 },
  { data: '2026-10-25', disposicao: 7, mobilidade: 'exercicio' },
  { data: '2026-10-20', disposicao: 4, mobilidade: 'sentada' },   // exatamente 7 dias atrás: fora da janela atual, entra na anterior
  { data: '2026-10-13', disposicao: 2 },                          // 14 dias atrás: fora das duas
  { data: '2026-10-27', disposicao: 6, mobilidade: 'caminhei_fora', hidratacao: 3 }, // mesma data: conta uma vez
];
eq(constancia(m, hoje, 14), { registrados: 4, dias: 14 }, 'constância 14 dias (13/10 é o 15º dia: fora)');
eq(constancia([], hoje, 14).registrados, 0, 'sem registros');
const d = disposicao(m, hoje);
eq(d.atual, 7, 'média atual (6, 8, 7)');
eq(d.anterior, 4, 'média anterior');
eq(d.dif, 3, 'diferença');
eq(disposicao([], hoje), null, 'sem disposição');
eq(disposicao([{ data: '2026-10-27', disposicao: 5 }], hoje).dif, null, 'sem período anterior');
eq(movimento(m, hoje), { dias: 2, registrados: 3 }, 'movimento (fora, exercício; deitada não)');
eq(movimento([{ data: '2026-10-27' }], hoje), null, 'sem mobilidade registrada');
const ck = [{ respondido_em: '2026-10-24T10:00:00Z', respostas: { adesao: 5 } }, { respondido_em: '2026-10-10T10:00:00Z', respostas: { adesao: 2 } }];
eq(progressoDaMeta('geral_checkin', { hoje, checkins: ck }), 'Check-in desta semana: respondido', 'check-in recente');
eq(progressoDaMeta('geral_checkin', { hoje, checkins: [ck[1]] }), 'Check-in desta semana: ainda não respondido', 'check-in antigo');
eq(progressoDaMeta('geral_checkin', { hoje, checkins: [] }), 'Check-in desta semana: ainda não respondido', 'sem check-in');
eq(progressoDaMeta('geral_plano', { hoje, checkins: ck }), 'Seguiu o plano em 5 de 7 dias no último check-in', 'adesão');
eq(progressoDaMeta('onco_atividade', { hoje, monit: m }), 'Movimento em 2 de 3 dias registrados nos últimos 7 dias', 'atividade');
eq(progressoDaMeta('onco_hidratacao', { hoje, monit: m }), 'Hidratação registrada em 2 dos últimos 7 dias', 'hidratação');
eq(progressoDaMeta('onco_forca', { hoje, monit: m }), 'Disposição média dos últimos 7 dias: 7 de 10', 'força/disposição');
eq(progressoDaMeta('emag_peso', { hoje, monit: m }), null, 'meta sem medida');
eq(progressoDaMeta('onco_atividade', { hoje, monit: [] }), null, 'sem monitoramento');
console.log(`${ok} ok, ${falhou} falhou (acompanhamento)`);
process.exit(falhou ? 1 : 0);
