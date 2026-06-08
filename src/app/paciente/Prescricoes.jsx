import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

const TIPOS = {
  exame:   { color: 'var(--blue)',   bg: 'var(--blue-soft)',   icon: 'microscope', label: 'Exame' },
  laudo:   { color: 'var(--green)',  bg: 'var(--green-soft)',  icon: 'file-text',  label: 'Laudo' },
  receita: { color: 'var(--orange)', bg: 'var(--orange-soft)', icon: 'pill',       label: 'Receita' },
};

export default function PrescricoesPaciente() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [docs, setDocs] = useState(undefined);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pacienteId) return;
      const { data } = await supabase
        .from('prescricoes')
        .select('id, tipo, titulo, storage_path, nota, created_at')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false });
      if (!active) return;
      setDocs(data ?? []);
    }
    load();
    return () => { active = false; };
  }, [pacienteId]);

  const filtrados = useMemo(() => {
    if (!docs) return [];
    if (filtro === 'todos') return docs;
    return docs.filter(d => d.tipo === filtro);
  }, [docs, filtro]);

  async function abrir(storage_path) {
    const { data, error } = await supabase
      .storage
      .from('prescricoes')
      .createSignedUrl(storage_path, 60);
    if (error) {
      alert('Não consegui abrir o documento: ' + error.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-deep)', borderRadius: 10, padding: 3, margin: '0 16px 12px' }}>
        {[
          { id: 'todos',   label: 'Todos' },
          { id: 'exame',   label: 'Exames' },
          { id: 'laudo',   label: 'Laudos' },
          { id: 'receita', label: 'Receitas' },
        ].map(t => (
          <button key={t.id} onClick={() => setFiltro(t.id)}
            style={{
              flex: 1, fontSize: 12, padding: '7px 4px', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              color: filtro === t.id ? 'var(--ink)' : 'var(--muted)',
              background: filtro === t.id ? 'var(--paper)' : 'transparent',
              fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {docs === undefined ? (
        <div className="empty-state"><div className="empty-sub">Carregando…</div></div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-file-off empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum documento ainda</div>
          <div className="empty-sub">
            Sua nutricionista enviará laudos, receitas e pedidos de exame por aqui.
          </div>
        </div>
      ) : (
        filtrados.map(d => {
          const t = TIPOS[d.tipo] ?? { color: 'var(--muted)', bg: 'var(--bg-soft)', icon: 'file', label: d.tipo };
          return (
            <div key={d.id} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                background: t.bg, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <i className={`ti ti-${t.icon}`} style={{ fontSize: 20, color: t.color }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: t.color, marginBottom: 3, fontWeight: 500 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{d.titulo}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{dataBR(d.created_at)}</div>
                {d.nota && (
                  <div style={{
                    background: t.bg, fontSize: d.storage_path ? 11 : 13,
                    padding: d.storage_path ? '6px 10px' : '10px 12px',
                    borderRadius: 6, lineHeight: 1.6, marginBottom: 8,
                    color: d.storage_path ? t.color : 'var(--ink)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {d.nota}
                  </div>
                )}
                {d.storage_path && (
                  <button className="btn ghost sm" onClick={() => abrir(d.storage_path)}>
                    <i className="ti ti-eye" style={{ fontSize: 13 }} aria-hidden="true"></i> Ver documento
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
