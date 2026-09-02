import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

const METRICAS = [
  { key: 'kg',          label: 'Peso',       unit: 'kg', dec: 1 },
  { key: 'cintura_cm',  label: 'Cintura',    unit: 'cm', dec: 1 },
  { key: 'quadril_cm',  label: 'Quadril',    unit: 'cm', dec: 1 },
  { key: 'pgc',         label: '% gordura',  unit: '%',  dec: 1 },
  { key: 'mm_kg',       label: 'Massa magra', unit: 'kg', dec: 1 },
];

export default function Progresso() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [registros, setRegistros] = useState(undefined);
  const [metrica, setMetrica] = useState('kg');
  const [obsExpandido, setObsExpandido] = useState(new Set());
  const toggleObs = useCallback(id => setObsExpandido(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }), []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pacienteId) return;
      const { data } = await supabase
        .from('peso_registros')
        .select('id, data, kg, cintura_cm, quadril_cm, braco_cm, coxa_cm, pgc, mm_kg, obs')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: true });
      if (!active) return;
      setRegistros(data ?? []);
    }
    load();
    return () => { active = false; };
  }, [pacienteId]);

  // Métricas disponíveis (com pelo menos 1 valor não-nulo)
  const metricasDisponiveis = useMemo(() => {
    if (!registros) return [];
    return METRICAS.filter(m => registros.some(r => r[m.key] != null));
  }, [registros]);

  const dadosMetrica = useMemo(() => {
    if (!registros) return [];
    return registros
      .filter(r => r[metrica] != null)
      .map(r => ({ ...r, valor: Number(r[metrica]) }));
  }, [registros, metrica]);

  const registrosRev = useMemo(() => [...(registros ?? [])].reverse(), [registros]);

  // IMPORTANTE: o chart precisa ser calculado SEMPRE (antes de qualquer return),
  // senão o número de hooks muda entre renders e o React quebra a tela inteira.
  const chart = useMemo(() => {
    const pts = dadosMetrica ?? [];
    if (pts.length < 2) return { points: [], path: '', area: '' };
    const vals = pts.map(p => (typeof p.valor === 'number' && isFinite(p.valor) ? p.valor : null)).filter(v => v !== null);
    if (vals.length < 2) return { points: [], path: '', area: '' };
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const range = rawMax - rawMin === 0 ? 1 : rawMax - rawMin;
    const min = rawMin - range * 0.05;
    const displayRange = (rawMax + range * 0.05) - min || 1;
    const points = pts.map((p, i) => {
      const v = typeof p.valor === 'number' && isFinite(p.valor) ? p.valor : rawMin;
      return {
        x: pts.length > 1 ? (i / (pts.length - 1)) * 100 : 50,
        y: Math.max(0, Math.min(100, 100 - ((v - min) / displayRange) * 100)),
        ...p,
      };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    return { points, path, area: path + ' L 100 100 L 0 100 Z' };
  }, [dadosMetrica]);

  if (registros === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  if (registros.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-trending-up empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Sem avaliações ainda</div>
        <div className="empty-sub">
          Sua nutricionista registra peso e medidas em cada consulta — o gráfico de evolução aparecerá aqui depois da primeira avaliação.
        </div>
      </div>
    );
  }

  const metricaAtual = METRICAS.find(m => m.key === metrica) ?? METRICAS[0];
  const atual   = dadosMetrica.length > 0 ? dadosMetrica[dadosMetrica.length - 1] : null;
  const inicial = dadosMetrica.length > 0 ? dadosMetrica[0] : null;

  const dif = (atual && inicial && dadosMetrica.length > 1)
    ? (atual.valor - inicial.valor)
    : 0;
  const { points, path, area } = chart;

  return (
    <>
      {/* Seletor de métrica */}
      <div style={{
        margin: '0 0 12px', display: 'flex', gap: 4,
        overflowX: 'auto', paddingBottom: 4,
      }}>
        {metricasDisponiveis.map(m => {
          const ativo = m.key === metrica;
          return (
            <button key={m.key} onClick={() => setMetrica(m.key)}
              style={{
                flexShrink: 0, padding: '6px 12px', fontSize: 12,
                borderRadius: 20, cursor: 'pointer',
                background: ativo ? 'var(--ink)' : 'var(--paper)',
                color: ativo ? 'var(--bg-soft)' : 'var(--ink)',
                fontWeight: 500, fontFamily: 'var(--font-sans)',
                whiteSpace: 'nowrap',
                border: ativo ? 'none' : '0.5px solid var(--hair)',
              }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ─── GRÁFICO EM DESTAQUE ──────────────────────────────── */}
      {dadosMetrica.length === 0 ? (
        <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Ainda não há dados de {metricaAtual?.label?.toLowerCase() ?? 'esta métrica'}.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '14px 12px 10px' }}>
          {/* Cabeçalho: valor atual + variação */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0 4px 10px' }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 2 }}>
                {metricaAtual.label} atual
              </div>
              {atual && (
                <div className="serif" style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, color: 'var(--ink)' }}>
                  {atual.valor.toFixed(metricaAtual.dec).replace('.', ',')}
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 3 }}>{metricaAtual.unit}</span>
                </div>
              )}
              {atual && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {dataBR(atual.data)}
                </div>
              )}
            </div>
            {dif !== 0 && (
              <div style={{
                marginTop: 2,
                padding: '4px 10px', borderRadius: 20,
                background: 'rgba(28,23,18,.85)', color: 'var(--bg-soft)',
                fontSize: 12, fontWeight: 600,
              }}>
                {dif > 0 ? '+' : '−'}{Math.abs(dif).toFixed(metricaAtual.dec).replace('.', ',')} {metricaAtual.unit}
              </div>
            )}
          </div>

          {/* SVG — com linha quando ≥2 pontos, só ponto quando 1 ponto */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="weight-chart">
            <defs>
              <linearGradient id="wfade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#c4a882" stopOpacity=".3" />
                <stop offset="100%" stopColor="#c4a882" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[25, 50, 75].map(y => (
              <line key={y} x1="0" x2="100" y1={y} y2={y}
                stroke="#e6dfd3" strokeWidth=".3" strokeDasharray="1,1" />
            ))}
            {points.length >= 2 && area && <path d={area} fill="url(#wfade)" />}
            {points.length >= 2 && path && (
              <path d={path} fill="none" stroke="#1c1712" strokeWidth=".7"
                strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={points.length === 1 ? 2.5 : 1.2}
                fill="#c4a882" stroke="#1c1712" strokeWidth=".4" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          {/* Extremos da série */}
          {points.length >= 2 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px 0', fontSize: 10, color: 'var(--muted)' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', opacity: .65 }}>
                  {dadosMetrica[0]?.valor.toFixed(metricaAtual.dec).replace('.', ',')} {metricaAtual.unit}
                </div>
                <div>{dataBR(dadosMetrica[0]?.data)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', opacity: .65 }}>
                  {dadosMetrica[dadosMetrica.length - 1]?.valor.toFixed(metricaAtual.dec).replace('.', ',')} {metricaAtual.unit}
                </div>
                <div>{dataBR(dadosMetrica[dadosMetrica.length - 1]?.data)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── HISTÓRICO ────────────────────────────────────────── */}
      <div style={{ margin: '14px 0 8px', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
        Histórico de avaliações ({registros.length})
      </div>
      <div className="card" style={{ padding: 0 }}>
        {registrosRev.map((r, i, arr) => (
          <div key={r.id} style={{
            padding: '12px 16px',
            borderBottom: i === arr.length - 1 ? 'none' : '0.5px solid var(--hair-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{dataBR(r.data)}</span>
              <span className="serif" style={{ fontSize: 17 }}>
                {r.kg != null ? `${Number(r.kg).toFixed(1).replace('.', ',')} kg` : '—'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {r.cintura_cm != null && <span>Cintura {r.cintura_cm}cm</span>}
              {r.quadril_cm != null && <span>Quadril {r.quadril_cm}cm</span>}
              {r.braco_cm   != null && <span>Braço {r.braco_cm}cm</span>}
              {r.coxa_cm    != null && <span>Coxa {r.coxa_cm}cm</span>}
              {r.pgc        != null && <span>{r.pgc}% gordura</span>}
              {r.mm_kg      != null && <span>{r.mm_kg}kg massa magra</span>}
            </div>
            {/* Observações clínicas — recolhidas por padrão */}
            {r.obs && (
              <div style={{ marginTop: 6 }}>
                <button
                  onClick={() => toggleObs(r.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-sans)',
                    padding: 0, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                  <i className={`ti ti-chevron-${obsExpandido.has(r.id) ? 'up' : 'down'}`}
                     style={{ fontSize: 10 }} aria-hidden="true" />
                  {obsExpandido.has(r.id) ? 'Ocultar observação' : 'Ver observação'}
                </button>
                {obsExpandido.has(r.id) && (
                  <div style={{ fontSize: 11, color: 'var(--ink)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                    "{r.obs}"
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
