/**
 * Teste standalone de opcoesTipoConsulta() e tipoSugerido() (consultaVisual.js).
 * Roda com `node src/lib/consultaVisual.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes.
 * Nada aqui depende de data; o TZ_TESTE só prova que continua assim.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { opcoesTipoConsulta, tipoSugerido } = await import('./consultaVisual.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// Cópia da lista TIPOS de src/app/nutri/Agenda.jsx (:27-36 em 2026-10-08):
// primeira, consulta_2 a consulta_12, avaliacao, retorno, avulsa.
const TIPOS = [
  { value: 'primeira', label: '1ª consulta' },
  ...Array.from({ length: 11 }, (_, i) => {
    const n = i + 2;
    return { value: `consulta_${n}`, label: `Consulta ${String(n).padStart(2, '0')}` };
  }),
  { value: 'avaliacao', label: 'Avaliação' },
  { value: 'retorno',   label: 'Retorno' },
  { value: 'avulsa',    label: 'Consulta avulsa' },
];

const NOVE = [
  '1ª consulta', 'Consulta 02', 'Consulta 03', 'Consulta 04', 'Consulta 05', 'Consulta 06',
  'Avaliação', 'Retorno', 'Consulta avulsa',
];
const rotulos = l => l.map(o => o.label);

// ─── opcoesTipoConsulta ──────────────────────────────────────────────
t('opções', 'criar (atual vazio): as 9, nesta ordem e com estes rótulos', rotulos(opcoesTipoConsulta(TIPOS, '')), NOVE);
t('opções', 'criar: os values', opcoesTipoConsulta(TIPOS, '').map(o => o.value),
  ['primeira', 'consulta_2', 'consulta_3', 'consulta_4', 'consulta_5', 'consulta_6', 'avaliacao', 'retorno', 'avulsa']);
t('opções', 'criar com atual undefined: as 9', rotulos(opcoesTipoConsulta(TIPOS, undefined)), NOVE);
t('opções', 'editar consulta_3: as mesmas 9, sem (atual)', rotulos(opcoesTipoConsulta(TIPOS, 'consulta_3')), NOVE);
t('opções', 'editar consulta_7: 10, "Consulta 07 (atual)" logo depois da 06',
  rotulos(opcoesTipoConsulta(TIPOS, 'consulta_7')),
  [...NOVE.slice(0, 6), 'Consulta 07 (atual)', ...NOVE.slice(6)]);
t('opções', 'editar consulta_7: o value é o gravado',
  opcoesTipoConsulta(TIPOS, 'consulta_7')[6].value, 'consulta_7');
t('opções', 'editar consulta_8: 10, "Consulta 08 (atual)" logo depois da 06',
  rotulos(opcoesTipoConsulta(TIPOS, 'consulta_8')),
  [...NOVE.slice(0, 6), 'Consulta 08 (atual)', ...NOVE.slice(6)]);
t('opções', 'editar avulsa: as mesmas 9', rotulos(opcoesTipoConsulta(TIPOS, 'avulsa')), NOVE);
t('opções', 'editar primeira: as mesmas 9', rotulos(opcoesTipoConsulta(TIPOS, 'primeira')), NOVE);
t('opções', 'atual desconhecido: 10, o valor + (atual) no fim',
  opcoesTipoConsulta(TIPOS, 'consulta_x').map(o => [o.value, o.label]).slice(-1),
  [['consulta_x', 'consulta_x (atual)']]);
t('opções', 'atual desconhecido: as 9 de antes continuam', rotulos(opcoesTipoConsulta(TIPOS, 'consulta_x')).slice(0, 9), NOVE);
t('opções', 'tipos vazio: lista vazia', opcoesTipoConsulta([], 'consulta_7'), []);
t('opções', 'tipos null: lista vazia, sem erro', opcoesTipoConsulta(null, ''), []);

// ─── tipoSugerido ────────────────────────────────────────────────────
t('sugestão', '1 → primeira', tipoSugerido(1), 'primeira');
t('sugestão', '2 a 6 → consulta_2 a consulta_6', [2, 3, 4, 5, 6].map(tipoSugerido),
  ['consulta_2', 'consulta_3', 'consulta_4', 'consulta_5', 'consulta_6']);
t('sugestão', '7, 8, 12, 13, 50 → avulsa', [7, 8, 12, 13, 50].map(tipoSugerido),
  ['avulsa', 'avulsa', 'avulsa', 'avulsa', 'avulsa']);
t('sugestão', 'inválidos → primeira', [0, -1, 1.5, NaN, null, undefined, '3'].map(tipoSugerido),
  ['primeira', 'primeira', 'primeira', 'primeira', 'primeira', 'primeira', 'primeira']);

// Invariante: a sugestão sempre existe no select de criar.
{
  const values = new Set(opcoesTipoConsulta(TIPOS, '').map(o => o.value));
  const fora = [];
  for (let n = 1; n <= 60; n++) if (!values.has(tipoSugerido(n))) fora.push(n);
  t('sugestão', 'para todo n de 1 a 60, a sugestão está nas opções de criar', fora, []);
}

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
