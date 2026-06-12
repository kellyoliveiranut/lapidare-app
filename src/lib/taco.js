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

// Retorna { gramas, porcaoTexto } — gramagem do substituto que equivale a kcalAlvo.
// porcaoTexto é opcional ("~2 porções") quando porcao_g está na TACO.
export function kcalEquivalente(kcalAlvo, nomeSubstituto) {
  if (!kcalAlvo || kcalAlvo <= 0) return null;
  const al = buscarAlimento(nomeSubstituto);
  if (!al || !al.kcal || al.kcal <= 0) return null;

  const gramas = Math.round((kcalAlvo * 100) / al.kcal);

  let porcaoTexto = null;
  if (al.porcao_g && al.porcao_g > 0) {
    const n = +(gramas / al.porcao_g).toFixed(1);
    if (n >= 0.5 && n <= 20) {
      const fmt = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
      porcaoTexto = `~${fmt} porção${n === 1 ? '' : 'ões'}`;
    }
  }

  return { gramas, porcaoTexto };
}
