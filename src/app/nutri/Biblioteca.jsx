import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';

const TAGS = [
  { id: 'receitas',      label: 'Receitas',       cor: 'orange' },
  { id: 'guia',          label: 'Guia',           cor: 'blue'   },
  { id: 'protocolo',     label: 'Protocolo',      cor: 'green'  },
  { id: 'suplementacao', label: 'Suplementação',  cor: 'amber'  },
  { id: 'outro',         label: 'Outro',          cor: 'gray'   },
];

function pillStyleFor(tag) {
  const t = TAGS.find(x => x.id === tag);
  const cor = t?.cor ?? 'gray';
  return {
    background: `var(--${cor}-bg, var(--bg2))`,
    color: `var(--${cor}, var(--text3))`,
  };
}

export default function Biblioteca() {
  const { user } = useSession();
  const [ebooks, setEbooks] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState({});
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todos');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [atribuirEbook, setAtribuirEbook] = useState(null);

  async function carregar() {
    if (!user) return;
    const [ebRes, pacRes, atRes] = await Promise.all([
      supabase.from('ebooks').select('*').eq('nutri_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pacientes').select('id, nome, email').eq('nutri_id', user.id).order('nome'),
      supabase.from('ebooks_pacientes').select('ebook_id, paciente_id'),
    ]);
    setEbooks(ebRes.data ?? []);
    setPacientes(pacRes.data ?? []);
    // mapa ebook_id → [paciente_id]
    const mapa = {};
    for (const a of atRes.data ?? []) {
      if (!mapa[a.ebook_id]) mapa[a.ebook_id] = [];
      mapa[a.ebook_id].push(a.paciente_id);
    }
    setAtribuicoes(mapa);
  }
  useEffect(() => { carregar(); }, [user]);

  function abrirEbook(eb) {
    const { data } = supabase.storage.from('ebooks').getPublicUrl(eb.storage_path);
    window.open(data.publicUrl, '_blank', 'noopener');
  }

  async function excluirEbook(eb) {
    const nPac = atribuicoes[eb.id]?.length ?? 0;
    const aviso = nPac > 0
      ? `Excluir "${eb.titulo}"? Está atribuído a ${nPac} paciente${nPac === 1 ? '' : 's'} — todas perderão acesso.`
      : `Excluir "${eb.titulo}"?`;
    if (!window.confirm(aviso)) return;
    await supabase.storage.from('ebooks').remove([eb.storage_path]);
    await supabase.from('ebooks').delete().eq('id', eb.id);
    carregar();
  }

  const filtrados = useMemo(() => {
    if (!ebooks) return [];
    const q = busca.trim().toLowerCase();
    return ebooks.filter(e => {
      if (filtroTag !== 'todos' && (e.tag ?? 'outro') !== filtroTag) return false;
      if (!q) return true;
      return (e.titulo ?? '').toLowerCase().includes(q)
        || (e.descricao ?? '').toLowerCase().includes(q);
    });
  }, [ebooks, busca, filtroTag]);

  return (
    <>
      <div className="page-title">Biblioteca</div>
      <div className="page-sub">E-books, guias e protocolos para reutilizar com suas pacientes</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <input
            style={{ width: 240, margin: 0 }}
            className="input-field"
            placeholder="Buscar e-book..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)}
            style={{ margin: 0, width: 'auto' }}>
            <option value="todos">Todas as categorias</option>
            {TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <button className="btn" onClick={() => setUploadOpen(true)}>
          <i className="ti ti-upload" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Adicionar e-book
        </button>
      </div>

      {ebooks === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : ebooks.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-book-2 empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Biblioteca vazia</div>
          <div className="empty-sub">
            Suba seus e-books, guias e protocolos uma única vez e atribua às pacientes que precisarem.
          </div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-upload" aria-hidden="true"></i> Adicionar primeiro e-book
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum e-book encontrado com esses filtros.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtrados.map(eb => {
            const nPac = atribuicoes[eb.id]?.length ?? 0;
            const tag = TAGS.find(t => t.id === (eb.tag ?? 'outro')) ?? TAGS[TAGS.length - 1];
            return (
              <div key={eb.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: 'var(--bg2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i className="ti ti-file-text" style={{ fontSize: 22, color: 'var(--dark)' }} aria-hidden="true"></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>{eb.titulo}</div>
                    <span style={{
                      display: 'inline-block', fontSize: 10, padding: '2px 8px',
                      borderRadius: 999, fontWeight: 500,
                      ...pillStyleFor(eb.tag ?? 'outro'),
                    }}>{tag.label}</span>
                  </div>
                </div>
                {eb.descricao && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>
                    {eb.descricao}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-users" aria-hidden="true"></i>
                  {nPac === 0
                    ? 'Não atribuído'
                    : `${nPac} paciente${nPac === 1 ? '' : 's'}`}
                  <span style={{ marginLeft: 'auto' }}>{dataBR(eb.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => abrirEbook(eb)}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setAtribuirEbook(eb)}>
                    <i className="ti ti-share" aria-hidden="true"></i> Atribuir
                  </button>
                  <button onClick={() => excluirEbook(eb)}
                    title="Excluir"
                    style={{
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
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); carregar(); }}
        />
      )}

      {atribuirEbook && (
        <ModalAtribuir
          ebook={atribuirEbook}
          pacientes={pacientes}
          atribuidos={atribuicoes[atribuirEbook.id] ?? []}
          onClose={() => setAtribuirEbook(null)}
          onSaved={() => { setAtribuirEbook(null); carregar(); }}
        />
      )}
    </>
  );
}


function ModalShell({ title, subtitle, onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: width, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
        {children}
      </div>
    </div>
  );
}


function ModalUpload({ nutriId, onClose, onSaved }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState('guia');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione um arquivo PDF.');
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }
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

  return (
    <ModalShell title="Adicionar e-book" subtitle="Sobe uma vez e atribui pra quantas pacientes quiser" onClose={onClose}>
      <label className="form-lbl">Arquivo (PDF)</label>
      <input type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
        style={{ padding: 6 }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        {arquivo
          ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB`
          : 'Nenhum arquivo selecionado · Tamanho máximo: 20 MB'}
      </div>

      <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
      <input value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Ex: Guia de receitas low-carb" />

      <label className="form-lbl" style={{ marginTop: 12 }}>Categoria</label>
      <select value={tag} onChange={e => setTag(e.target.value)}>
        {TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      <label className="form-lbl" style={{ marginTop: 12 }}>Descrição (opcional)</label>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
        rows={3} placeholder="Resumo do conteúdo, quem é o público, etc."
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
          <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}


function ModalAtribuir({ ebook, pacientes, atribuidos, onClose, onSaved }) {
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
      await supabase.from('ebooks_pacientes').insert(
        adicionar.map(paciente_id => ({ ebook_id: ebook.id, paciente_id }))
      );
    }
    if (remover.length > 0) {
      await supabase.from('ebooks_pacientes').delete()
        .eq('ebook_id', ebook.id).in('paciente_id', remover);
    }
    setBusy(false);
    onSaved();
  }

  const filtradas = pacientes.filter(p => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (p.nome ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q);
  });

  return (
    <ModalShell title="Atribuir pacientes"
      subtitle={`Quem pode ler "${ebook.titulo}"`}
      onClose={onClose}
      width={520}>
      <input value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar paciente..." style={{ marginBottom: 10 }} />

      <div style={{ maxHeight: 360, overflow: 'auto', border: '0.5px solid var(--border)', borderRadius: 8 }}>
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
                background: 'var(--bg2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: 'var(--dark)',
              }}>{iniciais(p.nome)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.email}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        {selecionadas.size} de {pacientes.length} selecionada{selecionadas.size === 1 ? '' : 's'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar atribuições'}
        </button>
      </div>
    </ModalShell>
  );
}
