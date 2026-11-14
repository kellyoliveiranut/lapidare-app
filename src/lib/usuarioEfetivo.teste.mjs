import { usuarioEfetivo } from './usuarioEfetivo.js';
let ok = 0, falhas = 0;
const t = (n, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('PASS ', n); } else { falhas++; console.log('FALHA', n, a, b); } };
const u = { id: 'sec', email: 's@x' };
t('secretária: id vira o da nutri e guarda o real', usuarioEfetivo(u, { id: 1 }, { id: 'dra' }), { id: 'dra', email: 's@x', id_real: 'sec' });
t('nutri: usuário intacto', usuarioEfetivo(u, null, { id: 'dra' }), u);
t('sem usuário: null', usuarioEfetivo(null, { id: 1 }, { id: 'dra' }), null);
t('sem perfil: não troca o id', usuarioEfetivo(u, { id: 1 }, null), u);
console.log(`\n${ok} PASS, ${falhas} FALHA`); process.exit(falhas ? 1 : 0);
