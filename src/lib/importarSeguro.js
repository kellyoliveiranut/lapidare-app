/**
 * Import dinâmico com mensagem clara quando o app foi atualizado.
 *
 * Cada publicação gera arquivos novos com hash no nome (jspdf.es.min-CKurBNo3.js).
 * Quem deixou a página aberta durante uma publicação ainda aponta para os nomes
 * antigos, que o servidor já não tem — e o navegador responde "Failed to fetch
 * dynamically imported module", que não diz nada a ninguém. Aqui isso vira uma
 * instrução: recarregar a página.
 *
 * NÃO recarrega sozinho de propósito: a tela pode ter texto digitado (plano,
 * observação) que um reload perderia.
 */
export function ehErroDeChunk(e) {
  const msg = String(e?.message ?? '');
  return e?.name === 'ChunkLoadError'
    || msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('error loading dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('valid JavaScript MIME type')
    || msg.includes('Loading chunk');
}

export const MSG_APP_ATUALIZADO =
  'O app foi atualizado desde que esta página abriu. Salve o que estiver escrevendo, '
  + 'recarregue a página (F5, ou puxe para atualizar no iPad) e tente de novo.';

export async function importarSeguro(carregar) {
  try {
    return await carregar();
  } catch (e) {
    if (ehErroDeChunk(e)) throw new Error(MSG_APP_ATUALIZADO);
    throw e;
  }
}
