import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { CATEGORIAS_EXAME, TOTAL_ITENS_EXAME } from '../../data/exames_solicitacao.js';

/* ============================================================
   SOLICITAÇÃO DE EXAMES — aba "Exames" do perfil da paciente

   A nutri marca os exames, o app GERA o PDF e SOBE para o bucket
   privado `prescricoes`, com uma linha em public.prescricoes de
   tipo='exame'. A paciente baixa em /paciente/exames.

   Diferente do gerarPDFPrescricao da Suplementação, que desenha o
   mesmo layout mas termina em doc.save() — download local, nada
   sobe. Aqui o documento precisa CHEGAR na paciente, então o
   destino é o storage.

   Não confundir com exames_laboratoriais, que é RESULTADO (oito
   colunas numéricas na aba Oncologia). Solicitação é documento,
   resultado é dado — coisas de natureza diferente.
   ============================================================ */

export default function SolicitacaoExames({ pacienteId, nutriId, pacienteNome }) {
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [observacao, setObservacao] = useState('');
  const [historico, setHistorico] = useState(undefined);   // undefined = carregando
  const [contato, setContato] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  async function carregar(signal = { cancelled: false }) {
    const [histRes, pacRes] = await Promise.all([
      supabase.from('prescricoes')
        .select('id, titulo, nota, storage_path, created_at')
        .eq('paciente_id', pacienteId).eq('tipo', 'exame')
        .order('created_at', { ascending: false }),
      supabase.from('pacientes').select('telefone').eq('id', pacienteId).maybeSingle(),
    ]);
    if (signal.cancelled) return;
    setHistorico(histRes.data ?? []);
    setContato(pacRes.data ?? null);
  }

  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  // Set + cópia imutável, mesmo padrão do ModalAtribuir da Biblioteca.
  function toggle(item) {
    setSelecionados(s => {
      const n = new Set(s);
      if (n.has(item)) n.delete(item); else n.add(item);
      return n;
    });
  }

  // "Marcar todos" da categoria. O estado do botão é DERIVADO da seleção, nunca
  // guardado: guardado, ele dessincronizaria assim que a nutri desmarcasse um
  // item na mão e continuaria dizendo "desmarcar todos".
  function alternarCategoria(cat) {
    const todosMarcados = cat.itens.every(i => selecionados.has(i));
    setSelecionados(s => {
      const n = new Set(s);
      cat.itens.forEach(i => { if (todosMarcados) n.delete(i); else n.add(i); });
      return n;
    });
  }

  function limpar() {
    setSelecionados(new Set());
    setObservacao('');
  }

  async function gerarEEnviar() {
    if (selecionados.size === 0) return;
    setBusy(true);
    setFeedback(null);

    // A ordem do catálogo manda no PDF, não a ordem em que a nutri clicou: um
    // documento que chega ao laboratório com os exames embaralhados é mais
    // difícil de conferir. Categorias sem nenhum item marcado não entram.
    const grupos = CATEGORIAS_EXAME
      .map(c => ({ label: c.label, itens: c.itens.filter(i => selecionados.has(i)) }))
      .filter(g => g.itens.length > 0);

    let path = null;
    try {
      const blob = await gerarPDFSolicitacao({
        pacienteNome,
        contato,
        grupos,
        observacao: observacao.trim(),
      });

      // Primeiro segmento = paciente_id: é o que a policy
      // prescricoes_storage_insert_nutri exige (split_part(name,'/',1)).
      path = `${pacienteId}/exames-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('prescricoes').upload(path, blob, { contentType: 'application/pdf' });
      if (upErr) throw upErr;

      // ARQUIVO PRIMEIRO, LINHA DEPOIS. Linha sem arquivo é um card quebrado
      // permanente na tela da paciente; arquivo sem linha é um órfão invisível
      // no bucket. Dos dois estados ruins, o órfão é de longe o menos pior — e
      // o rollback abaixo evita até ele.
      const itensPlanos = grupos.flatMap(g => g.itens);
      const { error: insErr } = await supabase.from('prescricoes').insert({
        paciente_id: pacienteId,
        nutri_id: nutriId,
        tipo: 'exame',
        titulo: `Solicitação de exames — ${dataBR(new Date())}`,
        storage_path: path,
        // `nota` guarda a lista para a tela da paciente listar o que foi pedido
        // SEM abrir o PDF, e para o histórico contar os itens. É texto
        // denormalizado de propósito: a alternativa era uma coluna jsonb nova
        // numa tabela compartilhada com outros tipos de prescrição.
        nota: itensPlanos.join(' · '),
      });
      if (insErr) throw insErr;

      path = null;                    // gravou: não há mais o que desfazer
      limpar();
      await carregar();
      setFeedback({ tipo: 'ok', msg: `Solicitação enviada com ${itensPlanos.length} exame${itensPlanos.length > 1 ? 's' : ''}.` });
    } catch (e) {
      // Só remove o que ESTA execução subiu. Se o upload é que falhou, path já
      // é o caminho mas não há objeto — o remove não erra por isso.
      if (path) await supabase.storage.from('prescricoes').remove([path]).catch(() => {});
      setFeedback({ tipo: 'erro', msg: 'Erro ao enviar: ' + (e?.message ?? 'tente novamente') });
    } finally {
      setBusy(false);
    }
  }

  async function baixar(item) {
    const { data, error } = await supabase.storage
      .from('prescricoes').createSignedUrl(item.storage_path, 60 * 60);
    if (error) return setFeedback({ tipo: 'erro', msg: 'Não foi possível abrir: ' + error.message });
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function excluir(item) {
    if (!window.confirm('Excluir esta solicitação? A paciente deixa de ver o documento.')) return;
    // Ordem inversa da criação, pelo mesmo raciocínio: some primeiro da tela da
    // paciente (a linha), e só depois o arquivo. Se o storage falhar, sobra um
    // órfão que ninguém enxerga — melhor que um card sem arquivo.
    const { error } = await supabase.from('prescricoes').delete().eq('id', item.id);
    if (error) return setFeedback({ tipo: 'erro', msg: 'Erro ao excluir: ' + error.message });
    await supabase.storage.from('prescricoes').remove([item.storage_path]).catch(() => {});
    await carregar();
    setFeedback({ tipo: 'ok', msg: 'Solicitação excluída.' });
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Solicitação de exames</div>
            <div className="card-sub">
              Marque os exames, gere o PDF e a paciente recebe no app dela
            </div>
          </div>
        </div>

        {feedback && (
          <div style={{
            margin: '0 0 14px', padding: '9px 12px', borderRadius: 8, fontSize: 13,
            background: feedback.tipo === 'ok' ? 'var(--green-soft, #eef5ee)' : 'var(--orange-bg, #fdf1e7)',
            color: feedback.tipo === 'ok' ? 'var(--green, #3f6b46)' : 'var(--orange, #b45309)',
          }}>
            {feedback.msg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CATEGORIAS_EXAME.map(cat => {
            const marcados = cat.itens.filter(i => selecionados.has(i)).length;
            const todos = marcados === cat.itens.length;
            return (
              <div key={cat.id} style={{
                border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--bg2)',
                  borderBottom: '0.5px solid var(--border)',
                }}>
                  <div style={{
                    flex: 1, minWidth: 0,
                    fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
                    fontWeight: 600, color: 'var(--gold-deep, #a08456)',
                  }}>
                    {cat.label}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {marcados}/{cat.itens.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => alternarCategoria(cat)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500,
                      color: 'var(--gold-deep, #a08456)', whiteSpace: 'nowrap',
                    }}>
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>

                {cat.itens.map(item => {
                  const checked = selecionados.has(item);
                  return (
                    <label key={item} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                      borderBottom: '0.5px solid var(--border)',
                      background: checked ? 'var(--amber-bg, var(--bg2))' : 'transparent',
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => toggle(item)} style={{ margin: 0, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>{item}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <label className="form-lbl" style={{ marginTop: 14 }}>Observação (opcional)</label>
        <input
          value={observacao}
          onChange={e => setObservacao(e.target.value)}
          placeholder="Jejum de 12h, trazer resultados na próxima consulta…"
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
          Vale para a solicitação inteira e sai no rodapé do PDF.
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 160, fontSize: 12, color: 'var(--text3)' }}>
            {selecionados.size} de {TOTAL_ITENS_EXAME} exame{selecionados.size === 1 ? '' : 's'} selecionado{selecionados.size === 1 ? '' : 's'}
          </div>
          {selecionados.size > 0 && (
            <button className="btn-outline" onClick={limpar} disabled={busy}>
              Limpar
            </button>
          )}
          <button className="btn" onClick={gerarEEnviar} disabled={busy || selecionados.size === 0}>
            <i className="ti ti-file-text" aria-hidden="true"></i>
            {busy ? ' Gerando…' : ' Gerar e enviar solicitação'}
          </button>
        </div>
      </div>

      {/* ── Histórico ── */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Solicitações enviadas</div>
            <div className="card-sub">O que a paciente já recebeu</div>
          </div>
        </div>

        {historico === undefined ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Carregando…</div>
        ) : historico.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Nenhuma solicitação enviada ainda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historico.map(h => {
              const itens = (h.nota ?? '').split(' · ').filter(Boolean);
              return (
                <div key={h.id} style={{
                  border: '0.5px solid var(--border)', borderRadius: 10, padding: '11px 13px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{dataBR(h.created_at)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {itens.length} exame{itens.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <button className="btn-outline" onClick={() => baixar(h)}>
                      <i className="ti ti-download" aria-hidden="true"></i> Abrir
                    </button>
                    <button
                      onClick={() => excluir(h)}
                      title="Excluir solicitação"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text3)', padding: 6, fontSize: 15,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                  {itens.length > 0 && (
                    <div style={{
                      fontSize: 11, color: 'var(--text3)', marginTop: 8,
                      lineHeight: 1.5, borderTop: '0.5px solid var(--border)', paddingTop: 7,
                    }}>
                      {itens.join(' · ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}


/* ============================================================
   PDF DA SOLICITAÇÃO DE EXAMES

   Mesmo layout do PDF de prescrição da Suplementação — cabeçalho
   escuro, card da paciente, régua, rodapé com assinatura. As
   constantes são as mesmas, repetidas aqui de propósito: elas
   moram dentro de _Suplementacao.jsx e não são exportadas;
   importar de lá acoplaria duas telas por causa de números de
   layout. Se um dia virarem três usos, aí sim vale um módulo.

   A diferença de fundo está no fim: devolve BLOB em vez de
   chamar doc.save(). Quem sobe é o chamador.
   ============================================================ */

const PAGE_W = 595.28, PAGE_H = 841.89;
const M = 72;
const W = PAGE_W - M * 2;
const TOPO = 64;
const FUNDO = PAGE_H - 56;

const CREME  = [253, 251, 248];
const ESCURO = [26, 22, 18];
const TINTA  = [40, 27, 6];
const OURO   = [196, 168, 130];
const BRONZE = [160, 132, 86];
const CINZA  = [141, 129, 117];
const SEPIA  = [107, 92, 62];
const LINHA  = [221, 213, 196];
const LINHA2 = [237, 230, 218];

const FS_ITEM = 10, LH_ITEM = 13.5;
const FS_CAT  = 7.9;
const PAD_CAT = 14;          // respiro antes do rótulo da categoria
const PAD_ITEM = 3;          // respiro entre itens

async function gerarPDFSolicitacao({ pacienteNome, contato, grupos, observacao }) {
  // Import dinâmico: o jsPDF vira chunk próprio, baixado no primeiro clique.
  // Mesmo motivo da Suplementação — estático, ele entraria no chunk da tela.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  let y = TOPO;

  function pintarFundo() {
    doc.setFillColor(...CREME);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  }

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
    doc.setLineWidth(0.375);
    doc.line(x, yLinha, x + largura, yLinha);
  }

  function caberOuQuebrar(altura) {
    if (y + altura <= FUNDO) return;
    doc.addPage();
    pintarFundo();
    y = TOPO;
  }

  pintarFundo();

  // ── Cabeçalho escuro ──
  const H_CAB = 95;
  doc.setFillColor(...ESCURO);
  doc.roundedRect(M, y, W, H_CAB, 7.5, 7.5, 'F');
  escrever('Essentia · Solicitação'.toUpperCase(), M + 24, y + 32,
    { estilo: 'bold', tamanho: 7.1, cor: OURO, charSpace: 1.57 });
  // 19pt e não os 22,5 da Suplementação: "Solicitação de Exames" é curto, mas o
  // tamanho menor deixa margem para um título mais longo entrar sem estourar —
  // aqui não há quebra automática de linha.
  escrever('Solicitação de Exames', M + 24, y + 62,
    { fonte: 'times', estilo: 'bold', tamanho: 19, cor: CREME });
  escrever(`Emitida em ${new Date().toLocaleDateString('pt-BR')}`, M + 24, y + 80,
    { tamanho: 7.9, cor: CINZA });
  y += H_CAB + 19.5;

  // ── Emissor ──
  escrever('Kelly Oliveira', M, y, { fonte: 'times', estilo: 'bold', tamanho: 12.75 });
  y += 13;
  escrever('Nutricionista · CRN 3801', M, y,
    { tamanho: 8.25, cor: BRONZE, charSpace: 0.33 });
  y += 16.5;

  // ── Card da paciente ──
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

  // ── Exames, agrupados por categoria ──
  escrever('Exames solicitados'.toUpperCase(), M, y,
    { estilo: 'bold', tamanho: FS_CAT, cor: BRONZE, charSpace: 1.1 });
  y += 4.5;
  regua(y, LINHA);
  y += PAD_CAT;

  for (let g = 0; g < grupos.length; g++) {
    const grupo = grupos[g];

    // O rótulo da categoria e o PRIMEIRO item andam juntos: um cabeçalho
    // sozinho no pé da página é órfão tipográfico, e aqui custaria uma virada
    // de folha para descobrir o que ele agrupa.
    caberOuQuebrar(FS_CAT + PAD_ITEM + LH_ITEM);
    escrever(grupo.label.toUpperCase(), M, y,
      { estilo: 'bold', tamanho: FS_CAT, cor: BRONZE, charSpace: 1.1 });
    y += FS_CAT + PAD_ITEM;

    for (const item of grupo.itens) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FS_ITEM);
      // 14pt reservados para o marcador; o texto quebra dentro do que sobra.
      const linhas = doc.splitTextToSize(item, W - 14);
      caberOuQuebrar(linhas.length * LH_ITEM);
      escrever('•', M, y + FS_ITEM, { tamanho: FS_ITEM, cor: BRONZE });
      linhas.forEach((linha, k) => {
        escrever(linha, M + 14, y + FS_ITEM + k * LH_ITEM, { tamanho: FS_ITEM });
      });
      y += linhas.length * LH_ITEM;
    }

    if (g < grupos.length - 1) {
      y += 6;
      regua(y, LINHA2);
      y += PAD_CAT;
    }
  }

  // ── Observação ──
  if (observacao) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    const linhas = doc.splitTextToSize(observacao, W);
    caberOuQuebrar(18 + linhas.length * 12);
    y += 18;
    escrever('Observações'.toUpperCase(), M, y,
      { estilo: 'bold', tamanho: 6.4, cor: BRONZE, charSpace: 1.02 });
    y += 12;
    linhas.forEach((linha, k) => {
      escrever(linha, M, y + k * 12, { estilo: 'italic', tamanho: 9, cor: SEPIA });
    });
    y += (linhas.length - 1) * 12;
  }

  // ── Rodapé ──
  caberOuQuebrar(30 + 90);
  y += 30;
  regua(y, TINTA, 195);
  y += 4.5 + 9.4;
  escrever('Kelly Oliveira', M, y, { fonte: 'times', estilo: 'bold', tamanho: 9.4 });
  y += 11;
  escrever('Nutricionista · CRN 3801', M, y, { tamanho: 8.25, cor: SEPIA });
  y += 19.5 + 7.5;
  regua(y, LINHA);
  y += 12;
  escrever('Documento gerado pelo app Essentia', PAGE_W / 2, y,
    { tamanho: 7.1, cor: OURO, charSpace: 0.71, align: 'center' });

  // A única diferença de fundo em relação ao PDF da Suplementação: lá é
  // doc.save() e o arquivo cai na máquina da nutri; aqui o blob volta para o
  // chamador, que sobe no storage.
  return doc.output('blob');
}
