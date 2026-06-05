import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais } from '../../lib/utils.js';
import ImportarCsv from './_ImportarCsv.jsx';

export default function Pacientes() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [pacientes, setPacientes] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [importerOpen, setImporterOpen] = useState(false);
  const [showPendentes, setShowPendentes] = useState(false);

  async function carregar() {
    const [pacRes, pendRes] = await Promise.all([
      supabase
        .from('pacientes')
        .select('id, nome, email, objetivo, tipo_plano, modalidade, avatar_url, created_at, status_paciente')
        .order('created_at', { ascending: false }),
      supabase
        .from('pacientes_pendentes')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false }),
    ]);
    setPacientes(pacRes.data ?? []);
    setPendentes(pendRes.data ?? []);
  }

  useEffect(() => { if (user) carregar(); }, [user]);

  async function copiarLinkSignup(p) {
    const link = `${window.location.origin}/signup-paciente/${user.id}`;
    await navigator.clipboard.writeText(link);
    alert(`Link copiado! Envie pra ${p.nome.split(' ')[0]} por WhatsApp ou email.`);
    await supabase.from('pacientes_pendentes').update({ status: 'enviado' }).eq('id', p.id);
    carregar();
  }

  async function removerPendente(p) {
    if (!window.confirm(`Remover "${p.nome}" da lista de pendentes?`)) return;
    await supabase.from('pacientes_pendentes').delete().eq('id', p.id);
    carregar();
  }

  async function reativar(id) {
    if (!window.confirm('Deseja reativar esta paciente?')) return;
    await supabase.from('pacientes').update({ status_paciente: 'ativo' }).eq('id', id);
    carregar();
  }

  const contagemPorStatus = useMemo(() => {
    if (!pacientes) return {};
    const m = {};
    for (const p of pacientes) {
      const s = p.status_paciente ?? 'ativo';
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [pacientes]);

  const filtradas = useMemo(() => {
    if (!pacientes) return [];
    const porStatus = pacientes.filter(p => (p.status_paciente ?? 'ativo') === filtroStatus);
    const q = busca.trim().toLowerCase();
    if (!q) return porStatus;
    return porStatus.filter(p =>
      p.nome?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    );
  }, [pacientes, busca, filtroStatus]);

  return (
    <>
      <div className="page-title">Pacientes</div>
      <div className="page-sub">Gerencie todas as suas pacientes</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 240, margin: 0 }}
          className="input-field"
          placeholder="Buscar paciente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={() => setImporterOpen(true)}>
            <i className="ti ti-file-upload" aria-hidden="true"></i> Importar CSV
          </button>
          <button className="btn" onClick={() => navigate('/nutri/cadastrar')}>
            <i className="ti ti-user-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Nova paciente
          </button>
        </div>
      </div>

      {/* Abas de status */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 8, padding: 3, marginBottom: 14 }}>
        {[
          { id: 'ativo',      label: 'Ativas',       icon: 'users' },
          { id: 'finalizado', label: 'Finalizadas',   icon: 'archive' },
          { id: 'obito',      label: 'In memoriam',   icon: 'heart-off' },
        ].map(t => {
          const count = contagemPorStatus[t.id] ?? 0;
          return (
            <button key={t.id} onClick={() => setFiltroStatus(t.id)}
              style={{
                flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 500,
                borderRadius: 6, border: 'none', cursor: 'pointer',
                color: filtroStatus === t.id ? 'var(--dark)' : 'var(--text3)',
                background: filtroStatus === t.id ? 'var(--white)' : 'transparent',
                boxShadow: filtroStatus === t.id ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.05))' : 'none',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                whiteSpace: 'nowrap',
              }}>
              <i className={`ti ti-${t.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />
              {t.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 999,
                  background: filtroStatus === t.id ? 'var(--bg2)' : 'transparent',
                  color: 'var(--text3)',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Banner de pendentes */}
      {pendentes.length > 0 && (
        <div className="al-b" style={{
          marginBottom: 14, background: 'var(--orange-bg)',
          borderLeftColor: 'var(--orange)',
          cursor: 'pointer',
        }} onClick={() => setShowPendentes(v => !v)}>
          <i className="ti ti-user-plus" style={{ fontSize: 16, color: 'var(--orange)', marginTop: 1 }} aria-hidden="true"></i>
          <div style={{ flex: 1 }}>
            <div className="al-t" style={{ color: 'var(--orange)' }}>
              {pendentes.length} paciente{pendentes.length === 1 ? '' : 's'} pendente{pendentes.length === 1 ? '' : 's'} de cadastro
            </div>
            <div className="al-d">
              Foram importadas mas ainda não criaram conta. Envie o link de cadastro pra ativar.
              {showPendentes ? ' Toque pra esconder.' : ' Toque pra ver.'}
            </div>
          </div>
          <i className={`ti ti-chevron-${showPendentes ? 'up' : 'down'}`} style={{ fontSize: 16, color: 'var(--orange)' }} aria-hidden="true"></i>
        </div>
      )}

      {showPendentes && pendentes.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Objetivo</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.nome}</strong></td>
                  <td>{p.email}</td>
                  <td>{p.objetivo ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => copiarLinkSignup(p)}>
                        <i className="ti ti-link" aria-hidden="true"></i> Copiar link
                      </button>
                      <button onClick={() => removerPendente(p)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importerOpen && (
        <ImportarCsv
          onClose={() => setImporterOpen(false)}
          onImported={() => { carregar(); setShowPendentes(true); }}
        />
      )}

      {pacientes === null ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--bg2)', margin: '0 auto 12px',
                animation: 'lapidare-spin 1.5s ease-in-out infinite alternate',
              }} />
              <div style={{ height: 14, borderRadius: 6, background: 'var(--bg2)', margin: '0 auto 8px', width: '70%' }} />
              <div style={{ height: 11, borderRadius: 6, background: 'var(--bg2)', margin: '0 auto', width: '45%' }} />
            </div>
          ))}
        </div>
      ) : pacientes.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-users empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma paciente cadastrada ainda</div>
          <div className="empty-sub">
            Cadastre a primeira paciente para começar a publicar planos, prescrições e acompanhar progresso.
          </div>
          <button className="btn" onClick={() => navigate('/nutri/cadastrar')}>
            <i className="ti ti-user-plus" aria-hidden="true"></i> Cadastrar primeira paciente
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma paciente encontrada para "{busca}".</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {filtradas.map(p => (
            <PacienteCard key={p.id} paciente={p} onNavigate={navigate} onReativar={reativar} />
          ))}
        </div>
      )}
    </>
  );
}

const PacienteCard = memo(function PacienteCard({ paciente: p, onNavigate, onReativar }) {
  return (
    <div
      className="card"
      onClick={() => onNavigate(`/nutri/pacientes/${p.id}`)}
      style={{ padding: '20px 16px', cursor: 'pointer', textAlign: 'center', transition: 'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
    >
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 600, color: 'var(--dark)',
        margin: '0 auto 12px',
        overflow: 'hidden',
        border: '2px solid var(--border)',
      }}>
        {p.avatar_url
          ? <img src={p.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : iniciais(p.nome)
        }
      </div>

      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, lineHeight: 1.3 }}>
        {p.nome}
      </div>

      {p.status_paciente === 'finalizado' && (
        <div style={{ marginBottom: 4 }}>
          <div style={{
            display: 'inline-block', fontSize: 10, fontWeight: 500,
            padding: '2px 7px', borderRadius: 999,
            background: '#ebebeb', color: '#666',
          }}>
            Finalizado
          </div>
        </div>
      )}
      {p.status_paciente === 'obito' && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 10, fontWeight: 500,
          padding: '2px 7px', borderRadius: 999,
          background: '#f5eeff', color: '#6c3483', marginBottom: 4,
        }}>
          <i className="ti ti-heart-off" style={{ fontSize: 11 }} aria-hidden="true" />
          In memoriam
        </div>
      )}

      {p.objetivo && (
        <div style={{
          display: 'inline-block',
          fontSize: 10, fontWeight: 500,
          padding: '2px 8px', borderRadius: 999,
          background: 'var(--gold-soft, #fdf6e3)',
          color: 'var(--gold-deep, #a08456)',
          marginBottom: 10,
        }}>
          {p.objetivo}
        </div>
      )}

      {p.status_paciente === 'finalizado' && (
        <button
          onClick={e => { e.stopPropagation(); onReativar?.(p.id); }}
          style={{
            marginBottom: 8, padding: '4px 12px', borderRadius: 999,
            background: 'var(--green-bg)', border: '0.5px solid var(--green)',
            color: 'var(--green)', fontSize: 10, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <i className="ti ti-refresh" style={{ fontSize: 11 }} aria-hidden="true" />
          Desarquivar
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: p.objetivo ? 0 : 10 }}>
        {p.tipo_plano && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
            <i className="ti ti-calendar-check" style={{ fontSize: 12 }} aria-hidden="true"></i>
            {p.tipo_plano.charAt(0).toUpperCase() + p.tipo_plano.slice(1)}
          </div>
        )}
        {p.modalidade && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
            <i className="ti ti-map-pin" style={{ fontSize: 12 }} aria-hidden="true"></i>
            {p.modalidade}
          </div>
        )}
      </div>
    </div>
  );
});
