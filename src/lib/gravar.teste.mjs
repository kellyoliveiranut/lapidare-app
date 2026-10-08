/**
 * Teste standalone de gravar() (gravar.js).
 * Roda com `node src/lib/gravar.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes.
 * Nada aqui depende de data; o TZ_TESTE só prova que continua assim.
 * A "consulta" é um objeto falso: .select() devolve a resposta pronta, ou lança.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { gravar: gravarReal } = await import('./gravar.js');
// Se o helper LANÇAR (o que ele promete nunca fazer), o caso vira FALHA em vez
// de derrubar o teste: o lançamento aparece como { lancou: mensagem }.
const gravar = async (...a) => { try { return await gravarReal(...a); } catch (e) { return { lancou: e?.message }; } };

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// Guarda o que select() recebeu, para provar que o helper pede só o id.
let pediu = null;
const falsa = resposta => ({ select: cols => { pediu = cols; return Promise.resolve(resposta); } });
const lanca = msg => ({ select: () => Promise.reject(new Error(msg)) });
const lancaSincrono = msg => ({ select: () => { throw new Error(msg); } });

// ─── sucesso ─────────────────────────────────────────────────────────
{
  const r = await gravar(falsa({ data: [{ id: 'a' }], error: null }));
  t('sucesso', '1 linha: ok com os dados', r, { ok: true, data: [{ id: 'a' }] });
  t('sucesso', 'pede .select("id")', pediu, 'id');
}
t('sucesso', 'esperado null com 0 linhas: ok',
  await gravar(falsa({ data: [], error: null }), { esperado: null }), { ok: true, data: [] });
t('sucesso', 'esperado 3 com 3 linhas: ok',
  (await gravar(falsa({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null }), { esperado: 3 })).ok, true);

// ─── 0 linhas ────────────────────────────────────────────────────────
t('0 linhas', '0 linhas: falha com "nenhuma linha"',
  await gravar(falsa({ data: [], error: null })),
  { ok: false, msg: 'Não consegui salvar: nenhuma linha foi alterada. Recarregue e tente de novo.' });
t('0 linhas', 'data null sem erro conta como 0',
  await gravar(falsa({ data: null, error: null })),
  { ok: false, msg: 'Não consegui salvar: nenhuma linha foi alterada. Recarregue e tente de novo.' });

// ─── mais linhas que o esperado ──────────────────────────────────────
{
  const r = await gravar(falsa({ data: [{ id: 1 }, { id: 2 }], error: null }));
  t('mais linhas', '2 linhas com esperado 1: falha', r.ok, false);
  t('mais linhas', 'a mensagem diz quantas e quantas eram esperadas',
    r.msg, 'Não consegui salvar com segurança: 2 linhas foram alteradas, e o esperado era 1. Recarregue e confira.');
}

// ─── erro ────────────────────────────────────────────────────────────
t('erro', 'erro do banco: falha com a mensagem dele',
  await gravar(falsa({ data: null, error: { message: 'new row violates row-level security policy' } })),
  { ok: false, msg: 'Não consegui salvar: new row violates row-level security policy' });
t('erro', 'exceção de rede (promise rejeitada): devolve, não lança',
  await gravar(lanca('Failed to fetch')), { ok: false, msg: 'Não consegui salvar: Failed to fetch' });
t('erro', 'exceção síncrona no select: devolve, não lança',
  await gravar(lancaSincrono('boom')), { ok: false, msg: 'Não consegui salvar: boom' });

// ─── rótulo ──────────────────────────────────────────────────────────
t('rótulo', 'o rótulo entra na mensagem',
  (await gravar(falsa({ data: [], error: null }), { rotulo: 'cancelar a consulta' })).msg,
  'Não consegui cancelar a consulta: nenhuma linha foi alterada. Recarregue e tente de novo.');

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
