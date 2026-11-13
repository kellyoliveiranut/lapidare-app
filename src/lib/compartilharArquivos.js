/* ============================================================
   COMPARTILHAR ARQUIVOS (folha de compartilhar do aparelho)

   Manda SÓ os arquivos, sem `url`, `text` nem `title`. É isso que evita o
   "blob:https://…" colado embaixo do PDF no WhatsApp: esse texto aparece quando
   o PDF é compartilhado a partir da aba do navegador (o endereço da aba entra
   junto com o arquivo). Aqui a folha de compartilhar recebe o arquivo puro.

   Sem rede e sem React; compartilharArquivos.teste.mjs.
   ============================================================ */

/** Monta File(s) a partir de [{ blob, nome }]. */
export function montarArquivos(itens) {
  return (itens ?? []).map(i => new File([i.blob], i.nome, { type: 'application/pdf' }));
}

/** O aparelho consegue compartilhar ESTES arquivos? (false no computador comum). */
export function podeCompartilharArquivos(arquivos, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try { return !!nav.canShare({ files: arquivos }); } catch { return false; }
}

/**
 * Abre a folha de compartilhar com os arquivos. Precisa ser chamado direto de
 * um toque (sem await antes), senão o Safari recusa.
 * Devolve { ok: true } | { ok: false, cancelado: true } | { ok: false, msg }.
 */
export async function compartilharArquivos(arquivos, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!podeCompartilharArquivos(arquivos, nav)) {
    return { ok: false, msg: 'Este aparelho não consegue compartilhar arquivos por aqui. Use "Baixar todos os PDFs".' };
  }
  try {
    await nav.share({ files: arquivos });
    return { ok: true };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, cancelado: true };
    return { ok: false, msg: `Não consegui abrir o compartilhamento: ${e?.message ?? e}` };
  }
}
