import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { iniciais } from '../../lib/utils.js';

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
  const scrollRef = useRef(null);

  // Carga inicial + marca como lidas as mensagens da nutri
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function carregar() {
      const { data } = await supabase
        .from('mensagens')
        .select('id, de, texto, created_at, lida')
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

  async function enviar() {
    if (!text.trim() || !user || !profile?.nutri_id) return;
    const conteudo = text.trim();
    setText('');
    setBusy(true);
    const { error } = await supabase.from('mensagens').insert({
      paciente_id: pacienteId,
      nutri_id: profile.nutri_id,
      de: 'paciente',
      texto: conteudo,
    });
    setBusy(false);
    if (error) {
      alert('Erro ao enviar: ' + error.message);
      setText(conteudo);
      return;
    }
    // Notifica a nutri via push (fire-and-forget — nunca bloqueia a UI)
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'notify_nutri' }),
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
              {m.texto}
              <div className="ts">{fmtHora(m.created_at)}</div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="chat-input">
        <input
          placeholder="Mensagem..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={busy}
        />
        <button disabled={!text.trim() || busy} onClick={enviar} aria-label="Enviar">
          <i className="ti ti-send" style={{ fontSize: 16 }} aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
