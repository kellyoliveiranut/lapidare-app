/**
 * PDF do relatório de evolução da paciente (download direto, sem diálogo de impressão
 * nem pop-up). Mesmas seções do relatório da tela: identificação, evolução
 * antropométrica, suplementação, hábitos, anotações clínicas e análise.
 */
import { criarDocumento, cabecalho, cardPaciente, rodape,
  M, W, TOPO, BRONZE, SEPIA, OURO, LINHA, LINHA2 } from './pdfBase.js';

const FS_SEC = 7.9, FS_TXT = 10, LH = 13.5, PAD_SEC = 14;

const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const num = (v, un = '') => (v == null || v === '' ? '—' : `${String(v).replace('.', ',')}${un}`);
const un3 = (t) => String(t ?? '').replace(/³/g, '3');
const semMarkdown = (t) => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');

/** Série de peso como linha simples (sem biblioteca de gráfico). Devolve a altura usada. */
function desenharGraficoPeso(p, y, pesos) {
  const { doc, escrever } = p;
  const pontos = pesos.filter(x => x.kg != null).map(x => ({ d: x.data, v: Number(x.kg) }));
  if (pontos.length < 2) return 0;
  const H = 90, X0 = M + 34, X1 = M + W - 8;
  const vs = pontos.map(x => x.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const px = (i) => X0 + (i / (pontos.length - 1)) * (X1 - X0);
  const py = (v) => y + H - ((v - min) / (max - min)) * H;

  doc.setDrawColor(...LINHA);
  doc.setLineWidth(0.375);
  doc.line(X0, y, X0, y + H);
  doc.line(X0, y + H, X1, y + H);
  escrever(`${max.toFixed(1).replace('.', ',')}`, M, y + 4, { tamanho: 7, cor: SEPIA });
  escrever(`${min.toFixed(1).replace('.', ',')}`, M, y + H, { tamanho: 7, cor: SEPIA });

  doc.setDrawColor(...BRONZE);
  doc.setLineWidth(1.4);
  for (let i = 1; i < pontos.length; i++) doc.line(px(i - 1), py(pontos[i - 1].v), px(i), py(pontos[i].v));
  doc.setFillColor(...BRONZE);
  pontos.forEach((pt, i) => doc.circle(px(i), py(pt.v), 2, 'F'));

  escrever(dataBR(pontos[0].d), X0, y + H + 11, { tamanho: 7, cor: SEPIA });
  escrever(dataBR(pontos[pontos.length - 1].d), X1, y + H + 11, { tamanho: 7, cor: SEPIA, align: 'right' });
  return H + 20;
}

export async function gerarPDFRelatorio({ pacienteNome, contato, idade, consultas, macros, pesos, suplementos, habitos, followups, exames, analise }) {
  const p = await criarDocumento();
  const { doc, escrever, regua, caberOuQuebrar } = p;
  let y = TOPO;

  y = cabecalho(p, y, {
    sobrancelha: 'Essentia · Relatório',
    titulo: 'Relatório de Evolução',
    tamanhoTitulo: 21,
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
  });
  y = cardPaciente(p, y, { pacienteNome, contato });

  const secao = (rotulo, alturaMin = 3 * LH) => {
    y += 14;
    y = caberOuQuebrar(y, FS_SEC + PAD_SEC + alturaMin);
    escrever(rotulo.toUpperCase(), M, y, { estilo: 'bold', tamanho: FS_SEC, cor: BRONZE, charSpace: 1.1 });
    y += 4.5;
    regua(y, LINHA);
    y += PAD_SEC;
  };
  const paragrafo = (texto, opc = {}) => {
    doc.setFont('helvetica', opc.estilo ?? 'normal');
    doc.setFontSize(opc.tamanho ?? FS_TXT);
    for (const linha of doc.splitTextToSize(String(texto ?? ''), W)) {
      y = caberOuQuebrar(y, LH);
      escrever(linha, M, y + (opc.tamanho ?? FS_TXT), { tamanho: opc.tamanho ?? FS_TXT, cor: opc.cor, estilo: opc.estilo });
      y += LH;
    }
  };
  // Tabela simples: `cols` = [{ rot, x (fração da largura), align }]
  const tabela = (cols, linhas) => {
    y = caberOuQuebrar(y, 2 * LH);
    cols.forEach(c => escrever(c.rot.toUpperCase(), M + c.x * W, y + 8, { estilo: 'bold', tamanho: 7, cor: SEPIA, charSpace: 0.6, align: c.align }));
    y += LH;
    regua(y - 3, LINHA);
    for (const l of linhas) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FS_TXT);
      const largs = cols.map((c, i) => (c.larg ? doc.splitTextToSize(String(l[i]), c.larg * W) : [String(l[i])]));
      const n = Math.max(...largs.map(x => x.length));
      y = caberOuQuebrar(y, n * LH);
      cols.forEach((c, i) => largs[i].forEach((linha, k) =>
        escrever(linha, M + c.x * W, y + FS_TXT + k * LH, { tamanho: FS_TXT, align: c.align })));
      y += n * LH;
      regua(y - 3, LINHA2);
    }
    y += 6;
  };

  // 1. Identificação
  secao('1. Identificação');
  const ident = [
    ['Idade', idade != null ? `${idade} anos` : '—'],
    ['Consultas realizadas', String(consultas ?? 0)],
    ...(macros?.kcal ? [['Calorias alvo', `${macros.kcal} kcal`]] : []),
    ...(macros?.proteinas_g ? [['Proteína alvo', `${macros.proteinas_g} g`]] : []),
  ];
  ident.forEach(([r, v]) => { y = caberOuQuebrar(y, LH); escrever(`${r}:`, M, y + FS_TXT, { tamanho: FS_TXT, cor: SEPIA }); escrever(v, M + 130, y + FS_TXT, { tamanho: FS_TXT }); y += LH; });
  y += PAD_SEC / 2;

  // 2. Evolução antropométrica
  secao('2. Evolução antropométrica');
  if (!pesos?.length) {
    paragrafo('Sem registros antropométricos.', { cor: SEPIA });
  } else {
    const alt = pesos.length >= 2 ? 112 : 0;
    if (alt) { y = caberOuQuebrar(y, alt); y += 6; y += desenharGraficoPeso(p, y, pesos); }
    tabela(
      [{ rot: 'Data', x: 0 }, { rot: 'Peso', x: 0.18 }, { rot: '% Gordura', x: 0.34 }, { rot: 'M. magra', x: 0.52 }, { rot: 'Cintura', x: 0.72 }],
      pesos.map(x => [dataBR(x.data), num(x.kg, ' kg'), num(x.pgc, '%'), num(x.mm_kg, ' kg'), num(x.cintura_cm, ' cm')]),
    );
    const ini = pesos[0], fim = pesos[pesos.length - 1];
    if (pesos.length >= 2 && ini.kg != null && fim.kg != null) {
      const dif = Number((fim.kg - ini.kg).toFixed(1));
      paragrafo(`Variação total: ${dif > 0 ? '+' : ''}${String(dif).replace('.', ',')} kg (${dataBR(ini.data)} a ${dataBR(fim.data)})`, { cor: SEPIA, tamanho: 9 });
    }
    y += PAD_SEC / 2;
  }

  // 3. Suplementação
  secao('3. Suplementação');
  if (!suplementos?.length) paragrafo('Sem suplementos cadastrados.', { cor: SEPIA });
  else tabela(
    [{ rot: 'Suplemento', x: 0, larg: 0.38 }, { rot: 'Dose', x: 0.42, larg: 0.2 }, { rot: 'Horário', x: 0.65, larg: 0.18 }, { rot: 'Aderência 30d', x: 1, align: 'right' }],
    suplementos.map(s => [s.nome ?? '', s.dose || '—', s.horario || '—', s.adesao == null ? '—' : `${s.adesao}%`]),
  );
  y += PAD_SEC / 2;

  // 4. Hábitos
  secao('4. Hábitos');
  if (!habitos?.length) paragrafo('Sem hábitos cadastrados.', { cor: SEPIA });
  else tabela(
    [{ rot: 'Hábito', x: 0, larg: 0.5 }, { rot: 'Meta', x: 0.55 }, { rot: 'Aderência 30d', x: 1, align: 'right' }],
    habitos.map(h => [h.nome ?? '', h.meta != null ? `${h.meta}${h.unidade || ''}` : '—', h.adesao == null ? '—' : `${h.adesao}%`]),
  );
  y += PAD_SEC / 2;

  // 5. Exames laboratoriais
  if (exames) {
    secao('5. Exames laboratoriais');
    paragrafo(`Exame de ${dataBR(exames.dataUltimo)}${exames.resumo.avaliados ? ` · ${exames.resumo.fora.length} de ${exames.resumo.avaliados} marcadores fora da referência` : ''}`, { cor: SEPIA, tamanho: 9 });
    tabela(
      [{ rot: 'Marcador', x: 0, larg: 0.34 }, { rot: 'Valor', x: 0.38, larg: 0.2 }, { rot: 'Referência', x: 0.6, larg: 0.16 }, { rot: 'Situação', x: 0.78, larg: 0.22 }],
      exames.linhas.map(l => [l.rotulo, `${l.valor}${l.unidade ? ' ' + un3(l.unidade) : ''}`, l.faixa, l.situacao]),
    );
    if (exames.comparacao.length) {
      paragrafo(`Comparação: ${dataBR(exames.dataAnterior)} para ${dataBR(exames.dataUltimo)}`, { cor: SEPIA, tamanho: 9 });
      tabela(
        [{ rot: 'Marcador', x: 0, larg: 0.34 }, { rot: 'Anterior', x: 0.38 }, { rot: 'Atual', x: 0.58 }, { rot: 'Variação', x: 0.78 }],
        exames.comparacao.map(l => [l.rotulo, l.a, l.b, `${l.dif}${l.unidade ? ' ' + un3(l.unidade) : ''}`]),
      );
    }
    paragrafo('"Fora da referência" compara o valor com a faixa de referência; a interpretação depende do contexto clínico.', { cor: OURO, tamanho: 8 });
    y += PAD_SEC / 2;
  }

  // 6. Anotações clínicas
  if (followups?.length) {
    secao('6. Anotações clínicas');
    for (const f of followups.slice(0, 6)) {
      y = caberOuQuebrar(y, 3 * LH);
      escrever(`${dataBR(f.data)}${f.titulo ? ` · ${f.titulo}` : ''}`, M, y + 9, { estilo: 'bold', tamanho: 9, cor: BRONZE });
      y += LH;
      paragrafo(String(f.conteudo ?? '').slice(0, 600));
      y += 4;
    }
    y += PAD_SEC / 2;
  }

  // 6. Análise
  if (analise) {
    secao('7. Análise e conclusão');
    paragrafo(semMarkdown(analise));
    y += 2;
    paragrafo('Análise gerada por IA com base nos dados clínicos registrados; revisada pela nutricionista.', { cor: OURO, tamanho: 8 });
  }

  rodape(p, y);
  return doc.output('blob');
}
