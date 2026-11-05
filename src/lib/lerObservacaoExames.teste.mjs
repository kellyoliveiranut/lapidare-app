import assert from 'node:assert/strict';
import { lerObservacaoExames } from './lerObservacaoExames.js';

const obs = 'Hematócrito: 37%, VCM: 90.9 fL, HCM: 28.7 pg, CHCM: 31.6 g/dL (abaixo do ref), RDW: 13.2%, Hemácias: 4.07 milhões/mm3, Eosinófilos: 90/mm3, Basófilos: 22/mm3, Monócitos: 348/mm3, Bastões: 0/mm3, Ureia: 42 mg/dL, Creatinina: 0.4 mg/dL (abaixo do ref feminino), TFG não-afrodescendente: 131.3 mL/min/1.73m2, TGO/AST: 12 U/L (abaixo do ref), TGP/ALT: 11 U/L, Hemoglobina levemente abaixo do valor de referência para adultos (12-18 g/dL)';
const { valores, ignorados } = lerObservacaoExames(obs);
assert.deepEqual(valores, {
  x_hematocrito: '37', x_vcm: '90.9', x_hcm: '28.7', x_chcm: '31.6', x_rdw: '13.2',
  x_hemacias: '4.07', x_eosinofilos: '90', x_basofilos: '22', x_monocitos: '348', x_bastoes: '0',
  x_ureia: '42', x_creatinina: '0.4', x_tfg: '131.3', x_tgo: '12', x_tgp: '11',
});
assert.deepEqual(ignorados, []);            // o comentário final não tem ":" e é descartado
// vírgula decimal não corta o número; rótulo desconhecido vai para ignorados
const r2 = lerObservacaoExames('Hemoglobina: 11,5 g/dL, Ferritina: 80 ng/mL, PCR: 3,2 mg/L');
assert.deepEqual(r2.valores, { hemoglobina: '11,5', pcr: '3,2' });
assert.deepEqual(r2.ignorados, ['Ferritina']);
assert.deepEqual(lerObservacaoExames('').valores, {});
assert.deepEqual(lerObservacaoExames(null).valores, {});
console.log('ok lerObservacaoExames');
