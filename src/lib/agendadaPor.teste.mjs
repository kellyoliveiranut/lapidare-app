import { rotuloAgendadaPor } from './agendadaPor.js';
let ok = 0, f = 0;
const t = (n, a, b) => { if (a === b) { ok++; console.log('PASS ', n); } else { f++; console.log('FALHA', n, a, b); } };
t('secretária', rotuloAgendadaPor('secretaria', 'Kelly Oliveira'), 'Agendada pela secretária');
t('nutri usa o primeiro nome', rotuloAgendadaPor('nutri', 'Kelly Oliveira'), 'Agendada por Kelly');
t('nutri sem nome', rotuloAgendadaPor('nutri', ''), 'Agendada por a Dra.');
t('antiga (nulo)', rotuloAgendadaPor(null, 'Kelly'), null);
t('valor estranho', rotuloAgendadaPor('paciente', 'Kelly'), null);
console.log(`\n${ok} PASS, ${f} FALHA`); process.exit(f ? 1 : 0);
