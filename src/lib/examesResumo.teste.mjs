import assert from 'node:assert/strict';
import { diasEntre, situacaoValor, resumirExame, avisoDesatualizado, montarResumoRelatorio, textoValor } from './examesResumo.js';
import { CAMPOS_EXAME } from '../data/exames_referencia.js';
import { CAMPOS_EMAG } from '../data/exames_emagrecimento.js';
import { aplicarReferencias } from './examesEmagrecimento.js';

assert.equal(diasEntre('2026-01-01', '2026-01-31'), 30);
assert.equal(diasEntre('2026-01-01', 'x'), null);
assert.equal(diasEntre('2025-12-31', '2026-01-01'), 1);

// Oncologia: Hb 11,5 está fora da faixa (12–16) mas não é alerta → 'atencao' (fora da referência)
const hb = CAMPOS_EXAME.find(c => c.key === 'hemoglobina');
assert.equal(situacaoValor(hb, 14, 'feminino'), 'normal');
assert.equal(situacaoValor(hb, 11.5, 'feminino'), 'atencao');
assert.equal(situacaoValor(hb, 7, 'feminino'), 'critico');
assert.equal(situacaoValor(hb, '', 'feminino'), null);
assert.equal(situacaoValor(hb, '13,5', 'masculino'), 'normal');

// Emagrecimento (campos com nivel())
const emag = aplicarReferencias(CAMPOS_EMAG, {});
const comFaixa = emag.find(c => c.tipo !== 'texto' && c.ref);
assert.ok(comFaixa);
const r = resumirExame(CAMPOS_EXAME, { hemoglobina: 11.5, leucocitos: 6500, pcr: 12 }, 'feminino');
assert.equal(r.avaliados, 3); assert.equal(r.fora.length, 2); assert.equal(r.dentro, 1);

assert.deepEqual(avisoDesatualizado(null, '2026-10-30', 90), { tipo: 'sem', dias: null });
assert.deepEqual(avisoDesatualizado('2026-01-01', '2026-10-30', 90).tipo, 'antigo');
assert.equal(avisoDesatualizado('2026-10-01', '2026-10-30', 90).tipo, null);

assert.equal(montarResumoRelatorio({ campos: CAMPOS_EXAME, exames: [], sexo: 'feminino' }), null);
const rel = montarResumoRelatorio({ campos: CAMPOS_EXAME, sexo: 'feminino', exames: [
  { data_exame: '2026-08-01', hemoglobina: 12, pcr: 3 },
  { data_exame: '2026-10-01', hemoglobina: 11, pcr: 3 },
] });
assert.equal(rel.dataUltimo, '2026-10-01'); assert.equal(rel.dataAnterior, '2026-08-01');
assert.equal(rel.linhas.find(l => l.rotulo === 'Hemoglobina').situacao, 'fora da referência');
assert.equal(rel.comparacao.find(l => l.rotulo === 'Hemoglobina').dif, '-1,0');
assert.equal(textoValor(hb, 12.5), '12,5');
// nunca usa "crítico" em texto
assert.ok(!JSON.stringify(rel).toLowerCase().includes('crític'));
console.log('examesResumo ok');
