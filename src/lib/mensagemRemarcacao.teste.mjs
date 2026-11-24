import { mensagemRemarcacao as m } from './mensagemRemarcacao.js';
let ok = 0, bad = 0;
const t = (n, a, b) => { const x = a === b; x ? ok++ : bad++; console.log((x ? '  PASS  ' : '  FALHA  ') + n + (x ? '' : `  (esperado ${b}, obteve ${a})`)); };
t('completa', m({ nome: 'Cleide', quando: 'amanhã, 25/11', hora: '14:00' }),
  'Olá, Cleide! Tudo bem? Aqui é da equipe da Dra. Kelly Oliveira. Precisamos remarcar a sua consulta de amanhã, 25/11 às 14:00, e pedimos desculpas pelo imprevisto. Entraremos em contato em breve com a nova data. Obrigada pela compreensão!');
t('sem nome', m({ quando: 'hoje', hora: '10:00' }).startsWith('Olá! Tudo bem?'), true);
t('sem data e hora', m({ nome: 'Ana' }).includes('a sua consulta, e pedimos'), true);
t('não cita motivo', /motivo|doente|viagem/i.test(m({ nome: 'Ana', quando: 'hoje', hora: '9:00' })), false);
console.log(`${ok} passaram, ${bad} falharam, ${ok + bad} no total`);
process.exit(bad ? 1 : 0);
