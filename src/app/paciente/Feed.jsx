import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { iniciais, dataBR } from '../../lib/utils.js';
import { comprimirImagem } from '../../lib/imagem.js';
import { iniciarTokenPush, avisarNutri } from '../../lib/push.js';

const REFEICOES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Outro'];

const PAGINA = 12;
const TTL = 18000;

// Cache de signed URLs
const urlCache = new Map();

async function getSignedUrl(path) {
  if (!path) return null;
  const now = Date.now();
  const cached = urlCache.get(path);
  if (cached && cached.exp > now) return cached.url;
  // evict expired entries to prevent unbounded growth
  for (const [k, v] of urlCache) { if (v.exp <= now) urlCache.delete(k); }
  const { data, error } = await supabase.storage
    .from('fotos_pratos')
    .createSignedUrl(path, TTL);
  if (error) {
    console.error('[Feed] createSignedUrl falhou:', error.message, '| path:', path);
    return null;
  }
  urlCache.set(path, { url: data.signedUrl, exp: now + (TTL - 200) * 1000 });
  return data.signedUrl;
}

export default function FeedPaciente() {
  const tema = useTheme();
  const nutriNome = tema.nutri_nome ?? 'Sua nutri';
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [posts, setPosts] = useState(undefined);
  const [urls, setUrls] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [refeicao, setRefeicao] = useState('Almoço');
  const [legenda, setLegenda] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [diag, setDiag] = useState(null);              // [diag] TEMPORÁRIO — remover depois
  const [respostas, setRespostas] = useState({});      // {postId: texto}
  const [enviandoResp, setEnviandoResp] = useState({}); // {postId: bool}
  const [visiveis, setVisiveis] = useState(PAGINA);
  const fileInputRef = useRef(null);
  const pedidos = useRef(new Set());                    // ids já solicitados

  async function carregar(signal) {
    if (!user) return;
    const { data } = await supabase
      .from('feed_pratos')
      .select('id, refeicao, legenda, storage_path, created_at, comentarios:feed_pratos_comentarios(id, autor, texto, created_at)')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (signal.cancelled) return;
    setPosts(data ?? []);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

  // Só a fatia renderizada.
  const naTela = useMemo(() => (posts ?? []).slice(0, visiveis), [posts, visiveis]);

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

  function selecionarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivo(file);
    setPreview(URL.createObjectURL(file));
    setFormOpen(true);
    setErro(null);
  }

  function cancelar() {
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(null);
    setPreview(null);
    setLegenda('');
    setRefeicao('Almoço');
    setFormOpen(false);
    setErro(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione uma foto.');
    setBusy(true);
    const tokenPush = iniciarTokenPush();

    // Comprime antes de subir: foto de celular de ~4MB vira ~200-500KB.
    // Mesma configuração dos chats (1600px no maior lado, JPEG 0.8).
    const blob = await comprimirImagem(arquivo);

    // A compressão sai sempre em JPEG, mas o fallback devolve o arquivo
    // original — que num iPhone pode ser HEIC. Por isso o tipo vem do que
    // será enviado de fato, e não fixo em image/jpeg: gravar bytes HEIC
    // sob a extensão .jpg quebraria a exibição depois.
    const tipo = blob.type || 'image/jpeg';
    const ext = tipo === 'image/jpeg'
      ? 'jpg'
      : (tipo.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
    const path = `${pacienteId}/${Date.now()}-${refeicao.toLowerCase().replace(/[^a-z]/g, '')}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos_pratos').upload(path, blob, { contentType: tipo });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }

    const { error: insErr } = await supabase.from('feed_pratos').insert({
      paciente_id: pacienteId,
      storage_path: path,
      refeicao,
      legenda: legenda.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('fotos_pratos').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    // [diag] TEMPORÁRIO — remover depois (voltar para a chamada sem .then)
    avisarNutri(tokenPush, 'foto_prato').then(msg => setDiag(msg));
    cancelar();
    carregar({ cancelled: false });
  }

  async function responder(post) {
    const texto = (respostas[post.id] ?? '').trim();
    if (!texto) return;
    setEnviandoResp(s => ({ ...s, [post.id]: true }));
    const tokenPush = iniciarTokenPush();
    const { error } = await supabase.from('feed_pratos_comentarios').insert({
      prato_id: post.id,
      paciente_id: pacienteId,
      autor: 'paciente',
      texto,
    });
    setEnviandoResp(s => ({ ...s, [post.id]: false }));
    if (error) return setErro('Erro ao enviar resposta: ' + error.message);
    setRespostas(r => { const n = { ...r }; delete n[post.id]; return n; });
    avisarNutri(tokenPush, 'resposta_prato');
    carregar({ cancelled: false });
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*"
        onChange={selecionarFoto} style={{ display: 'none' }} />

      {/* [diag] TEMPORÁRIO — remover depois. Fica FORA do bloco {formOpen && …}
          de propósito: o cancelar() fecha o formulário antes de a resposta do
          push chegar, e a caixa de erro de lá já teria sumido. */}
      {diag && (
        <div onClick={() => setDiag(null)} style={{
          position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 9999,
          background: '#1c1712', color: '#fff', fontSize: 11,
          fontFamily: 'monospace', padding: '10px 12px', borderRadius: 10,
          wordBreak: 'break-all', lineHeight: 1.5, cursor: 'pointer',
        }}>
          {diag} <span style={{ opacity: .6 }}>· toque para fechar</span>
        </div>
      )}

      {/* CTA topo — só quando form fechado */}
      {!formOpen && (
        <div style={{
          margin: '0 0 12px',
          border: '1.5px dashed var(--gold)',
          borderRadius: 14,
          padding: '18px 16px',
          background: 'var(--bg-soft)',
          textAlign: 'center',
        }}>
          <i className="ti ti-camera-plus" style={{ fontSize: 28, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '6px 0 4px' }}>Adicionar foto do prato</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            Compartilhe sua refeição — a Dra. comenta em breve
          </div>
          <button className="btn primary sm" onClick={() => fileInputRef.current?.click()}>
            <i className="ti ti-camera" style={{ fontSize: 14 }} aria-hidden="true"></i> Tirar/escolher foto
          </button>
        </div>
      )}

      {/* Form de novo post (após escolher foto) */}
      {formOpen && (
        <div className="card" style={{ padding: 14 }}>
          {preview && (
            <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-deep)' }}>
              <img src={preview} alt="prévia"
                loading="lazy" decoding="async"
                style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          <label style={{ fontSize: 10, letterSpacing: '.04em', color: 'var(--ink-soft)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Refeição
          </label>
          <select value={refeicao} onChange={e => setRefeicao(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13,
              background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
              borderRadius: 10, outline: 'none', marginBottom: 10,
              fontFamily: 'var(--font-sans)',
            }}>
            {REFEICOES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label style={{ fontSize: 10, letterSpacing: '.04em', color: 'var(--ink-soft)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Legenda (opcional)
          </label>
          <textarea rows={3} value={legenda} onChange={e => setLegenda(e.target.value)}
            placeholder="Ex: arroz integral, feijão, frango grelhado, salada"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13,
              background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
              borderRadius: 10, outline: 'none', resize: 'vertical',
              fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
            }} />

          {erro && (
            <div style={{
              fontSize: 11, color: 'var(--red)', background: 'var(--red-soft)',
              padding: '6px 10px', borderRadius: 8, marginTop: 8,
            }}>{erro}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={cancelar} disabled={busy}
              style={{ flex: 1 }}>Cancelar</button>
            <button className="btn primary" onClick={enviar} disabled={busy}
              style={{ flex: 1 }}>
              {busy ? 'Enviando...' : 'Enviar prato'}
            </button>
          </div>
        </div>
      )}

      {posts === undefined ? (
        <div className="empty-state"><div className="empty-sub">Carregando…</div></div>
      ) : posts.length === 0 && !formOpen ? (
        <div className="empty-state">
          <div className="empty-sub">
            Suas fotos de pratos aparecerão aqui. A nutricionista verá e dará feedback.
          </div>
        </div>
      ) : (
        <>
        {naTela.map(p => (
          <div key={p.id} className="feed-card">
            <div className="feed-head">
              <div className="feed-avatar">{iniciais(profile?.nome)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{profile?.nome ?? 'Você'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {p.refeicao ?? 'Refeição'} · {dataBR(p.created_at)}
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--bg-deep)', height: 240 }}>
              {urls[p.id] ? (
                <img src={urls[p.id]} alt={p.legenda ?? 'prato'}
                  loading="lazy" decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--muted-2)' }} aria-hidden="true"></i>
                </div>
              )}
            </div>
            {p.legenda && <div className="feed-caption">{p.legenda}</div>}

            {[...(p.comentarios ?? [])]
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map(c => (
                <div key={c.id} className="feed-comment"
                  style={c.autor === 'paciente'
                    ? { borderLeftColor: 'var(--muted)', background: 'var(--bg-deep)' }
                    : undefined}>
                  <span className="who" style={c.autor === 'paciente' ? { color: 'var(--muted)' } : undefined}>
                    {c.autor === 'nutri' ? nutriNome : 'Você'}
                  </span>
                  {c.texto}
                </div>
              ))}

            <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
              <input
                value={respostas[p.id] ?? ''}
                onChange={e => setRespostas(r => ({ ...r, [p.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') responder(p); }}
                placeholder="Responder a nutri…"
                style={{
                  flex: 1, padding: '8px 10px', fontSize: 12,
                  background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
                  borderRadius: 10, outline: 'none', fontFamily: 'var(--font-sans)',
                }} />
              <button className="btn primary sm"
                onClick={() => responder(p)}
                disabled={enviandoResp[p.id] || !(respostas[p.id] ?? '').trim()}>
                {enviandoResp[p.id] ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        ))}
        {(posts?.length ?? 0) > visiveis && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
            <button className="btn ghost sm" onClick={() => setVisiveis(v => v + PAGINA)}>
              Ver fotos anteriores ({(posts?.length ?? 0) - visiveis})
            </button>
          </div>
        )}
        </>
      )}
    </>
  );
}
