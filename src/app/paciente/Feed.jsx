import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { iniciais, dataBR } from '../../lib/utils.js';

const REFEICOES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Outro'];

// Cache de signed URLs (vale por 5 min)
const urlCache = new Map();

async function getSignedUrl(path) {
  const cached = urlCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from('fotos_pratos').createSignedUrl(path, 300);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 280_000 });
  return data.signedUrl;
}

export default function FeedPaciente() {
  const tema = useTheme();
  const nutriNome = tema.nutri_nome ?? 'Sua nutri';
  const { user, profile } = useSession();
  const [posts, setPosts] = useState(undefined);
  const [urls, setUrls] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [refeicao, setRefeicao] = useState('Almoço');
  const [legenda, setLegenda] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const fileInputRef = useRef(null);

  async function carregar(signal) {
    if (!user) return;
    const { data } = await supabase
      .from('feed_pratos')
      .select('id, refeicao, legenda, storage_path, comentario_nutri, created_at')
      .eq('paciente_id', user.id)
      .order('created_at', { ascending: false });
    if (signal.cancelled) return;
    setPosts(data ?? []);

    // Pre-fetch signed URLs
    const novasUrls = {};
    for (const p of data ?? []) {
      if (signal.cancelled) return;
      const url = await getSignedUrl(p.storage_path);
      if (url) novasUrls[p.id] = url;
    }
    if (!signal.cancelled) setUrls(novasUrls);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

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

    const ext = arquivo.name.split('.').pop() || 'jpg';
    const path = `${user.id}/${Date.now()}-${refeicao.toLowerCase().replace(/[^a-z]/g, '')}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos_pratos').upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }

    const { error: insErr } = await supabase.from('feed_pratos').insert({
      paciente_id: user.id,
      storage_path: path,
      refeicao,
      legenda: legenda.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('fotos_pratos').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    cancelar();
    carregar();
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={selecionarFoto} style={{ display: 'none' }} />

      {/* CTA topo — só quando form fechado */}
      {!formOpen && (
        <div style={{
          margin: '0 16px 12px',
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
        posts.map(p => (
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
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--muted-2)' }} aria-hidden="true"></i>
                </div>
              )}
            </div>
            {p.legenda && <div className="feed-caption">{p.legenda}</div>}
            {p.comentario_nutri && (
              <div className="feed-comment">
                <span className="who">{nutriNome}</span>
                {p.comentario_nutri}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
