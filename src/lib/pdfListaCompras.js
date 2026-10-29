/**
 * PDF da lista de compras (mesmo desenho do plano alimentar: cabeçalho escuro,
 * card da paciente, seções com régua, rodapé com assinatura). Devolve um BLOB;
 * quem chama baixa. Não sobe para a paciente: ela vê a lista publicada no app.
 */
import { criarDocumento, cabecalho, cardPaciente, rodape,
  M, W, TOPO, BRONZE, SEPIA, LINHA } from './pdfBase.js';

const FS_SEC = 7.9, FS_ITEM = 10, LH_ITEM = 14, PAD_SEC = 14, PAD_CAT = 12;
const COL_QTD = 120;

function dataExtensa(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export async function gerarPDFListaCompras({ pacienteNome, contato, dados }) {
  const p = await criarDocumento();
  const { escrever, regua, caberOuQuebrar, doc } = p;
  let y = TOPO;

  y = cabecalho(p, y, {
    sobrancelha: 'Essentia · Compras',
    titulo: 'Lista de Compras',
    tamanhoTitulo: 21,
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
  });
  y = cardPaciente(p, y, { pacienteNome, contato });

  const validade = dataExtensa(dados?.validade);
  if (validade) {
    escrever(`Válida até ${validade}`, M, y, { tamanho: 8.25, cor: SEPIA });
    y += 16.5;
  }

  for (const cat of dados?.lista ?? []) {
    const itens = Array.isArray(cat?.itens) ? cat.itens : [];
    y = caberOuQuebrar(y, FS_SEC + PAD_SEC + 2 * LH_ITEM);
    escrever(String(cat.categoria ?? '').toUpperCase(), M, y,
      { estilo: 'bold', tamanho: FS_SEC, cor: BRONZE, charSpace: 1.1 });
    y += 4.5;
    regua(y, LINHA);
    y += PAD_SEC;

    for (const bruto of itens) {
      // Itens são "Nome — quantidade"; a quantidade vai na coluna da direita.
      const partes = String(bruto ?? '').split(/\s+[—–]\s+/);
      const nome = partes[0].trim();
      const qtd = (partes[1] ?? '').trim();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FS_ITEM);
      const linhas = doc.splitTextToSize(`• ${nome}`, W - (qtd ? COL_QTD : 0));
      y = caberOuQuebrar(y, linhas.length * LH_ITEM);
      linhas.forEach((l, k) => escrever(l, M, y + FS_ITEM + k * LH_ITEM, { tamanho: FS_ITEM }));
      if (qtd) escrever(qtd, M + W, y + FS_ITEM, { tamanho: FS_ITEM, cor: SEPIA, align: 'right' });
      y += linhas.length * LH_ITEM;
    }
    y += PAD_CAT;
  }

  rodape(p, y);
  return doc.output('blob');
}
