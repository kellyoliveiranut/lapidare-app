import assert from 'node:assert/strict';
import { valorDoCampo, numeroDe, homaIr, achatarExame, chavesAtivas, normalizarRefs, aplicarReferencias, compararExames, rotuloCriterio } from './examesEmagrecimento.js';
import { textoRef } from '../data/exames_referencia.js';
import { CAMPOS_EMAG, CHAVES_PADRAO_EMAG, CHAVES_EMAG, PEDIDO_EMAGRECIMENTO } from '../data/exames_emagrecimento.js';
import { CATEGORIAS_EXAME } from '../data/exames_solicitacao.js';

assert.equal(numeroDe('95,2'), 95.2); assert.equal(numeroDe('1.234,5'), 1234.5);
assert.equal(numeroDe(''), null); assert.equal(numeroDe('abc'), null); assert.equal(numeroDe(7), 7);
assert.equal(homaIr(90, 10), 2.22); assert.equal(homaIr('90', '10,0'), 2.22);
assert.equal(homaIr(null, 10), null); assert.equal(homaIr(0, 10), null);

assert.deepEqual(achatarExame({ id: 1, data_exame: '2026-01-01', valores: { ldl: 100 }, obs: null }),
  { id: 1, data_exame: '2026-01-01', obs: '', ldl: 100 });

const tres = CAMPOS_EMAG.slice(0, 3);
assert.deepEqual(chavesAtivas(null, tres), tres.map(c => c.key));
assert.deepEqual(chavesAtivas(['homa_ir', 'xxx', 'glicemia_jejum'], CAMPOS_EMAG), ['glicemia_jejum', 'homa_ir']);
assert.deepEqual(chavesAtivas([], tres), []);
assert.deepEqual(chavesAtivas(null, tres, ['hba1c']), ['hba1c']);

// catálogo consistente
assert.equal(new Set(CHAVES_EMAG).size, CHAVES_EMAG.length);
for (const k of CHAVES_PADRAO_EMAG) assert.ok(CHAVES_EMAG.includes(k), 'painel com chave inexistente: ' + k);
const todosItens = new Set(CATEGORIAS_EXAME.flatMap(c => c.itens));
for (const i of PEDIDO_EMAGRECIMENTO) assert.ok(todosItens.has(i), 'item fora do catálogo de solicitação: ' + i);

// normalizar
assert.deepEqual(normalizarRefs({ ldl: { min: '', max: '130,5', alto: 'x', fonte: '  Dir. X  ' }, tsh: { fonte: 'só fonte' }, lixo: null }),
  { ldl: { max: 130.5, fonte: 'Dir. X' } });

const com = aplicarReferencias(CAMPOS_EMAG, {});
const g = com.find(c => c.key === 'glicemia_jejum');
// referência orientativa da tabela: 70–99, bordas inclusivas, "fora" = atenção (nunca crítico)
assert.equal(textoRef(g, null), '70–99');
assert.equal(g.nivel(70), 'normal'); assert.equal(g.nivel(99), 'normal');
assert.equal(g.nivel(100), 'atencao'); assert.equal(g.nivel(69), 'atencao');
// sem faixa → sem cor (LDL: meta individualizada)
const ldl = com.find(c => c.key === 'ldl');
assert.equal(ldl.nivel(500), null); assert.equal(textoRef(ldl, null), null);
// por sexo
const hb = com.find(c => c.key === 'hemoglobina');
assert.equal(hb.nivel(13, 'feminino'), 'normal'); assert.equal(hb.nivel(13, 'masculino'), 'atencao');
assert.equal(hb.nivel(13, null), 'normal');
// LH: só homem tem faixa; mulher fica sem cor
const lh = com.find(c => c.key === 'lh');
assert.equal(lh.nivel(5, 'masculino'), 'normal'); assert.equal(lh.nivel(5, 'feminino'), null);
// faixa personalizada substitui a orientativa e traz alerta própria
const pers = aplicarReferencias(CAMPOS_EMAG, { glicemia_jejum: { min: 75, max: 90, criticoAlto: 126 } }).find(c => c.key === 'glicemia_jejum');
assert.equal(pers.personalizada, true); assert.equal(textoRef(pers, null), '75–90');
assert.equal(pers.nivel(95), 'atencao'); assert.equal(pers.nivel(80), 'normal'); assert.equal(pers.nivel(130), 'critico');

// critérios por diretriz
const hba1c = CAMPOS_EMAG.find(c => c.key === 'hba1c');
assert.equal(rotuloCriterio(hba1c, 5.6), 'Normal'); assert.equal(rotuloCriterio(hba1c, 5.7), 'Pré-diabetes');
assert.equal(rotuloCriterio(hba1c, 6.4), 'Pré-diabetes'); assert.equal(rotuloCriterio(hba1c, 6.5), 'Critério para diabetes');
const vd = CAMPOS_EMAG.find(c => c.key === 'vitamina_d');
assert.equal(rotuloCriterio(vd, 11), 'Deficiência importante'); assert.equal(rotuloCriterio(vd, 12), 'Inadequação');
assert.equal(rotuloCriterio(vd, 19), 'Inadequação'); assert.equal(rotuloCriterio(vd, 20), 'Adequada para a maioria dos adultos saudáveis');
assert.equal(rotuloCriterio(vd, 50), 'Adequada para a maioria dos adultos saudáveis'); assert.match(rotuloCriterio(vd, 51), /Atenção/);
const pcr = CAMPOS_EMAG.find(c => c.key === 'pcr_us');
assert.match(rotuloCriterio(pcr, 0.9), /Menor/); assert.match(rotuloCriterio(pcr, 1), /intermediária/);
assert.match(rotuloCriterio(pcr, 3), /intermediária/); assert.match(rotuloCriterio(pcr, 3.1), /elevada/);
assert.equal(rotuloCriterio(ldl, 100), null);

const cmp = compararExames({ ldl: 100, hdl: 50 }, { ldl: 90, tsh: 2 }, CAMPOS_EMAG);
assert.equal(cmp.length, 1); assert.equal(cmp[0].dif, -10); assert.equal(cmp[0].pct, -10);
// Urina tipo 1: texto do laudo, comparado ao esperado sem depender de acento/caixa
const urina = aplicarReferencias(CAMPOS_EMAG, {});
const prot = urina.find(c => c.key === 'urina_proteinas');
assert.equal(prot.nivel('Negativo'), 'normal'); assert.equal(prot.nivel(' negativo '), 'normal');
assert.equal(prot.nivel('Positivo'), 'atencao');
assert.equal(urina.find(c => c.key === 'urina_aspecto').nivel('Límpido'), 'normal');
assert.equal(urina.find(c => c.key === 'urina_aspecto').nivel('Turvo'), 'atencao');
assert.equal(urina.find(c => c.key === 'urina_cristais').nivel('Oxalato'), null); // sem esperado: só mostra
assert.equal(valorDoCampo(prot, '  Negativo '), 'Negativo'); assert.equal(valorDoCampo(prot, ''), null);
const dens = urina.find(c => c.key === 'urina_densidade');
assert.equal(valorDoCampo(dens, '1020'), 1.02); assert.equal(valorDoCampo(dens, '1,020'), 1.02); assert.equal(valorDoCampo(dens, '1.020'), 1.02);
assert.equal(dens.nivel(1.02), 'normal'); assert.equal(dens.nivel(1.035), 'atencao');
assert.equal(textoRef(dens, null), '1,005–1,030');
assert.equal(urina.find(c => c.key === 'urina_ph').nivel(6), 'normal');
console.log('ok examesEmagrecimento');
