/**
 * Teste standalone do marcador e do contador de "registro pendente" na lista
 * de pacientes da nutri (bloco-88).
 * Roda com `node src/lib/registroPendenteLista.teste.mjs`, sem framework, na raiz do repo.
 *
 * registroPendente.js repete a regra de registroPendente() de protocoloCiclo.js
 * para a tela de Pacientes não carregar o catálogo; aqui as duas são
 * comparadas valor a valor.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const { linhaPendente, idsComRegistroPendente, contarRegistroPendente } = await import('./registroPendente.js');
const { registroPendente } = await import('./protocoloCiclo.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// Regra: só false exato confirma.
t('linha com true → pendente', linhaPendente({ paciente_id: 'a', registro_pendente: true }), true);
t('linha com null → pendente', linhaPendente({ paciente_id: 'a', registro_pendente: null }), true);
t('linha sem a coluna → pendente', linhaPendente({ paciente_id: 'a' }), true);
t('linha com false → confirmado', linhaPendente({ paciente_id: 'a', registro_pendente: false }), false);
t('"false" e 0 não confirmam', [linhaPendente({ registro_pendente: 'false' }), linhaPendente({ registro_pendente: 0 })], [true, true]);
t('sem linha → não pendente', [linhaPendente(null), linhaPendente(undefined)], [false, false]);
const VALORES = [true, false, null, undefined, 'false', 0, 1, ''];
t('mesma regra de registroPendente() do protocoloCiclo.js, valor a valor',
  VALORES.map(v => linhaPendente({ registro_pendente: v })), VALORES.map(v => registroPendente({ registro_pendente: v })));
t('mesma regra sem tratamento', [linhaPendente(null), linhaPendente(undefined)], [registroPendente(null), registroPendente(undefined)]);

// 5 pacientes misturadas: A true, B false, C null, D sem a coluna, E sem linha.
const PACIENTES = ['A', 'B', 'C', 'D', 'E'].map(id => ({ id }));
const LINHAS = [
  { paciente_id: 'A', registro_pendente: true },
  { paciente_id: 'B', registro_pendente: false },
  { paciente_id: 'C', registro_pendente: null },
  { paciente_id: 'D' },
];
const ids = idsComRegistroPendente({ data: LINHAS, error: null });
t('5 pacientes: pendentes A, C e D; B confirmada; E sem tratamento não conta', [...ids].sort(), ['A', 'C', 'D']);
t('5 pacientes: contador = 3', contarRegistroPendente(PACIENTES, ids), 3);
t('marcador por paciente', PACIENTES.map(p => ids.has(p.id)), [true, false, true, true, false]);
t('contador só conta quem está na lista filtrada (busca deixou B, C e E)',
  contarRegistroPendente(PACIENTES.filter(p => ['B', 'C', 'E'].includes(p.id)), ids), 1);

// Erro na consulta: nenhum marcador, contador 0 (o cabeçalho só mostra com N > 0).
for (const [rotulo, res] of [
  ['erro (coluna inexistente)', { data: null, error: { code: '42703', message: 'column does not exist' } }],
  ['erro com data presente', { data: LINHAS, error: { message: 'falhou' } }],
  ['data null sem erro', { data: null, error: null }],
  ['resultado ausente', undefined],
]) {
  const s = idsComRegistroPendente(res);
  t(`${rotulo}: zero marcadores e contador 0`, [s.size, contarRegistroPendente(PACIENTES, s)], [0, 0]);
}
t('lista vazia de tratamentos: nada pendente', idsComRegistroPendente({ data: [], error: null }).size, 0);

// A tela: só leitura, um select a mais, sem importar o catálogo.
const tela = readFileSync(new URL('../app/nutri/Pacientes.jsx', import.meta.url), 'utf8').replace(/\r/g, '');
const blocoTrat = tela.slice(tela.indexOf(".from('tratamentos_oncologicos')"), tela.indexOf(".from('tratamentos_oncologicos')") + 120);
t('Pacientes.jsx: uma consulta a tratamentos_oncologicos, só select(paciente_id,registro_pendente)',
  [tela.split("from('tratamentos_oncologicos')").length - 1, /\.select\('paciente_id,registro_pendente'\)/.test(blocoTrat), /\.(insert|update|upsert|delete)\(/.test(blocoTrat)], [1, true, false]);
t('Pacientes.jsx não importa protocoloCiclo.js (catálogo fora da lista)', tela.includes('protocoloCiclo'), false);
t('Pacientes.jsx: selo "Registro pendente" com title e contador "N com registro pendente"',
  [tela.includes('>Registro pendente</span>'), tela.split('title="Registro pendente de confirmação"').length - 1, tela.includes('{nPendentes} com registro pendente')], [true, 2, true]);
t('Pacientes.jsx: selo no âmbar de _TratamentoOncologico.jsx',
  /background: '#fffbeb', color: '#92400e', border: '0\.5px solid #fde68a'/.test(tela), true);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
