/** node src/lib/compartilharArquivos.teste.mjs — sem framework. */
const { montarArquivos, podeCompartilharArquivos, compartilharArquivos } = await import('./compartilharArquivos.js');
let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  if (!passou) console.log('FALHOU:', nome, '\n  esperado', JSON.stringify(esperado), '\n  obtido  ', JSON.stringify(obtido));
}
const arqs = montarArquivos([{ blob: new Blob(['a']), nome: 'plano.pdf' }, { blob: new Blob(['b']), nome: 'compras.pdf' }]);
t('monta 2 arquivos pdf', arqs.map(a => [a.name, a.type]), [['plano.pdf', 'application/pdf'], ['compras.pdf', 'application/pdf']]);
t('sem navigator.share não pode', podeCompartilharArquivos(arqs, {}), false);
t('sem canShare não pode', podeCompartilharArquivos(arqs, { share() {} }), false);
t('canShare false', podeCompartilharArquivos(arqs, { share() {}, canShare: () => false }), false);
t('canShare lança', podeCompartilharArquivos(arqs, { share() {}, canShare() { throw new Error('x'); } }), false);
t('canShare true', podeCompartilharArquivos(arqs, { share() {}, canShare: () => true }), true);

let recebido = null;
const navOk = { canShare: () => true, share: async (d) => { recebido = d; } };
t('compartilha ok', await compartilharArquivos(arqs, navOk), { ok: true });
t('manda só os arquivos (sem url, text nem title)', Object.keys(recebido), ['files']);
t('cancelado pelo usuário', await compartilharArquivos(arqs, { canShare: () => true, share: async () => { const e = new Error('c'); e.name = 'AbortError'; throw e; } }), { ok: false, cancelado: true });
const r = await compartilharArquivos(arqs, { canShare: () => true, share: async () => { throw new Error('boom'); } });
t('erro vira mensagem', [r.ok, /boom/.test(r.msg)], [false, true]);
t('aparelho sem suporte', (await compartilharArquivos(arqs, {})).ok, false);
console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
