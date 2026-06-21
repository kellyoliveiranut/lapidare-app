import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais } from '../../lib/utils.js';

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, hoje)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, ontem)) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function ChatNutri() {
  const { user } = useSession();
  const [pacientes, setPacientes] = useState(undefined);
  const [conversas, setConversas] = useState({});  // { pacienteId: {ultima, naoLidas} }
  const [selecionada, setSelecionada] = useState(null);

  // Carga inicial: pacientes + última mensagem + contagem não-lidas
  async function carregar() {
    if (!user) return;
    const { data: pacs } = await supabase
      .from('pacientes')
      .select('id, nome, email')
      .eq('nutri_id', user.id)
      .order('nome');

    const dadosPacientes = pacs ?? [];
    setPacientes(dadosPacientes);

    if (dadosPacientes.length === 0) return;

    // Para cada paciente: última mensagem + count não-lidas (de='paciente')
    const novasConversas = {};
    await Promise.all(dadosPacientes.map(async p => {
      const [ultRes, naoLidasRes] = await Promise.all([
        supabase.from('mensagens')
          .select('texto, created_at, de')
          .eq('paciente_id', p.id).eq('nutri_id', user.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('paciente_id', p.id).eq('nutri_id', user.id)
          .eq('de', 'paciente').eq('lida', false),
      ]);
      novasConversas[p.id] = {
        ultima: ultRes.data,
        naoLidas: naoLidasRes.count ?? 0,
      };
    }));
    setConversas(novasConversas);
  }

  useEffect(() => { carregar(); }, [user]);

  // Subscribe global: qualquer INSERT em mensagens das pacientes da nutri
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-nutri-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens',
        filter: `nutri_id=eq.${user.id}`,
      }, () => {
        carregar();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (pacientes === undefined) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Carregando…</div>
      </>
    );
  }

  if (pacientes.length === 0) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Mensagens com todas as pacientes</div>
        <div className="card empty-card">
          <i className="ti ti-message-circle empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma paciente cadastrada</div>
          <div className="empty-sub">Cadastre uma paciente para começar a conversar.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-title">Chat</div>
      <div className="page-sub">Conversas com suas pacientes em tempo real</div>

      <div className="chat-layout">
        {/* Lista de conversas */}
        <div className="card" style={{ padding: 0, overflowY: 'auto' }}>
          {pacientes.map(p => {
            const c = conversas[p.id] ?? {};
            const ativo = selecionada?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelecionada(p)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', width: '100%', textAlign: 'left',
                  background: ativo ? '#f5f0e8' : 'transparent',
                  border: 'none', borderBottom: '0.5px solid #f5f0e8',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  borderLeft: ativo ? '2px solid var(--amber)' : '2px solid transparent',
                  transition: 'background .15s',
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--bg2)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: 'var(--dark)', flexShrink: 0,
                }}>{iniciais(p.nome)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nome}
                    </span>
                    {c.ultima && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                        {fmtDataCurta(c.ultima.created_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontSize: 12, color: 'var(--text3)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      flex: 1,
                    }}>
                      {c.ultima
                        ? (c.ultima.de === 'nutri' ? 'Você: ' : '') + c.ultima.texto
                        : 'Sem mensagens ainda'}
                    </span>
                    {c.naoLidas > 0 && (
                      <span style={{
                        background: 'var(--amber)', color: 'var(--dark)',
                        fontSize: 11, fontWeight: 600,
                        padding: '1px 6px', borderRadius: 20, flexShrink: 0, minWidth: 16, textAlign: 'center',
                      }}>{c.naoLidas}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Painel da conversa */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selecionada ? (
            <ConversaPanel paciente={selecionada} nutriId={user.id} onAfterAction={carregar} />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24, textAlign: 'center',
            }}>
              <div>
                <i className="ti ti-messages" style={{ fontSize: 36, color: 'var(--border)' }} aria-hidden="true"></i>
                <div style={{ fontSize: 15, color: 'var(--text3)', marginTop: 10 }}>
                  Selecione uma conversa na lista ao lado
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ConversaPanel({ paciente, nutriId, onAfterAction }) {
  const [msgs, setMsgs] = useState(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  async function carregar(marcarLidas) {
    const { data } = await supabase
      .from('mensagens')
      .select('id, de, texto, created_at, lida')
      .eq('paciente_id', paciente.id).eq('nutri_id', nutriId)
      .order('created_at', { ascending: true });
    setMsgs(data ?? []);

    if (marcarLidas) {
      const naoLidas = (data ?? []).filter(m => m.de === 'paciente' && !m.lida).map(m => m.id);
      if (naoLidas.length > 0) {
        await supabase.from('mensagens').update({ lida: true }).in('id', naoLidas);
        onAfterAction?.();  // atualiza badges na lista
      }
    }
  }

  useEffect(() => { carregar(true); }, [paciente.id]);

  // Subscribe específica desta conversa
  useEffect(() => {
    const channel = supabase
      .channel(`chat-conv-${paciente.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens',
        filter: `paciente_id=eq.${paciente.id}`,
      }, async (payload) => {
        const m = payload.new;
        if (m.nutri_id !== nutriId) return;
        setMsgs(curr => {
          if (!curr) return [m];
          if (curr.some(x => x.id === m.id)) return curr;
          return [...curr, m];
        });
        if (m.de === 'paciente') {
          await supabase.from('mensagens').update({ lida: true }).eq('id', m.id);
          onAfterAction?.();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [paciente.id, nutriId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  async function enviar() {
    if (!text.trim()) return;
    const conteudo = text.trim();
    setText('');
    setBusy(true);
    const { error } = await supabase.from('mensagens').insert({
      paciente_id: paciente.id,
      nutri_id: nutriId,
      de: 'nutri',
      texto: conteudo,
    });
    setBusy(false);
    if (error) {
      alert('Erro: ' + error.message);
      setText(conteudo);
      return;
    }
    onAfterAction?.();
    // Notifica a paciente via push (fire-and-forget)
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'notify_paciente', paciente_id: paciente.id, kind: 'mensagem' }),
      }).catch(() => {});
    });
  }

  return (
    <>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '0.5px solid #f5f0e8',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--amber)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, color: 'var(--dark)',
        }}>{iniciais(paciente.nome)}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{paciente.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{paciente.email}</div>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 0,
        background: 'var(--bg)',
        minHeight: 0,
      }}>
        {msgs === undefined ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: 'var(--text3)' }}>Carregando…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: 'var(--text3)' }}>
            Nenhuma mensagem ainda. Envie a primeira.
          </div>
        ) : (
          msgs.map(m => {
            const minha = m.de === 'nutri';
            return (
              <div key={m.id} style={{
                alignSelf: minha ? 'flex-end' : 'flex-start',
                background: minha ? 'var(--dark)' : 'var(--white)',
                color: minha ? 'var(--white)' : 'var(--dark)',
                border: minha ? 'none' : '0.5px solid var(--border)',
                padding: '8px 12px',
                borderRadius: 14,
                borderBottomRightRadius: minha ? 3 : 14,
                borderBottomLeftRadius: minha ? 14 : 3,
                marginBottom: 6,
                maxWidth: '75%', fontSize: 14, lineHeight: 1.4,
                wordWrap: 'break-word',
              }}>
                {m.texto}
                <div style={{ fontSize: 11, opacity: .55, marginTop: 3, textAlign: 'right' }}>
                  {fmtHora(m.created_at)}
                  {minha && m.lida && ' ✓✓'}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 16px',
        borderTop: '0.5px solid #f5f0e8',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
        background: 'var(--white)',
      }}>
        <input
          placeholder="Mensagem..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={busy}
          style={{ flex: 1, margin: 0 }}
        />
        <button className="btn" onClick={enviar} disabled={!text.trim() || busy}
          style={{ padding: '8px 14px' }}>
          <i className="ti ti-send" aria-hidden="true"></i>
        </button>
      </div>
    </>
  );
}
