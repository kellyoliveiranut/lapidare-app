/* Separa o endereço escrito em texto livre ("Travessa Curuzu, 430, apartamento
   1403, Edifício Maiatá III, bairro da Pedreira, CEP 66085110") nos campos da
   nota fiscal. Só preenche o que dá para reconhecer com segurança; o resto
   fica vazio (cidade e UF costumam vir do CEP, pela consulta ao ViaCEP).
   Funções puras (ver separarEndereco.teste.mjs). */

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const VAZIO = { end_cep: '', end_logradouro: '', end_numero: '', end_complemento: '', end_bairro: '', end_cidade: '', end_uf: '' };

const RE_COMPLEMENTO = /^(apto?\.?|apartamento|ap\.?|bloco|bl\.?|casa|sala|sl\.?|ed\.?|edif[ií]cio|condom[ií]nio|cond\.?|lote|lt\.?|quadra|qd\.?|andar|torre|conjunto|conj\.?|fundos|loja|cobertura)\b/i;
const RE_NUMERO = /^(?:n[º°o.]?\s*)?(\d+[A-Za-z]?|s\/?n)$/i;

export function separarEndereco(texto) {
  const out = { ...VAZIO };
  let t = String(texto ?? '').trim();
  if (!t) return out;

  // CEP: 8 dígitos, com ou sem hífen/ponto, de preferência depois de "CEP".
  const mCep = t.match(/\bcep[:\s]*([0-9]{2}\.?[0-9]{3}-?[0-9]{3})\b/i) || t.match(/\b([0-9]{5}-?[0-9]{3})\b/);
  if (mCep) {
    out.end_cep = mCep[1].replace(/\D/g, '');
    t = t.replace(mCep[0], ',');
  }

  const partes = t.split(/\s*[,;]\s*|\s+-\s+/).map(p => p.trim()).filter(Boolean);
  const sobra = [];
  const compl = [];
  partes.forEach((p, i) => {
    if (i === 0) { out.end_logradouro = p; return; }
    if (!out.end_numero && RE_NUMERO.test(p)) { out.end_numero = p.replace(/^n[º°o.]?\s*/i, ''); return; }
    const mBairro = p.match(/^bairro\s+(?:d[aeo]s?\s+)?(.+)$/i);
    if (mBairro) { out.end_bairro = mBairro[1].trim(); return; }
    if (RE_COMPLEMENTO.test(p)) { compl.push(p); return; }
    if (!out.end_uf && /^[A-Z]{2}$/.test(p) && UFS.includes(p)) { out.end_uf = p; return; }
    sobra.push(p);
  });
  // Número colado na rua: "Rua das Flores 220".
  if (!out.end_numero) {
    const m = out.end_logradouro.match(/^(.*\D)\s+(\d+[A-Za-z]?)$/);
    if (m) { out.end_logradouro = m[1].trim(); out.end_numero = m[2]; }
  }
  out.end_complemento = compl.join(', ');
  // O que sobrou, na ordem "bairro, cidade". Na dúvida fica vazio: errar o
  // bairro numa nota é pior do que deixar em branco (o CEP completa o resto).
  if (out.end_bairro) {
    if (sobra.length >= 1) out.end_cidade = sobra[sobra.length - 1];
  } else if (sobra.length >= 2) {
    out.end_bairro = sobra[sobra.length - 2];
    out.end_cidade = sobra[sobra.length - 1];
  } else if (sobra.length === 1 && !out.end_cep) {
    out.end_bairro = sobra[0];
  }
  return out;
}
