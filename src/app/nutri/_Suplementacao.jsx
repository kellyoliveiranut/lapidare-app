import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, normalizarTelefone } from '../../lib/utils.js';
import { iniciarTokenPush, avisarPaciente } from '../../lib/push.js';

const HOJE_ISO = () => new Date().toISOString().slice(0, 10);

export default function Suplementacao({ pacienteId, nutriId, pacienteNome }) {
  const { profile } = useSession();
  const [suplementos, setSuplementos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [contato, setContato] = useState(null);          // telefone/email pra prévia
  const [ultimoEnvio, setUltimoEnvio] = useState(null);  // último envio à farmácia
  const [enviarFarmaciaOpen, setEnviarFarmaciaOpen] = useState(false);
  const [enviandoFarmacia, setEnviandoFarmacia] = useState(false);
  const [lojas, setLojas] = useState([]);                // lojas parceiras ativas da nutri
  const [enviarLojaOpen, setEnviarLojaOpen] = useState(false);
  const [favoritos, setFavoritos] = useState([]);
  const [editar, setEditar] = useState(null);
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfTitulo, setPdfTitulo] = useState('');
  const [pdfNota, setPdfNota] = useState('');            // posologia — vai para prescricoes.nota
  const [pdfErro, setPdfErro] = useState(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);   // chunk do jsPDF baixando
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  async function carregar(signal = { cancelled: false }) {
    const [supRes, logRes, pdfRes, envRes, pacRes] = await Promise.all([
      supabase.from('suplementos').select('id, nome, dose, horario, obs, foto_url, ativo, data_inicio, manipulado').eq('paciente_id', pacienteId).order('ordem'),
      supabase.from('suplementos_logs').select('tomado, data, suplemento_id')
        .eq('paciente_id', pacienteId)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
      supabase.from('prescricoes').select('id, titulo, nota, storage_path, created_at')
        .eq('paciente_id', pacienteId).eq('tipo', 'suplementacao')
        .order('created_at', { ascending: false }),
      supabase.from('envios_farmacia').select('enviado_em')
        .eq('paciente_id', pacienteId)
        .order('enviado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('pacientes').select('telefone, email').eq('id', pacienteId).maybeSingle(),
    ]);
    if (signal.cancelled) return;
    setSuplementos(supRes.data ?? []);
    setLogs(logRes.data ?? []);
    setPdfs(pdfRes.data ?? []);
    setUltimoEnvio(envRes.data ?? null);
    setContato(pacRes.data ?? null);
  }

  async function carregarFavoritos() {
    if (!nutriId) return;
    const { data } = await supabase
      .from('ebooks').select('id, titulo, descricao, storage_path')
      .eq('nutri_id', nutriId)
      .eq('tag', 'manipulados')
      .order('titulo');
    const items = (data ?? []).map(it => ({
      ...it,
      foto_url: /\.(jpg|jpeg|png|webp)$/i.test(it.storage_path ?? '')
        ? supabase.storage.from('ebooks').getPublicUrl(it.storage_path).data.publicUrl
        : null,
    }));
    setFavoritos(items);
  }

  // Fora do Promise.all de carregar(): loja é dado da nutri, não da paciente, e
  // carregar() re-roda a cada suplemento salvo — não faz sentido refetchar as
  // lojas junto. Mesmo formato de carregarFavoritos.
  async function carregarLojas() {
    if (!nutriId) return;
    const { data } = await supabase
      .from('lojas_parceiras').select('id, nome, telefone')
      .eq('nutri_id', nutriId)
      .eq('ativo', true)
      .order('nome');
    setLojas(data ?? []);
  }

  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    carregarFavoritos();
    carregarLojas();
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  async function uploadFotoSuplemento(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${nutriId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('suplementos').upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('suplementos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function salvar(s, fotoFile) {
    if (!s.nome?.trim()) { alert('Informe o nome do suplemento.'); return; }
    setBusy(true);
    try {
      let foto_url = s.foto_url ?? null;
      let fotoAviso = null;
      if (fotoFile) {
        try { foto_url = await uploadFotoSuplemento(fotoFile); }
        catch (e) { fotoAviso = e.message; foto_url = s.foto_url ?? null; }
      }
      if (s.novo) {
        const { error } = await supabase.from('suplementos').insert({
          paciente_id: pacienteId, nutri_id: nutriId,
          nome: s.nome.trim(), dose: s.dose?.trim() || null,
          horario: s.horario?.trim() || null, obs: s.obs?.trim() || null,
          foto_url, ativo: true, ordem: suplementos?.length ?? 0,
          data_inicio: s.data_inicio || HOJE_ISO(),
          manipulado: !!s.manipulado,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suplementos').update({
          nome: s.nome.trim(), dose: s.dose?.trim() || null,
          horario: s.horario?.trim() || null, obs: s.obs?.trim() || null,
          foto_url, ativo: s.ativo,
          data_inicio: s.data_inicio || null,
          manipulado: !!s.manipulado,
          updated_at: new Date().toISOString(),
        }).eq('id', s.id);
        if (error) throw error;
      }
      setEditar(null);
      setAdicionarOpen(false);
      carregar();
      setFeedback(fotoAviso
        ? `Suplemento salvo! Foto não enviada: ${fotoAviso}`
        : 'Suplemento salvo com sucesso!');
    } catch (e) {
      alert('Erro ao salvar suplemento: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setBusy(false);
    }
  }

  async function salvarVarios(items) {
    setBusy(true);
    try {
      const base = suplementos?.length ?? 0;
      const rows = items.map((item, i) => ({
        paciente_id: pacienteId, nutri_id: nutriId,
        nome: item.nome,
        dose: item.dose?.trim() || null,
        horario: item.horario?.trim() || null,
        obs: item.obs?.trim() || null,
        foto_url: item.foto_url || null,
        ativo: true, ordem: base + i,
        data_inicio: item.data_inicio || HOJE_ISO(),
        manipulado: !!item.manipulado,
      }));
      const { error } = await supabase.from('suplementos').insert(rows);
      if (error) throw error;
      setAdicionarOpen(false);
      carregar();
      setFeedback(`${items.length} suplemento${items.length > 1 ? 's adicionados' : ' adicionado'} com sucesso!`);
    } catch (e) {
      alert('Erro ao salvar suplementos: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setBusy(false);
    }
  }

  async function excluir(s) {
    if (!window.confirm(`Excluir "${s.nome}"? Os logs de aderência também serão removidos.`)) return;
    await supabase.from('suplementos').delete().eq('id', s.id);
    carregar();
  }

  async function salvarNaBiblioteca(s) {
    const { error } = await supabase.from('suplementos_favoritos').insert({
      nutri_id: nutriId,
      nome: s.nome.trim(),
      dose: s.dose?.trim() || null,
      horario: s.horario?.trim() || null,
      obs: s.obs?.trim() || null,
      foto_url: s.foto_url ?? null,
    });
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    alert('Salvo na Biblioteca!');
    carregarFavoritos();
  }

  async function subirPdf() {
    const titulo = pdfTitulo.trim();
    if (!pdfFile || !titulo) return;
    setPdfErro(null);
    setBusy(true);

    // Antes do primeiro await de Supabase, storage incluído: getSession disputa
    // o mesmo lock de auth (ver iniciarTokenPush em push.js).
    const tokenPush = iniciarTokenPush();

    const ext  = (pdfFile.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${pacienteId}/${Date.now()}-suplementacao.${ext}`;

    const { error: upErr } = await supabase.storage.from('prescricoes')
      .upload(path, pdfFile, { contentType: pdfFile.type });
    if (upErr) { setBusy(false); setPdfErro('Upload falhou: ' + upErr.message); return; }

    const { error: insErr } = await supabase.from('prescricoes').insert({
      paciente_id: pacienteId, nutri_id: nutriId,
      tipo: 'suplementacao',
      titulo,
      nota: pdfNota.trim() || null,
      storage_path: path,
    });
    if (insErr) {
      // Rollback: sem isto o PDF fica no bucket sem linha que o aponte —
      // invisível nas duas telas e impossível de apagar pela interface.
      await supabase.storage.from('prescricoes').remove([path]);
      setBusy(false);
      setPdfErro('Erro ao gravar: ' + insErr.message);
      return;
    }

    avisarPaciente(tokenPush, pacienteId, 'prescricao');

    setBusy(false);
    setPdfFile(null);
    setPdfTitulo('');
    setPdfNota('');
    const inp = document.getElementById('sup-pdf-file');
    if (inp) inp.value = '';
    setFeedback('Prescrição enviada para a paciente!');
    carregar();
  }

  async function enviarParaFarmacia(formula) {
    setEnviandoFarmacia(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada. Recarregue a página.');
      const resp = await fetch('/.netlify/functions/enviar-farmacia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ paciente_id: pacienteId, formula }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Falha ao enviar.');
      setEnviarFarmaciaOpen(false);
      setFeedback('Fórmula enviada para a farmácia!');
      carregar(); // atualiza "última enviada em"
    } catch (e) {
      alert('Erro ao enviar: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setEnviandoFarmacia(false);
    }
  }

  async function abrirPdf(pdf) {
    const { data, error } = await supabase.storage.from('prescricoes').createSignedUrl(pdf.storage_path, 120);
    if (error) return alert('Erro: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function excluirPdf(pdf) {
    if (!window.confirm(`Excluir PDF "${pdf.titulo}"?`)) return;
    await supabase.storage.from('prescricoes').remove([pdf.storage_path]);
    await supabase.from('prescricoes').delete().eq('id', pdf.id);
    carregar();
  }

  const aderencia = useMemo(() => {
    const ativos = (suplementos ?? []).filter(s => s.ativo);
    if (ativos.length === 0) return null;
    const dias7 = [];
    for (let i = 6; i >= 0; i--)
      dias7.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    const esperado = ativos.length * dias7.length;
    const cumprido = logs.filter(l =>
      l.tomado && dias7.includes(l.data) && ativos.some(s => s.id === l.suplemento_id)
    ).length;
    return Math.round((cumprido / esperado) * 100);
  }, [suplementos, logs]);

  const ativos = (suplementos ?? []).filter(s => s.ativo);
  const manipuladosAtivos = ativos.filter(s => s.manipulado);
  const suplementosLoja = filtrarParaLoja(ativos);

  function abrirEnviarFarmacia() {
    if (manipuladosAtivos.length === 0) {
      alert('Nenhuma fórmula manipulada prescrita.');
      return;
    }
    setEnviarFarmaciaOpen(true);
  }

  function abrirEnviarLoja() {
    if (suplementosLoja.length === 0) {
      alert('Nenhum suplemento para a prescrição de loja.');
      return;
    }
    setEnviarLojaOpen(true);
  }

  // gerarPDFPrescricao virou async por causa do import dinâmico do jsPDF: sem o
  // try/catch aqui, uma falha viraria promise rejeitada silenciosa.
  async function gerarPdf() {
    setGerandoPdf(true);
    try {
      await gerarPDFPrescricao({ pacienteNome, contato, suplementosAtivos: ativos });
    } catch (e) {
      alert('Erro ao gerar o PDF: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Suplementação de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">Lista pra ela checar todo dia + PDF da prescrição</div>
          </div>
          <button className="btn" onClick={() => setAdicionarOpen(true)}>
            <i className="ti ti-plus" aria-hidden="true"></i> Adicionar suplemento
          </button>
        </div>

        <div className="card-body">
          {feedback && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: 'var(--green-bg)', border: '0.5px solid var(--green)',
              color: 'var(--green)', fontSize: 13, fontWeight: 500,
            }}>
              <i className="ti ti-check" aria-hidden="true" />
              {feedback}
            </div>
          )}

          {aderencia !== null && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: 12, borderRadius: 10, marginBottom: 14,
              background: aderencia >= 70 ? 'var(--green-bg)' : aderencia >= 40 ? 'var(--orange-bg)' : 'var(--red-bg)',
              border: `0.5px solid var(--${aderencia >= 70 ? 'green' : aderencia >= 40 ? 'orange' : 'red'})`,
            }}>
              <div style={{
                fontSize: 24, fontWeight: 600,
                color: `var(--${aderencia >= 70 ? 'green' : aderencia >= 40 ? 'orange' : 'red'})`,
              }}>{aderencia}%</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Aderência últimos 7 dias</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {aderencia >= 70 ? 'Excelente — paciente engajada' :
                   aderencia >= 40 ? 'Atenção — converse no próximo check-in' :
                                     'Baixa aderência — vale investigar o motivo'}
                </div>
              </div>
            </div>
          )}

          <div style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
          }}>Suplementos prescritos</div>

          {suplementos === null ? (
            <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : suplementos.length === 0 ? (
            <div style={{
              padding: '20px 16px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)', textAlign: 'center',
            }}>
              <i className="ti ti-pill" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} aria-hidden="true"></i>
              Nenhum suplemento prescrito ainda.
              <br />
              <button className="btn" style={{ marginTop: 12 }} onClick={() => setAdicionarOpen(true)}>
                <i className="ti ti-plus" aria-hidden="true"></i> Adicionar suplemento
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suplementos.map(s => (
                <div key={s.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: 12, borderRadius: 8,
                  background: s.ativo ? 'var(--white)' : 'var(--bg2)',
                  border: '0.5px solid var(--border)',
                  opacity: s.ativo ? 1 : 0.6,
                }}>
                  {s.foto_url ? (
                    <img src={s.foto_url} alt={s.nome} loading="lazy" decoding="async"
                      style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <i className="ti ti-pill"
                      style={{ fontSize: 18, color: 'var(--gold-deep, var(--dark))', flexShrink: 0 }}
                      aria-hidden="true"></i>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {s.nome}
                      {!s.ativo && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(pausado)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      {s.dose && <span><i className="ti ti-droplet" aria-hidden="true"></i> {s.dose}</span>}
                      {s.horario && <span><i className="ti ti-clock" aria-hidden="true"></i> {s.horario}</span>}
                      {s.data_inicio && (
                        <span><i className="ti ti-calendar" aria-hidden="true"></i> desde {dataBR(s.data_inicio)}</span>
                      )}
                      {s.obs && <span style={{ fontStyle: 'italic' }}>"{s.obs}"</span>}
                    </div>
                  </div>
                  <button onClick={() => salvarNaBiblioteca(s)} title="Salvar na Biblioteca"
                    style={{
                      background: 'none', border: '0.5px solid var(--border)',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 13,
                    }}>
                    <i className="ti ti-star" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => setEditar({ ...s, novo: false })}
                    className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                    <i className="ti ti-edit" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => excluir(s)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Saídas da prescrição: fórmula manipulada pra farmácia (e-mail),
              PDF pra paciente e texto de WhatsApp pra loja parceira. */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={abrirEnviarFarmacia}>
              <i className="ti ti-send" aria-hidden="true"></i> Enviar para farmácia
            </button>
            <button className="btn-outline" onClick={gerarPdf} disabled={gerandoPdf}>
              <i className="ti ti-file-text" aria-hidden="true"></i>
              {gerandoPdf ? ' Gerando…' : ' Gerar PDF'}
            </button>
            {/* O title fica no span, não no button: navegador suprime evento de
                ponteiro em elemento desabilitado e o tooltip nunca apareceria. */}
            <span title={lojas.length === 0 ? 'Nenhuma loja cadastrada' : undefined}>
              <button className="btn-outline" onClick={abrirEnviarLoja} disabled={lojas.length === 0}>
                <i className="ti ti-building-store" aria-hidden="true"></i> Enviar para loja parceira
              </button>
            </span>
            {ultimoEnvio && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                <i className="ti ti-check" aria-hidden="true"></i> Última fórmula enviada em {dataBR(ultimoEnvio.enviado_em)}
              </span>
            )}
          </div>

          <div style={{
            marginTop: 18, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
          }}>Prescrição em PDF</div>

          <div style={{
            border: '1.5px dashed var(--border)', borderRadius: 8,
            padding: 12, marginBottom: 10,
          }}>
            <input value={pdfTitulo} onChange={e => setPdfTitulo(e.target.value)}
              placeholder="Título — ex: Fórmula manipulada · setembro"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />

            {/* A posologia é o que a paciente lê na tela dela sem precisar
                abrir o PDF. Vai para prescricoes.nota. */}
            <textarea value={pdfNota} onChange={e => setPdfNota(e.target.value)}
              rows={3}
              placeholder="Posologia e orientações — ex: 1 cápsula em jejum, 30 min antes do café"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }} />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input id="sup-pdf-file" type="file" accept="application/pdf"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                style={{ flex: 1, padding: 4 }} />
              <button className="btn" onClick={subirPdf} disabled={!pdfFile || !pdfTitulo.trim() || busy}>
                <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>

            {pdfErro && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>{pdfErro}</div>
            )}
          </div>

          {pdfs.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Nenhuma prescrição em PDF enviada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pdfs.map(pdf => (
                <div key={pdf.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: 10, borderRadius: 8, background: 'var(--white)',
                  border: '0.5px solid var(--border)',
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{pdf.titulo}</div>
                    {/* A posologia aparece aqui para você conferir exatamente o
                        que a paciente está lendo na tela dela. */}
                    {pdf.nota && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginTop: 2 }}>
                        {pdf.nota}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Enviado em {dataBR(pdf.created_at)}</div>
                  </div>
                  <button onClick={() => abrirPdf(pdf)} className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button onClick={() => excluirPdf(pdf)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {adicionarOpen && (
        <ModalAdicionarSuplemento
          favoritos={favoritos}
          onClose={() => setAdicionarOpen(false)}
          onSalvarBiblioteca={salvarVarios}
          onSalvarManual={(s, fotoFile) => salvar({ ...s, novo: true }, fotoFile)}
          busy={busy}
        />
      )}

      {editar && (
        <ModalSuplemento
          s={editar}
          onClose={() => setEditar(null)}
          onSave={salvar}
          busy={busy}
        />
      )}

      {enviarFarmaciaOpen && (
        <ModalEnviarFarmacia
          pacienteNome={pacienteNome}
          contato={contato}
          suplementosAtivos={manipuladosAtivos}
          farmaciaEmail={profile?.farmacia_email}
          farmaciaNome={profile?.farmacia_nome}
          onClose={() => setEnviarFarmaciaOpen(false)}
          onEnviar={enviarParaFarmacia}
          busy={enviandoFarmacia}
        />
      )}

      {enviarLojaOpen && (
        <ModalEnviarLoja
          pacienteNome={pacienteNome}
          contato={contato}
          lojas={lojas}
          onClose={() => setEnviarLojaOpen(false)}
        />
      )}
    </>
  );
}


/* ============================================================
   MODAL ADICIONAR SUPLEMENTO — escolher da biblioteca ou manual
   ============================================================ */
function ModalAdicionarSuplemento({ favoritos, onClose, onSalvarBiblioteca, onSalvarManual, busy }) {
  const [modo, setModo] = useState(null); // null | 'biblioteca' | 'manual'

  // estado biblioteca: { [favId]: { nome, dose, horario, obs, foto_url, data_inicio, favorito_id } }
  const [selecionados, setSelecionados] = useState({});

  // estado manual
  const [form, setForm] = useState({
    nome: '', dose: '', horario: '', obs: '', foto_url: null,
    data_inicio: new Date().toISOString().slice(0, 10),
    manipulado: false,
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);

  function toggleFav(fav) {
    setSelecionados(prev => {
      if (prev[fav.id]) {
        const next = { ...prev };
        delete next[fav.id];
        return next;
      }
      return {
        ...prev,
        [fav.id]: {
          nome: fav.titulo,
          dose: '',
          horario: '',
          obs: fav.descricao ?? '',
          foto_url: fav.foto_url ?? null,
          data_inicio: new Date().toISOString().slice(0, 10),
          manipulado: false,
          favorito_id: fav.id,
        },
      };
    });
  }

  function updateSel(favId, field, value) {
    setSelecionados(prev => ({ ...prev, [favId]: { ...prev[favId], [field]: value } }));
  }

  function handleFotoChange(e) {
    const file = e.target.files?.[0] ?? null;
    setFotoFile(file);
    if (file) setFotoPreview(URL.createObjectURL(file));
  }

  const qtd = Object.keys(selecionados).length;

  const titulo = modo === null
    ? 'Adicionar suplemento'
    : modo === 'biblioteca' ? 'Escolher da Biblioteca' : 'Adicionar manualmente';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 500, width: '100%',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        padding: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {modo && (
              <button onClick={() => setModo(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', padding: '2px 4px', fontSize: 16,
              }}>
                <i className="ti ti-arrow-left" aria-hidden="true"></i>
              </button>
            )}
            <div style={{ fontSize: 16, fontWeight: 500 }}>{titulo}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        {/* ── Chooser ── */}
        {modo === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setModo('biblioteca')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}>
              <i className="ti ti-books"
                style={{ fontSize: 24, color: 'var(--gold-deep, #a08456)', flexShrink: 0 }}
                aria-hidden="true"></i>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>
                  Escolher da Biblioteca
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {favoritos.length === 0
                    ? 'Nenhum item na Biblioteca ainda'
                    : `${favoritos.length} item${favoritos.length !== 1 ? 'ns' : ''} na Biblioteca — posologia editável`}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} aria-hidden="true"></i>
            </button>

            <button
              onClick={() => setModo('manual')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}>
              <i className="ti ti-edit"
                style={{ fontSize: 24, color: 'var(--blue, #1a5a8c)', flexShrink: 0 }}
                aria-hidden="true"></i>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>
                  Adicionar manualmente
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Preencher nome, posologia e data de início
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} aria-hidden="true"></i>
            </button>
          </div>
        )}

        {/* ── Biblioteca ── */}
        {modo === 'biblioteca' && (
          <>
            {favoritos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
                <i className="ti ti-books" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} aria-hidden="true"></i>
                Nenhum item em Suplementação na Biblioteca.
                <br />
                <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                  Adicione itens na seção Suplementação da página Biblioteca.
                </span>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Itens selecionados — fora do grid, evita reflow */}
                {Object.entries(selecionados).map(([favId, sel]) => {
                  const fav = favoritos.find(f => String(f.id) === favId);
                  if (!fav) return null;
                  return (
                    <div key={favId} style={{
                      marginBottom: 10, borderRadius: 10, overflow: 'hidden',
                      background: 'var(--amber-bg, #fdf8ee)',
                      border: '2px solid var(--amber, #c9a96e)',
                    }}>
                      <div
                        onClick={() => toggleFav(fav)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          background: 'var(--amber, #c9a96e)',
                          border: '1.5px solid var(--amber, #c9a96e)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--white)', fontSize: 12,
                        }}>
                          <i className="ti ti-check" aria-hidden="true"></i>
                        </div>
                        {fav.foto_url ? (
                          <img src={fav.foto_url} alt={fav.titulo} loading="lazy" decoding="async"
                            style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <i className="ti ti-pill" style={{ fontSize: 20, color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true"></i>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{fav.titulo}</div>
                          {fav.descricao && (
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fav.descricao}</div>
                          )}
                        </div>
                      </div>
                      <div style={{
                        padding: '10px 12px 12px',
                        borderTop: '0.5px solid var(--border)',
                        background: 'var(--white)',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label className="form-lbl">Posologia</label>
                            <input
                              value={sel.dose}
                              onChange={e => updateSel(favId, 'dose', e.target.value)}
                              placeholder="1 cápsula, 5g…"
                            />
                          </div>
                          <div>
                            <label className="form-lbl">Horário</label>
                            <input
                              value={sel.horario}
                              onChange={e => updateSel(favId, 'horario', e.target.value)}
                              placeholder="Café da manhã…"
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label className="form-lbl">Data de início</label>
                            <input
                              type="date"
                              value={sel.data_inicio}
                              onChange={e => updateSel(favId, 'data_inicio', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="form-lbl">Observação</label>
                            <input
                              value={sel.obs}
                              onChange={e => updateSel(favId, 'obs', e.target.value)}
                              placeholder="Tomar em jejum…"
                            />
                          </div>
                        </div>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: 12, cursor: 'pointer',
                        }}>
                          <input type="checkbox" checked={!!sel.manipulado}
                            onChange={e => updateSel(favId, 'manipulado', e.target.checked)} />
                          É fórmula manipulada (vai pra farmácia)
                        </label>
                      </div>
                    </div>
                  );
                })}

                {/* Itens NÃO selecionados — grid compacto, sem reflow */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 10,
                  alignContent: 'start',
                }}>
                  {favoritos.filter(fav => !selecionados[String(fav.id)]).map(fav => (
                    <div key={fav.id}
                      className="suplemento-card"
                      onClick={() => toggleFav(fav)}
                      style={{ background: 'var(--bg2)' }}
                    >
                      <div style={{
                        width: '100%', height: 120,
                        background: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8, marginBottom: 8,
                      }}>
                        {fav.foto_url ? (
                          <img src={fav.foto_url} alt={fav.titulo} loading="lazy" decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} />
                        ) : (
                          <i className="ti ti-pill" style={{ fontSize: 28, color: 'var(--text3)' }} aria-hidden="true"></i>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{fav.titulo}</div>
                      {fav.descricao && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{fav.descricao}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
                Cancelar
              </button>
              {qtd > 0 && (
                <button
                  className="btn" style={{ flex: 2, justifyContent: 'center' }}
                  onClick={() => onSalvarBiblioteca(Object.values(selecionados))}
                  disabled={busy}>
                  <i className="ti ti-check" aria-hidden="true"></i>
                  {busy ? 'Salvando…' : `Adicionar ${qtd} suplemento${qtd > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Manual ── */}
        {modo === 'manual' && (
          <>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <label className="form-lbl">Nome</label>
              <input
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Vitamina D3 2000UI"
                autoFocus
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label className="form-lbl">Posologia</label>
                  <input
                    value={form.dose}
                    onChange={e => setForm({ ...form, dose: e.target.value })}
                    placeholder="1 cápsula, 5g…"
                  />
                </div>
                <div>
                  <label className="form-lbl">Horário</label>
                  <input
                    value={form.horario}
                    onChange={e => setForm({ ...form, horario: e.target.value })}
                    placeholder="Café da manhã, 08:00…"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label className="form-lbl">Data de início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={e => setForm({ ...form, data_inicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-lbl">Observação (opcional)</label>
                  <input
                    value={form.obs}
                    onChange={e => setForm({ ...form, obs: e.target.value })}
                    placeholder="Tomar em jejum, com gordura…"
                  />
                </div>
              </div>

              <label className="form-lbl" style={{ marginTop: 10 }}>Foto do suplemento (opcional)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                {fotoPreview && (
                  <img src={fotoPreview} alt="preview" loading="lazy" decoding="async"
                    style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <input type="file" accept="image/*" onChange={handleFotoChange}
                  style={{ flex: 1, fontSize: 12 }} />
              </div>

              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 14, fontSize: 13, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={!!form.manipulado}
                  onChange={e => setForm({ ...form, manipulado: e.target.checked })} />
                É fórmula manipulada (vai pra farmácia)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => onSalvarManual(form, fotoFile)}
                disabled={busy || !form.nome.trim()}>
                <i className="ti ti-check" aria-hidden="true"></i>
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


/* ============================================================
   MODAL ENVIAR FÓRMULA PARA FARMÁCIA — prévia + confirmação
   ============================================================ */
function ModalEnviarFarmacia({ pacienteNome, contato, suplementosAtivos, farmaciaEmail, farmaciaNome, onClose, onEnviar, busy }) {
  const inicial = (suplementosAtivos ?? [])
    .map(s => [s.nome, s.dose].filter(Boolean).join(' — '))
    .join('\n');
  const [formula, setFormula] = useState(inicial);
  const semFarmacia = !farmaciaEmail?.trim();

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 520, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Enviar fórmula para farmácia</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        {semFarmacia ? (
          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 4,
            background: 'var(--orange-bg)', border: '0.5px solid var(--orange)',
            color: 'var(--orange)', fontSize: 13,
          }}>
            <i className="ti ti-alert-triangle" aria-hidden="true"></i>{' '}
            E-mail da farmácia não configurado. Vá em <strong>Personalização</strong> e cadastre o e-mail da farmácia antes de enviar.
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Para: <strong>{farmaciaNome?.trim() || farmaciaEmail}</strong>
                {farmaciaNome?.trim() && <span> ({farmaciaEmail})</span>}
              </div>

              <label className="form-lbl">Fórmula (edite como precisar)</label>
              <textarea
                value={formula}
                onChange={e => setFormula(e.target.value)}
                rows={8}
                placeholder={'Ex:\nVitamina D3 5000UI\nMagnésio dimalato 300mg\n— manipular em 60 cápsulas —'}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
                autoFocus
              />

              <label className="form-lbl" style={{ marginTop: 12 }}>Contato da paciente (vai no e-mail)</label>
              <div style={{
                padding: 12, borderRadius: 8, background: 'var(--bg2)',
                border: '0.5px solid var(--border)', fontSize: 13, lineHeight: 1.6,
              }}>
                <div><strong>Nome:</strong> {pacienteNome}</div>
                <div><strong>Telefone:</strong> {contato?.telefone || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn" style={{ flex: 2, justifyContent: 'center' }}
                onClick={() => onEnviar(formula.trim())}
                disabled={busy || !formula.trim()}>
                <i className="ti ti-send" aria-hidden="true"></i>
                {busy ? 'Enviando…' : 'Confirmar envio'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


/* ============================================================
   MODAL ENVIAR PRESCRIÇÃO PARA LOJA PARCEIRA — escolha da loja + texto
   ============================================================
   Não escreve nada no banco e não tem estado de envio: o botão final é um
   link wa.me. Quem manda a mensagem é a nutri, no WhatsApp dela — o app não
   tem como confirmar que saiu, então não finge que sabe (ver o comentário da
   migration 2026-08-13_lojas_parceiras.sql). */
function ModalEnviarLoja({ pacienteNome, contato, lojas, onClose }) {
  // Uma loja só: já entra escolhida e o chooser nunca aparece.
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0] : null);
  // O texto não depende da loja — o nome dela não entra na prescrição. Por isso
  // é montado uma vez e sobrevive a ir e voltar no chooser sem perder a edição.
  const [texto, setTexto] = useState(
    () => textoPrescricaoLoja({ pacienteNome, contato })
  );
  const podeVoltar = lojas.length > 1;   // com uma loja só, voltar não teria destino
  const vazio = !texto.trim();

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 520, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loja && podeVoltar && (
              <button onClick={() => setLoja(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', padding: '2px 4px', fontSize: 16,
              }}>
                <i className="ti ti-arrow-left" aria-hidden="true"></i>
              </button>
            )}
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {loja ? 'Enviar para loja parceira' : 'Escolher a loja'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        {/* ── Chooser (só com 2+ lojas ativas) ── */}
        {!loja ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {lojas.map(l => (
              <button
                key={l.id}
                onClick={() => setLoja(l)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  background: 'var(--bg2)', border: '0.5px solid var(--border)',
                  textAlign: 'left', fontFamily: 'var(--font-sans)',
                }}>
                <i className="ti ti-building-store"
                  style={{ fontSize: 24, color: 'var(--gold-deep, #a08456)', flexShrink: 0 }}
                  aria-hidden="true"></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>{l.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{l.telefone}</div>
                </div>
                <i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} aria-hidden="true"></i>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Para: <strong>{loja.nome}</strong> ({loja.telefone})
              </div>

              <label className="form-lbl">Mensagem (edite como precisar)</label>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={12}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
                Cancelar
              </button>
              {/* <a> não aceita disabled: com a mensagem apagada, desligo o clique na mão. */}
              <a
                className="btn"
                style={{
                  flex: 2, justifyContent: 'center',
                  ...(vazio ? { pointerEvents: 'none', opacity: 0.5 } : null),
                }}
                href={`https://wa.me/${normalizarTelefone(loja.telefone)}?text=${encodeURIComponent(texto)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={onClose}>
                <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> Abrir WhatsApp
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


/* ============================================================
   MODAL EDITAR SUPLEMENTO
   ============================================================ */
function ModalSuplemento({ s, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    ...s,
    data_inicio: s.data_inicio ?? new Date().toISOString().slice(0, 10),
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(s.foto_url ?? null);

  function handleFotoChange(e) {
    const file = e.target.files?.[0] ?? null;
    setFotoFile(file);
    if (file) setFotoPreview(URL.createObjectURL(file));
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 480, width: '100%', padding: 20,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Editar suplemento</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <label className="form-lbl">Nome</label>
        <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
          placeholder="Ex: Vitamina D3 2000UI" autoFocus />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label className="form-lbl">Posologia</label>
            <input value={form.dose ?? ''} onChange={e => setForm({ ...form, dose: e.target.value })}
              placeholder="1 cápsula, 5g…" />
          </div>
          <div>
            <label className="form-lbl">Horário</label>
            <input value={form.horario ?? ''} onChange={e => setForm({ ...form, horario: e.target.value })}
              placeholder="Café da manhã, 08:00…" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label className="form-lbl">Data de início</label>
            <input type="date" value={form.data_inicio ?? ''} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
          </div>
          <div>
            <label className="form-lbl">Observação (opcional)</label>
            <input value={form.obs ?? ''} onChange={e => setForm({ ...form, obs: e.target.value })}
              placeholder="Tomar em jejum, com gordura…" />
          </div>
        </div>

        <label className="form-lbl" style={{ marginTop: 10 }}>Foto do suplemento (opcional)</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          {fotoPreview && (
            <img src={fotoPreview} alt="preview" loading="lazy" decoding="async"
              style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <input type="file" accept="image/*" onChange={handleFotoChange}
            style={{ flex: 1, fontSize: 12 }} />
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 14, fontSize: 13, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={!form.ativo}
            onChange={e => setForm({ ...form, ativo: !e.target.checked })} />
          Pausar (paciente não vê na lista do dia)
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 10, fontSize: 13, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={!!form.manipulado}
            onChange={e => setForm({ ...form, manipulado: e.target.checked })} />
          É fórmula manipulada (vai pra farmácia)
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onSave(form, fotoFile)} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   PDF DE PRESCRIÇÃO DE SUPLEMENTAÇÃO

   Diverge dos outros documentos do app (_RelatorioEvolucao,
   Checkins, Questionarios), que montam HTML e chamam print():
   aqui o jsPDF desenha em coordenadas e o .pdf baixa direto,
   sem passar pelo diálogo de impressão do navegador.

   FONTES: o jsPDF só traz as 14 padrão do PDF. Cormorant
   Garamond virou Times e Inter virou Helvetica — embutir as
   fontes de marca custaria ~250 kB de TTF por causa de um
   título. Consequência: o texto fica limitado ao CP1252, que
   cobre o português inteiro mas não emoji nem símbolo fora do
   Latin-1 (·, — e acentos estão cobertos).
   ============================================================ */

// "Posologia" na tela é a coluna `dose`; `horario` completa a instrução.
function posologiaDe(s) {
  return [s.dose, s.horario].filter(Boolean).join(' · ');
}

// Lipeshot e Moroshot são fórmulas manipuladas: vão pra farmácia de
// manipulação (ver 2026-07-23_suplementos_manipulado.sql), não pra
// prescrição de loja parceira. Seguem ativos na lista da paciente —
// só não entram nas duas saídas de prescrição de loja (PDF e WhatsApp).
// Casa por inclusão, igual ao ilike '%...%' do backfill: além dos dois
// isolados existe o combinado "Moroshot + Lipeshot" cadastrado.
const FORA_DA_PRESCRICAO_LOJA = ['lipeshot', 'moroshot'];

// Uma definição só da regra, usada pelo PDF e pelo texto de WhatsApp — as duas
// saídas partem da mesma lista. Idempotente: filtrar de novo dá o mesmo
// resultado, então não importa se o chamador já filtrou antes.
function filtrarParaLoja(lista) {
  return (lista ?? []).filter(s => {
    const n = String(s.nome ?? '').trim().toLowerCase();
    return !FORA_DA_PRESCRICAO_LOJA.some(x => n.includes(x));
  });
}

// Só os dados da paciente: a lista de suplementos vai completa no PDF anexado.
// Texto puro, sem encode: quem monta a URL do wa.me aplica encodeURIComponent
// (mesma divisão de mensagemAcesso.js).
function textoPrescricaoLoja({ pacienteNome, contato }) {
  return [
    'PRESCRIÇÃO DE SUPLEMENTAÇÃO', '',
    `Paciente: ${pacienteNome}`,
    `Contato: ${contato?.telefone || '—'}`, '',
    'Segue em anexo o PDF com os suplementos prescritos.', '',
    'Kelly Oliveira',
    'Nutricionista — CRN 3801',
  ].join('\n');
}

// A4 em pontos. Todo o layout anterior estava em px; a conversão é exata em
// impressão: pt = px * 0.75 (1px = 1/96 pol, 1pt = 1/72 pol).
const PAGE_W = 595.28, PAGE_H = 841.89;
const M = 72;                    // margem lateral (~os 73pt que o CSS somava)
const W = PAGE_W - M * 2;        // 451,28pt de largura útil
const TOPO = 64;
const FUNDO = PAGE_H - 56;       // limite vertical antes de quebrar a página

// Mesma paleta do HTML anterior, em RGB: setFillColor(r,g,b) é a assinatura
// que não depende do parser de cor CSS do jsPDF.
const CREME  = [253, 251, 248];  // #FDFBF8  fundo da página
const ESCURO = [26, 22, 18];     // #1a1612  faixa do cabeçalho
const TINTA  = [40, 27, 6];      // #281b06  texto principal
const OURO   = [196, 168, 130];  // #C4A882  selo e marca do rodapé
const BRONZE = [160, 132, 86];   // #a08456  rótulos e registro
const CINZA  = [141, 129, 117];  // #8d8175  data de emissão
const SEPIA  = [107, 92, 62];    // #6b5c3e  posologia em itálico
const LINHA  = [221, 213, 196];  // #DDD5C4  bordas do card e do rodapé
const LINHA2 = [237, 230, 218];  // #EDE6DA  divisória entre suplementos

// prescricao-suplementacao-maria-souza.pdf — sem acento e sem espaço, que é o
// que atravessa Windows, Android e iOS sem o navegador reescrever o nome.
// NFD separa a letra do acento e o filtro por código descarta o acento solto;
// feito sem \u no regex de propósito, pra não depender de escape no fonte.
function nomeArquivoPrescricao(pacienteNome) {
  const semAcento = String(pacienteNome ?? '')
    .normalize('NFD')
    .split('')
    .filter(c => c.charCodeAt(0) < 128)
    .join('');
  const slug = semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `prescricao-suplementacao-${slug || 'paciente'}.pdf`;
}

async function gerarPDFPrescricao({ pacienteNome, contato, suplementosAtivos }) {
  const itens = filtrarParaLoja(suplementosAtivos);
  if (itens.length === 0) {
    alert('Nenhum suplemento para a prescrição de loja.');
    return;
  }

  // Import dinâmico: o jsPDF vira chunk próprio, baixado no primeiro clique.
  // Estático no topo do arquivo ele entraria no chunk da tela, que é baixado
  // ao abrir a aba mesmo de quem nunca gera PDF.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Texto no PDF é posicionado pela LINHA DE BASE, não pelo topo da caixa —
  // por isso y é acumulador explícito, em vez do fluxo que o CSS dava de graça.
  let y = TOPO;

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

  function caberOuQuebrar(altura) {
    if (y + altura <= FUNDO) return;
    doc.addPage();
    pintarFundo();
    y = TOPO;
  }

  pintarFundo();

  // ── Cabeçalho escuro ──
  // .doc-header: fundo #1a1612, border-radius 10px, padding 28/32/26px.
  const H_CAB = 95;
  doc.setFillColor(...ESCURO);
  doc.roundedRect(M, y, W, H_CAB, 7.5, 7.5, 'F');
  // text-transform: uppercase não existe no jsPDF — a caixa alta vai no JS.
  escrever('Essentia · Prescrição'.toUpperCase(), M + 24, y + 32,
    { estilo: 'bold', tamanho: 7.1, cor: OURO, charSpace: 1.57 });
  escrever('Prescrição de Suplementação', M + 24, y + 62,
    { fonte: 'times', estilo: 'bold', tamanho: 22.5, cor: CREME });
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
  // Colunas fixas: o CSS usava flex com gap, então a coluna do contato começava
  // onde o nome terminasse. Fixo fica igual entre pacientes; em compensação um
  // nome muito longo é cortado na largura da coluna em vez de invadir o vizinho.
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

  // ── Lista de suplementos ──
  escrever('Suplementos prescritos'.toUpperCase(), M, y,
    { estilo: 'bold', tamanho: 7.9, cor: BRONZE, charSpace: 1.1 });
  y += 4.5;
  regua(y, LINHA);
  y += 3;

  for (let i = 0; i < itens.length; i++) {
    const s = itens[i];
    const pos = posologiaDe(s);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const linhasNome = doc.splitTextToSize(String(s.nome ?? ''), W);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.4);
    const linhasPos = pos ? doc.splitTextToSize(pos, W) : [];

    const alturaItem = 9.75 + 10.5 + (linhasNome.length - 1) * 12.6
      + (linhasPos.length ? 2.25 + linhasPos.length * 14.6 : 0) + 9.75;

    // page-break-inside: avoid POR ITEM, nunca na lista inteira — um bloco
    // grande com avoid é tudo-ou-nada e empurra meia página em branco (a
    // mesma armadilha que o CSS anterior comentava).
    caberOuQuebrar(alturaItem);

    const base = y + 9.75 + 10.5;
    linhasNome.forEach((linha, k) => {
      escrever(linha, M, base + k * 12.6, { estilo: 'bold', tamanho: 10.5 });
    });
    const basePos = base + (linhasNome.length - 1) * 12.6 + 2.25;
    linhasPos.forEach((linha, k) => {
      escrever(linha, M, basePos + 9.4 + k * 14.6,
        { estilo: 'italic', tamanho: 9.4, cor: SEPIA });
    });

    y += alturaItem;
    if (i < itens.length - 1) regua(y, LINHA2);   // .sup-item:last-child sem borda
  }

  // ── Rodapé ──
  // .rodape tinha page-break-inside: avoid — aqui é a checagem do bloco inteiro.
  caberOuQuebrar(30 + 90);
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

  doc.save(nomeArquivoPrescricao(pacienteNome));
}
