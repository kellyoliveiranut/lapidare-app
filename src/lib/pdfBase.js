/**
 * Base comum dos PDFs do Essentia.
 *
 * Nasceu de duplicação medida, não suposta: a solicitação de exames
 * (_SolicitacaoExames.jsx) e a prescrição de suplementação (_Suplementacao.jsx)
 * tinham geometria, paleta e as quatro primitivas de desenho IDÊNTICAS linha a
 * linha — mais a moldura inteira do documento (faixa de cabeçalho, bloco do
 * emissor, card da paciente e rodapé) repetida com só o título variando.
 *
 * O que NÃO mora aqui, de propósito: as métricas de item de cada documento
 * (FS_ITEM/LH_ITEM, FS_NOME/PAD_V/GAP_*...) e o corpo específico. Aquilo é a
 * identidade de cada documento; isto aqui é a infraestrutura.
 *
 * A DATA DE EMISSÃO é parâmetro e não `new Date()` daqui. Duas razões: o módulo
 * não deveria decidir a data de um documento, e um relógio escondido na base
 * tornaria impossível comparar duas gerações byte a byte.
 */

export const PAGE_W = 595.28, PAGE_H = 841.89;
export const M = 72;
export const W = PAGE_W - M * 2;
export const TOPO = 64;
export const FUNDO = PAGE_H - 56;

// Paleta em RGB: setFillColor(r,g,b) é a assinatura que não depende do parser
// de cor CSS do jsPDF.
export const CREME  = [253, 251, 248];  // #FDFBF8  fundo da página
export const ESCURO = [26, 22, 18];     // #1a1612  faixa do cabeçalho
export const TINTA  = [40, 27, 6];      // #281b06  texto principal
export const OURO   = [196, 168, 130];  // #C4A882  selo e marca do rodapé
export const BRONZE = [160, 132, 86];   // #a08456  rótulos e registro
export const CINZA  = [141, 129, 117];  // #8d8175  data de emissão
export const SEPIA  = [107, 92, 62];    // #6b5c3e  horário e observação
export const LINHA  = [221, 213, 196];  // #DDD5C4  bordas do card e do rodapé
export const LINHA2 = [237, 230, 218];  // #EDE6DA  divisória entre itens

/**
 * Cria o documento e devolve as primitivas já amarradas a ele.
 *
 * O import do jsPDF é dinâmico pelo mesmo motivo que era nos dois geradores:
 * estático, ele entraria no chunk da tela, baixado ao abrir a aba mesmo por
 * quem nunca gera PDF.
 *
 * `caberOuQuebrar` RECEBE e DEVOLVE o y, em vez de fechar sobre uma variável
 * local. É o que permitiu extrair a função sem transformar todo `y` do chamador
 * em `p.y`: assim `doc`, `escrever` e `regua` saem por desestruturação e as
 * chamadas continuam escritas exatamente como antes.
 */
export async function criarDocumento() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // O fundo creme era `body { background }`. Em PDF não existe fundo herdado:
  // é retângulo pintado, e em toda página nova.
  function pintarFundo() {
    doc.setFillColor(...CREME);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  }

  // Um lugar só pro quarteto setFont/setFontSize/setTextColor/text.
  // charSpace é o letter-spacing do CSS convertido pra pt absolutos.
  function escrever(txt, x, base, opc = {}) {
    const { fonte = 'helvetica', estilo = 'normal', tamanho = 10.5,
            cor = TINTA, charSpace = 0, align } = opc;
    doc.setFont(fonte, estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    doc.text(txt, x, base, { charSpace, ...(align ? { align } : null) });
  }

  function regua(yLinha, cor, largura = W, x = M) {
    doc.setDrawColor(...cor);
    doc.setLineWidth(0.375);       // as bordas de .5px
    doc.line(x, yLinha, x + largura, yLinha);
  }

  function caberOuQuebrar(y, altura) {
    if (y + altura <= FUNDO) return y;
    doc.addPage();
    pintarFundo();
    return TOPO;
  }

  pintarFundo();
  return { doc, pintarFundo, escrever, regua, caberOuQuebrar };
}

/**
 * Faixa escura do topo + bloco do emissor. Devolve o novo y.
 *
 * `tamanhoTitulo` é parâmetro porque os dois documentos divergem de propósito:
 * 22,5pt na Suplementação e 19pt nos Exames — lá o título é curto, e o tamanho
 * menor deixa margem para um título mais longo entrar sem estourar, já que aqui
 * não há quebra automática de linha.
 */
export function cabecalho(p, y, { sobrancelha, titulo, tamanhoTitulo, dataEmissao }) {
  const { doc, escrever } = p;
  const H_CAB = 95;
  doc.setFillColor(...ESCURO);
  doc.roundedRect(M, y, W, H_CAB, 7.5, 7.5, 'F');
  // text-transform: uppercase não existe no jsPDF — a caixa alta vai no JS.
  escrever(sobrancelha.toUpperCase(), M + 24, y + 32,
    { estilo: 'bold', tamanho: 7.1, cor: OURO, charSpace: 1.57 });
  escrever(titulo, M + 24, y + 62,
    { fonte: 'times', estilo: 'bold', tamanho: tamanhoTitulo, cor: CREME });
  escrever(`Emitida em ${dataEmissao}`, M + 24, y + 80,
    { tamanho: 7.9, cor: CINZA });
  y += H_CAB + 19.5;

  escrever('Kelly Oliveira', M, y, { fonte: 'times', estilo: 'bold', tamanho: 12.75 });
  y += 13;
  escrever('Nutricionista · CRN 3801', M, y,
    { tamanho: 8.25, cor: BRONZE, charSpace: 0.33 });
  y += 16.5;
  return y;
}

/**
 * Card branco com nome e contato da paciente. Devolve o novo y.
 *
 * Colunas fixas: o CSS usava flex com gap, então a coluna do contato começava
 * onde o nome terminasse. Fixo fica igual entre pacientes; em compensação um
 * nome muito longo é cortado na largura da coluna em vez de invadir o vizinho.
 */
export function cardPaciente(p, y, { pacienteNome, contato }) {
  const { doc, escrever } = p;
  const H_CARD = 52;
  const COL1_W = 215;
  const COL2 = M + 15 + 230;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...LINHA);
  doc.setLineWidth(0.375);
  doc.roundedRect(M, y, W, H_CARD, 6, 6, 'FD');
  escrever('Paciente'.toUpperCase(), M + 15, y + 20,
    { estilo: 'bold', tamanho: 6.4, cor: BRONZE, charSpace: 1.02 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  escrever(doc.splitTextToSize(String(pacienteNome ?? '—'), COL1_W)[0], M + 15, y + 36);
  escrever('Contato'.toUpperCase(), COL2, y + 20,
    { estilo: 'bold', tamanho: 6.4, cor: BRONZE, charSpace: 1.02 });
  escrever(contato?.telefone || '—', COL2, y + 36);
  y += H_CARD + 22.5;
  return y;
}

/**
 * Assinatura e marca do rodapé. É o fim do documento, então não devolve y.
 * A checagem de altura cobre o bloco inteiro — o rodapé partido em duas
 * páginas era o `page-break-inside: avoid` do CSS anterior.
 */
export function rodape(p, y) {
  const { escrever, regua, caberOuQuebrar } = p;
  y = caberOuQuebrar(y, 30 + 90);
  y += 30;
  regua(y, TINTA, 195);                          // .assinatura-linha, 260px
  y += 4.5 + 9.4;
  escrever('Kelly Oliveira', M, y, { fonte: 'times', estilo: 'bold', tamanho: 9.4 });
  y += 11;
  escrever('Nutricionista · CRN 3801', M, y, { tamanho: 8.25, cor: SEPIA });
  y += 19.5 + 7.5;
  regua(y, LINHA);
  y += 12;
  escrever('Documento gerado pelo app Essentia', PAGE_W / 2, y,
    { tamanho: 7.1, cor: OURO, charSpace: 0.71, align: 'center' });
}

/**
 * plano-alimentar-maria-souza.pdf — sem acento e sem espaço, que é o que
 * atravessa Windows, Android e iOS sem o navegador reescrever o nome. NFD
 * separa a letra do acento e o filtro por código descarta o acento solto;
 * o regex é feito sem \u de propósito, pra não depender de escape no fonte.
 *
 * Os dois geradores de PDF chamam esta função: o plano alimentar passa um
 * prefixo fixo, a prescrição de suplementação passa o modo.slug escolhido no
 * modal. O prefixo é parâmetro justamente porque os dois precisam de prefixos
 * diferentes — até a unificação, cada gerador carregava sua própria cópia.
 */
export function nomeArquivoPdf(prefixo, pacienteNome) {
  const semAcento = String(pacienteNome ?? '')
    .normalize('NFD')
    .split('')
    .filter(c => c.charCodeAt(0) < 128)
    .join('');
  const slug = semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${prefixo}-${slug || 'paciente'}.pdf`;
}

/**
 * Baixa um blob no navegador de quem clicou.
 *
 * O doc.save() do jsPDF faz exatamente isto por dentro. Aqui é explícito
 * porque o blob já saiu do gerador para subir no storage — gerar de novo só
 * para salvar seria desenhar o documento duas vezes.
 *
 * O revokeObjectURL vai num setTimeout, e não na mesma volta do event loop:
 * revogar imediatamente cancela o download em alguns navegadores, porque a
 * URL morre antes de o download realmente começar.
 */
export function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
