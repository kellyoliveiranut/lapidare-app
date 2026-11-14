import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.jsx';
import { avisarStatus } from '../lib/realtime.js';

/**
 * Chat interno e privado entre a nutri e a secretária (tabela chat_equipe).
 * Botão flutuante: "Falar com a secretaria" para a Dra., "Falar com a Dra."
 * para a secretária. As pacientes não têm acesso (RLS).
 */
export default function ChatEquipe() {
  const { user, profile, secretaria } = useSession();
  const souSecretaria = !!secretaria;
  const nutriId = user?.id;
  const eu = souSecretaria ? 'secretaria' : 'nutri';
  const outro = souSecretaria ? 'a Dra.' : 'a secretaria';

  const [existe, setExiste] = useState(souSecretaria); // a Dra. só vê se há secretária ativa
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);

  // A Dra. só mostra o botão depois que a secretária aceitou o convite.
  useEffect(() => {
    if (souSecretaria || !nutriId) return;
    let vivo = true;
    supabase.from('secretarias').select('id').eq('nutri_id', nutriId).eq('ativo', true)
      .not('user_id', 'is', null).limit(1).maybeSingle()
      .then(({ data }) => { if (vivo) setExiste(!!data); });
    return () => { vivo = false; };
  }, [souSecretaria, nutriId]);

  async function carregar() {
    const { data, error } = await supabase.from('chat_equipe')
      .select('id, de, texto, lida, criado_em').eq('nutri_id', nutriId)
      .order('criado_em', { ascending: true }).limit(200);
    if (!error) setMsgs(data ?? []);
  }

  useEffect(() => {
    if (!existe || !nutriId) return;
    carregar();
    const canal = supabase.channel(`chat-equipe-${nutriId}-${eu}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_equipe', filter: `nutri_id=eq.${nutriId}`,
      }, carregar)
      .subscribe(avisarStatus('chat-equipe'));
    return () => { supabase.removeChannel(canal); };
  }, [existe, nutriId]); // eslint-disable-line react-hooks/exhaustive-deps

  const naoLidas = msgs.filter(m => m.de !== eu && !m.lida).length;

  useEffect(() => {
    if (!aberto) return;
    fimRef.current?.scrollIntoView({ block: 'end' });
    if (naoLidas > 0) {
      supabase.from('chat_equipe').update({ lida: true })
        .eq('nutri_id', nutriId).neq('de', eu).eq('lida', false)
        .then(({ error }) => { if (error) console.warn(error.message); });
    }
  }, [aberto, msgs.length, naoLidas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true); setErro('');
    const { error } = await supabase.from('chat_equipe').insert({ nutri_id: nutriId, de: eu, texto: t });
    setEnviando(false);
    if (error) { setErro('Não consegui enviar. Tente de novo.'); return; }
    setTexto('');
    carregar();
  }

  if (!existe || !nutriId) return null;

  const hora = iso => new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)}
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 70, display: 'inline-flex',
            alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 999, border: 'none',
            background: 'var(--ink, #3a2a1a)', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.25)', fontFamily: 'var(--font-sans)',
          }}>
          <i className="ti ti-message-circle" aria-hidden="true" style={{ fontSize: 18 }} />
          Falar com {outro}
          {naoLidas > 0 && (
            <span style={{
              background: '#d94c4c', color: '#fff', borderRadius: 999, minWidth: 20, height: 20,
              fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
            }}>{naoLidas}</span>
          )}
        </button>
      )}

      {aberto && (
        <div role="dialog" aria-label={`Conversa com ${outro}`}
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 85, width: 'min(360px, calc(100vw - 24px))',
            height: 'min(480px, calc(100dvh - 36px))', display: 'flex', flexDirection: 'column',
            background: 'var(--white, #fff)', border: '1px solid var(--border)', borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,.28)', overflow: 'hidden', fontFamily: 'var(--font-sans)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', background: 'var(--ink, #3a2a1a)', color: '#fff' }}>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
              {souSecretaria ? `Conversa com ${profile?.nome?.split(' ')[0] ? 'a Dra. ' + profile.nome.split(' ')[0] : 'a Dra.'}` : 'Conversa com a secretaria'}
              <div style={{ fontWeight: 400, fontSize: 11, opacity: .75 }}>Privado — as pacientes não veem</div>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg, #faf8f5)' }}>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
                Nenhuma mensagem ainda. Escreva abaixo.
              </div>
            )}
            {msgs.map(m => {
              const minha = m.de === eu;
              return (
                <div key={m.id} style={{
                  alignSelf: minha ? 'flex-end' : 'flex-start', maxWidth: '85%',
                  background: minha ? 'var(--ink, #3a2a1a)' : 'var(--white, #fff)',
                  color: minha ? '#fff' : 'var(--dark)', border: minha ? 'none' : '1px solid var(--border)',
                  borderRadius: 12, padding: '8px 11px', fontSize: 14, lineHeight: 1.4,
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}>
                  {m.texto}
                  <div style={{ fontSize: 10, opacity: .6, marginTop: 3, textAlign: 'right' }}>{hora(m.criado_em)}</div>
                </div>
              );
            })}
            <div ref={fimRef} />
          </div>

          {erro && <div role="alert" style={{ fontSize: 12, color: 'var(--red, #d94c4c)', padding: '4px 12px' }}>{erro}</div>}
          <form onSubmit={enviar} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border)' }}>
            <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000}
              placeholder="Escreva uma mensagem…" aria-label="Mensagem"
              style={{ flex: 1, margin: 0, fontSize: 16 }} />
            <button className="btn" type="submit" disabled={enviando || !texto.trim()}>Enviar</button>
          </form>
        </div>
      )}
    </>
  );
}
