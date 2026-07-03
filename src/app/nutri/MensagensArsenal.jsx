import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Categorias sugeridas para o campo de "nova mensagem" (texto livre — a nutri
// pode digitar qualquer outra). Servem só como atalho no datalist.
const CATEGORIAS_SUGERIDAS = [
  'Engajamento', 'Educativa', 'Bastidores', 'Cupom',
  'Material liberado', 'Reativação', 'Depoimento', 'Datas',
];

export default function MensagensArsenal() {
  const { user } = useSession();
  const [msgs, setMsgs] = useState([]);        // todas as mensagens da nutri
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);

  // edição inline
  const [editandoId, setEditandoId] = useState(null);
  const [editTexto, setEditTexto] = useState('');

  // adicionar nova
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoTexto, setNovoTexto] = useState('');

  function mostrarFeedback(tipo, msg) {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('mensagens_arsenal')
      .select('*')
      .eq('nutri_id', user.id)
      .order('categoria', { ascending: true })
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setMsgs(data ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  // agrupa por categoria, preservando a ordem já vinda do banco
  const grupos = useMemo(() => {
    const map = new Map();
    for (const m of msgs) {
      if (!map.has(m.categoria)) map.set(m.categoria, []);
      map.get(m.categoria).push(m);
    }
    return Array.from(map, ([categoria, itens]) => ({ categoria, itens }));
  }, [msgs]);

  async function copiar(m) {
    try {
      await navigator.clipboard.writeText(m.texto);
      setCopiadoId(m.id);
      setTimeout(() => setCopiadoId(prev => (prev === m.id ? null : prev)), 2000);
    } catch {
      mostrarFeedback('erro', 'Não consegui copiar. Copie manualmente.');
    }
  }

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
      .from('mensagens_arsenal')
      .update({ texto })
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao salvar: ' + error.message); return; }
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, texto } : x)));
    cancelarEdicao();
    mostrarFeedback('ok', 'Mensagem atualizada!');
  }

  async function toggleEnviada(m) {
    if (!user) return;
    const novo = !m.enviada;
    // update otimista — reverte se der erro
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, enviada: novo } : x)));
    const { error } = await supabase
      .from('mensagens_arsenal')
      .update({ enviada: novo })
      .eq('id', m.id);
    if (error) {
      setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, enviada: !novo } : x)));
      mostrarFeedback('erro', 'Erro ao atualizar: ' + error.message);
    }
  }

  async function excluir(m) {
    if (!user) return;
    if (!window.confirm('Excluir esta mensagem? Essa ação não pode ser desfeita.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('mensagens_arsenal')
      .delete()
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao excluir: ' + error.message); return; }
    setMsgs(prev => prev.filter(x => x.id !== m.id));
    mostrarFeedback('ok', 'Mensagem excluída.');
  }

  async function adicionar() {
    const categoria = novaCategoria.trim();
    const texto = novoTexto.trim();
    if (!categoria || !texto || !user) return;
    setBusy(true);
    // nova mensagem vai pro fim da sua categoria
    const maxOrdem = msgs
      .filter(m => m.categoria === categoria)
      .reduce((max, m) => Math.max(max, m.ordem ?? 0), 0);
    const { data, error } = await supabase
      .from('mensagens_arsenal')
      .insert({ nutri_id: user.id, categoria, texto, ordem: maxOrdem + 1 })
      .select()
      .single();
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao adicionar: ' + error.message); return; }
    setMsgs(prev => [...prev, data]);
    setNovoTexto('');
    // mantém a categoria selecionada para adicionar várias em sequência
    mostrarFeedback('ok', 'Mensagem adicionada!');
  }

  return (
    <div>
      <style>{`
        .arsenal-msgs {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 900px) {
          .arsenal-msgs { grid-template-columns: 1fr 1fr; }
          .arsenal-msg--editando { grid-column: 1 / -1; }
        }
      `}</style>

      {/* ── ADICIONAR NOVA ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">💬 Arsenal de mensagens</div>
          <div className="card-sub">
            Textos prontos para <strong>copiar e colar no WhatsApp do seu grupo</strong>.
            Organize por categoria, edite quando quiser e adicione novas.
            Placeholders como <code style={{ fontSize: 11 }}>[CUPOM]</code>,{' '}
            <code style={{ fontSize: 11 }}>[DATA]</code> e <code style={{ fontSize: 11 }}>[LINK]</code>{' '}
            você troca na hora de enviar.
          </div>
        </div>
        <div className="card-body">
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            Adicionar nova mensagem
          </div>

          <input
            list="arsenal-categorias"
            value={novaCategoria}
            onChange={e => setNovaCategoria(e.target.value)}
            placeholder="Categoria (ex.: Engajamento)"
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: 8,
              padding: '9px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--bg2)',
              fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink)',
              outline: 'none',
            }}
          />
          <datalist id="arsenal-categorias">
            {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
          </datalist>

          <textarea
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            rows={3}
            placeholder="Escreva a mensagem…"
            style={{
              width: '100%', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: novoTexto.trim() ? 'var(--bg-soft)' : 'var(--bg2)',
              fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
              outline: 'none', color: 'var(--ink)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              className="btn"
              onClick={adicionar}
              disabled={busy || !novaCategoria.trim() || !novoTexto.trim()}
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

      {/* ── LISTA POR CATEGORIA ── */}
      {loading ? (
        <div className="card"><div className="card-body" style={{ color: 'var(--text3)', fontSize: 13 }}>
          Carregando…
        </div></div>
      ) : grupos.length === 0 ? (
        <div className="card"><div className="card-body" style={{
          color: 'var(--text3)', fontSize: 13, textAlign: 'center',
        }}>
          Nenhuma mensagem ainda. Adicione a primeira acima.
        </div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grupos.map(g => (
            <div className="card" key={g.categoria}>
              <div className="card-header">
                <div className="card-title" style={{ fontSize: 15 }}>{g.categoria}</div>
                <div className="card-sub">{g.itens.length} mensagem{g.itens.length > 1 ? 's' : ''}</div>
              </div>
              <div className="card-body">
                <div className="arsenal-msgs">
                  {g.itens.map(m => (
                    <div
                      key={m.id}
                      className={editandoId === m.id ? 'arsenal-msg--editando' : undefined}
                      style={{
                        padding: '10px 12px', borderRadius: 10,
                        border: m.enviada ? '1px dashed var(--border)' : '1px solid var(--border)',
                        background: m.enviada ? 'var(--bg2)' : 'var(--bg-soft)',
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
                            {m.enviada && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                                textTransform: 'uppercase', marginBottom: 5,
                                color: 'var(--green, #16a34a)',
                              }}>
                                <i className="ti ti-check" style={{ fontSize: 12 }} />
                                Enviada
                              </div>
                            )}
                            <div style={{
                              fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-sans)',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              color: m.enviada ? 'var(--text3)' : 'var(--ink)',
                            }}>
                              {m.texto}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button
                              onClick={() => toggleEnviada(m)}
                              title={m.enviada ? 'Marcar como não enviada' : 'Marcar como enviada'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: m.enviada ? 'var(--green, #16a34a)' : 'var(--muted)',
                                padding: '5px 7px',
                              }}
                            >
                              <i className={`ti ti-${m.enviada ? 'circle-check-filled' : 'circle'}`} style={{ fontSize: 16 }} />
                            </button>
                            <button
                              onClick={() => copiar(m)}
                              title="Copiar"
                              style={{
                                background: copiadoId === m.id ? 'var(--green-bg)' : 'none',
                                border: 'none', borderRadius: 7, cursor: 'pointer',
                                color: copiadoId === m.id ? 'var(--green)' : 'var(--gold-deep, var(--text2))',
                                padding: '5px 8px', fontSize: 12, fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                              }}
                            >
                              <i className={`ti ti-${copiadoId === m.id ? 'check' : 'copy'}`} style={{ fontSize: 14 }} />
                              {copiadoId === m.id ? 'Copiado!' : 'Copiar'}
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
          ))}
        </div>
      )}
    </div>
  );
}
