import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Mensagens semanais de Emagrecimento (tabela mensagens_emagrecimento).
// Lista única, sem categorias. O placeholder {nome} é trocado pelo primeiro
// nome da paciente na hora de exibir (ver Inicio.jsx) — aqui salvamos literal.

const temPlaceholder = t => /\{nome\}/.test(t);

export default function MensagensEmagrecimento() {
  const { user } = useSession();
  const [msgs, setMsgs] = useState([]);        // todas as mensagens da nutri
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // edição inline
  const [editandoId, setEditandoId] = useState(null);
  const [editTexto, setEditTexto] = useState('');

  // adicionar nova
  const [novoTexto, setNovoTexto] = useState('');

  function mostrarFeedback(tipo, msg) {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('mensagens_emagrecimento')
      .select('*')
      .eq('nutri_id', user.id)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setMsgs(data ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  function iniciarEdicao(m) {
    setEditandoId(m.id);
    setEditTexto(m.texto);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditTexto('');
  }

  async function salvarEdicao(m) {
    const texto = editTexto.trim();
    if (!texto || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from('mensagens_emagrecimento')
      .update({ texto })
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao salvar: ' + error.message); return; }
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, texto } : x)));
    cancelarEdicao();
    mostrarFeedback('ok', 'Mensagem atualizada!');
  }

  async function toggleAtiva(m) {
    if (!user) return;
    const novo = !m.ativa;
    // update otimista — reverte se der erro
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ativa: novo } : x)));
    const { error } = await supabase
      .from('mensagens_emagrecimento')
      .update({ ativa: novo })
      .eq('id', m.id);
    if (error) {
      setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ativa: !novo } : x)));
      mostrarFeedback('erro', 'Erro ao atualizar: ' + error.message);
    }
  }

  async function excluir(m) {
    if (!user) return;
    if (!window.confirm('Excluir esta mensagem? Essa ação não pode ser desfeita.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('mensagens_emagrecimento')
      .delete()
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao excluir: ' + error.message); return; }
    setMsgs(prev => prev.filter(x => x.id !== m.id));
    mostrarFeedback('ok', 'Mensagem excluída.');
  }

  async function adicionar() {
    const texto = novoTexto.trim();
    if (!texto || !user) return;
    setBusy(true);
    // nova mensagem vai pro fim da rotação
    const maxOrdem = msgs.reduce((max, m) => Math.max(max, m.ordem ?? 0), 0);
    const { data, error } = await supabase
      .from('mensagens_emagrecimento')
      .insert({ nutri_id: user.id, texto, ordem: maxOrdem + 1 })
      .select()
      .single();
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao adicionar: ' + error.message); return; }
    setMsgs(prev => [...prev, data]);
    setNovoTexto('');
    mostrarFeedback('ok', 'Mensagem adicionada!');
  }

  const ativas = msgs.filter(m => m.ativa).length;

  return (
    <div>
      <style>{`
        .emag-msgs {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 900px) {
          .emag-msgs { grid-template-columns: 1fr 1fr; }
          .emag-msg--editando { grid-column: 1 / -1; }
        }
      `}</style>

      {/* ── ADICIONAR NOVA ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">⚖️ Mensagens de emagrecimento</div>
          <div className="card-sub">
            Mensagens semanais que aparecem no topo da tela da paciente de
            emagrecimento. A cada semana entra a próxima da lista, em rotação.
            Use <code style={{ fontSize: 11 }}>{'{nome}'}</code> onde quiser o{' '}
            <strong>primeiro nome da paciente</strong> — ele é trocado
            automaticamente ao exibir.
          </div>
        </div>
        <div className="card-body">
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            Adicionar nova mensagem
          </div>

          <textarea
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            rows={3}
            placeholder="Escreva a mensagem… (ex.: {nome}, um passo de cada vez.)"
            style={{
              width: '100%', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: novoTexto.trim() ? 'var(--bg-soft)' : 'var(--bg2)',
              fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
              outline: 'none', color: 'var(--ink)',
            }}
          />
          {novoTexto.trim() && !temPlaceholder(novoTexto) && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              💡 Essa mensagem não tem <code style={{ fontSize: 11 }}>{'{nome}'}</code> — ela
              aparecerá igual para todas as pacientes.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              className="btn"
              onClick={adicionar}
              disabled={busy || !novoTexto.trim()}
            >
              {busy ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>

          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
            }}>
              {feedback.msg}
            </div>
          )}
        </div>
      </div>

      {/* ── LISTA ── */}
      {loading ? (
        <div className="card"><div className="card-body" style={{ color: 'var(--text3)', fontSize: 13 }}>
          Carregando…
        </div></div>
      ) : msgs.length === 0 ? (
        <div className="card"><div className="card-body" style={{
          color: 'var(--text3)', fontSize: 13, textAlign: 'center',
        }}>
          Nenhuma mensagem ainda. Adicione a primeira acima.
        </div></div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: 15 }}>Mensagens da rotação</div>
            <div className="card-sub">
              {msgs.length} mensagem{msgs.length > 1 ? 's' : ''} · {ativas} ativa{ativas > 1 ? 's' : ''} na rotação
            </div>
          </div>
          <div className="card-body">
            <div className="emag-msgs">
              {msgs.map((m, i) => (
                <div
                  key={m.id}
                  className={editandoId === m.id ? 'emag-msg--editando' : undefined}
                  style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: m.ativa ? '1px solid var(--border)' : '1px dashed var(--border)',
                    background: m.ativa ? 'var(--bg-soft)' : 'var(--bg2)',
                  }}
                >
                  {editandoId === m.id ? (
                    <>
                      <textarea
                        value={editTexto}
                        onChange={e => setEditTexto(e.target.value)}
                        rows={3}
                        autoFocus
                        style={{
                          width: '100%', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
                          padding: '9px 11px', borderRadius: 8,
                          border: '1.5px solid var(--border)', background: 'var(--bg2)',
                          fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55,
                          outline: 'none', color: 'var(--ink)',
                        }}
                      />
                      {editTexto.trim() && !temPlaceholder(editTexto) && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                          💡 Sem <code style={{ fontSize: 11 }}>{'{nome}'}</code> — aparecerá igual para todas.
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button
                          onClick={cancelarEdicao}
                          disabled={busy}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
                            fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn"
                          onClick={() => salvarEdicao(m)}
                          disabled={busy || !editTexto.trim()}
                        >
                          {busy ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                          textTransform: 'uppercase', marginBottom: 5,
                          color: 'var(--text3)',
                        }}>
                          #{i + 1}
                          {!m.ativa && <span style={{ color: 'var(--muted)' }}>· inativa</span>}
                        </div>
                        <div style={{
                          fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-sans)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          color: m.ativa ? 'var(--ink)' : 'var(--text3)',
                        }}>
                          {m.texto}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleAtiva(m)}
                          title={m.ativa ? 'Desativar (tirar da rotação)' : 'Ativar (voltar à rotação)'}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: m.ativa ? 'var(--green, #16a34a)' : 'var(--muted)',
                            padding: '5px 7px',
                          }}
                        >
                          <i className={`ti ti-${m.ativa ? 'circle-check-filled' : 'circle'}`} style={{ fontSize: 16 }} />
                        </button>
                        <button
                          onClick={() => iniciarEdicao(m)}
                          title="Editar"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', padding: '5px 7px',
                          }}
                        >
                          <i className="ti ti-pencil" style={{ fontSize: 15 }} />
                        </button>
                        <button
                          onClick={() => excluir(m)}
                          disabled={busy}
                          title="Excluir"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', padding: '5px 7px',
                          }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: 15 }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
