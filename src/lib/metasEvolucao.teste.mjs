import { METAS, TEMAS, MAX_METAS, temaDoObjetivo, metasPorCodigos } from './metasEvolucao.js';
let ok = 0, falhou = 0;
const eq = (a, b, n) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhou++; console.log('FALHOU', n, a, b); } };
eq(new Set(METAS.map((m) => m.id)).size, METAS.length, 'códigos únicos');
eq(METAS.every((m) => TEMAS.some((t) => t.id === m.tema)), true, 'todo tema existe');
eq(temaDoObjetivo('Oncologia'), 'oncologia', 'onco');
eq(temaDoObjetivo('Preparo pré-cirúrgico'), 'oncologia', 'pré-cirúrgico');
eq(temaDoObjetivo('Outro'), null, 'outro');
eq(metasPorCodigos(['onco_forca', 'inexistente', 'onco_forca']).map((m) => m.id), ['onco_forca'], 'ignora desconhecido e repetido');
eq(metasPorCodigos(null), [], 'nulo');
eq(MAX_METAS, 5, 'limite igual ao do banco');
// Oncologia nunca com meta de peso
eq(METAS.filter((m) => m.tema === 'oncologia').some((m) => /peso|emagrec|perder/i.test(m.texto)), false, 'onco sem meta de peso');
console.log(`${ok} ok, ${falhou} falhou (metas)`);
process.exit(falhou ? 1 : 0);
