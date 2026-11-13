/* Apoio ao envio dos PDFs por e-mail (função netlify enviar-pdfs-paciente).
   Sem rede e sem React; emailPdfs.teste.mjs. */

// Mesmo teto do servidor: o corpo da função aceita ~6 MB e o base64 incha 33%.
export const LIMITE_BYTES_EMAIL = 4.5 * 1024 * 1024;

/** Blob -> base64 (sem o prefixo data:). Em pedaços, para não estourar a pilha. */
export async function blobParaBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO));
  }
  return btoa(bin);
}

/** Cabe num e-mail? `itens` = [{ blob }]. Soma os bytes reais dos PDFs. */
export function cabeNoEmail(itens) {
  const total = (itens ?? []).reduce((s, i) => s + (i?.blob?.size ?? 0), 0);
  return { cabe: total <= LIMITE_BYTES_EMAIL, total };
}

/** Texto de confirmação: o endereço aparece SEMPRE, para a nutri conferir. */
export function textoConfirmacaoEmail(email, nomes) {
  const n = nomes.length;
  return `Enviar ${n} PDF${n > 1 ? 's' : ''} para ${email}?\n\n${nomes.join('\n')}\n\nConfira o endereço antes de enviar.`;
}

/** E-mail minimamente plausível (o servidor valida de novo). */
export function emailPlausivel(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}
