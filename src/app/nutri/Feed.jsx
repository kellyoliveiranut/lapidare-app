import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais, dataBR } from '../../lib/utils.js';

const urlCache = new Map();

async function getSignedUrl(path) {
  const cached = urlCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from('fotos_pratos').createSignedUrl(path, 300);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 280_000 });
  return data.signedUrl;
}

function comentariosOrdenados(p) {
  return [...(p.comentarios ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
function temComentarioNutri(p) {
  return (p.comentarios ?? []).some(c => c.autor === 'nutri');
}
function temNovaResposta(p) {
  const cs = comentariosOrdenados(p);
  return cs.length > 0 && cs[cs.length - 1].autor === 'paciente';
}

export default function FeedNutri() {
  const { user } = useSession();
  const [posts, setPosts] = useState(undefined);
  const [urls, setUrls] = useState({});
  const [filtro, setFiltro] = useState('todas');
  const [comentarioEdit, setComentarioEdit] = useState({}); // {postId: text}
  const [salvando, setSalvando] = useState({});

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('feed_pratos')
      .select('id, refeicao, legenda, storage_path, created_at, paciente:pacientes(id, nome, nutri_id), comentarios:feed_pratos_comentarios(id, autor, texto, created_at)')
      .order('created_at', { ascending: false });
    // Filtrar só os das pacientes dessa nutri
    const filtrados = (data ?? []).filter(p => p.paciente?.nutri_id === user.id);
    setPosts(filtrados);

    const novasUrls = {};
    for (const p of filtrados) {
      const url = await getSignedUrl(p.storage_path);
      if (url) novasUrls[p.id] = url;
    }
    setUrls(novasUrls);
  }
  useEffect(() => { carregar(); }, [user]);

  const filtrados = useMemo(() => {
    if (!posts) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    if (filtro === 'sem_feedback')  return posts.filter(p => !temComentarioNutri(p));
    if (filtro === 'nova_resposta') return posts.filter(p => temNovaResposta(p));
    if (filtro === 'hoje') return posts.filter(p => p.created_at?.slice(0, 10) === hoje);
    return posts;
  }, [posts, filtro]);

  async function salvarComentario(post) {
    const texto = (comentarioEdit[post.id] ?? '').trim();
    if (!texto) return;
    setSalvando(s => ({ ...s, [post.id]: true }));
    const { error } = await supabase.from('feed_pratos_comentarios').insert({
      prato_id: post.id,
      paciente_id: post.paciente?.id,
      autor: 'nutri',
      texto,
    });
    setSalvando(s => ({ ...s, [post.id]: false }));
    if (error) { alert('Erro ao comentar: ' + error.message); return; }
    setComentarioEdit(e => {
      const novo = { ...e };
      delete novo[post.id];
      return novo;
    });
    // Avisa a paciente via push (fire-and-forget — nunca bloqueia a UI)
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken || !post.paciente?.id) return;
      fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'notify_paciente', paciente_id: post.paciente.id, kind: 'comentario_prato' }),
      }).catch(() => {});
    });
    carregar();
  }

  const semFeedback = posts?.filter(p => !temComentarioNutri(p)).length ?? 0;
  const novasRespostas = posts?.filter(p => temNovaResposta(p)).length ?? 0;
  const hoje = posts?.filter(p => p.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length ?? 0;

  return (
    <>
      <div className="page-title">Feed de pratos</div>
      <div className="page-sub">Fotos enviadas pelas pacientes — comente e dê feedback</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { id: 'todas',         label: `Todas (${posts?.length ?? 0})` },
          { id: 'nova_resposta', label: `Nova resposta (${novasRespostas})` },
          { id: 'sem_feedback',  label: `Sem feedback (${semFeedback})` },
          { id: 'hoje',          label: `Hoje (${hoje})` },
        ].map(f => (
          <button key={f.id}
            className={filtro === f.id ? 'btn' : 'btn-outline'}
            onClick={() => setFiltro(f.id)}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            {f.label}
          </button>
        ))}
      </div>

      {posts === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-camera empty-icon" aria-hidden="true"></i>
          <div className="empty-title">
            {filtro === 'sem_feedback' ? 'Todas têm feedback ✓'
              : filtro === 'hoje' ? 'Nenhuma foto hoje'
              : 'Nenhuma foto enviada ainda'}
          </div>
          <div className="empty-sub">
            As fotos de pratos das suas pacientes aparecerão aqui para você comentar e dar feedback.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}>
          {filtrados.map(p => {
            const url = urls[p.id];
            const emEdicao = comentarioEdit[p.id] !== undefined;
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--bg2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600, color: 'var(--dark)',
                  }}>{iniciais(p.paciente?.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.paciente?.nome ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {p.refeicao ?? '—'} · {dataBR(p.created_at)}
                    </div>
                  </div>
                  {temNovaResposta(p) ? (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20,
                      background: 'var(--amber-bg, #fdf8ee)', color: 'var(--amber, #c9a96e)',
                      fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase',
                    }}>Nova resposta</span>
                  ) : !temComentarioNutri(p) ? (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20,
                      background: 'var(--orange-bg)', color: 'var(--orange)',
                      fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase',
                    }}>SEM FB</span>
                  ) : null}
                </div>

                <div style={{
                  background: 'var(--bg2)', height: 280,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer"
                       style={{ display: 'block', width: '100%', height: '100%' }}>
                      <img src={url} alt={p.legenda ?? 'prato'}
                        loading="lazy" decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </a>
                  ) : (
                    <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--border)' }} aria-hidden="true"></i>
                  )}
                </div>

                {p.legenda && (
                  <div style={{ padding: '10px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--dark)' }}>
                    {p.legenda}
                  </div>
                )}

                <div style={{
                  padding: '10px 14px 14px',
                  borderTop: '0.5px solid #f5f0e8',
                  background: '#faf8f5',
                }}>
                  {comentariosOrdenados(p).map(c => (
                    <div key={c.id} style={{
                      background: 'var(--white)',
                      borderLeft: `2px solid ${c.autor === 'nutri' ? 'var(--amber)' : 'var(--blue, #1a5a8c)'}`,
                      borderRadius: 6, padding: '8px 10px', marginBottom: 8,
                      fontSize: 13, lineHeight: 1.5, color: 'var(--text2)',
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, marginBottom: 3, letterSpacing: '.5px',
                        color: c.autor === 'nutri' ? 'var(--amber)' : 'var(--blue, #1a5a8c)',
                      }}>
                        {c.autor === 'nutri' ? 'VOCÊ' : (p.paciente?.nome?.split(' ')[0] ?? 'Paciente').toUpperCase()}
                      </div>
                      {c.texto}
                    </div>
                  ))}

                  {!emEdicao ? (
                    <button
                      onClick={() => setComentarioEdit(e => ({ ...e, [p.id]: '' }))}
                      className="btn"
                      style={{ width: '100%', fontSize: 13, padding: '8px 12px', justifyContent: 'center' }}>
                      <i className="ti ti-message-circle" aria-hidden="true"></i>
                      {temComentarioNutri(p) ? ' Responder' : ' Comentar este prato'}
                    </button>
                  ) : (
                    <>
                      <textarea
                        rows={3}
                        autoFocus
                        value={comentarioEdit[p.id] ?? ''}
                        onChange={ev => setComentarioEdit(e => ({ ...e, [p.id]: ev.target.value }))}
                        placeholder="Ex: Boa porção de proteína! Acrescente uns legumes verdes."
                        style={{
                          width: '100%', padding: '8px 10px', fontSize: 13,
                          border: '0.5px solid var(--border)',
                          borderRadius: 6, outline: 'none',
                          fontFamily: 'var(--font-sans)', resize: 'vertical',
                          boxSizing: 'border-box',
                        }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => setComentarioEdit(e => { const n = { ...e }; delete n[p.id]; return n; })}
                          className="btn-outline" style={{ flex: 1, fontSize: 12, padding: '5px 10px' }}>
                          Cancelar
                        </button>
                        <button onClick={() => salvarComentario(p)}
                          disabled={salvando[p.id]}
                          className="btn" style={{ flex: 1, fontSize: 12, padding: '5px 10px' }}>
                          <i className="ti ti-check" aria-hidden="true"></i>
                          {salvando[p.id] ? '...' : 'Enviar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
