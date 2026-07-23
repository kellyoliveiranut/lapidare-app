import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { iniciais } from '../../lib/utils.js';
import { comprimirImagem, getAnexoUrl } from '../../lib/imagem.js';

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPaciente() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const tema = useTheme();
  const nutriNome = tema.nutri_nome ?? 'Sua nutri';
  const [msgs, setMsgs] = useState(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [anexo, setAnexo] = useState(null);
  const [anexoPreview, setAnexoPreview] = useState(null);
  const [urls, setUrls] = useState({});   // { imagem_path: signedUrl }
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // Carga inicial + marca como lidas as mensagens da nutri
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function carregar() {
      const { data } = await supabase
        .from('mensagens')
        .select('id, de, texto, imagem_path, created_at, lida')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: true });
      if (!active) return;
      setMsgs(data ?? []);

      // marca como lidas todas as mensagens da nutri ainda não lidas
      const naoLidas = (data ?? []).filter(m => m.de === 'nutri' && !m.lida).map(m => m.id);
      if (naoLidas.length > 0) {
        await supabase.from('mensagens').update({ lida: true }).in('id', naoLidas);
      }
    }

    carregar();
    return () => { active = false; };
  }, [user]);

  // Subscribe em tempo real
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-paciente-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `paciente_id=eq.${pacienteId}`,
      }, async (payload) => {
        const m = payload.new;
        setMsgs(curr => {
          if (!curr) return [m];
          if (curr.some(x => x.id === m.id)) return curr;
          return [...curr, m];
        });
        // Se for da nutri, marca como lida imediatamente (paciente está vendo)
        if (m.de === 'nutri') {
          await supabase.from('mensagens').update({ lida: true }).eq('id', m.id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Auto-scroll para o fim
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  // Busca signed URLs das mensagens com imagem (inclusive as que chegam via realtime)
  useEffect(() => {
    if (!msgs) return;
    let active = true;
    (async () => {
      const faltando = msgs.filter(m => m.imagem_path && !urls[m.imagem_path]);
      if (faltando.length === 0) return;
      const novas = {};
      for (const m of faltando) {
        const u = await getAnexoUrl(m.imagem_path);
        if (u) novas[m.imagem_path] = u;
      }
      if (active && Object.keys(novas).length) setUrls(prev => ({ ...prev, ...novas }));
    })();
    return () => { active = false; };
  }, [msgs]);

  function selecionarAnexo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
    if (f.size > 20 * 1024 * 1024) { alert('Imagem muito grande (máximo 20MB).'); return; }
    setAnexo(f);
    setAnexoPreview(URL.createObjectURL(f));
  }

  function limparAnexo() {
    if (anexoPreview) URL.revokeObjectURL(anexoPreview);
    setAnexo(null);
    setAnexoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function enviar() {
    const conteudo = text.trim();
    if ((!conteudo && !anexo) || !user || !profile?.nutri_id) return;
    setBusy(true);

    let imagem_path = null;
    if (anexo) {
      const blob = await comprimirImagem(anexo);
      const path = `${pacienteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('chat_anexos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) { setBusy(false); alert('Erro ao enviar a foto: ' + upErr.message); return; }
      imagem_path = path;
    }

    const { error } = await supabase.from('mensagens').insert({
      paciente_id: pacienteId,
      nutri_id: profile.nutri_id,
      de: 'paciente',
      texto: conteudo || null,
      imagem_path,
    });
    setBusy(false);
    if (error) {
      if (imagem_path) await supabase.storage.from('chat_anexos').remove([imagem_path]);
      alert('Erro ao enviar: ' + error.message);
      return;
    }

    setText('');
    limparAnexo();
    // Notifica a nutri via push (fire-and-forget — nunca bloqueia a UI)
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(imagem_path ? { mode: 'notify_nutri', kind: 'mensagem_foto' } : { mode: 'notify_nutri' }),
      }).catch(() => {});
    });
    // a UI atualiza via realtime — não precisa recarregar
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 76px)' }}>
      {/* Banner da Dra. */}
      <div className="card cream" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px', padding: '10px 14px' }}>
        {tema.nutri_foto_url ? (
          <img src={tema.nutri_foto_url} alt={nutriNome}
            loading="lazy" decoding="async"
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--gold)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: 'var(--ink)'
          }}>{iniciais(nutriNome)}</div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{nutriNome}</div>
          <div style={{ fontSize: 10, color: 'var(--green)' }}>● Disponível por mensagem</div>
        </div>
      </div>

      {/* Aviso fixo */}
      <div style={{
        fontSize: 10.5, color: 'var(--muted)', textAlign: 'center',
        padding: '0 10px 8px', lineHeight: 1.4,
      }}>
        Este espaço é para o acompanhamento nutricional. Em caso de urgência, procure sua equipe médica.
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        padding: '4px 16px 8px', gap: 0
      }}>
        {msgs === undefined ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 12 }}>
            Carregando…
          </div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 12 }}>
            Envie uma mensagem para {nutriNome}
          </div>
        ) : (
          msgs.map(m => (
            <div key={m.id} className={`bubble ${m.de === 'paciente' ? 'me' : 'dr'}`}>
              {m.imagem_path && (
                urls[m.imagem_path] ? (
                  <img src={urls[m.imagem_path]} alt="Foto"
                    loading="lazy" decoding="async"
                    onClick={() => window.open(urls[m.imagem_path], '_blank', 'noopener')}
                    style={{
                      maxWidth: '100%', borderRadius: 8, display: 'block',
                      marginBottom: m.texto ? 6 : 0, cursor: 'pointer',
                    }} />
                ) : (
                  <div style={{
                    width: 180, height: 140, borderRadius: 8,
                    background: 'rgba(0,0,0,.06)', marginBottom: m.texto ? 6 : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className="ti ti-photo" style={{ fontSize: 24, opacity: .5 }} aria-hidden="true"></i>
                  </div>
                )
              )}
              {m.texto}
              <div className="ts">{fmtHora(m.created_at)}</div>
            </div>
          ))
        )}
      </div>

      {/* Preview do anexo escolhido */}
      {anexoPreview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px' }}>
          <img src={anexoPreview} alt="prévia" loading="lazy" decoding="async"
            style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>Foto pronta pra enviar</span>
          <button onClick={limparAnexo} aria-label="Remover foto"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      )}

      {/* Input */}
      <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={selecionarAnexo} />
      <div className="chat-input">
        <button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Anexar foto"
          style={{ background: 'transparent', color: 'var(--muted)' }}>
          <i className="ti ti-camera" style={{ fontSize: 17 }} aria-hidden="true"></i>
        </button>
        <input
          placeholder="Mensagem..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={busy}
        />
        <button disabled={busy || (!text.trim() && !anexo)} onClick={enviar} aria-label="Enviar">
          <i className="ti ti-send" style={{ fontSize: 16 }} aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
