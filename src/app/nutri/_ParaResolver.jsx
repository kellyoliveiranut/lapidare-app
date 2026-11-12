// "Para resolver": consultas que já passaram e continuam agendadas. Quem
// CONFIRMOU e não foi marcada aparece primeiro. Três saídas por consulta:
//   Compareceu → vira realizada
//   Faltou     → registra a falta (a consulta segue agendada)
//   Cancelou   → aviso em cima da hora conta como cancelamento
// Some sozinho quando não há nada para resolver.
import { useState } from 'react';

function quando(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const ROTULO_DESFAZER = {
  compareceu: 'marcada como realizada',
  faltou: 'falta registrada',
  cancelou: 'consulta cancelada',
};

const btn = (cor, fundo) => ({
  background: fundo, color: cor, border: `1px solid ${cor}`, borderRadius: 8,
  padding: '8px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  minHeight: 40,
});

export default function ParaResolver({ fila, onResolver, desfazer, onDesfazer, confirmouAntes }) {
  const [ocupadaId, setOcupadaId] = useState(null);
  const [aberto, setAberto] = useState(true);

  async function resolver(c, acao) {
    if (ocupadaId) return;
    setOcupadaId(c.id);
    try { await onResolver(c, acao); } finally { setOcupadaId(null); }
  }

  if (!fila.length && !desfazer) return null;
  const nConfirmadas = fila.filter(confirmouAntes).length;

  return (
    <div style={{
      border: '1px solid #e0b36a', background: '#fff8ec', borderRadius: 12,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {fila.length > 0 && (
        <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: '#7a4b00',
          }}>
          <i className={`ti ti-chevron-${aberto ? 'down' : 'right'}`} style={{ fontSize: 18 }} aria-hidden="true" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Para resolver · {fila.length} consulta{fila.length > 1 ? 's' : ''} que já passou
            {nConfirmadas > 0 && ` (${nConfirmadas} confirmada${nConfirmadas > 1 ? 's' : ''})`}
          </span>
        </button>
      )}

      {aberto && fila.map(c => {
        const confirmou = confirmouAntes(c);
        const ocupada = ocupadaId === c.id;
        return (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid #f0dcb8',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{c.paciente?.nome ?? 'Paciente sem nome'}</div>
              <div style={{ fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>
                {quando(c.data_hora)}
                {confirmou && (
                  <span style={{
                    marginLeft: 8, background: '#fde3c2', color: '#8a4b00', borderRadius: 999,
                    padding: '2px 8px', fontSize: 12, fontWeight: 700,
                  }}>Confirmou</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={ocupada} onClick={() => resolver(c, 'compareceu')}
                style={btn('#2f6b3a', '#eaf5ec')}>Compareceu</button>
              <button type="button" disabled={ocupada} onClick={() => resolver(c, 'faltou')}
                style={btn('#a33a2a', '#fdeceb')}>Faltou</button>
              <button type="button" disabled={ocupada} onClick={() => resolver(c, 'cancelou')}
                style={btn('#5a4a32', '#f6f1e8')}
                title="Avisou em cima da hora: conta como cancelamento">Cancelou</button>
            </div>
          </div>
        );
      })}

      {desfazer && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          fontSize: 14, color: '#5a4a32',
        }}>
          <span>{desfazer.nome}: {ROTULO_DESFAZER[desfazer.acao]}.</span>
          <button type="button" onClick={onDesfazer} style={{
            background: 'none', border: 'none', color: '#1e4f8a', textDecoration: 'underline',
            cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0,
          }}>Desfazer</button>
        </div>
      )}
    </div>
  );
}
