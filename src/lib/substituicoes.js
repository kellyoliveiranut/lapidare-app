// Funções puras da Lista de substituição (editor da nutri, PDF e tela da paciente).

export const CATEGORIAS_SUGERIDAS = ['Proteínas', 'Carboidratos', 'Frutas', 'Laticínios', 'Gorduras', 'Outros'];

const txt = (v) => String(v ?? '').trim();

// Agrupa por categoria, na ordem em que cada categoria aparece pela 1ª vez.
// Sem nenhuma categoria preenchida → um único grupo sem título (comportamento antigo).
// Misturado: as linhas sem categoria vão para o fim, sob "Outras".
export function agruparPorCategoria(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  if (!itens.some(s => txt(s?.categoria))) return [{ categoria: '', itens: itens.slice() }];
  const grupos = new Map();
  const semCat = [];
  for (const s of itens) {
    const c = txt(s?.categoria);
    if (!c) { semCat.push(s); continue; }
    const chave = c.toLowerCase();
    if (!grupos.has(chave)) grupos.set(chave, { categoria: c, itens: [] });
    grupos.get(chave).itens.push(s);
  }
  const saida = [...grupos.values()];
  if (semCat.length) saida.push({ categoria: 'Outras', itens: semCat });
  return saida;
}

// Move o item de índice i uma posição (delta -1 sobe, +1 desce). Não muta.
export function mover(lista, i, delta) {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const nova = lista.slice();
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

// Linhas com original preenchido contam; "sem substitutos" é original sem opções
// (ou opções sem original, que seriam descartadas ao publicar).
export function resumo(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  let total = 0, semSubstitutos = 0, semAlimento = 0;
  for (const s of itens) {
    const o = txt(s?.original);
    const subs = Array.isArray(s?.subs) ? s.subs.length : txt(s?.subs).length;
    if (!o && !subs) continue;
    if (!o) { semAlimento++; continue; }
    total++;
    if (!subs) semSubstitutos++;
  }
  return { total, semSubstitutos, semAlimento };
}

// Copia substituições de outro plano: ids novos, descarta vazias, e (modo
// 'acrescentar') ignora o que já existe pelo alimento original.
export function importarSubstituicoes(atual, doutroPlano, modo, novoId) {
  const base = Array.isArray(atual) ? atual : [];
  const vindas = (Array.isArray(doutroPlano) ? doutroPlano : [])
    .filter(s => txt(s?.original))
    .map(s => ({
      _id: novoId(),
      original: txt(s.original),
      categoria: txt(s.categoria),
      subs: Array.isArray(s.subs)
        ? s.subs.map(x => (typeof x === 'object' ? txt(x?.nome) : txt(x))).filter(Boolean).join(', ')
        : txt(s.subs),
    }));
  if (modo === 'substituir') return vindas;
  const existentes = new Set(base.map(s => txt(s.original).toLowerCase()).filter(Boolean));
  return [...base, ...vindas.filter(s => !existentes.has(s.original.toLowerCase()))];
}
