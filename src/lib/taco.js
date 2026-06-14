import tacoData from '../data/taco_app.json';

const _lista = tacoData.alimentos;

// Remove acentos e coloca em minúsculo — idêntico ao campo "norm" do JSON
export function normalizar(nome) {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Keywords que indicam alimento líquido/lácteo: evitam casar "leite de X" com o ingrediente sólido X.
const LIQUID_CLASSES = ['leite', 'bebida', 'suco', 'cha', 'infusao', 'iogurte', 'queijo', 'requeijao', 'creme'];

// Termos no norm que identificam bebidas/líquidos (além do grupo "Bebidas")
const LIQUID_TERMS = ['leite', 'bebida', 'suco', 'agua', 'caldo', 'cha', 'cafe', 'refrigerante', 'isotonico', 'iogurte', 'kefir', 'vitamina', 'smoothie'];

// Retorna true se o alimento TACO for uma bebida/líquido.
export function ehLiquido(alimento) {
  if (!alimento) return false;
  if (alimento.grupo === 'Bebidas') return true;
  const n = alimento.norm ?? normalizar(alimento.nome ?? '');
  return LIQUID_TERMS.some(t => n.includes(t));
}

// Stop words de 3+ chars que não identificam alimentos (preposições/pronomes)
const STOP_WORDS = new Set(['dos', 'das', 'nas', 'nos', 'por', 'para']);

// Encontra o alimento na TACO por nome normalizado.
// Ordem: 1) exato, 2) food.norm contém busca, 3) busca contém food.norm (≥8 chars),
//        4) todas as content-words com checagem de classe líquida.
export function buscarAlimento(nome) {
  if (!nome) return null;
  const n = normalizar(nome);
  if (!n) return null;

  // 1) Exato
  let r = _lista.find(a => a.norm === n);
  if (r) return r;

  // 2) Nome do alimento contém o termo buscado (ex.: "aveia em flocos" ⊆ "aveia em flocos integral")
  if (n.length >= 4) {
    r = _lista.find(a => a.norm.includes(n));
    if (r) return r;
  }

  // 3) Busca contém o nome do alimento — exige ≥8 chars para evitar ingredientes curtos
  //    (ex.: "amendoa" com 7 chars NÃO casa "leite vegetal de amendoas")
  r = _lista.find(a => a.norm.length >= 8 && n.includes(a.norm));
  if (r) return r;

  // 4) Content-word match com verificação de coerência de classe
  //    Remove qualificadores negativos "sem X" antes de extrair as palavras-chave
  const stripped = n.replace(/\bsem\s+\w+/g, '').trim();
  const words = stripped
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return null;

  // Se a busca é de alimento líquido/lácteo, o resultado também deve sê-lo
  const searchIsLiquid = LIQUID_CLASSES.some(kw => n.includes(kw));

  r = _lista.find(a => {
    if (!words.every(w => a.norm.includes(w))) return false;
    if (searchIsLiquid && !LIQUID_CLASSES.some(kw => a.norm.includes(kw))) return false;
    return true;
  });
  return r ?? null;
}

// Extrai gramas de uma string de quantidade ("150g", "200 ml", "100 g")
// Trata ml como g para fins calóricos de alimentos líquidos.
export function parseGramas(qty) {
  if (!qty) return null;
  const m = String(qty).match(/(\d+(?:[,.]\d+)?)\s*(?:g(?:r(?:ama?s?)?)?\b|ml\b)/i);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// kcal do alimento original calculada via TACO + quantidade do plano
export function kcalDoAlimento(nomeAlimento, qtyStr) {
  const al = buscarAlimento(nomeAlimento);
  if (!al || !al.kcal || al.kcal <= 0) return null;
  const g = parseGramas(qtyStr);
  if (!g || g <= 0) return null;
  return (al.kcal * g) / 100;
}

// Retorna a medida caseira humanizada para {gramas} do {alimento} TACO.
// Ex.: "1,3 colher de sopa", "2,0 unidade". Null se porcao_g ausente.
export function medidaCaseira(gramas, alimento) {
  if (!alimento?.porcao_g || alimento.porcao_g <= 0) return null;

  const porcao = String(alimento.porcao ?? '');
  const m = porcao.match(/^(\d+(?:[,.]\d+)?)?\s*([^(]+?)\s*\(/);
  if (!m) return null;

  const quantidadeInicial = m[1] ? parseFloat(m[1].replace(',', '.')) : 1;
  let unidade = m[2].trim();
  if (!unidade) return null;

  // "col sopa" → "colher de sopa", "col chá" → "colher de chá", etc.
  unidade = unidade.replace(/\bcol\b\s+/g, 'colher de ');

  const qtd = (quantidadeInicial * gramas) / alimento.porcao_g;
  if (qtd <= 0) return null;

  return `${qtd.toFixed(1).replace('.', ',')} ${unidade}`;
}

// Retorna { gramas, medida } — gramagem do substituto que equivale a kcalAlvo.
// medida é a medida caseira humanizada via TACO (ex.: "1,3 colher de sopa").
export function kcalEquivalente(kcalAlvo, nomeSubstituto) {
  if (!kcalAlvo || kcalAlvo <= 0) return null;
  const al = buscarAlimento(nomeSubstituto);
  if (!al || !al.kcal || al.kcal <= 0) return null;

  const gramas = Math.round((kcalAlvo * 100) / al.kcal);
  const medida = medidaCaseira(gramas, al);
  const liquido = ehLiquido(al);

  return { gramas, medida, liquido };
}
