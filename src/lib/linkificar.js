/**
 * Quebra um texto em pedaços de texto e de link, para mostrar URLs clicáveis
 * (ex.: observação da tarefa com o link de uma reunião).
 *
 * Só reconhece http:// e https://, nada de javascript: ou data:. A pontuação que
 * costuma colar no fim do link ( . , ; : ! ? ) ] ) fica fora dele.
 */
export function partirComLinks(texto) {
  const s = String(texto ?? '');
  const partes = [];
  const RE = /https?:\/\/[^\s<>"]+/gi;
  let ultimo = 0;
  let m;
  while ((m = RE.exec(s))) {
    let url = m[0];
    const fim = /[.,;:!?)\]'”’]+$/.exec(url);
    if (fim) url = url.slice(0, url.length - fim[0].length);
    if (!/^https?:\/\/[^/\s]+\S*$/i.test(url) || url.length <= 8) continue;
    if (m.index > ultimo) partes.push({ tipo: 'texto', valor: s.slice(ultimo, m.index) });
    partes.push({ tipo: 'link', valor: url, href: url });
    ultimo = m.index + url.length;
    RE.lastIndex = ultimo;
  }
  if (ultimo < s.length) partes.push({ tipo: 'texto', valor: s.slice(ultimo) });
  return partes;
}
