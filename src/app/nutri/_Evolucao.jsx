import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { formatarResposta } from '../../lib/checkinDefault.js';
import { diasEntre, ehEmagrecimento } from '../../lib/resultadosClinicos.js';
import {
  METRICAS, PERIODOS, serieDaMetrica, comparar, sentidoDaVariacao, detectarSuspeitas,
  composicaoCorporal, fraseComposicao, fmtNum, fmtValor, fmtDelta, rotuloTipoConsulta,
  descricaoAvaliacao, descricaoPlano, resumoCheckin,
} from '../../lib/evolucaoAvaliacoes.js';

// Avaliações "ignoradas nas contas" ficam só neste navegador (não apagam nada).
const chaveIgnoradas = (pacienteId) => `lapidare:evolucaoIgnoradas:${pacienteId}`;
function lerIgnoradas(pacienteId) {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveIgnoradas(pacienteId)) ?? '[]');
    return new Set(Array.isArray(bruto) ? bruto : []);
  } catch { return new Set(); }
}
const CARTOES = ['kg', 'cintura_cm', 'pgc'];

export default function Evolucao({ pacienteId, paciente, nutriId }) {
  const [carregando, setCarregando] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [apresentacao, setApresentacao] = useState(false);
  const [verCheckin, setVerCheckin] = useState(null);
  const [periodo, setPeriodo] = useState('inicio');
  const [guardadas, setGuardadas] = useState(() => ({ id: pacienteId, set: lerIgnoradas(pacienteId) }));
  const [metricaGrafico, setMetricaGrafico] = useState('kg');

  // Se a ficha trocou de paciente, relê do navegador (sem efeito: deriva no render).
  const ignoradas = useMemo(
    () => (guardadas.id === pacienteId ? guardadas.set : lerIgnoradas(pacienteId)),
    [guardadas, pacienteId],
  );

  function alternarIgnorada(id) {
    const nova = new Set(ignoradas);
    if (nova.has(id)) nova.delete(id); else nova.add(id);
    try { localStorage.setItem(chaveIgnoradas(pacienteId), JSON.stringify([...nova])); } catch { /* sem storage */ }
    setGuardadas({ id: pacienteId, set: nova });
  }

  async function carregar(signal = { cancelled: false }) {
    const [avRes, ckRes, plRes, prRes, csRes] = await Promise.all([
      supabase.from('peso_registros').select('id,data,kg,altura_cm,pgc,mm_kg,mm_pct,gordura_kg,cintura_cm,quadril_cm,abdome_cm,braco_cm,braco_dir_cm,braco_esq_cm,coxa_cm,coxa_dir_cm,coxa_esq_cm,panturrilha_cm,hidratacao_pct,geb_kcal,get_kcal,obs').eq('paciente_id', pacienteId).order('data'),
      supabase.from('checkin_envios').select('id, perguntas, respostas, respondido_em, enviado_em').eq('paciente_id', pacienteId).not('respondido_em', 'is', null).order('respondido_em'),
      supabase.from('planos').select('id, dados, publicado_em').eq('paciente_id', pacienteId).order('publicado_em'),
      supabase.from('prescricoes').select('id, tipo, titulo, created_at').eq('paciente_id', pacienteId).order('created_at'),
      supabase.from('consultas').select('id, tipo, data_hora, status').eq('paciente_id', pacienteId).order('data_hora'),
    ]);
    if (signal.cancelled) return;
    setAvaliacoes(avRes.data ?? []);
    setCheckins(ckRes.data ?? []);
    setPlanos(plRes.data ?? []);
    setPrescricoes(prRes.data ?? []);
    setConsultas(csRes.data ?? []);
    setCarregando(false);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  // ESC pra sair do modo apresentação
  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e) => { if (e.key === 'Escape') setApresentacao(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  // ─── Highlights ───
  // Cada métrica tem o seu próprio "início" (primeiro registro COM aquela medida).
  const pesoNeutro = !ehEmagrecimento(paciente);
  const series = useMemo(() => {
    const out = {};
    for (const campo of Object.keys(METRICAS)) out[campo] = serieDaMetrica(avaliacoes, campo, ignoradas);
    return out;
  }, [avaliacoes, ignoradas]);
  const comparacoes = useMemo(() => {
    const out = {};
    for (const campo of Object.keys(METRICAS)) out[campo] = comparar(series[campo], periodo);
    return out;
  }, [series, periodo]);
  const suspeitas = useMemo(() => detectarSuspeitas(avaliacoes, ignoradas), [avaliacoes, ignoradas]);
  const composicao = useMemo(() => composicaoCorporal(avaliacoes, periodo, ignoradas), [avaliacoes, periodo, ignoradas]);
  const avaliacoesPorId = useMemo(() => new Map(avaliacoes.map((a) => [a.id, a])), [avaliacoes]);

  const validas = avaliacoes.filter((a) => !ignoradas.has(a.id));
  const primeira = validas[0];
  const ultima   = validas[validas.length - 1];
  const totalDias = primeira && ultima ? diasEntre(primeira.data, ultima.data) : 0;
  const metricasDoGrafico = Object.keys(METRICAS).filter((c) => series[c].length >= 2);
  const campoGrafico = metricasDoGrafico.includes(metricaGrafico) ? metricaGrafico : metricasDoGrafico[0];

  // ─── Timeline consolidada ───
  const eventos = useMemo(() => {
    const lst = [];
    for (const a of avaliacoes) {
      lst.push({
        data: new Date(a.data + 'T12:00:00').toISOString(),
        tipo: 'avaliacao', icon: 'scale', cor: '#1a5a8c',
        titulo: 'Avaliação antropométrica',
        desc: descricaoAvaliacao(a),
        avaliacaoId: a.id,
      });
    }
    for (const c of checkins) {
      lst.push({
        data: c.respondido_em,
        tipo: 'checkin', icon: 'clipboard-check', cor: 'var(--green)',
        titulo: 'Check-in respondido',
        desc: resumoCheckin(c, formatarResposta),
        checkinId: c.id,
        checkin: c,
      });
    }
    for (const p of planos) {
      lst.push({
        data: p.publicado_em,
        tipo: 'plano', icon: 'salad', cor: 'var(--amber)',
        titulo: 'Plano alimentar publicado',
        desc: descricaoPlano(p.dados),
      });
    }
    for (const p of prescricoes) {
      lst.push({
        data: p.created_at,
        tipo: 'prescricao', icon: 'file-text', cor: 'var(--blue)',
        titulo: `Prescrição · ${p.tipo}`,
        desc: p.titulo,
      });
    }
    for (const c of consultas.filter(c => c.status === 'realizada')) {
      lst.push({
        data: c.data_hora,
        tipo: 'consulta', icon: 'calendar-check', cor: 'var(--green)',
        titulo: rotuloTipoConsulta(c.tipo),
        desc: null,
      });
    }
    return lst.sort((a, b) => b.data.localeCompare(a.data));  // mais recente primeiro
  }, [avaliacoes, checkins, planos, prescricoes, consultas]);

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando linha do tempo…</div></div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-history empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Sem registros de evolução ainda</div>
        <div className="empty-sub">
          Conforme você registrar avaliações antropométricas e a paciente responder check-ins,
          tudo vai aparecer aqui em ordem cronológica.
        </div>
      </div>
    );
  }

  // ─── Modo apresentação ───
  if (apresentacao) {
    return (
      <ModoApresentacao
        paciente={paciente}
        series={series}
        comparacoes={comparacoes}
        periodo={periodo}
        pesoNeutro={pesoNeutro}
        composicao={composicao}
        totalDias={totalDias}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {totalDias > 0 && <>Acompanhamento de <strong style={{ color: 'var(--dark)' }}>{totalDias} dia{totalDias === 1 ? '' : 's'}</strong> · </>}
          {eventos.length} evento{eventos.length === 1 ? '' : 's'} no histórico
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setApresentacao(true)}>
            <i className="ti ti-presentation" aria-hidden="true"></i> Modo apresentação
          </button>
        </div>
      </div>

      {/* Período + avisos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <label htmlFor="evo-periodo" style={{ fontSize: 12, color: 'var(--text3)' }}>Comparar</label>
        <select id="evo-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
          style={{ width: 'auto', maxWidth: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--white)', color: 'var(--dark)' }}>
          {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <AvisoSuspeitas suspeitas={suspeitas} porId={avaliacoesPorId}
        ignoradas={ignoradas} onIgnorar={alternarIgnorada} />

      {/* Highlights */}
      <div className="stats-grid">
        {CARTOES.map((campo) => (
          <CartaoMetrica key={campo} campo={campo} serie={series[campo]} comp={comparacoes[campo]}
            pesoNeutro={pesoNeutro} />
        ))}
        <div className="stat-card">
          <div className="stat-label">Adesão check-ins</div>
          <div className="stat-val">{checkins.length}</div>
          <div className="stat-sub">respondidos no total</div>
        </div>
      </div>

      {composicao && (
        <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
          <div className="stat-label" style={{ marginBottom: 6 }}>Composição corporal</div>
          <div style={{ fontSize: 15, color: 'var(--dark)', fontWeight: 500 }}>{fraseComposicao(composicao)}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Gordura {fmtDelta('gordura_kg', composicao.gorduraDif)} · massa magra {fmtDelta('mm_kg', composicao.massaMagraDif)}
            {' '}· de {dataBR(composicao.deData)} a {dataBR(composicao.ateData)} ({composicao.dias} dia{composicao.dias === 1 ? '' : 's'})
          </div>
        </div>
      )}

      {campoGrafico && (
        <GraficoEvolucao
          metricas={metricasDoGrafico} campo={campoGrafico} onTrocar={setMetricaGrafico}
          serie={series[campoGrafico]} suspeitas={suspeitas}
          consultas={consultas.filter((c) => c.status === 'realizada')}
          planos={planos} />
      )}

      {/* Timeline */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Linha do tempo</div>
        <span className="card-sub">mais recente primeiro</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28, marginTop: 8 }}>
        {/* Linha vertical */}
        <div style={{
          position: 'absolute', left: 11, top: 0, bottom: 0,
          width: 2, background: 'var(--border)',
        }} />
        {eventos.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            {/* Ponto */}
            <div style={{
              position: 'absolute', left: -22, top: 14,
              width: 16, height: 16, borderRadius: '50%',
              background: ev.cor,
              border: '2px solid var(--white)',
              boxShadow: '0 0 0 1px var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`ti ti-${ev.icon}`} style={{ fontSize: 9, color: 'var(--white)' }} aria-hidden="true"></i>
            </div>
            {/* Card do evento */}
            <div
              className="card"
              style={{
                padding: '12px 14px', marginBottom: 0,
                cursor: ev.checkinId ? 'pointer' : 'default',
              }}
              onClick={() => ev.checkinId && setVerCheckin(ev.checkin)}>
              <div style={{
                fontSize: 10, color: ev.cor, letterSpacing: '.5px',
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
              }}>
                {dataBR(ev.data)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>{ev.titulo}</div>
              {ev.desc && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{ev.desc}</div>
              )}
              {ev.checkinId && (
                <div style={{ fontSize: 10, color: 'var(--gold-deep, #a08456)', marginTop: 4 }}>
                  toque para ver respostas →
                </div>
              )}
              {ev.avaliacaoId != null && (
                <LinhaAvaliacao
                  ignorada={ignoradas.has(ev.avaliacaoId)}
                  suspeita={suspeitas.get(ev.avaliacaoId)}
                  onAlternar={() => alternarIgnorada(ev.avaliacaoId)} />
              )}
            </div>
          </div>
        ))}
      </div>

      {verCheckin && (
        <VerCheckinModal envio={verCheckin} onClose={() => setVerCheckin(null)} />
      )}
    </>
  );
}

/* ============================================================
   CARTÃO DE MÉTRICA (valor atual + variação com data-base)
   ============================================================ */
function CartaoMetrica({ campo, serie, comp, pesoNeutro }) {
  const m = METRICAS[campo];
  const atual = serie[serie.length - 1];
  if (!atual) {
    return (
      <div className="stat-card" style={{ opacity: .5 }}>
        <div className="stat-label">{m.rotulo} atual</div>
        <div className="stat-val">—</div>
        <div className="stat-sub">sem registro</div>
      </div>
    );
  }
  const sentido = comp ? sentidoDaVariacao(campo, comp.dif, { pesoNeutro }) : 'neutro';
  const cor = sentido === 'bom' ? 'var(--green)' : sentido === 'ruim' ? 'var(--red)' : 'var(--text3)';
  return (
    <div className="stat-card">
      <div className="stat-label">{m.rotulo} atual</div>
      <div className="stat-val">
        {fmtNum(atual.valor, m.casas)}
        <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 3 }}>{m.unidade === '%' ? '%' : ` ${m.unidade}`}</span>
      </div>
      {comp ? (
        <>
          <div className="stat-sub" style={{ color: cor, fontWeight: 500 }}>{fmtDelta(campo, comp.dif)}</div>
          <div className="stat-sub">
            desde {dataBR(comp.base.data)} ({fmtValor(campo, comp.base.valor)}) · {comp.dias} dia{comp.dias === 1 ? '' : 's'}
          </div>
        </>
      ) : (
        <div className="stat-sub">
          {serie.length === 1 ? `só uma avaliação (${dataBR(atual.data)})` : 'sem base para comparar'}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   AVISO "CONFERIR" (salto improvável) — não apaga nada
   ============================================================ */
function AvisoSuspeitas({ suspeitas, porId, ignoradas, onIgnorar }) {
  const itens = [...suspeitas.entries()];
  const ignoradasLista = [...ignoradas].map((id) => porId.get(id)).filter(Boolean);
  if (itens.length === 0 && ignoradasLista.length === 0) return null;
  return (
    <div role="status" style={{
      background: '#fbf3df', border: '0.5px solid #e3cf9c', borderRadius: 10,
      padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--dark)',
    }}>
      {itens.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            <i className="ti ti-alert-triangle" aria-hidden="true"></i>{' '}
            {itens.length === 1 ? 'Uma avaliação para conferir' : `${itens.length} avaliações para conferir`}
          </div>
          {itens.map(([id, sus]) => {
            const av = porId.get(id);
            return (
              <div key={id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '4px 0' }}>
                <span>
                  {dataBR(av?.data)}: {METRICAS[sus.campo].rotulo.toLowerCase()} {fmtDelta(sus.campo, sus.dif)} em {sus.dias} dia{sus.dias === 1 ? '' : 's'}
                  {' '}(vs {dataBR(sus.deData)}). Pode ser erro de digitação.
                </span>
                <button className="btn-outline" onClick={() => onIgnorar(id)}>Ignorar nas contas</button>
              </div>
            );
          })}
        </>
      )}
      {ignoradasLista.length > 0 && (
        <div style={{ marginTop: itens.length ? 8 : 0, color: 'var(--text2)' }}>
          Ignoradas nas contas (continuam salvas, só neste navegador):{' '}
          {ignoradasLista.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ' · '}{dataBR(a.data)}{' '}
              <button className="btn-outline" onClick={() => onIgnorar(a.id)}>Voltar a usar</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Selo + botão dentro do card da avaliação na linha do tempo. */
function LinhaAvaliacao({ ignorada, suspeita, onAlternar }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
      {ignorada && <span style={{ fontSize: 11, color: 'var(--text3)' }}>ignorada nas contas</span>}
      {!ignorada && suspeita && (
        <span style={{ fontSize: 11, color: '#8a6a1c', fontWeight: 600 }}>conferir</span>
      )}
      <button className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}
        onClick={(e) => { e.stopPropagation(); onAlternar(); }}>
        {ignorada ? 'Voltar a usar' : 'Ignorar nas contas'}
      </button>
    </div>
  );
}

/* ============================================================
   GRÁFICO DE EVOLUÇÃO (uma métrica por vez, com consultas e planos)
   ============================================================ */
function GraficoEvolucao({ metricas, campo, onTrocar, serie, suspeitas, consultas, planos }) {
  const m = METRICAS[campo];
  const L = 600, A = 220, ml = 44, mr = 14, mt = 14, mb = 28;
  const dia = (iso) => Date.UTC(...String(iso).slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const t0 = dia(serie[0].data);
  const t1 = dia(serie[serie.length - 1].data);
  const span = Math.max(t1 - t0, 1);
  const vals = serie.map((p) => p.valor);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const folga = (vmax - vmin) * 0.15 || 1;
  const lo = vmin - folga, hi = vmax + folga;
  const x = (t) => ml + ((t - t0) / span) * (L - ml - mr);
  const y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (A - mt - mb);
  const pontos = serie.map((p) => ({ ...p, cx: x(dia(p.data)), cy: y(p.valor) }));
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const dentro = (iso) => { if (!iso) return null; const t = dia(iso); return t >= t0 && t <= t1 ? t : null; };
  const marcas = [
    ...consultas.map((c) => ({ t: dentro(c.data_hora), cor: 'var(--green)', nome: `${rotuloTipoConsulta(c.tipo)} · ${dataBR(c.data_hora)}` })),
    ...planos.map((p) => ({ t: dentro(p.publicado_em), cor: 'var(--amber)', nome: `Plano publicado · ${dataBR(p.publicado_em)}` })),
  ].filter((mk) => mk.t != null);
  return (
    <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="stat-label">Evolução no tempo</div>
        <div role="group" aria-label="Métrica do gráfico" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {metricas.map((c) => (
            <button key={c} type="button" aria-pressed={c === campo}
              className={c === campo ? 'btn' : 'btn-outline'} style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onTrocar(c)}>
              {METRICAS[c].rotulo}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label={`Gráfico de ${m.rotulo.toLowerCase()}: de ${fmtValor(campo, serie[0].valor)} em ${dataBR(serie[0].data)} a ${fmtValor(campo, serie[serie.length - 1].valor)} em ${dataBR(serie[serie.length - 1].data)}`}>
        {[hi - folga * 0.3, (hi + lo) / 2, lo + folga * 0.3].map((v, i) => (
          <g key={i}>
            <line x1={ml} x2={L - mr} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--hair-soft, #e7dfd0)' }} strokeWidth="1" />
            <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--text3)' }}>{fmtNum(v, 1)}</text>
          </g>
        ))}
        {marcas.map((mk, i) => (
          <line key={i} x1={x(mk.t)} x2={x(mk.t)} y1={mt} y2={A - mb} strokeDasharray="3 3" strokeWidth="1.2" style={{ stroke: mk.cor }}>
            <title>{mk.nome}</title>
          </line>
        ))}
        <path d={linha} fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--gold-deep, #a08456)' }} />
        {pontos.map((p) => {
          const sus = suspeitas.has(p.id) && suspeitas.get(p.id).campo === campo;
          return (
            <circle key={p.id} cx={p.cx} cy={p.cy} r={sus ? 5 : 4} strokeWidth="2"
              style={{ stroke: sus ? '#c0883a' : 'var(--gold-deep, #a08456)', fill: sus ? 'var(--white)' : 'var(--dark)' }}>
              <title>{`${dataBR(p.data)} · ${fmtValor(campo, p.valor)}${sus ? ' · conferir' : ''}`}</title>
            </circle>
          );
        })}
        <text x={pontos[0].cx} y={A - 8} textAnchor="start" fontSize="11" style={{ fill: 'var(--text3)' }}>{dataBR(serie[0].data)}</text>
        <text x={pontos[pontos.length - 1].cx} y={A - 8} textAnchor="end" fontSize="11" style={{ fill: 'var(--text3)' }}>{dataBR(serie[serie.length - 1].data)}</text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        <span>● avaliação</span>
        <span style={{ color: '#c0883a' }}>○ conferir</span>
        <span style={{ color: 'var(--green)' }}>┆ consulta realizada</span>
        <span style={{ color: 'var(--amber)' }}>┆ plano publicado</span>
      </div>
    </div>
  );
}

/* ============================================================
   MODO APRESENTAÇÃO (fullscreen pra consulta)
   ============================================================ */
function ModoApresentacao({ paciente, series, comparacoes, periodo, pesoNeutro, composicao, totalDias, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      zIndex: 200,
      overflow: 'auto',
      padding: '40px 32px',
    }}>
      <button onClick={onClose} style={{
        position: 'fixed', top: 20, right: 20,
        background: 'var(--dark)', color: 'var(--white)',
        border: 'none', borderRadius: 8, padding: '8px 14px',
        cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        zIndex: 201,
      }}>
        <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
      </button>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', marginBottom: 8,
        }}>
          Evolução
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 4, lineHeight: 1.1,
        }}>
          {paciente?.nome}
        </h1>
        {totalDias > 0 && (
          <div style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 32 }}>
            {totalDias} dias de acompanhamento
          </div>
        )}

        {/* Stats grandes */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14, marginBottom: 36,
        }}>
          {CARTOES.map((campo) => {
            const serie = series[campo];
            const atual = serie[serie.length - 1];
            if (!atual) return null;
            const comp = comparacoes[campo];
            const sentido = comp ? sentidoDaVariacao(campo, comp.dif, { pesoNeutro }) : 'neutro';
            const corDelta = sentido === 'bom' ? 'var(--green)' : sentido === 'ruim' ? 'var(--red)' : 'var(--text3)';
            return (
              <div key={campo} style={{
                background: 'var(--white)', border: '0.5px solid var(--border)',
                borderRadius: 14, padding: '24px 28px',
              }}>
                <div style={{
                  fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                }}>{METRICAS[campo].rotulo}</div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 600,
                  color: 'var(--dark)', lineHeight: 1,
                }}>
                  {fmtNum(atual.valor, 1)}
                  <span style={{ fontSize: 22, color: 'var(--text3)', marginLeft: 6 }}>{METRICAS[campo].unidade}</span>
                </div>
                {comp && (
                  <div style={{
                    fontSize: 18, fontWeight: 500, color: corDelta,
                    marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                  }}>
                    {fmtDelta(campo, comp.dif)}
                    <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 6, fontWeight: 400 }}>
                      desde {dataBR(comp.base.data)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {composicao && (
          <div style={{
            background: 'var(--white)', border: '0.5px solid var(--border)', borderRadius: 14,
            padding: '20px 28px', marginBottom: 36, fontSize: 20, color: 'var(--dark)',
            fontFamily: 'var(--font-serif)',
          }}>
            {fraseComposicao(composicao)}
            <span style={{ display: 'block', fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', marginTop: 6 }}>
              {PERIODOS[periodo]} · desde {dataBR(composicao.deData)}
            </span>
          </div>
        )}

        {CARTOES.every((c) => series[c].length === 0) && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            Sem avaliações antropométricas registradas ainda.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MODAL DE VER RESPOSTAS DO CHECK-IN
   ============================================================ */
function VerCheckinModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  return (
    <ModalShell title="Respostas do check-in"
      subtitle={`Respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose} large>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 600 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
