import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';

const SECOES = [
  { id: 'receitas',    emoji: '📖', label: 'Receitas'    },
  { id: 'manipulados', emoji: '💊', label: 'Suplementação' },
  { id: 'formulacoes', emoji: '🧪', label: 'Formulações' },
  { id: 'materiais',   emoji: '📄', label: 'Materiais'   },
];

const TAGS_PROPRIAS = new Set(['receitas', 'manipulados', 'formulacoes', 'materiais']);

function secaoDoItem(tag) {
  if (TAGS_PROPRIAS.has(tag)) return tag;
  return 'materiais'; // guia, protocolo, suplementacao, outro, null → Materiais
}

export default function Biblioteca() {
  const { user } = useSession();
  const [items, setItems] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState({});
  const [secaoAtiva, setSecaoAtiva] = useState('receitas');
  const [busca, setBusca] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [atribuirItem, setAtribuirItem] = useState(null);
  const [editarItem, setEditarItem] = useState(null);

  async function carregar(signal = { cancelled: false }) {
    if (!user) return;
    const [ebRes, pacRes, atRes] = await Promise.all([
      supabase.from('ebooks').select('*').eq('nutri_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pacientes').select('id, nome')
        .eq('nutri_id', user.id).eq('status_paciente', 'ativo').order('nome'),
      supabase.from('ebooks_pacientes').select('ebook_id, paciente_id'),
    ]);
    if (signal.cancelled) return;
    setItems(ebRes.data ?? []);
    setPacientes(pacRes.data ?? []);
    const mapa = {};
    for (const a of atRes.data ?? []) {
      (mapa[a.ebook_id] ??= []).push(a.paciente_id);
    }
    setAtribuicoes(mapa);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

  function abrirItem(it) {
    const { data } = supabase.storage.from('ebooks').getPublicUrl(it.storage_path);
    window.open(data.publicUrl, '_blank', 'noopener');
  }

  async function excluirItem(it) {
    const nPac = atribuicoes[it.id]?.length ?? 0;
    const aviso = nPac > 0
      ? `Excluir "${it.titulo}"? Atribuído a ${nPac} paciente${nPac !== 1 ? 's' : ''} — perderão acesso.`
      : `Excluir "${it.titulo}"?`;
    if (!window.confirm(aviso)) return;
    await supabase.storage.from('ebooks').remove([it.storage_path]);
    await supabase.from('ebooks').delete().eq('id', it.id);
    carregar();
  }

  const secaoAtual = SECOES.find(s => s.id === secaoAtiva);

  const filtrados = useMemo(() => {
    if (!items) return [];
    const q = busca.trim().toLowerCase();
    return items.filter(it => {
      if (secaoDoItem(it.tag) !== secaoAtiva) return false;
      if (!q) return true;
      return (it.titulo ?? '').toLowerCase().includes(q)
        || (it.descricao ?? '').toLowerCase().includes(q);
    });
  }, [items, secaoAtiva, busca]);

  const contagensSecao = useMemo(() => {
    const counts = {};
    for (const s of SECOES) counts[s.id] = 0;
    for (const it of items ?? []) counts[secaoDoItem(it.tag)] = (counts[secaoDoItem(it.tag)] ?? 0) + 1;
    return counts;
  }, [items]);

  function countSecao(sid) { return contagensSecao[sid] ?? 0; }

  return (
    <>
      <div className="page-title">Biblioteca</div>
      <div className="page-sub">Receitas, suplementação, formulações e materiais para compartilhar com suas pacientes</div>

      {/* Tabs de seções */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16,
        overflowX: 'auto', scrollbarWidth: 'thin',
      }}>
        {SECOES.map(s => {
          const n = countSecao(s.id);
          const ativa = secaoAtiva === s.id;
          return (
            <button key={s.id}
              onClick={() => { setSecaoAtiva(s.id); setBusca(''); }}
              style={{
                flex: '0 0 auto', padding: '7px 14px',
                fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer',
                color: ativa ? 'var(--dark)' : 'var(--text3)',
                background: ativa ? 'var(--white)' : 'transparent',
                boxShadow: ativa ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {s.emoji} {s.label}
              {n > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 20,
                  background: ativa ? 'var(--bg2)' : 'transparent',
                  color: 'var(--text3)',
                }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Barra de busca + botão */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 240, margin: 0 }}
          placeholder={`Buscar em ${secaoAtual?.label ?? ''}…`}
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <button className="btn" onClick={() => setUploadOpen(true)}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Novo item
        </button>
      </div>

      {/* Grid de itens */}
      {items === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <div style={{ fontSize: 32, marginBottom: 8 }}>{secaoAtual?.emoji}</div>
          <div className="empty-title">{secaoAtual?.label} vazia</div>
          <div className="empty-sub">
            {busca.trim()
              ? 'Nenhum item encontrado com essa busca.'
              : `Adicione itens de ${secaoAtual?.label.toLowerCase()} para compartilhar com suas pacientes.`}
          </div>
          {!busca.trim() && (
            <button className="btn" onClick={() => setUploadOpen(true)}>
              <i className="ti ti-plus" aria-hidden="true"></i> Adicionar primeiro item
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {filtrados.map(it => {
            const pacs = (atribuicoes[it.id] ?? [])
              .map(pid => pacientes.find(p => p.id === pid))
              .filter(Boolean);
            const mostrar = pacs.slice(0, 3);
            const extra = pacs.length - mostrar.length;

            return (
              <div key={it.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                  {/\.(jpg|jpeg|png)$/i.test(it.storage_path ?? '') ? (
                    <img
                      src={supabase.storage.from('ebooks').getPublicUrl(it.storage_path).data.publicUrl}
                      alt={it.titulo}
                      loading="lazy" decoding="async"
                      style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                      background: 'var(--bg2)', fontSize: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {SECOES.find(s => s.id === secaoDoItem(it.tag))?.emoji}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>{it.titulo}</div>
                    {it.descricao && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.4 }}>
                        {it.descricao}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pacientes com acesso */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
                  {pacs.length === 0 ? (
                    <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-users" aria-hidden="true"></i>
                      Sem acesso atribuído
                    </span>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {mostrar.map((p, i) => (
                          <div key={p.id} title={p.nome} style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--amber)', color: 'var(--dark)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 600,
                            border: '2px solid var(--white)',
                            marginLeft: i > 0 ? -7 : 0,
                            position: 'relative', zIndex: 3 - i,
                          }}>
                            {iniciais(p.nome)}
                          </div>
                        ))}
                        {extra > 0 && (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--bg3)', color: 'var(--text3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 600,
                            border: '2px solid var(--white)', marginLeft: -7,
                          }}>+{extra}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {pacs.length === 1
                          ? pacs[0].nome.split(' ')[0]
                          : `${pacs.length} pacientes`}
                      </span>
                    </>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
                    {dataBR(it.created_at)}
                  </span>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => abrirItem(it)}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setAtribuirItem(it)}>
                    <i className="ti ti-users" aria-hidden="true"></i> Pacientes
                  </button>
                  <button onClick={() => setEditarItem(it)} title="Editar" style={{
                    background: 'none', border: '0.5px solid var(--border)',
                    borderRadius: 6, padding: '4px 8px',
                    color: 'var(--text3)', cursor: 'pointer',
                  }}>
                    <i className="ti ti-pencil" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => excluirItem(it)} title="Excluir" style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 8px',
                    color: 'var(--red)', cursor: 'pointer',
                  }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploadOpen && (
        <ModalUpload
          nutriId={user.id}
          secaoDefault={secaoAtiva}
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); carregar(); }}
        />
      )}

      {atribuirItem && (
        <ModalAtribuir
          item={atribuirItem}
          pacientes={pacientes}
          atribuidos={atribuicoes[atribuirItem.id] ?? []}
          onClose={() => setAtribuirItem(null)}
          onSaved={() => { setAtribuirItem(null); carregar(); }}
        />
      )}

      {editarItem && (
        <ModalEditar
          item={editarItem}
          onClose={() => setEditarItem(null)}
          onSaved={() => { setEditarItem(null); carregar(); }}
        />
      )}
    </>
  );
}


function ModalShell({ title, subtitle, onClose, children, footer, width = 480 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300,
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: width, width: '100%',
        maxHeight: '80dvh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Cabeçalho fixo */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'start',
          padding: '20px 20px 12px', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
        {/* Corpo rolável */}
        <div style={{ overflow: 'auto', padding: '0 20px', flex: 1 }}>
          {children}
        </div>
        {/* Rodapé fixo — fora do scroll, sempre visível */}
        {footer && (
          <div style={{
            flexShrink: 0,
            padding: '12px 20px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
            background: 'var(--white)',
            borderTop: '0.5px solid var(--border)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


function ModalUpload({ nutriId, secaoDefault, onClose, onSaved }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState(secaoDefault);
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione uma imagem JPG ou PNG.');
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) { setBusy(false); return setErro('Upload falhou: ' + upErr.message); }
    const { error: insErr } = await supabase.from('ebooks').insert({
      nutri_id: nutriId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tag, storage_path: path,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('ebooks').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    onSaved();
  }

  const botoesFooter = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
        Cancelar
      </button>
      <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
        <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Salvar'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Adicionar item"
      subtitle="Sobe uma vez e atribui pra quantas pacientes quiser"
      onClose={onClose}
      footer={botoesFooter}
    >
      <label className="form-lbl">Imagem (JPG ou PNG)</label>
      <input type="file" accept="image/jpeg,image/png" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
        style={{ padding: 6 }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        {arquivo
          ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB`
          : 'Nenhum arquivo selecionado · Máximo: 5 MB'}
      </div>

      <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
      <input value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Ex: Cardápio detox 7 dias" />

      <label className="form-lbl" style={{ marginTop: 12 }}>Seção</label>
      <select value={tag} onChange={e => setTag(e.target.value)}>
        {SECOES.map(s => (
          <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
        ))}
      </select>

      <label className="form-lbl" style={{ marginTop: 12 }}>Descrição (opcional)</label>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
        rows={3} placeholder="Resumo do conteúdo, indicação, público-alvo…"
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}
      <div style={{ height: 8 }} />
    </ModalShell>
  );
}


function ModalEditar({ item, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(item.titulo ?? '');
  const [descricao, setDescricao] = useState(item.descricao ?? '');
  const [tag, setTag] = useState(item.tag ?? 'materiais');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const urlAtual = /\.(jpg|jpeg|png)$/i.test(item.storage_path ?? '')
    ? supabase.storage.from('ebooks').getPublicUrl(item.storage_path).data.publicUrl
    : null;

  async function salvar() {
    setErro(null);
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    let storage_path = item.storage_path;
    if (arquivo) {
      const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${item.nutri_id}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
      const { error: upErr } = await supabase.storage.from('ebooks')
        .upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) { setBusy(false); return setErro('Upload falhou: ' + upErr.message); }
      await supabase.storage.from('ebooks').remove([item.storage_path]);
      storage_path = path;
    }
    const { error } = await supabase.from('ebooks').update({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tag,
      storage_path,
    }).eq('id', item.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  const footer = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
        Cancelar
      </button>
      <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
        <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  );

  return (
    <ModalShell title="Editar item" onClose={onClose} footer={footer}>
      {urlAtual && !arquivo && (
        <img src={urlAtual} alt={titulo} loading="lazy" decoding="async"
          style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
      )}

      <label className="form-lbl">Imagem (opcional — substitui a atual)</label>
      <input type="file" accept="image/jpeg,image/png"
        onChange={e => setArquivo(e.target.files?.[0] ?? null)}
        style={{ padding: 6 }} />
      {arquivo && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(1)} MB
        </div>
      )}

      <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
      <input value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Ex: Cardápio detox 7 dias" />

      <label className="form-lbl" style={{ marginTop: 12 }}>Seção</label>
      <select value={tag} onChange={e => setTag(e.target.value)}>
        {SECOES.map(s => (
          <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
        ))}
      </select>

      <label className="form-lbl" style={{ marginTop: 12 }}>Descrição / Posologia (opcional)</label>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
        rows={3} placeholder="Resumo do conteúdo, posologia, indicação…"
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}
      <div style={{ height: 8 }} />
    </ModalShell>
  );
}


function ModalAtribuir({ item, pacientes, atribuidos, onClose, onSaved }) {
  const [selecionadas, setSelecionadas] = useState(new Set(atribuidos));
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    setSelecionadas(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setBusy(true);
    const atual = new Set(atribuidos);
    const adicionar = [...selecionadas].filter(id => !atual.has(id));
    const remover   = [...atual].filter(id => !selecionadas.has(id));
    if (adicionar.length > 0) {
      const { error: addErr } = await supabase.from('ebooks_pacientes').insert(
        adicionar.map(paciente_id => ({ ebook_id: item.id, paciente_id }))
      );
      if (!addErr) {
        // Notifica cada paciente nova via push (fire-and-forget)
        supabase.auth.getSession().then(({ data }) => {
          const accessToken = data.session?.access_token;
          if (!accessToken) return;
          adicionar.forEach(paciente_id => {
            fetch('/.netlify/functions/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({ mode: 'notify_paciente', paciente_id, kind: 'material' }),
            }).catch(() => {});
          });
        });
      }
    }
    if (remover.length > 0) {
      await supabase.from('ebooks_pacientes').delete()
        .eq('ebook_id', item.id).in('paciente_id', remover);
    }
    setBusy(false);
    onSaved();
  }

  const filtradas = pacientes.filter(p => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (p.nome ?? '').toLowerCase().includes(q);
  });

  const botoesFooter = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
        Cancelar
      </button>
      <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
        <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Gerenciar acesso"
      subtitle={`Quem pode ver "${item.titulo}"`}
      onClose={onClose}
      width={520}
      footer={botoesFooter}
    >
      <input value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar paciente…" style={{ marginBottom: 10 }} />

      <div style={{ maxHeight: 300, overflow: 'auto', border: '0.5px solid var(--border)', borderRadius: 8 }}>
        {filtradas.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Nenhuma paciente encontrada.
          </div>
        ) : filtradas.map(p => {
          const checked = selecionadas.has(p.id);
          return (
            <label key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', cursor: 'pointer',
              borderBottom: '0.5px solid var(--border)',
              background: checked ? 'var(--amber-bg, var(--bg2))' : 'transparent',
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} style={{ margin: 0 }} />
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--bg2)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: 'var(--dark)',
              }}>{iniciais(p.nome)}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginBottom: 4 }}>
        {selecionadas.size} de {pacientes.length} paciente{selecionadas.size !== 1 ? 's' : ''} com acesso
      </div>
    </ModalShell>
  );
}
