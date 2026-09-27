/**
 * PDF do contrato Essentia ACEITO.
 *
 * A fonte é contratos_essentia.texto_html — o snapshot congelado no aceite, e
 * não o template. O template muda de versão; o snapshot é o que a paciente
 * leu e aceitou, com nome, identificação, valor e data dela já dentro.
 *
 * O PDF é uma CÓPIA de leitura, não a prova. A prova continua sendo a linha no
 * banco. Por isso o bloco de aceite traz o SHA-256 do texto_html: qualquer um
 * com acesso ao banco recalcula o hash e confere que o PDF saiu daquele texto.
 *
 * GUARDA CONTRA TEXTO PERDIDO: o parser só conhece h2, h3 e p — é tudo o que os
 * templates 1.0, 1.1 e 1.2 usam (contado nas migrations). Qualquer coisa fora
 * disso (texto solto entre blocos, tag desconhecida, tag dentro de parágrafo,
 * entidade que não sabemos decodificar) FAZ LANÇAR em vez de ser descartada.
 * Um contrato que sai em PDF com uma cláusula a menos é pior que nenhum PDF:
 * se um dia o template ganhar <ul> ou <strong>, este arquivo precisa aprender a
 * desenhar isso antes, e o erro é o que obriga.
 *
 * O bloco de aceite entra NO LUGAR do rodape() da base: aquele assina como a
 * nutri ("Kelly Oliveira · CRN"), e num contrato uma linha de assinatura em
 * branco sugeriria assinatura manuscrita que ninguém deu.
 */
import { criarDocumento, cabecalho, nomeArquivoPdf,
  M, W, PAGE_W, TOPO, TINTA, OURO, BRONZE, SEPIA, CINZA, LINHA } from './pdfBase.js';
import { TZ_CLINICA } from './utils.js';

const FS_H2 = 12.5, LH_H2 = 16;
const FS_H3 = 9.5,  LH_H3 = 13;
const FS_P  = 9.5,  LH_P  = 13.5;

// Exatamente o que escapar_html() do banco produz, mais &nbsp; por segurança.
// Numéricas (&#233;) também passam: são inequívocas.
const ENTIDADES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function trecho(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 60)}...` : t;
}

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (ent, corpo) => {
    const conhecida = ENTIDADES[ent.toLowerCase()];
    if (conhecida !== undefined) return conhecida;
    if (corpo[0] === '#') {
      const cod = corpo[1] === 'x' || corpo[1] === 'X'
        ? parseInt(corpo.slice(2), 16)
        : parseInt(corpo.slice(1), 10);
      return String.fromCodePoint(cod);
    }
    throw new Error(`Contrato com entidade HTML desconhecida: ${ent}`);
  });
}

/**
 * HTML do snapshot -> [{ tipo: 'h2'|'h3'|'p', texto }].
 * Lança se sobrar qualquer texto que não coube num bloco (ver cabeçalho).
 * Parágrafo vazio (<p> </p>) é pulado: não há texto nele para perder.
 */
export function extrairBlocos(html) {
  const src = String(html ?? '');
  const RE = /<(h2|h3|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
  const blocos = [];
  let fora = '';
  let ultimo = 0;
  let m;
  while ((m = RE.exec(src))) {
    fora += src.slice(ultimo, m.index);
    ultimo = RE.lastIndex;
    const tipo = m[1].toLowerCase();
    if (/[<>]/.test(m[2])) {
      throw new Error(`Contrato com marcação dentro de <${tipo}>: "${trecho(m[2])}"`);
    }
    const texto = decodificar(m[2]).replace(/\s+/g, ' ').trim();
    if (texto) blocos.push({ tipo, texto });
  }
  fora += src.slice(ultimo);
  if (fora.trim()) {
    throw new Error(`Contrato com conteúdo fora de h2/h3/p: "${trecho(fora)}"`);
  }
  if (!blocos.length) throw new Error('Contrato sem texto.');
  return blocos;
}

/**
 * SHA-256 em hex dos bytes UTF-8 do texto_html EXATAMENTE como gravado —
 * sem trim, sem normalizar quebra de linha. É o que torna o hash conferível
 * contra o banco: encode(sha256(convert_to(texto_html, 'UTF8')), 'hex').
 *
 * crypto.subtle existe no navegador e no Node 19+; nada de import de node:crypto,
 * que quebraria o bundle.
 */
export async function hashTexto(textoHtml) {
  const bytes = new TextEncoder().encode(String(textoHtml));
  const dig = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * timestamptz -> { data: '22/09/2026', hora: '14:05' } no fuso da clínica,
 * e não no do aparelho de quem baixa: o carimbo é um fato só.
 */
export function formatarAceite(aceitoEm) {
  const d = new Date(aceitoEm);
  if (Number.isNaN(d.getTime())) throw new Error('Data de aceite inválida.');
  const partes = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ_CLINICA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return {
    data: `${partes.day}/${partes.month}/${partes.year}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/**
 * Gera o PDF. Devolve { blob, hash, nomeArquivo } — o hash volta junto para a
 * tela poder mostrá-lo sem recalcular.
 *
 * Só aceita contrato aceito: sem texto_html ou sem aceito_em não há o que
 * provar, e o check contratos_essentia_snapshot_coerente garante que os dois
 * andam juntos no banco.
 */
export async function gerarPdfContrato({ textoHtml, aceitoEm, pacienteNome, contratoId, dataEmissao }) {
  if (!textoHtml || !aceitoEm) {
    throw new Error('Contrato ainda não aceito — não há texto para gerar o PDF.');
  }
  // Parser e hash ANTES de abrir o documento: se o texto não passa na guarda,
  // não se chega a desenhar nada.
  const blocos = extrairBlocos(textoHtml);
  const hash = await hashTexto(textoHtml);
  const { data, hora } = formatarAceite(aceitoEm);

  const p = await criarDocumento();
  const { doc, escrever, regua, caberOuQuebrar } = p;

  let y = cabecalho(p, TOPO, {
    sobrancelha: 'Contrato de prestação de serviços',
    titulo: 'Contrato Essentia',
    tamanhoTitulo: 19,
    dataEmissao,
  });
  y += 6;

  const linhas = (texto, fonte, estilo, tamanho) => {
    doc.setFont(fonte, estilo);
    doc.setFontSize(tamanho);
    return doc.splitTextToSize(texto, W);
  };

  blocos.forEach((b, i) => {
    if (b.tipo === 'h2') {
      const ls = linhas(b.texto, 'times', 'bold', FS_H2);
      y += i === 0 ? 0 : 10;
      y = caberOuQuebrar(y, ls.length * LH_H2);
      ls.forEach(l => {
        escrever(l, PAGE_W / 2, y + FS_H2, { fonte: 'times', estilo: 'bold', tamanho: FS_H2, align: 'center' });
        y += LH_H2;
      });
      y += 6;
    } else if (b.tipo === 'h3') {
      const ls = linhas(b.texto, 'helvetica', 'bold', FS_H3);
      y += 8;
      // Título não fica órfão no pé da página: exige espaço para ele e mais
      // duas linhas do parágrafo que vem depois.
      y = caberOuQuebrar(y, ls.length * LH_H3 + 2 * LH_P);
      ls.forEach(l => {
        escrever(l, M, y + FS_H3, { estilo: 'bold', tamanho: FS_H3 });
        y += LH_H3;
      });
      y += 2;
    } else {
      const ls = linhas(b.texto, 'helvetica', 'normal', FS_P);
      ls.forEach(l => {
        y = caberOuQuebrar(y, LH_P);
        escrever(l, M, y + FS_P, { tamanho: FS_P });
        y += LH_P;
      });
      y += 6;
    }
  });

  // ── Bloco de aceite eletrônico ────────────────────────────────────────
  const PAD = 15;
  const LARG_INT = W - PAD * 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const lsNome = doc.splitTextToSize(`Aceito por ${pacienteNome || '—'}`, LARG_INT);
  doc.setFontSize(7.1);
  const lsNota = doc.splitTextToSize(
    'O código acima é o SHA-256 do texto do contrato gravado no momento do aceite. '
    + 'Qualquer alteração no texto, por menor que seja, produz outro código.', LARG_INT);

  const H_CARD = 20 + lsNome.length * 14 + 14 + 16 + 16 + 12 + lsNota.length * 9 + 12;
  y += 14;
  y = caberOuQuebrar(y, H_CARD + 40);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...LINHA);
  doc.setLineWidth(0.375);
  doc.roundedRect(M, y, W, H_CARD, 6, 6, 'FD');

  let yc = y + 20;
  escrever('Aceite eletrônico'.toUpperCase(), M + PAD, yc,
    { estilo: 'bold', tamanho: 6.4, cor: BRONZE, charSpace: 1.02 });
  yc += 16;
  lsNome.forEach(l => { escrever(l, M + PAD, yc, { tamanho: 10.5 }); yc += 14; });
  escrever(`em ${data} às ${hora} (horário de Belém)`, M + PAD, yc, { tamanho: 9.5, cor: TINTA });
  yc += 16;
  escrever(`Registro do contrato: ${contratoId || '—'}`, M + PAD, yc, { tamanho: 7.9, cor: SEPIA });
  yc += 16;
  escrever('SHA-256 do texto aceito:', M + PAD, yc, { tamanho: 7.9, cor: SEPIA });
  yc += 12;
  escrever(hash, M + PAD, yc, { fonte: 'courier', tamanho: 7.5, cor: TINTA });
  yc += 12;
  lsNota.forEach(l => { escrever(l, M + PAD, yc, { tamanho: 7.1, cor: CINZA }); yc += 9; });

  y += H_CARD + 20;
  regua(y, LINHA);
  y += 12;
  escrever('Documento gerado pelo app Essentia', PAGE_W / 2, y,
    { tamanho: 7.1, cor: OURO, charSpace: 0.71, align: 'center' });

  return {
    blob: doc.output('blob'),
    hash,
    nomeArquivo: nomeArquivoPdf('contrato-essentia', pacienteNome),
  };
}
