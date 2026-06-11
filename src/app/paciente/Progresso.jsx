import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

const TIPOS_FOTO = [
  { id: 'frente',          label: 'Frente' },
  { id: 'perfil_direito',  label: 'Perfil direito' },
  { id: 'perfil_esquerdo', label: 'Perfil esquerdo' },
  { id: 'costas',          label: 'Costas' },
  { id: 'livre',           label: 'Livre' },
];

// Cache de signed URLs (5 min)
const _urlCache = new Map();
async function _signedUrl(path) {
  const now = Date.now();
  const c = _urlCache.get(path);
  if (c && c.exp > now) return c.url;
  for (const [k, v] of _urlCache) { if (v.exp <= now) _urlCache.delete(k); }
  const { data } = await supabase.storage.from('fotos_evolucao').createSignedUrl(path, 300);
  if (!data) return null;
  _urlCache.set(path, { url: data.signedUrl, exp: now + 280_000 });
  return data.signedUrl;
}

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
        .select('id, data, kg, altura_cm, cintura_cm, quadril_cm, braco_cm, coxa_cm, pgc, mm_kg, obs')
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

      <FotosEvolucao />
    </>
  );
}

/* ============================================================
   FOTOS DE EVOLUÇÃO — paciente sobe as próprias
   ============================================================ */
function FotosEvolucao() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [fotos, setFotos] = useState(undefined);
  const [urls, setUrls] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [tipo, setTipo] = useState('frente');
  const [obs, setObs] = useState('');
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const fileRef = useRef(null);

  async function carregar(signal = { cancelled: false }) {
    if (!user) return;
    const { data } = await supabase
      .from('fotos_evolucao')
      .select('id, storage_path, tipo, data_foto, obs, created_at')
      .eq('paciente_id', pacienteId)
      .order('data_foto', { ascending: false });
    if (signal.cancelled) return;
    setFotos(data ?? []);
    const novas = {};
    for (const f of data ?? []) {
      if (signal.cancelled) return;
      const u = await _signedUrl(f.storage_path);
      if (u) novas[f.id] = u;
    }
    if (!signal.cancelled) setUrls(novas);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

  function escolher(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
    setRot(0);
    setFlip(false);
    setFormOpen(true);
    setErro(null);
  }

  function cancelar() {
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(null);
    setPreview(null);
    setObs('');
    setTipo('frente');
    setRot(0);
    setFlip(false);
    setFormOpen(false);
    setErro(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function transformarArquivo() {
    if (rot === 0 && !flip) return arquivo;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const swap = rot === 90 || rot === 270;
        const w = swap ? img.height : img.width;
        const h = swap ? img.width  : img.height;
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w / 2, h / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(b => {
          URL.revokeObjectURL(img.src);
          b ? resolve(b) : reject(new Error('Canvas falhou'));
        }, arquivo.type || 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Falha ao carregar imagem')); };
      img.src = URL.createObjectURL(arquivo);
    });
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione uma foto.');
    setBusy(true);
    let blob;
    try {
      blob = await transformarArquivo();
    } catch (e) {
      setBusy(false);
      return setErro('Erro ao processar: ' + e.message);
    }
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${pacienteId}/${Date.now()}-${tipo}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos_evolucao').upload(path, blob, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }
    const { error: insErr } = await supabase.from('fotos_evolucao').insert({
      paciente_id: pacienteId,
      storage_path: path,
      tipo,
      data_foto: new Date().toISOString().slice(0, 10),
      obs: obs.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('fotos_evolucao').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    cancelar();
    carregar();
  }

  async function excluirFoto(f) {
    if (!window.confirm('Excluir esta foto?')) return;
    await supabase.storage.from('fotos_evolucao').remove([f.storage_path]);
    await supabase.from('fotos_evolucao').delete().eq('id', f.id);
    carregar();
  }

  return (
    <>
      <div style={{ margin: '20px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
          Suas fotos de evolução
        </span>
        {fotos?.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fotos.length} foto{fotos.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        onChange={escolher} style={{ display: 'none' }} />

      {/* CTA topo */}
      {!formOpen && (
        <div style={{
          margin: '0 0 12px',
          border: '1.5px dashed var(--gold)',
          borderRadius: 14,
          padding: '18px 16px',
          background: 'var(--bg-soft)',
          textAlign: 'center',
        }}>
          <i className="ti ti-camera-plus" style={{ fontSize: 28, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '6px 0 4px' }}>Tirar foto de evolução</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Tire fotos periódicas (frente, perfil, costas) — a Dra. usa pra comparar e mostrar sua evolução.
          </div>
          <button className="btn primary sm" onClick={() => fileRef.current?.click()}>
            <i className="ti ti-camera" style={{ fontSize: 14 }} aria-hidden="true"></i> Tirar/escolher foto
          </button>
        </div>
      )}

      {/* Form de upload */}
      {formOpen && (
        <div className="card" style={{ padding: 14 }}>
          {preview && (() => {
            const swap = rot === 90 || rot === 270;
            const transform = `${flip ? 'scaleX(-1) ' : ''}rotate(${rot}deg)`;
            return (
              <>
                <div style={{
                  marginBottom: 8, borderRadius: 10, overflow: 'hidden',
                  background: '#000',
                  height: 320,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img src={preview} alt="prévia"
                    loading="lazy" decoding="async"
                    style={{
                      maxWidth: swap ? '320px' : '100%',
                      maxHeight: swap ? '100%' : '320px',
                      objectFit: 'contain',
                      transform,
                      transition: 'transform .18s ease',
                    }} />
                </div>
                <div style={{
                  display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
                  justifyContent: 'center',
                }}>
                  <button type="button" className="btn ghost sm"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setRot(r => (r + 270) % 360)}>
                    <i className="ti ti-rotate-2" aria-hidden="true"></i> Girar esquerda
                  </button>
                  <button type="button" className="btn ghost sm"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setRot(r => (r + 90) % 360)}>
                    <i className="ti ti-rotate-clockwise-2" aria-hidden="true"></i> Girar direita
                  </button>
                  <button type="button" className="btn ghost sm"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setFlip(f => !f)}>
                    <i className="ti ti-flip-horizontal" aria-hidden="true"></i> Espelhar
                  </button>
                  {(rot !== 0 || flip) && (
                    <button type="button" className="btn ghost sm"
                      style={{ fontSize: 11, padding: '4px 10px', color: 'var(--muted)' }}
                      onClick={() => { setRot(0); setFlip(false); }}>
                      <i className="ti ti-refresh" aria-hidden="true"></i> Resetar
                    </button>
                  )}
                </div>
              </>
            );
          })()}

          <label style={{ fontSize: 10, letterSpacing: '.04em', color: 'var(--ink-soft)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Tipo de foto
          </label>
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13,
              background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
              borderRadius: 10, outline: 'none', marginBottom: 10,
              fontFamily: 'var(--font-sans)',
            }}>
            {TIPOS_FOTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          <label style={{ fontSize: 10, letterSpacing: '.04em', color: 'var(--ink-soft)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Observação (opcional)
          </label>
          <input value={obs} onChange={e => setObs(e.target.value)}
            placeholder="Ex: 1 mês de plano"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13,
              background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
              borderRadius: 10, outline: 'none',
              fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
            }} />

          {erro && (
            <div style={{
              fontSize: 11, color: 'var(--red)', background: 'var(--red-soft)',
              padding: '6px 10px', borderRadius: 8, marginTop: 8,
            }}>{erro}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={cancelar} disabled={busy} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button className="btn primary" onClick={enviar} disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Enviando...' : 'Salvar foto'}
            </button>
          </div>
        </div>
      )}

      {/* Galeria */}
      {fotos === undefined ? null : fotos.length === 0 && !formOpen ? (
        <div style={{ padding: '8px 16px 16px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Nenhuma foto ainda — suas fotos aparecerão aqui.
        </div>
      ) : (
        <div style={{
          margin: '0',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        }}>
          {fotos.map(f => (
            <div key={f.id} style={{
              position: 'relative', aspectRatio: '3/4',
              borderRadius: 10, overflow: 'hidden',
              background: 'var(--bg-deep)',
            }}>
              {urls[f.id] ? (
                <img src={urls[f.id]} alt=""
                  loading="lazy" decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-photo" style={{ fontSize: 24, color: 'var(--muted-2)' }} aria-hidden="true"></i>
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,.65), transparent)',
                color: 'white', padding: '14px 6px 4px',
                fontSize: 9, textAlign: 'center', fontWeight: 500,
              }}>
                {dataBR(f.data_foto)}
              </div>
              <button onClick={() => excluirFoto(f)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,.55)', color: 'white',
                  border: 'none', borderRadius: '50%',
                  width: 24, height: 24, fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <i className="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
