/**
 * Abrir janela/arquivo sem cair no bloqueio de pop-up do Safari (iPad/iPhone).
 *
 * O Safari só deixa window.open passar se ele acontecer DENTRO do toque. Depois
 * de um await (buscar link assinado, gerar algo) o gesto já foi consumido e a
 * janela é barrada em silêncio — o botão "não faz nada". Por isso a janela é
 * aberta primeiro, em branco, e o endereço entra depois.
 */

/** iPad (que se apresenta como Mac com tela de toque), iPhone e iPod. */
export function ehIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Abre `obterUrl()` (async) numa nova aba. Devolve a URL, ou null se não houve.
 * Quem chama trata o erro: a aba em branco já foi fechada.
 */
export async function abrirComUrl(obterUrl) {
  const janela = window.open('', '_blank');
  try {
    const url = await obterUrl();
    if (!url) { janela?.close(); return null; }
    if (janela) janela.location.href = url;
    else window.open(url, '_blank', 'noopener');
    return url;
  } catch (e) {
    janela?.close();
    throw e;
  }
}

const BARRA = `<style>@media print{.nao-imprimir{display:none!important}}</style>
<div class="nao-imprimir" style="position:sticky;top:0;z-index:9;background:#281b06;padding:10px 14px;text-align:center">
<button onclick="window.print()" style="font:600 15px -apple-system,Helvetica,Arial,sans-serif;padding:10px 18px;border:0;border-radius:8px;background:#c9a96e;color:#281b06">Imprimir / salvar PDF</button></div>`;

/**
 * Abre um HTML pronto para imprimir/salvar como PDF. Chamar direto no clique
 * (sem await antes). Em iPad/iPhone a impressão automática não abre, então
 * ela é tirada e entra um botão "Imprimir / salvar PDF" (toque dentro da janela
 * conta como gesto). No computador segue como antes: imprime sozinho.
 *
 * `autoImprimir`: para HTML que não traz o próprio <script> de impressão.
 * Devolve false se o navegador barrou a janela.
 */
export function abrirParaImprimir(html, { janela = undefined, autoImprimir = false } = {}) {
  const win = window.open('', '_blank', janela);
  if (!win) return false;
  const ios = ehIOS();
  let doc = String(html);
  if (ios) doc = doc.replace(/<script>\s*window\.onload[\s\S]*?<\/script>/, '');
  doc = /<body[^>]*>/i.test(doc) ? doc.replace(/<body[^>]*>/i, (m) => m + BARRA) : BARRA + doc;
  win.document.write(doc);
  win.document.close();
  if (autoImprimir && !ios) setTimeout(() => win.print(), 600);
  return true;
}
