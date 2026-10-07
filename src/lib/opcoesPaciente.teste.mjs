/**
 * Teste standalone de modalidadeDaPaciente, localPadrao e datasSemLocal
 * (opcoesPaciente.js). Roda com `node src/lib/opcoesPaciente.teste.mjs`.
 *
 * O fuso é fixado em process.env.TZ ANTES do import: localPadrao lê o dia da
 * semana com getDay() sobre 'YYYY-MM-DDT12:00:00' local. Rodar com TZ_TESTE em
 * outros fusos prova que segunda continua segunda fora de Belém.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { modalidadeDaPaciente, localPadrao, datasSemLocal, localParaDefinirData } = await import('./opcoesPaciente.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// ─── modalidadeDaPaciente ────────────────────────────────────────────
t('modalidade', '"presencial" → presencial',  modalidadeDaPaciente('presencial'), 'presencial');
t('modalidade', '"Presencial" → presencial',  modalidadeDaPaciente('Presencial'), 'presencial');
t('modalidade', '" Presencial " com espaços → presencial', modalidadeDaPaciente(' Presencial '), 'presencial');
t('modalidade', '"Online" → online',          modalidadeDaPaciente('Online'), 'online');
t('modalidade', '"Híbrido" → online',         modalidadeDaPaciente('Híbrido'), 'online');
t('modalidade', 'vazio → online',             modalidadeDaPaciente(''), 'online');
t('modalidade', 'null → online',              modalidadeDaPaciente(null), 'online');
t('modalidade', 'undefined → online',         modalidadeDaPaciente(undefined), 'online');

// ─── localPadrao ─────────────────────────────────────────────────────
// Semana de 2026-10-05 (segunda) a 2026-10-10 (sábado).
const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07', QUI = '2026-10-08', SEX = '2026-10-09', SAB = '2026-10-10';
const CTO = { id: 'cto', ativo: true, dias_semana: [1, 5] };
const EDV = { id: 'edv', ativo: true, dias_semana: [2, 3, 4] };
const L = [CTO, EDV];

t('local', 'segunda → CTO',      localPadrao(L, SEG), 'cto');
t('local', 'terça → Ed Village', localPadrao(L, TER), 'edv');
t('local', 'quarta → Ed Village', localPadrao(L, QUA), 'edv');
t('local', 'quinta → Ed Village', localPadrao(L, QUI), 'edv');
t('local', 'sexta → CTO',        localPadrao(L, SEX), 'cto');
t('local', 'sábado, dois ativos e nenhum com o dia → sem local', localPadrao(L, SAB), '');
t('local', 'dois locais ativos no MESMO dia → sem local (não escolhe por ordem)',
  localPadrao([CTO, { id: 'outro', ativo: true, dias_semana: [1] }], SEG), '');
t('local', 'local do dia INATIVO não conta; sobra 1 ativo → ele (fallback do único)',
  localPadrao([{ ...CTO, ativo: false }, EDV], SEG), 'edv');
t('local', 'local do dia inativo e dois outros ativos sem o dia → sem local',
  localPadrao([{ ...CTO, ativo: false }, EDV, { id: 'x', ativo: true, dias_semana: [3] }], SEG), '');
t('local', 'só um ativo, sem dias_semana → ele em qualquer dia, até sábado',
  [localPadrao([{ id: 'unico', ativo: true, dias_semana: [] }], SEG), localPadrao([{ id: 'unico', ativo: true }], SAB)], ['unico', 'unico']);
t('local', 'nenhum local → sem local', localPadrao([], SEG), '');
t('local', 'sem data e dois ativos → sem local', localPadrao(L, ''), '');

// ─── datasSemLocal (o aviso dos modais) ──────────────────────────────
t('aviso', 'semana inteira com CTO e Ed Village: só o sábado fica sem local',
  datasSemLocal([SEG, TER, QUA, QUI, SEX, SAB], L), [SAB]);
t('aviso', 'todas com regra: lista vazia', datasSemLocal([SEG, TER, SEX], L), []);
t('aviso', 'falha de leitura (locais = []): todas as datas', datasSemLocal([SEG, TER], []), [SEG, TER]);
t('aviso', 'data vazia ("a definir") fica fora', datasSemLocal(['', SAB], L), [SAB]);
t('aviso', 'lista nula: vazia', datasSemLocal(null, L), []);

// ─── localParaDefinirData (consulta "a definir" ganhando data) ──────
const ld = (o) => localParaDefinirData({ modalidade: 'presencial', localId: null, locais: L, ...o });
t('definir data', 'online, sem local → null',               ld({ modalidade: 'online', dataISO: SEG }), null);
t('definir data', 'presencial com local já gravado → null (não sobrescreve)', ld({ localId: 'edv', dataISO: SEG }), null);
t('definir data', 'presencial sem local, segunda → CTO',    ld({ dataISO: SEG }), 'cto');
t('definir data', 'presencial sem local, terça → Ed Village', ld({ dataISO: TER }), 'edv');
t('definir data', 'presencial sem local, sábado, dois ativos → null', ld({ dataISO: SAB }), null);
t('definir data', 'presencial sem local, locais vazio → null', ld({ locais: [], dataISO: SEG }), null);
t('definir data', 'presencial sem local, um único ativo → ele, em qualquer dia',
  [ld({ locais: [{ id: 'unico', ativo: true, dias_semana: [] }], dataISO: SEG }),
   ld({ locais: [{ id: 'unico', ativo: true, dias_semana: [] }], dataISO: SAB })], ['unico', 'unico']);

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
