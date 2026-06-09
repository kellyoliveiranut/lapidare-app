import { useNavigate } from 'react-router-dom';

export function cumpriuHabito(h, valor) {
  if (valor === undefined || valor === null) return false;
  if (h.tipo === 'boolean') return valor >= 1;
  if (h.tipo === 'numero')  return h.meta ? valor >= h.meta : valor > 0;
  if (h.tipo === 'escala')  return valor >= 4;
  return false;
}

/**
 * Tracker compacto de hábitos do dia.
 * Props:
 *   habitos          — array de hábitos ativos
 *   habitosLogs      — { habito_id: valor } de hoje
 *   habitosStreak    — número de dias seguidos
 *   setValorHabito   — async (habito, valor) => void
 *   showHistoricoLink — bool (default true); false quando já estamos na aba Hábitos
 *   containerStyle   — estilo extra para o div externo (ex.: remover margin lateral)
 */
export function HabitosHoje({
  habitos,
  habitosLogs,
  habitosStreak,
  setValorHabito,
  showHistoricoLink = true,
  containerStyle,
}) {
  const navigate = useNavigate();
  const habitosCumpridos = habitos.filter(h => cumpriuHabito(h, habitosLogs[h.id])).length;

  if (!habitos.length) return null;

  return (
    <div style={{
      margin: '0 16px 14px', padding: 16,
      background: 'var(--white)',
      border: `0.5px solid ${habitosCumpridos === habitos.length ? 'var(--green, var(--hair))' : 'var(--hair)'}`,
      borderRadius: 16,
      ...containerStyle,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{
            fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
            color: 'var(--muted)', fontWeight: 500,
          }}>Hábitos de hoje</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>
            {habitosCumpridos}
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>/{habitos.length}</span>
            {habitosCumpridos === habitos.length && (
              <span style={{ marginLeft: 8, fontSize: 14 }}>🎉</span>
            )}
          </div>
        </div>
        {habitosStreak > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px',
            background: 'var(--orange-bg, var(--bg-soft))',
            borderRadius: 999, fontSize: 11,
            color: 'var(--orange, var(--gold-deep))', fontWeight: 500,
          }}>
            <i className="ti ti-flame" aria-hidden="true"></i>
            {habitosStreak} dia{habitosStreak === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {habitos.map(h => {
          const valor = habitosLogs[h.id];
          const ok = cumpriuHabito(h, valor);
          return (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: ok ? 'var(--green-soft, var(--bg-soft))' : 'var(--bg-soft)',
              border: `0.5px solid ${ok ? 'var(--green, transparent)' : 'transparent'}`,
            }}>
              <span style={{ fontSize: 18 }}>{h.emoji ?? '✨'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--ink)',
                  textDecoration: ok && h.tipo === 'boolean' ? 'line-through' : 'none',
                  opacity: ok && h.tipo === 'boolean' ? 0.7 : 1,
                }}>{h.nome}</div>
              </div>

              {h.tipo === 'boolean' && (
                <button onClick={() => setValorHabito(h, ok ? 0 : 1)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: ok ? 'var(--green, var(--gold-deep))' : 'var(--white)',
                    color: ok ? '#fff' : 'var(--muted-2)',
                    border: `1.5px solid ${ok ? 'var(--green, var(--gold-deep))' : 'var(--hair)'}`,
                    cursor: 'pointer', fontSize: 14, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {ok && <i className="ti ti-check" aria-hidden="true"></i>}
                </button>
              )}

              {h.tipo === 'numero' && (() => {
                const v = valor ?? 0;
                const meta = h.meta ?? 0;
                const passo = meta && meta < 5 ? 0.5 : 1;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => setValorHabito(h, Math.max(0, Number((v - passo).toFixed(1))))}
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: 'var(--white)', border: '1px solid var(--hair)',
                        cursor: 'pointer', fontSize: 14, color: 'var(--ink)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>−</button>
                    <div style={{ minWidth: 60, textAlign: 'center', fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>
                      {v}<span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                        {meta ? `/${meta}` : ''} {h.unidade ?? ''}
                      </span>
                    </div>
                    <button
                      onClick={() => setValorHabito(h, Number((v + passo).toFixed(1)))}
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: 'var(--white)', border: '1px solid var(--hair)',
                        cursor: 'pointer', fontSize: 14, color: 'var(--ink)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>+</button>
                  </div>
                );
              })()}

              {h.tipo === 'escala' && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const ativo = (valor ?? 0) === n;
                    const emoji = ['😞', '😕', '😐', '🙂', '😄'][n - 1];
                    return (
                      <button key={n} onClick={() => setValorHabito(h, n)}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          background: ativo ? 'var(--gold-deep)' : 'transparent',
                          border: 'none', cursor: 'pointer', fontSize: 14, padding: 0,
                          opacity: ativo ? 1 : 0.5,
                        }}>{emoji}</button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showHistoricoLink && (
        <button onClick={() => navigate('/paciente/habitos')}
          style={{
            width: '100%', marginTop: 10, padding: '8px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
          Ver histórico completo
          <i className="ti ti-chevron-right" style={{ fontSize: 12 }} aria-hidden="true"></i>
        </button>
      )}
    </div>
  );
}
