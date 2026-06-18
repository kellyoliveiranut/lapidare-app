import { useState, useEffect } from 'react';

// ── Cache de módulo ──────────────────────────────────────────────────────────
// _lista fica null até o JSON carregar. Todas as funções de lookup retornam
// null/vazio enquanto _lista for null — sem quebrar nada na tela.
let _lista = null;
const _readyCbs = new Set();

// Dispara o download assim que o módulo é importado pela primeira vez.
// O import() dinâmico faz o Vite criar um chunk separado para taco_app.json
// em vez de embutir os dados em PlanoView ou PacientePerfil.
import('../data/taco_app.json')
  .then(m => {
    _lista = (m.default ?? m).alimentos ?? [];
    _readyCbs.forEach(fn => fn());
    _readyCbs.clear();
  })
  .catch(() => {
    // Falha de rede: funções continuam retornando null — sem crash.
    _readyCbs.clear();
  });

/**
 * Assina o evento "TACO pronto". Chama cb() imediatamente se já carregou.
 * Retorna função de cancelamento.
 */
export function _subscribeTaco(cb) {
  if (_lista !== null) { cb(); return () => {}; }
  _readyCbs.add(cb);
  return () => _readyCbs.delete(cb);
}

/**
 * Hook React — força re-render quando taco_app.json termina de carregar.
 * Chame uma vez no topo de qualquer componente que exiba valores derivados do TACO.
 * Medidas já salvas (al.medida etc.) aparecem ANTES do TACO carregar;
 * o fallback TACO preenche logo depois.
 */
export function useTacoReady() {
  const [ready, setReady] = useState(() => _lista !== null);
  useEffect(() => {
    if (_lista !== null) return;
    return _subscribeTaco(() => setReady(true));
  }, []);
  return ready;
}

// ── Utilitários ──────────────────────────────────────────────────────────────

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
// Retorna null se _lista ainda não carregou OU se não encontrar.
export function buscarAlimento(nome) {
  if (!_lista || !nome) return null;
  const n = normalizar(nome);
  if (!n) return null;

  // 1) Exato
  let r = _lista.find(a => a.norm === n);
  if (r) return r;

  // 2) Nome do alimento contém o termo buscado
  if (n.length >= 4) {
    r = _lista.find(a => a.norm.includes(n));
    if (r) return r;
  }

  // 3) Busca contém o nome do alimento — exige ≥8 chars para evitar ingredientes curtos
  r = _lista.find(a => a.norm.length >= 8 && n.includes(a.norm));
  if (r) return r;

  // 4) Content-word match com verificação de coerência de classe
  const stripped = n.replace(/\bsem\s+\w+/g, '').trim();
  const words = stripped
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return null;

  const searchIsLiquid = LIQUID_CLASSES.some(kw => n.includes(kw));
  r = _lista.find(a => {
    if (!words.every(w => a.norm.includes(w))) return false;
    if (searchIsLiquid && !LIQUID_CLASSES.some(kw => a.norm.includes(kw))) return false;
    return true;
  });
  return r ?? null;
}

// Extrai gramas de uma string de quantidade ("150g", "200 ml", "100 g")
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
// Null se porcao_g ausente, contagem fora de [0,5–6] ou TACO não carregado.
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

  // Arredonda para múltiplo de 0,5 mais próximo
  const qtdArred = Math.round(qtd * 2) / 2;
  // Esconde medida se a contagem ficou fora do intervalo razoável
  if (qtdArred < 0.5 || qtdArred > 6) return null;
  // Remove o ",0" desnecessário (2,0 → "2")
  const qtdStr = qtdArred % 1 === 0
    ? String(Math.round(qtdArred))
    : qtdArred.toFixed(1).replace('.', ',');
  return `${qtdStr} ${unidade}`;
}

// Retorna { gramas, medida } — gramagem do substituto que equivale a kcalAlvo.
// Retorna null se TACO não carregou ainda.
export function kcalEquivalente(kcalAlvo, nomeSubstituto) {
  if (!kcalAlvo || kcalAlvo <= 0) return null;
  const al = buscarAlimento(nomeSubstituto);
  if (!al || !al.kcal || al.kcal <= 0) return null;

  const gramasRaw = (kcalAlvo * 100) / al.kcal;
  const gramas = gramasRaw > 20
    ? Math.round(gramasRaw / 5) * 5
    : Math.round(gramasRaw);
  const medida = medidaCaseira(gramas, al);
  const liquido = ehLiquido(al);

  return { gramas, medida, liquido };
}
