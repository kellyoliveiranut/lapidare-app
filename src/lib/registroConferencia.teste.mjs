/**
 * Teste standalone da conferência da confirmação do registro (bloco-94).
 * Roda com `node src/lib/registroConferencia.teste.mjs`, sem framework, na raiz do repo.
 *
 * Quem conferiu e a fonte são digitados (a conta de login é compartilhada);
 * tamanho em pontos de código, como o char_length do banco; a data/hora é do
 * gatilho do banco, nunca do app. O texto da confirmação sai no fuso fixo de
 * Belém, igual em qualquer TZ_TESTE.
 *
 * O fuso é fixado ANTES do import, como nos outros testes. registroConferencia.js
 * importa protocoloCiclo.js, que importa o JSON sem atributo; o hook só
 * acrescenta `type: 'json'`.
 */
import { register } from 'node:module';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const { LIMITES_CONFERENCIA, validarConferencia, gravacaoConfirmar, gravacaoPendente, textoConfirmacao } =
  await import('./registroConferencia.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const MIN_POR = 'Informe nome e registro profissional (mín. 5 caracteres).';
const MAX_POR = 'Nome e registro profissional: máx. 120 caracteres.';
const MIN_FONTE = 'Informe a fonte da conferência (mín. 5 caracteres).';
const MAX_FONTE = 'Fonte da conferência: máx. 300 caracteres.';
const FONTE_OK = 'Prescrição de 10/10/2026';
const POR_OK = 'Profissional Teste CRN-0 00000';
const x = n => 'x'.repeat(n);

t('limites iguais aos do check do banco', LIMITES_CONFERENCIA, { por: { min: 5, max: 120 }, fonte: { min: 5, max: 300 } });

// Limites de "por".
t('por com 4: erro de mínimo', validarConferencia({ por: x(4), fonte: FONTE_OK }).erros, { por: MIN_POR });
t('por com 5: ok', validarConferencia({ por: x(5), fonte: FONTE_OK }).ok, true);
t('por com 120: ok', validarConferencia({ por: x(120), fonte: FONTE_OK }).ok, true);
t('por com 121: erro de máximo', validarConferencia({ por: x(121), fonte: FONTE_OK }).erros, { por: MAX_POR });

// Limites de "fonte".
t('fonte com 4: erro de mínimo', validarConferencia({ por: POR_OK, fonte: x(4) }).erros, { fonte: MIN_FONTE });
t('fonte com 5: ok', validarConferencia({ por: POR_OK, fonte: x(5) }).ok, true);
t('fonte com 300: ok', validarConferencia({ por: POR_OK, fonte: x(300) }).ok, true);
t('fonte com 301: erro de máximo', validarConferencia({ por: POR_OK, fonte: x(301) }).erros, { fonte: MAX_FONTE });

// Espaços, vazio, undefined/null.
t('espaços nas pontas saem e não contam (3 letras + espaços = mínimo)',
  validarConferencia({ por: '   abc   ', fonte: '  ' + x(5) + '\n' }), { ok: false, erros: { por: MIN_POR }, valores: { por: 'abc', fonte: x(5) } });
t('valores com trim()', validarConferencia({ por: '  ' + POR_OK + '  ', fonte: '\t' + FONTE_OK + ' ' }).valores, { por: POR_OK, fonte: FONTE_OK });
t('só espaços = vazio (os dois campos)', validarConferencia({ por: '     ', fonte: '      ' }),
  { ok: false, erros: { por: MIN_POR, fonte: MIN_FONTE }, valores: { por: '', fonte: '' } });
t('undefined = vazio', validarConferencia({ por: undefined, fonte: undefined }),
  { ok: false, erros: { por: MIN_POR, fonte: MIN_FONTE }, valores: { por: '', fonte: '' } });
t('null = vazio', validarConferencia({ por: null, fonte: null }),
  { ok: false, erros: { por: MIN_POR, fonte: MIN_FONTE }, valores: { por: '', fonte: '' } });
t('sem argumento = vazio', validarConferencia().ok, false);

// Emoji conta 1 ponto de código (char_length do banco), não 2 unidades UTF-16.
const EMOJI = '\u{1FA7A}';
t('emoji: 1 ponto de código, 2 unidades UTF-16', [[...EMOJI].length, EMOJI.length], [1, 2]);
t('4 letras + emoji = 5: ok', validarConferencia({ por: 'abcd' + EMOJI, fonte: FONTE_OK }).ok, true);
t('3 letras + emoji = 4: erro de mínimo (seria 5 em UTF-16)', validarConferencia({ por: 'abc' + EMOJI, fonte: FONTE_OK }).erros, { por: MIN_POR });
t('119 + emoji = 120: ok', validarConferencia({ por: x(119) + EMOJI, fonte: FONTE_OK }).ok, true);
t('120 + emoji = 121: erro de máximo', validarConferencia({ por: x(120) + EMOJI, fonte: FONTE_OK }).erros, { por: MAX_POR });

// gravacaoConfirmar: chaves exatas, sem registro_confirmado_em.
const g = gravacaoConfirmar({ por: '  ' + POR_OK + ' ', fonte: ' ' + FONTE_OK + '  ' });
t('gravacaoConfirmar: exatamente 3 chaves, nesta ordem', Object.keys(g), ['registro_pendente', 'registro_confirmado_por', 'registro_confirmado_fonte']);
t('gravacaoConfirmar: valores (com trim) e pendente false', g,
  { registro_pendente: false, registro_confirmado_por: POR_OK, registro_confirmado_fonte: FONTE_OK });
t('gravacaoConfirmar: sem registro_confirmado_em (é do gatilho)', 'registro_confirmado_em' in g, false);
const lanca = f => { try { f(); return false; } catch (e) { return e instanceof Error; } };
t('gravacaoConfirmar lança com por curto', lanca(() => gravacaoConfirmar({ por: x(4), fonte: FONTE_OK })), true);
t('gravacaoConfirmar lança com fonte longa', lanca(() => gravacaoConfirmar({ por: POR_OK, fonte: x(301) })), true);
t('gravacaoConfirmar lança com vazio/undefined', [lanca(() => gravacaoConfirmar({})), lanca(() => gravacaoConfirmar())], [true, true]);

// gravacaoPendente.
t('gravacaoPendente: as 4 chaves', gravacaoPendente(),
  { registro_pendente: true, registro_confirmado_em: null, registro_confirmado_por: null, registro_confirmado_fonte: null });

// textoConfirmacao.
t('pendente (true, null, undefined) → null', [
  textoConfirmacao({ registro_pendente: true, registro_confirmado_em: '2026-10-13T15:30:00Z', registro_confirmado_por: POR_OK, registro_confirmado_fonte: FONTE_OK }),
  textoConfirmacao({ registro_pendente: null }),
  textoConfirmacao({ registro_pendente: undefined }),
], [null, null, null]);
const conf = em => ({ registro_pendente: false, registro_confirmado_em: em, registro_confirmado_por: POR_OK, registro_confirmado_fonte: FONTE_OK });
t('2026-10-13T15:30:00Z → 13/10/2026 às 12:30 (Belém)', textoConfirmacao(conf('2026-10-13T15:30:00Z')),
  `Registro confirmado em 13/10/2026 às 12:30 por ${POR_OK} · fonte: ${FONTE_OK}`);
t('2026-10-14T01:30:00Z → 13/10/2026 às 22:30 (Belém, ainda dia 13)', textoConfirmacao(conf('2026-10-14T01:30:00Z')),
  `Registro confirmado em 13/10/2026 às 22:30 por ${POR_OK} · fonte: ${FONTE_OK}`);
t('timestamptz como o PostgREST devolve (+00:00) dá o mesmo texto', textoConfirmacao(conf('2026-10-13T15:30:00+00:00')),
  `Registro confirmado em 13/10/2026 às 12:30 por ${POR_OK} · fonte: ${FONTE_OK}`);
t('confirmado sem registro_confirmado_em → texto de reserva', [
  textoConfirmacao({ registro_pendente: false }),
  textoConfirmacao({ registro_pendente: false, registro_confirmado_em: null, registro_confirmado_por: null }),
], ['Registro confirmado (sem registro de quem conferiu).', 'Registro confirmado (sem registro de quem conferiu).']);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
