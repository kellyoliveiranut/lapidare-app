import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nomeEnvio(e) {
  if (e.nome) return e.nome;
  return e.tipo === 'pre_consulta' ? 'Check-in pré-consulta' : 'Check-in semanal';
}

export default function CheckinsPaciente() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const navigate = useNavigate();
  const [envios, setEnvios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pacienteId) return;
    supabase
      .from('checkin_envios')
      .select('id, nome, tipo, enviado_em, respondido_em')
      .eq('paciente_id', pacienteId)
      .order('enviado_em', { ascending: false })
      .then(({ data }) => {
        setEnvios(data ?? []);
        setLoading(false);
      });
  }, [pacienteId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 13 }}>
        Carregando…
      </div>
    );
  }

  if (!envios.length) {
    return (
      <div className="empty-state">
        <i className="ti ti-clipboard empty-icon" aria-hidden="true" />
        <div className="empty-title">Nenhum check-in ainda</div>
        <div className="empty-sub">
          Quando sua nutricionista enviar um formulário, ele aparecerá aqui para você responder.
        </div>
      </div>
    );
  }

  const pendentes   = envios.filter(e => !e.respondido_em);
  const respondidos = envios.filter(e =>  e.respondido_em);

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* ── Pendentes ── */}
      {pendentes.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.07em',
            marginBottom: 10,
          }}>
            Aguardando resposta · {pendentes.length}
          </div>

          {pendentes.map(e => (
            <button
              key={e.id}
              onClick={() => navigate(`/paciente/checkin/${e.id}`)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--gold-soft, #fdf6e3)',
                border: '1.5px solid var(--gold, #c9a96e)',
                borderRadius: 14, padding: '14px 16px',
                marginBottom: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600,
                  color: 'var(--gold-deep, #a08456)',
                  marginBottom: 3, lineHeight: 1.3,
                }}>
                  {nomeEnvio(e)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Enviado em {fmtData(e.enviado_em)}
                </div>
              </div>
              <span style={{
                flexShrink: 0,
                padding: '7px 14px', borderRadius: 999,
                background: 'var(--gold-deep, #a08456)',
                color: '#fff', fontSize: 12, fontWeight: 600,
              }}>
                Responder
              </span>
            </button>
          ))}
        </section>
      )}

      {/* ── Respondidos ── */}
      {respondidos.length > 0 && (
        <section>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.07em',
            marginBottom: 10,
          }}>
            Já respondidos · {respondidos.length}
          </div>

          {respondidos.map(e => (
            <button
              key={e.id}
              onClick={() => navigate(`/paciente/checkin/${e.id}`)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--bg-soft)',
                border: '0.5px solid var(--hair)',
                borderRadius: 14, padding: '14px 16px',
                marginBottom: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ink)', marginBottom: 3, lineHeight: 1.3,
                }}>
                  {nomeEnvio(e)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Respondido em {fmtData(e.respondido_em)}
                </div>
              </div>
              <i className="ti ti-check"
                style={{ color: '#16a34a', fontSize: 18, flexShrink: 0 }}
                aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

    </div>
  );
}
