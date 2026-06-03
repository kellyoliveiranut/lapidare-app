import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import DateInput from '../../components/DateInput.jsx';

export default function FollowUp({ pacienteId, nutriId, pacienteNome }) {
  const [followups, setFollowups] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [editar, setEditar] = useState(null);          // followup sendo editado (ou objeto novo)
  const [modelosOpen, setModelosOpen] = useState(false);

  async function carregar() {
    const [fRes, tRes] = await Promise.all([
      supabase.from('followups').select('*')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('followup_templates').select('*')
        .eq('nutri_id', nutriId)
        .order('created_at'),
    ]);
    setFollowups(fRes.data ?? []);
    setTemplates(tRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function excluir(fu) {
    if (!window.confirm(`Excluir follow-up "${fu.titulo}"?`)) return;
    await supabase.from('followups').delete().eq('id', fu.id);
    carregar();
  }

  function novoEmBranco() {
    setEditar({
      novo: true,
      titulo: '',
      conteudo: '',
      data: new Date().toISOString().slice(0, 10),
      template_id: null,
    });
  }

  function novoDoTemplate(t) {
    setEditar({
      novo: true,
      titulo: t.nome,
      conteudo: t.conteudo,
      data: new Date().toISOString().slice(0, 10),
      template_id: t.id,
    });
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Follow-up de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">Anotações internas — só você vê (a paciente não)</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-outline" onClick={() => setModelosOpen(true)}>
              <i className="ti ti-template" aria-hidden="true"></i> Modelos
            </button>
            <button className="btn" onClick={novoEmBranco}>
              <i className="ti ti-plus" aria-hidden="true"></i> Novo follow-up
            </button>
          </div>
        </div>

        <div className="card-body">
          {/* Iniciar a partir de modelo */}
          {templates.length > 0 && (
            <div style={{
              padding: 10, borderRadius: 8, background: 'var(--bg2)', marginBottom: 14,
            }}>
              <div style={{
                fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
              }}>
                Iniciar a partir de um modelo
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {templates.map(t => (
                  <button key={t.id} className="btn-outline"
                    onClick={() => novoDoTemplate(t)}
                    style={{ fontSize: 11, padding: '4px 10px' }}>
                    <i className="ti ti-file-plus" aria-hidden="true"></i> {t.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Histórico */}
          {followups === null ? (
            <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : followups.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Card de exemplo */}
              <div style={{
                border: '0.5px dashed var(--border)', borderRadius: 10,
                padding: 14, opacity: 0.6, pointerEvents: 'none', userSelect: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                  <div style={{
                    flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                    background: 'var(--bg2)', fontSize: 11, fontWeight: 500, color: 'var(--dark)',
                  }}>
                    {new Date().toLocaleDateString('pt-BR')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 5 }}>
                      Retorno mensal · junho
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                      Paciente relatou melhora na disposição. Manteve dieta 80% da semana. Queixa de náusea nas manhãs.{' '}
                      <strong>Conduta:</strong> manter plano, revisar café da manhã.
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                  Exemplo de follow-up — crie o primeiro agora
                </div>
                <button className="btn" onClick={novoEmBranco}>
                  <i className="ti ti-plus" aria-hidden="true"></i> Criar follow-up
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {followups.map(fu => (
                <div key={fu.id} style={{
                  border: '0.5px solid var(--border)', borderRadius: 10,
                  padding: 14, background: 'var(--white)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                    <div style={{
                      flexShrink: 0, padding: '4px 10px',
                      borderRadius: 6, background: 'var(--bg2)',
                      fontSize: 11, fontWeight: 500, color: 'var(--dark)',
                    }}>
                      {dataBR(fu.data)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fu.titulo}</div>
                      <pre style={{
                        fontFamily: 'var(--font-sans)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        margin: '6px 0 0', fontSize: 12, lineHeight: 1.5,
                        color: 'var(--text2, var(--dark))',
                      }}>{fu.conteudo}</pre>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button onClick={() => setEditar({ ...fu, novo: false })}
                        className="btn-outline" style={{ fontSize: 10, padding: '3px 8px' }}>
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button onClick={() => excluir(fu)}
                        style={{
                          background: 'none', border: '0.5px solid var(--red)',
                          borderRadius: 6, padding: '3px 8px',
                          color: 'var(--red)', cursor: 'pointer',
                        }}>
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editar && (
        <ModalEditarFollowup
          fu={editar} pacienteId={pacienteId} nutriId={nutriId}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); carregar(); }}
        />
      )}

      {modelosOpen && (
        <ModalModelos
          nutriId={nutriId} templates={templates}
          onClose={() => setModelosOpen(false)}
          onChanged={carregar}
        />
      )}
    </>
  );
}


/* ============================================================
   MODAL: criar/editar um follow-up
   ============================================================ */
function ModalEditarFollowup({ fu, pacienteId, nutriId, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(fu.titulo);
  const [data, setData] = useState(fu.data);
  const [conteudo, setConteudo] = useState(fu.conteudo);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!titulo.trim()) return setErro('Informe um título.');
    if (!conteudo.trim()) return setErro('Conteúdo vazio.');
    setBusy(true);
    if (fu.novo) {
      const { error } = await supabase.from('followups').insert({
        paciente_id: pacienteId, nutri_id: nutriId,
        titulo: titulo.trim(), conteudo, data,
        template_id: fu.template_id ?? null,
      });
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    } else {
      const { error } = await supabase.from('followups')
        .update({ titulo: titulo.trim(), conteudo, data, updated_at: new Date().toISOString() })
        .eq('id', fu.id);
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    }
    setBusy(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 720, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {fu.novo ? 'Novo follow-up' : 'Editar follow-up'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Anotação privada da nutri
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label className="form-lbl">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Retorno mensal · maio" />
          </div>
          <div>
            <label className="form-lbl">Data</label>
            <DateInput value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <label className="form-lbl" style={{ marginTop: 12 }}>Conteúdo</label>
        <textarea value={conteudo} onChange={e => setConteudo(e.target.value)}
          rows={16}
          style={{
            width: '100%', boxSizing: 'border-box',
            resize: 'vertical', minHeight: 280,
            fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
          }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   MODAL: gerenciar modelos
   ============================================================ */
function ModalModelos({ nutriId, templates, onClose, onChanged }) {
  const [edit, setEdit] = useState(null);   // null = nenhum / objeto = editando

  async function excluir(t) {
    if (!window.confirm(`Excluir modelo "${t.nome}"?`)) return;
    await supabase.from('followup_templates').delete().eq('id', t.id);
    onChanged();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 720, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Biblioteca de modelos</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Modelos reutilizáveis pra padronizar seus follow-ups com todas as pacientes
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        {!edit ? (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button className="btn" onClick={() => setEdit({
                novo: true, nome: '', descricao: '', conteudo: '',
              })}>
                <i className="ti ti-plus" aria-hidden="true"></i> Novo modelo
              </button>
            </div>
            {templates.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Nenhum modelo criado ainda.
              </div>
            ) : (
              <div style={{ overflow: 'auto', flex: 1 }}>
                {templates.map(t => (
                  <div key={t.id} style={{
                    border: '0.5px solid var(--border)', borderRadius: 8,
                    padding: 12, marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.nome}</div>
                      {t.descricao && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{t.descricao}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setEdit({ ...t, novo: false })}
                        className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button onClick={() => excluir(t)}
                        style={{
                          background: 'none', border: '0.5px solid var(--red)',
                          borderRadius: 6, padding: '3px 8px',
                          color: 'var(--red)', cursor: 'pointer',
                        }}>
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <EditarTemplate
            t={edit} nutriId={nutriId}
            onCancel={() => setEdit(null)}
            onSaved={() => { setEdit(null); onChanged(); }}
          />
        )}
      </div>
    </div>
  );
}


function EditarTemplate({ t, nutriId, onCancel, onSaved }) {
  const [nome, setNome] = useState(t.nome);
  const [descricao, setDescricao] = useState(t.descricao ?? '');
  const [conteudo, setConteudo] = useState(t.conteudo);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe um nome.');
    if (!conteudo.trim()) return setErro('Conteúdo vazio.');
    setBusy(true);
    if (t.novo) {
      const { error } = await supabase.from('followup_templates').insert({
        nutri_id: nutriId,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        conteudo,
      });
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    } else {
      const { error } = await supabase.from('followup_templates').update({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        conteudo,
        updated_at: new Date().toISOString(),
      }).eq('id', t.id);
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    }
    setBusy(false);
    onSaved();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <label className="form-lbl">Nome</label>
      <input value={nome} onChange={e => setNome(e.target.value)}
        placeholder="Ex: Retorno mensal" />

      <label className="form-lbl" style={{ marginTop: 10 }}>Descrição (opcional)</label>
      <input value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: Pra usar nas consultas mensais de acompanhamento" />

      <label className="form-lbl" style={{ marginTop: 10 }}>Conteúdo</label>
      <textarea value={conteudo} onChange={e => setConteudo(e.target.value)}
        rows={14}
        style={{
          width: '100%', boxSizing: 'border-box',
          resize: 'vertical', minHeight: 240,
          fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
        }}
        placeholder={`Ex:

## Queixa principal


## Conduta


## Próximos passos
`} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>
          ← Voltar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar modelo'}
        </button>
      </div>
    </div>
  );
}
