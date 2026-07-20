import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

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
  const [favoritos, setFavoritos] = useState([]);
  const [editar, setEditar] = useState(null);
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  async function carregar(signal = { cancelled: false }) {
    const [supRes, logRes, pdfRes, envRes, pacRes] = await Promise.all([
      supabase.from('suplementos').select('id, nome, dose, horario, obs, foto_url, ativo, data_inicio').eq('paciente_id', pacienteId).order('ordem'),
      supabase.from('suplementos_logs').select('tomado, data, suplemento_id')
        .eq('paciente_id', pacienteId)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
      supabase.from('prescricoes').select('id, titulo, storage_path, created_at')
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

  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    carregarFavoritos();
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
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suplementos').update({
          nome: s.nome.trim(), dose: s.dose?.trim() || null,
          horario: s.horario?.trim() || null, obs: s.obs?.trim() || null,
          foto_url, ativo: s.ativo,
          data_inicio: s.data_inicio || null,
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
    if (!pdfFile) return;
    setBusy(true);
    const ext = (pdfFile.name.split('.').pop() || 'pdf').toLowerCase();
    const titulo = pdfFile.name.replace(/\.[^.]+$/, '');
    const path = `${pacienteId}/${Date.now()}-suplementacao.${ext}`;
    const { error: upErr } = await supabase.storage.from('prescricoes')
      .upload(path, pdfFile, { contentType: pdfFile.type });
    if (upErr) { setBusy(false); alert('Erro: ' + upErr.message); return; }
    await supabase.from('prescricoes').insert({
      paciente_id: pacienteId, nutri_id: nutriId,
      tipo: 'suplementacao', titulo, storage_path: path,
    });
    setBusy(false);
    setPdfFile(null);
    const inp = document.getElementById('sup-pdf-file');
    if (inp) inp.value = '';
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

          {/* Enviar fórmula pra farmácia de manipulação */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => setEnviarFarmaciaOpen(true)}>
              <i className="ti ti-send" aria-hidden="true"></i> Enviar para farmácia
            </button>
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
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input id="sup-pdf-file" type="file" accept="application/pdf"
              onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              style={{ flex: 1, padding: 4 }} />
            <button className="btn" onClick={subirPdf} disabled={!pdfFile || busy}>
              <i className="ti ti-upload" aria-hidden="true"></i> Subir
            </button>
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
          suplementosAtivos={(suplementos ?? []).filter(s => s.ativo)}
          farmaciaEmail={profile?.farmacia_email}
          farmaciaNome={profile?.farmacia_nome}
          onClose={() => setEnviarFarmaciaOpen(false)}
          onEnviar={enviarParaFarmacia}
          busy={enviandoFarmacia}
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
                <div><strong>E-mail:</strong> {contato?.email || '—'}</div>
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
