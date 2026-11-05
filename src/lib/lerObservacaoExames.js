/* Lê o texto das Observações de um exame ("Hematócrito: 37%, VCM: 90.9 fL, …")
   e devolve os números por campo, EXATAMENTE como escritos no texto.
   Sem IA e sem arredondar: o que está depois do ":" é o que vai para o campo.
   Rótulo que não é reconhecido fica de fora (e vai em `ignorados`). Comentários
   sem ":" ("Hemoglobina levemente abaixo…") e o que vem entre parênteses são
   descartados. Funções puras, rodam no node (ver lerObservacaoExames.teste.mjs). */

const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Primeiro trecho do rótulo → chave do campo. Os 8 principais não levam prefixo;
// os extras vão com 'x_' (a mesma chave do estado do formulário).
const ALIAS = [
  ['hemoglobina', 'hemoglobina'], ['leucocitos', 'leucocitos'], ['neutrofilos', 'neutrofilos'],
  ['linfocitos', 'linfocitos'], ['plaquetas', 'plaquetas'], ['pcr', 'pcr'],
  ['albumina', 'albumina'], ['glicemia', 'glicemia'],
  ['hematocrito', 'x_hematocrito'], ['hemacias', 'x_hemacias'], ['vcm', 'x_vcm'],
  ['hcm', 'x_hcm'], ['chcm', 'x_chcm'], ['rdw', 'x_rdw'],
  ['eosinofilos', 'x_eosinofilos'], ['basofilos', 'x_basofilos'],
  ['monocitos', 'x_monocitos'], ['bastoes', 'x_bastoes'],
  ['ureia', 'x_ureia'], ['creatinina', 'x_creatinina'], ['tfg', 'x_tfg'],
  ['tgo', 'x_tgo'], ['ast', 'x_tgo'], ['tgp', 'x_tgp'], ['alt', 'x_tgp'],
];

function chaveDoRotulo(rotulo) {
  const r = semAcento(rotulo).trim();
  for (const [prefixo, chave] of ALIAS) {
    if (r === prefixo || r.startsWith(prefixo + ' ') || r.startsWith(prefixo + '/')) return chave;
  }
  return null;
}

export function lerObservacaoExames(texto) {
  const valores = {};
  const ignorados = [];
  // Vírgula separa itens só quando vem uma letra depois; "0,4" não é cortado.
  const trechos = String(texto ?? '').split(/,\s*(?=[A-Za-zÀ-ÿ])/);
  for (const t of trechos) {
    const m = t.match(/^\s*([^:]+?)\s*:\s*(-?\d+(?:[.,]\d+)?)/);
    if (!m) continue;
    const chave = chaveDoRotulo(m[1]);
    if (!chave) { ignorados.push(m[1].trim()); continue; }
    if (!(chave in valores)) valores[chave] = m[2];
  }
  return { valores, ignorados };
}
