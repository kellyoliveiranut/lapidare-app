/**
 * PDF do plano alimentar.
 *
 * Espelha o PlanoImpressao de src/app/paciente/Plano.jsx — mesmas seções, mesma
 * ordem, mesma tolerância a campo que falta. Aquele documento é HTML + print.css
 * e depende do diálogo de impressão do navegador; este devolve BLOB para subir
 * no storage e virar linha em dietas_pdf, como a solicitação de exames já faz.
 *
 * O espelhamento passou a ser verdade em 2026-09-11. Até então os dois lados
 * ignoravam em silêncio `dados.obs` (a observação geral) e `al.subs` (as opções
 * de um alimento, que não se confundem com `dados.substituicoes`, a lista
 * global): a nutri digitava os dois e a paciente não os via em lugar nenhum.
 * Agora os dois documentos mostram a observação logo após a identificação, e as
 * opções recuadas sob cada alimento.
 *
 * Uma divergência sobrou, e é deliberada: o HTML marca cada opção com "→" e
 * este PDF com "•". A seta não existe em WinAnsi e vazaria no stream como
 * 21 92 00, saindo como lixo — enquanto no HTML ela renderiza normalmente.
 *
 * As substituições ficam NESTE documento, e não num PDF separado, porque é assim
 * que o plano impresso sempre foi. dietas_pdf.tipo aceita 'substituicoes', mas
 * ninguém grava esse tipo hoje — separar é decisão de produto, não de código.
 */
import { criarDocumento, cabecalho, cardPaciente, rodape,
  M, W, TOPO, BRONZE, SEPIA, LINHA, LINHA2 } from './pdfBase.js';

const FS_SEC  = 7.9;
const FS_REF  = 10.5;
const FS_ITEM = 10, LH_ITEM = 13.5;
const COL_QTD = 120;          // largura reservada à quantidade, à direita
const PAD_SEC = 14;           // respiro depois da régua de seção
const PAD_REF = 12;           // respiro entre refeições
const FS_SUB  = 8.5, LH_SUB = 11.5;   // opções de substituição de um alimento
const IND_SUB = 14;           // recuo das opções sob o alimento

// Planos antigos guardam as opções de substituição de três jeitos: texto único,
// array de strings, ou array de objetos com .nome. Mesma tolerância do
// PlanoImpressao — um plano de 2024 não pode gerar PDF quebrado.
function textoSubs(subs) {
  if (Array.isArray(subs)) {
    return subs
      .map(s => (s && typeof s === 'object' ? (s.nome ?? '') : String(s ?? '')))
      .filter(Boolean)
      .join(', ');
  }
  return String(subs ?? '');
}

// Opções de substituição DE UM ALIMENTO, como lista. Irmão do textoSubs(), que
// junta tudo numa linha só para a seção global — e que NÃO é mexido aqui de
// propósito: alterá-lo mudaria o desenho da seção de substituições em todo
// plano já publicado, e esta mudança tem que ser puramente aditiva.
function listaSubs(subs) {
  if (Array.isArray(subs)) {
    return subs
      .map(s => (s && typeof s === 'object' ? (s.nome ?? '') : String(s ?? '')))
      .filter(Boolean);
  }
  return String(subs ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function secao(p, y, rotulo) {
  p.escrever(rotulo.toUpperCase(), M, y,
    { estilo: 'bold', tamanho: FS_SEC, cor: BRONZE, charSpace: 1.1 });
  y += 4.5;
  p.regua(y, LINHA);
  return y + PAD_SEC;
}

export async function gerarPDFPlano({ pacienteNome, contato, dados, publicadoEm }) {
  const p = await criarDocumento();
  const { doc, escrever, regua, caberOuQuebrar } = p;
  let y = TOPO;

  y = cabecalho(p, y, {
    sobrancelha: 'Essentia · Plano',
    titulo: 'Plano Alimentar',
    tamanhoTitulo: 21,
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
  });

  y = cardPaciente(p, y, { pacienteNome, contato });

  if (publicadoEm) {
    escrever(`Plano publicado em ${new Date(publicadoEm).toLocaleDateString('pt-BR')}`,
      M, y, { tamanho: 8.25, cor: SEPIA });
    y += 16.5;
  }

  // ── Observação geral do plano ──
  // Antes das refeições de propósito: é orientação que vale para o documento
  // inteiro, e quem lê precisa dela antes da lista, não depois dela.
  const obs = String(dados?.obs ?? '').trim();
  if (obs) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS_ITEM);
    const linhasObs = doc.splitTextToSize(obs, W);
    y = caberOuQuebrar(y, FS_SEC + PAD_SEC + linhasObs.length * LH_ITEM);
    y = secao(p, y, 'Observações');
    linhasObs.forEach((linha, k) => {
      escrever(linha, M, y + FS_ITEM + k * LH_ITEM, { tamanho: FS_ITEM, cor: SEPIA });
    });
    y += linhasObs.length * LH_ITEM + PAD_REF;
  }

  // ── Resumo nutricional (a maioria dos planos tem macros vazio) ──
  const macros = dados?.macros ?? {};
  const linhasResumo = [
    ['Energia',     macros.kcal,   'kcal'],
    ['Proteína',    macros.prot_g, 'g'],
    ['Carboidrato', macros.cho_g,  'g'],
    ['Lipídio',     macros.lip_g,  'g'],
    ['Água',        macros.agua_l, 'L'],
  ].filter(([, v]) => v != null && v !== '');

  if (linhasResumo.length) {
    y = caberOuQuebrar(y, FS_SEC + PAD_SEC + linhasResumo.length * LH_ITEM);
    y = secao(p, y, 'Resumo nutricional');
    for (const [rotulo, valor, unidade] of linhasResumo) {
      escrever(rotulo, M, y + FS_ITEM, { tamanho: FS_ITEM, cor: SEPIA });
      escrever(`${valor} ${unidade}`, M + W, y + FS_ITEM,
        { tamanho: FS_ITEM, align: 'right' });
      y += LH_ITEM;
    }
    y += PAD_REF;
  }

  // ── Refeições ──
  const refeicoes = dados?.refeicoes ?? [];
  y = caberOuQuebrar(y, FS_SEC + PAD_SEC + FS_REF + LH_ITEM);
  y = secao(p, y, 'Refeições');

  for (let i = 0; i < refeicoes.length; i++) {
    const ref = refeicoes[i];
    const alimentos = ref.alimentos ?? [];
    const nomeRef = `${ref.nome ?? ''}${ref.horario ? ` · ${ref.horario}` : ''}`;

    // O nome da refeição e o primeiro alimento andam juntos: um cabeçalho
    // sozinho no pé da página custaria uma virada de folha para descobrir o
    // que ele agrupa.
    y = caberOuQuebrar(y, FS_REF + 6 + LH_ITEM);
    escrever(nomeRef, M, y + FS_REF, { estilo: 'bold', tamanho: FS_REF });
    y += FS_REF + 6;

    for (const al of alimentos) {
      // O editor guarda "quantidade"; buildDados grava "qty". Os dois existem
      // no banco hoje, então os dois são lidos — igual ao PlanoImpressao.
      const qtd = String(al.qty ?? al.quantidade ?? '');
      doc.setFont('helvetica', 'normal');

      // As opções são medidas ANTES da altura total: alimento e substituições
      // viram um bloco só, pelo mesmo motivo que o nome da refeição anda junto
      // do primeiro alimento — opção órfã no topo da folha não diz de quem é.
      //
      // Bullet e não seta: "→" não existe em WinAnsi e vaza no stream como
      // 21 92 00 (medido), saindo como lixo. No HTML a seta funciona e fica lá.
      doc.setFontSize(FS_SUB);
      const blocosOpc = listaSubs(al.subs)
        .map(o => doc.splitTextToSize(`• ${o}`, W - IND_SUB - COL_QTD));

      doc.setFontSize(FS_ITEM);
      // A quantidade tem coluna própria à direita; o nome quebra no que sobra.
      const linhas = doc.splitTextToSize(String(al.nome ?? ''), W - COL_QTD);
      const altura = linhas.length * LH_ITEM
        + blocosOpc.reduce((s, b) => s + b.length * LH_SUB, 0);
      y = caberOuQuebrar(y, altura);

      linhas.forEach((linha, k) => {
        escrever(linha, M, y + FS_ITEM + k * LH_ITEM, { tamanho: FS_ITEM });
      });
      if (qtd) {
        escrever(qtd, M + W, y + FS_ITEM, { tamanho: FS_ITEM, cor: SEPIA, align: 'right' });
      }
      y += linhas.length * LH_ITEM;

      for (const bloco of blocosOpc) {
        bloco.forEach((linha, k) => {
          escrever(linha, M + IND_SUB, y + FS_SUB + k * LH_SUB,
            { tamanho: FS_SUB, cor: SEPIA });
        });
        y += bloco.length * LH_SUB;
      }
    }

    y += PAD_REF;
    if (i < refeicoes.length - 1) regua(y - PAD_REF / 2, LINHA2);
  }

  // ── Substituições ──
  const substituicoes = dados?.substituicoes ?? [];
  if (substituicoes.length) {
    y = caberOuQuebrar(y, FS_SEC + PAD_SEC + 2 * LH_ITEM);
    y = secao(p, y, 'Substituições');
    escrever('Escolha UMA opção por alimento, na quantidade indicada.', M, y,
      { estilo: 'italic', tamanho: 9, cor: SEPIA });
    y += 15;

    for (const s of substituicoes) {
      const opcoes = textoSubs(s.subs);
      // O original vai em negrito e as opções seguem na MESMA linha, então a
      // largura dele é medida com a fonte em negrito antes de quebrar o resto.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(FS_ITEM);
      const largOriginal = doc.getTextWidth(String(s.original ?? '') + ' ');
      doc.setFont('helvetica', 'normal');
      const linhasOpc = opcoes ? doc.splitTextToSize(`— ${opcoes}`, W - largOriginal) : [];
      const nLinhas = Math.max(1, linhasOpc.length);
      y = caberOuQuebrar(y, nLinhas * LH_ITEM);
      escrever(String(s.original ?? ''), M, y + FS_ITEM,
        { estilo: 'bold', tamanho: FS_ITEM });
      // Todas as linhas das opções alinham na mesma coluna, à direita do
      // original: a primeira ao lado dele, as seguintes sob ela.
      linhasOpc.forEach((linha, k) => {
        escrever(linha, M + largOriginal, y + FS_ITEM + k * LH_ITEM,
          { tamanho: FS_ITEM, cor: SEPIA });
      });
      y += nLinhas * LH_ITEM;
    }
  }

  rodape(p, y);

  // Igual à solicitação de exames: o blob volta pro chamador, que sobe no
  // storage. Quem chama é que sabe o paciente_id e o nutri_id.
  return doc.output('blob');
}
