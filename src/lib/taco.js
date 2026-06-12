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

// Encontra o alimento na TACO por nome normalizado.
// Ordem: 1) exato, 2) busca ⊂ norm, 3) norm ⊂ busca, 4) todas as palavras, 5) melhor parcial.
export function buscarAlimento(nome) {
  if (!nome) return null;
  const n = normalizar(nome);
  if (!n) return null;

  let r = _lista.find(a => a.norm === n);
  if (r) return r;

  r = _lista.find(a => a.norm.includes(n));
  if (r) return r;

  r = _lista.find(a => n.includes(a.norm));
  if (r) return r;

  const words = n.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0) {
    r = _lista.find(a => words.every(w => a.norm.includes(w)));
    if (r) return r;

    let best = null, bestScore = 0;
    for (const a of _lista) {
      const score = words.filter(w => a.norm.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    if (best && bestScore >= Math.ceil(words.length * 0.6)) return best;
  }

  return null;
}

// Extrai gramas de uma string de quantidade ("150g", "200 ml", "100 g")
function _parseGramas(qty) {
  if (!qty) return null;
  const m = String(qty).match(/(\d+(?:[,.]\d+)?)\s*(?:g(?:r(?:ama?s?)?)?\b|ml\b)/i);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// kcal do alimento original calculada via TACO + quantidade do plano
export function kcalDoAlimento(nomeAlimento, qtyStr) {
  const al = buscarAlimento(nomeAlimento);
  if (!al || !al.kcal || al.kcal <= 0) return null;
  const g = _parseGramas(qtyStr);
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

  return { gramas, medida };
}
