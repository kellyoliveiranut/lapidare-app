import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais, dataLocalISO } from '../../lib/utils.js';
import { comprimirImagem, getAnexoUrl } from '../../lib/imagem.js';

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

/**
 * Ordem da lista de conversas: atividade primeiro, alfabética no rabo.
 * Quem nunca mandou mensagem vai para o fim — e entre si fica em ordem de
 * nome, que é a ordem que a tela sempre teve.
 */
function porAtividade(a, b) {
  const ta = a.ultima?.created_at;
  const tb = b.ultima?.created_at;
  if (ta && tb) return new Date(tb) - new Date(ta);  // as duas: mais recente no topo
  if (ta) return -1;                                  // só `a` tem mensagem: sobe
  if (tb) return 1;                                   // só `b` tem: sobe
  // localeCompare com a locale, não comparação crua: sem isso "Ângela" cairia
  // depois de "Zuleica", porque Â está fora da faixa A–Z da tabela de caracteres.
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

export default function ChatNutri() {
  const { user } = useSession();
  const [lista, setLista] = useState(undefined);  // [{id, nome, email, ultima, naoLidas}]
  const [selecionada, setSelecionada] = useState(null);
  const recarregarRef = useRef(null);

  // Duas requisições em paralelo e UM setState: a lista nasce ordenada, então
  // não existe momento em que a chave de ordenação esteja ausente da tela.
  async function carregar() {
    if (!user) return;
    const [{ data: pacs }, { data: pend }] = await Promise.all([
      supabase
        .from('pacientes')
        .select('id, nome, email, mensagens(created_at, texto, imagem_path, de)')
        .eq('nutri_id', user.id)
        .eq('status_paciente', 'ativo')
        .eq('tipo_plano', 'essentia')
        // Sem !inner de propósito: filtro em recurso embutido poda só as
        // mensagens, nunca a paciente. Quem nunca escreveu tem que continuar
        // na lista — é ela que vai para o fim, não para fora.
        .eq('mensagens.nutri_id', user.id)
        .order('nome')
        .order('created_at', { referencedTable: 'mensagens', ascending: false })
        .limit(1, { referencedTable: 'mensagens' }),
      supabase
        .from('mensagens')
        .select('paciente_id')
        .eq('nutri_id', user.id)
        .eq('de', 'paciente')
        .eq('lida', false),
    ]);

    const naoLidas = {};
    for (const m of pend ?? []) naoLidas[m.paciente_id] = (naoLidas[m.paciente_id] ?? 0) + 1;

    setLista(
      (pacs ?? [])
        .map(p => ({
          id: p.id, nome: p.nome, email: p.email,
          ultima: p.mensagens?.[0] ?? null,
          naoLidas: naoLidas[p.id] ?? 0,
        }))
        .sort(porAtividade)
    );
  }

  useEffect(() => { carregar(); }, [user]);

  // Subscribe global: qualquer INSERT em mensagens das pacientes da nutri.
  // Recarga com debounce: uma troca rápida de mensagens dispara vários INSERT
  // seguidos, e sem isso a lista se reordenaria a cada um.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-nutri-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens',
        filter: `nutri_id=eq.${user.id}`,
      }, () => {
        clearTimeout(recarregarRef.current);
        recarregarRef.current = setTimeout(carregar, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(recarregarRef.current);
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (lista === undefined) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Carregando…</div>
      </>
    );
  }

  if (lista.length === 0) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Mensagens com todas as pacientes</div>
        <div className="card empty-card">
          <i className="ti ti-message-circle empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma conversa disponível</div>
          <div className="empty-sub">
            O chat é do plano Essentia e mostra apenas pacientes ativas. Quem está
            em consulta avulsa, ou com o atendimento finalizado, não aparece aqui.
          </div>
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
          {lista.map(c => {
            const ativo = selecionada?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelecionada(c)}
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
                }}>{iniciais(c.nome)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.nome}
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
                        ? (c.ultima.de === 'nutri' ? 'Você: ' : '') + (c.ultima.texto || (c.ultima.imagem_path ? '📷 Foto' : ''))
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
