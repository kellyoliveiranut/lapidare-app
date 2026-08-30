import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais, dataBR } from '../../lib/utils.js';
import { iniciarTokenPush, avisarPaciente } from '../../lib/push.js';

const PAGINA = 12;
const TTL = 3600;   // era 300 — evitava a URL expirar antes do loading="lazy" puxar a imagem

const urlCache = new Map();

async function getSignedUrl(path) {
  if (!path) return null;
  const now = Date.now();
  const cached = urlCache.get(path);
  if (cached && cached.exp > now) return cached.url;
  for (const [k, v] of urlCache) { if (v.exp <= now) urlCache.delete(k); }
  const { data, error } = await supabase.storage
    .from('fotos_pratos')
    .createSignedUrl(path, TTL);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: now + (TTL - 200) * 1000 });
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
  const [edicao, setEdicao] = useState({});                 // {comentarioId: text}
  const [salvandoEdicao, setSalvandoEdicao] = useState({});
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [todosComentarios, setTodosComentarios] = useState({}); // {postId: true}
  const pedidos = useRef(new Set());                        // ids já solicitados

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('feed_pratos')
      .select('id, refeicao, legenda, storage_path, created_at, paciente:pacientes(id, nome, nutri_id), comentarios:feed_pratos_comentarios(id, autor, texto, created_at)')
      .order('created_at', { ascending: false })
      .limit(300);
    // Filtrar só os das pacientes dessa nutri
    const filtrados = (data ?? []).filter(p => p.paciente?.nutri_id === user.id);
    setPosts(filtrados);
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

  // Só a fatia renderizada. As contagens das pílulas continuam sobre `posts`.
  const naTela = useMemo(() => filtrados.slice(0, visiveis), [filtrados, visiveis]);

  // Assina em paralelo, e só o que está na tela.
  // Sem flag de cancelamento: sob StrictMode a limpeza rodaria entre a 1a e a
  // 2a execução e descartaria o resultado, enquanto os ids já marcados em
  // `pedidos` impediriam a 2a de pedir de novo — as fotos nunca chegariam.
  // setUrls em componente desmontado é no-op desde o React 18, e o urlCache
  // de módulo faz qualquer repetição sair sem rede.
  useEffect(() => {
    const faltando = naTela.filter(p => p.storage_path && !pedidos.current.has(p.id));
    if (!faltando.length) return;
    faltando.forEach(p => pedidos.current.add(p.id));

    Promise.all(faltando.map(p =>
      getSignedUrl(p.storage_path).then(url => [p.id, url])
    )).then(pares => {
      // falhou: tira do set para que uma recarga tente de novo
      pares.filter(([, url]) => !url).forEach(([id]) => pedidos.current.delete(id));
      const novas = Object.fromEntries(pares.filter(([, url]) => url));
      if (Object.keys(novas).length) setUrls(u => ({ ...u, ...novas }));
    });
  }, [naTela]);

  async function salvarComentario(post) {
    const texto = (comentarioEdit[post.id] ?? '').trim();
    if (!texto) return;
    setSalvando(s => ({ ...s, [post.id]: true }));
    const tokenPush = iniciarTokenPush();
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
    avisarPaciente(tokenPush, post.paciente?.id, 'comentario_prato');
    carregar();
  }

  // Editar e apagar valem só pro comentário da própria nutri: as policies
  // fpc_update_nutri / fpc_delete_nutri recusam o resto no banco, e os
  // botões só aparecem em c.autor === 'nutri'.
  async function salvarEdicao(comentario) {
    const texto = (edicao[comentario.id] ?? '').trim();
    if (!texto) return;
    setSalvandoEdicao(s => ({ ...s, [comentario.id]: true }));
    const { error } = await supabase.from('feed_pratos_comentarios')
      .update({ texto })
      .eq('id', comentario.id);
    setSalvandoEdicao(s => ({ ...s, [comentario.id]: false }));
    if (error) { alert('Erro ao editar comentário: ' + error.message); return; }
    setEdicao(e => {
      const novo = { ...e };
      delete novo[comentario.id];
      return novo;
    });
    carregar();
  }

  async function apagarComentario(comentario) {
    if (!window.confirm('Apagar este comentário? A paciente deixa de vê-lo.')) return;
    const { error } = await supabase.from('feed_pratos_comentarios')
      .delete()
      .eq('id', comentario.id);
    if (error) { alert('Erro ao apagar comentário: ' + error.message); return; }
    carregar();
  }

  const semFeedback = posts?.filter(p => !temComentarioNutri(p)).length ?? 0;
  const novasRespostas = posts?.filter(p => temNovaResposta(p)).length ?? 0;
  const hoje = posts?.filter(p => p.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length ?? 0;

  return (
    <>
      {/* Cabeçalho compactado só nesta tela: page-title/page-sub são classes
          compartilhadas por todo o painel e não devem mudar por causa do feed */}
      <div className="page-title" style={{ fontSize: 20 }}>Feed de pratos</div>
      <div className="page-sub" style={{ fontSize: 13, marginBottom: 10 }}>
        Fotos enviadas pelas pacientes — comente e dê feedback
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          { id: 'todas',         label: `Todas (${posts?.length ?? 0})` },
          { id: 'nova_resposta', label: `Nova resposta (${novasRespostas})` },
          { id: 'sem_feedback',  label: `Sem feedback (${semFeedback})` },
          { id: 'hoje',          label: `Hoje (${hoje})` },
        ].map(f => (
          <button key={f.id}
            className={filtro === f.id ? 'btn' : 'btn-outline'}
            onClick={() => { setFiltro(f.id); setVisiveis(PAGINA); }}
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
        <>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}>
          {naTela.map(p => {
            const url = urls[p.id];
            const emEdicao = comentarioEdit[p.id] !== undefined;
            // marginBottom: 0 — a classe .card traz 12px que, dentro de um
            // grid com gap, viravam 24px entre fileiras
            return (
              <div key={p.id} className="card"
                   style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
                <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--bg2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--dark)',
                  }}>{iniciais(p.paciente?.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.paciente?.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
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

                {/* contain, não cover: a 383px de largura o cover cortava ~45%
                    de uma foto em pé. Aqui a foto aparece inteira, com faixa
                    neutra nas laterais. */}
                <div style={{
                  background: 'var(--bg3)', height: 200,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer"
                       style={{ display: 'block', width: '100%', height: '100%' }}>
                      <img src={url} alt={p.legenda ?? 'prato'}
                        loading="lazy" decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </a>
                  ) : (
                    <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--border)' }} aria-hidden="true"></i>
                  )}
                </div>

                {/* Sem clamp: a legenda é o que a paciente escreveu para a nutri
                    ler, e cortar em uma linha entregava o recado pela metade. O
                    `title` continua, mas nunca substituiu o texto — no celular
                    não existe hover.

                    wordBreak porque o card tem overflow: hidden (linha 210): sem
                    ele, um link colado sem espaços seria cortado pela borda, em
                    silêncio, em vez de quebrar em duas linhas. */}
                {p.legenda && (
                  <div style={{
                    padding: '6px 12px', fontSize: 14, lineHeight: 1.5, color: 'var(--dark)',
                    wordBreak: 'break-word',
                  }} title={p.legenda}>
                    {p.legenda}
                  </div>
                )}

                <div style={{
                  padding: '8px 12px 10px',
                  borderTop: '0.5px solid #f5f0e8',
                  background: '#faf8f5',
                }}>
                  {/* Só o último comentário fica visível; os anteriores entram
                      sob demanda. Numa conversa de 3 idas e vindas isso poupa
                      ~100px de altura do card. */}
                  {!todosComentarios[p.id] && comentariosOrdenados(p).length > 1 && (
                    <button
                      onClick={() => setTodosComentarios(t => ({ ...t, [p.id]: true }))}
                      style={{
                        background: 'none', border: 'none', padding: '0 0 6px',
                        color: 'var(--text3)', fontSize: 11, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}>
                      ver os {comentariosOrdenados(p).length} comentários
                    </button>
                  )}
                  {(todosComentarios[p.id]
                    ? comentariosOrdenados(p)
                    : comentariosOrdenados(p).slice(-1)
                  ).map(c => {
                    const editandoEste = edicao[c.id] !== undefined;
                    return (
                      <div key={c.id} style={{
                        background: 'var(--white)',
                        borderLeft: `2px solid ${c.autor === 'nutri' ? 'var(--amber)' : 'var(--blue, #1a5a8c)'}`,
                        borderRadius: 6, padding: '6px 8px', marginBottom: 6,
                        fontSize: 12, lineHeight: 1.5, color: 'var(--text2)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <div style={{
                            flex: 1, fontSize: 11, fontWeight: 600, letterSpacing: '.5px',
                            color: c.autor === 'nutri' ? 'var(--amber)' : 'var(--blue, #1a5a8c)',
                          }}>
                            {c.autor === 'nutri' ? 'VOCÊ' : (p.paciente?.nome?.split(' ')[0] ?? 'Paciente').toUpperCase()}
                          </div>
                          {c.autor === 'nutri' && !editandoEste && (
                            <>
                              <button onClick={() => setEdicao(e => ({ ...e, [c.id]: c.texto }))}
                                title="Editar comentário" aria-label="Editar comentário"
                                style={{
                                  background: 'none', border: 'none', padding: 2,
                                  color: 'var(--text3)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                                }}>
                                <i className="ti ti-pencil" aria-hidden="true"></i>
                              </button>
                              <button onClick={() => apagarComentario(c)}
                                title="Apagar comentário" aria-label="Apagar comentário"
                                style={{
                                  background: 'none', border: 'none', padding: 2,
                                  color: 'var(--red)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                                }}>
                                <i className="ti ti-trash" aria-hidden="true"></i>
                              </button>
                            </>
                          )}
                        </div>

                        {editandoEste ? (
                          <>
                            <textarea
                              rows={3}
                              autoFocus
                              value={edicao[c.id] ?? ''}
                              onChange={ev => setEdicao(e => ({ ...e, [c.id]: ev.target.value }))}
                              style={{
                                width: '100%', padding: '8px 10px', fontSize: 13,
                                border: '0.5px solid var(--border)',
                                borderRadius: 6, outline: 'none',
                                fontFamily: 'var(--font-sans)', resize: 'vertical',
                                boxSizing: 'border-box',
                              }} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button onClick={() => setEdicao(e => { const n = { ...e }; delete n[c.id]; return n; })}
                                className="btn-outline" style={{ flex: 1, fontSize: 12, padding: '5px 10px' }}>
                                Cancelar
                              </button>
                              <button onClick={() => salvarEdicao(c)}
                                disabled={salvandoEdicao[c.id]}
                                className="btn" style={{ flex: 1, fontSize: 12, padding: '5px 10px' }}>
                                <i className="ti ti-check" aria-hidden="true"></i>
                                {salvandoEdicao[c.id] ? '...' : 'Salvar'}
                              </button>
                            </div>
                          </>
                        ) : c.texto}
                      </div>
                    );
                  })}

                  {!emEdicao ? (
                    <button
                      onClick={() => setComentarioEdit(e => ({ ...e, [p.id]: '' }))}
                      className="btn"
                      style={{ width: '100%', fontSize: 13, padding: '6px 12px', justifyContent: 'center' }}>
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
        {filtrados.length > visiveis && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <button className="btn-outline" onClick={() => setVisiveis(v => v + PAGINA)}
              style={{ fontSize: 13, padding: '8px 18px' }}>
              Carregar mais ({filtrados.length - visiveis} restantes)
            </button>
          </div>
        )}
        </>
      )}
    </>
  );
}
