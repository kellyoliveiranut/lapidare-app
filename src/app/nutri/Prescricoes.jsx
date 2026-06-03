import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';

const TIPO_INFO = {
  exame:   { label: 'Exame',    color: 'var(--blue)',   bg: 'var(--blue-bg)' },
  laudo:   { label: 'Laudo',    color: 'var(--green)',  bg: 'var(--green-bg)' },
  receita: { label: 'Receita',  color: 'var(--orange)', bg: 'var(--orange-bg)' },
};

export default function PrescricoesNutri() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [presc, setPresc] = useState(undefined);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('prescricoes')
      .select('id, tipo, titulo, storage_path, nota, created_at, paciente:pacientes(id, nome)')
      .eq('nutri_id', user.id)
      .order('created_at', { ascending: false });
    setPresc(data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  const filtradas = useMemo(() => {
    if (!presc) return [];
    const q = busca.trim().toLowerCase();
    return presc.filter(p => {
      if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false;
      if (q && !(p.titulo?.toLowerCase().includes(q) || p.paciente?.nome?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [presc, busca, filtroTipo]);

  async function abrir(path) {
    const { data, error } = await supabase.storage
      .from('prescricoes').createSignedUrl(path, 60);
    if (error) return alert('Erro ao abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remover(item) {
    if (!window.confirm(`Remover "${item.titulo}"?`)) return;
    await supabase.storage.from('prescricoes').remove([item.storage_path]);
    const { error } = await supabase.from('prescricoes').delete().eq('id', item.id);
    if (error) return alert('Erro ao remover: ' + error.message);
    carregar();
  }

  const contagem = useMemo(() => {
    if (!presc) return { todos: 0, exame: 0, laudo: 0, receita: 0 };
    return {
      todos:   presc.length,
      exame:   presc.filter(p => p.tipo === 'exame').length,
      laudo:   presc.filter(p => p.tipo === 'laudo').length,
      receita: presc.filter(p => p.tipo === 'receita').length,
    };
  }, [presc]);

  return (
    <>
      <div className="page-title">Prescrições</div>
      <div className="page-sub">
        Todos os documentos enviados às suas pacientes — uploads novos são feitos no perfil de cada uma
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 280, margin: 0 }}
          className="input-field"
          placeholder="Buscar por título ou paciente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'todos',   label: `Todos (${contagem.todos})` },
            { id: 'exame',   label: `Exames (${contagem.exame})` },
            { id: 'laudo',   label: `Laudos (${contagem.laudo})` },
            { id: 'receita', label: `Receitas (${contagem.receita})` },
          ].map(f => (
            <button key={f.id}
              className={filtroTipo === f.id ? 'btn' : 'btn-outline'}
              onClick={() => setFiltroTipo(f.id)}
              style={{ fontSize: 12, padding: '6px 12px' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {presc === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : presc.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-file-text empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma prescrição enviada</div>
          <div className="empty-sub">
            Para enviar uma prescrição, abra o perfil de uma paciente e use a aba <strong>Prescrições</strong>.
          </div>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum documento encontrado com esses filtros.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Paciente</th>
                <th>Tipo</th>
                <th>Enviado em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(d => {
                const info = TIPO_INFO[d.tipo] ?? { label: d.tipo, color: 'var(--text3)', bg: 'var(--bg2)' };
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: info.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <i className="ti ti-file-text" style={{ fontSize: 16, color: info.color }} aria-hidden="true"></i>
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{d.titulo}</div>
                          {d.nota && (
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontStyle: 'italic' }}>
                              "{d.nota}"
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                        onClick={() => navigate(`/nutri/pacientes/${d.paciente?.id}`)}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'var(--bg2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600,
                        }}>{iniciais(d.paciente?.nome)}</div>
                        <span style={{ color: 'var(--gold-deep, #a08456)', fontSize: 13 }}>
                          {d.paciente?.nome ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20,
                        background: info.bg, color: info.color, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '.5px',
                      }}>
                        {info.label}
                      </span>
                    </td>
                    <td>{dataBR(d.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => abrir(d.storage_path)}>
                          <i className="ti ti-eye" aria-hidden="true"></i> Ver
                        </button>
                        <button onClick={() => remover(d)}
                          style={{
                            background: 'none', border: '0.5px solid var(--red)',
                            borderRadius: 6, padding: '4px 8px',
                            color: 'var(--red)', cursor: 'pointer',
                          }}>
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
