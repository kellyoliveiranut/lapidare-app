import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { iniciais, dataLocalISO } from '../../lib/utils.js';
import { comprimirImagem, getAnexoUrl } from '../../lib/imagem.js';

// Uma conversa: histórico, envio, anexo e realtime de UMA paciente.
//
// Não sabe que existe lista, rota ou sessão — recebe `nutriId` pronto e do
// `paciente` usa só id, nome e email. Também não tem opinião sobre o próprio
// tamanho: devolve um fragmento, e quem monta é que dá a caixa
// (display:flex; flexDirection:column; minHeight:0). É o que permite o mesmo
// componente servir a coluna do Chat e, depois, um painel flutuante.

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const MESES_MINUSCULO = [
  'janeiro', 'fevereiro', 'marÃ§o', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Chave "YYYY-MM-DD" do dia LOCAL de um timestamp â€” mesma base do fmtHora,
 * pra separador e hora nunca discordarem na mesma tela.
 */
function diaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ESTILO_SEPARADOR = {
  alignSelf: 'center', fontSize: 10, color: 'var(--text3)',
  marginBottom: 8, letterSpacing: '.03em',
};

/** "Hoje" / "Ontem" / "12 de julho" (mesmo ano) / "12/07/2025" (ano anterior) */
function rotuloDia(dia) {
  if (!dia) return '';
  if (dia === dataLocalISO(0)) return 'Hoje';
  if (dia === dataLocalISO(-1)) return 'Ontem';
  const [ano, mes, d] = dia.split('-');
  if (Number(ano) === new Date().getFullYear()) {
    return `${Number(d)} de ${MESES_MINUSCULO[Number(mes) - 1]}`;
  }
  return `${d}/${mes}/${ano}`;
}

export default function ConversaPanel({ paciente, nutriId, onAfterAction }) {
  const [msgs, setMsgs] = useState(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [anexo, setAnexo] = useState(null);
  const [anexoPreview, setAnexoPreview] = useState(null);
  const [urls, setUrls] = useState({});   // { imagem_path: signedUrl }
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  async function carregar(marcarLidas) {
    const { data } = await supabase
      .from('mensagens')
      .select('id, de, texto, imagem_path, created_at, lida')
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
    if (!conteudo && !anexo) return;
    setBusy(true);

    let imagem_path = null;
    if (anexo) {
      const blob = await comprimirImagem(anexo);
      const path = `${paciente.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('chat_anexos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) { setBusy(false); alert('Erro ao enviar a foto: ' + upErr.message); return; }
      imagem_path = path;
    }

    const { error } = await supabase.from('mensagens').insert({
      paciente_id: paciente.id,
      nutri_id: nutriId,
      de: 'nutri',
      texto: conteudo || null,
      imagem_path,
    });
    setBusy(false);
    if (error) {
      if (imagem_path) await supabase.storage.from('chat_anexos').remove([imagem_path]);
      alert('Erro: ' + error.message);
      return;
    }

    setText('');
    limparAnexo();
    onAfterAction?.();
    // Notifica a paciente via push (fire-and-forget)
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'notify_paciente', paciente_id: paciente.id, kind: imagem_path ? 'mensagem_foto' : 'mensagem' }),
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
          msgs.map((m, i) => {
            const minha = m.de === 'nutri';
            const dia = diaLocal(m.created_at);
            const novoDia = i === 0 || dia !== diaLocal(msgs[i - 1].created_at);
            return (
              <Fragment key={m.id}>
                {novoDia && (
                  <div style={{ ...ESTILO_SEPARADOR, marginTop: i === 0 ? 2 : 12 }}>{rotuloDia(dia)}</div>
                )}
                <div style={{
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
                  <div style={{ fontSize: 11, opacity: .55, marginTop: 3, textAlign: 'right' }}>
                    {fmtHora(m.created_at)}
                    {minha && m.lida && ' ✓✓'}
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      {/* Preview do anexo escolhido */}
      {anexoPreview && (
        <div style={{
          padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0, background: 'var(--white)',
        }}>
          <img src={anexoPreview} alt="prévia" loading="lazy" decoding="async"
            style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>Foto pronta pra enviar</span>
          <button onClick={limparAnexo} aria-label="Remover foto"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      )}

      {/* Input */}
      <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={selecionarAnexo} />
      <div style={{
        padding: '10px 16px',
        borderTop: '0.5px solid #f5f0e8',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
        background: 'var(--white)',
      }}>
        <button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Anexar foto"
          style={{
            background: 'none', border: '0.5px solid var(--border)', borderRadius: 8,
            padding: '7px 11px', cursor: 'pointer', color: 'var(--text3)',
          }}>
          <i className="ti ti-camera" aria-hidden="true"></i>
        </button>
        <input
          placeholder="Mensagem..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={busy}
          style={{ flex: 1, margin: 0 }}
        />
        <button className="btn" onClick={enviar} disabled={busy || (!text.trim() && !anexo)}
          style={{ padding: '8px 14px' }}>
          <i className="ti ti-send" aria-hidden="true"></i>
        </button>
      </div>
    </>
  );
}
