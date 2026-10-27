import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import { diasEntre, ehEmagrecimento } from '../../lib/resultadosClinicos.js';
import {
  METRICAS, serieDaMetrica, comparar, sentidoDaVariacao, composicaoCorporal,
  fraseComposicao, fmtNum, fmtValor, fmtDelta,
} from '../../lib/evolucaoAvaliacoes.js';

// Ordem dos botões/cartões. Quadril só aparece se houver registro.
const ORDEM = ['kg', 'cintura_cm', 'pgc', 'mm_kg', 'quadril_cm', 'braco_cm', 'coxa_cm'];
const CARTOES = ['kg', 'cintura_cm', 'pgc', 'mm_kg'];
const MANUSCRITA = "'Caveat', 'Bradley Hand', cursive";

/* Sinaleira: só para Emagrecimento. Verde = foi no sentido desejado, amarelo = estável,
   terracota = foi no sentido contrário. Sempre com seta/sinal (cor não é o único aviso).
   Oncologia: sem semáforo — o foco é função e força. */
const SINAL = {
  bom:    { cor: '#5f8a4b', fundo: '#e6f0df', nome: 'no caminho' },
  neutro: { cor: '#b8902f', fundo: '#f8efd2', nome: 'estável' },
  ruim:   { cor: '#c0704f', fundo: '#f6e3db', nome: 'mudou ao contrário' },
};
function sinalDe(campo, comp, pesoNeutro) {
  if (!comp) return null;
  const sentido = sentidoDaVariacao(campo, comp.dif);
  if (pesoNeutro || METRICAS[campo].melhorMenor == null) return null; // sem sentido definido: sem cor
  return SINAL[sentido];
}

const ENTENDA = [
  ['Peso', 'Quanto você pesa na balança no dia da avaliação.'],
  ['Cintura', 'A medida ao redor da cintura, feita com fita métrica.'],
  ['% de gordura', 'Quanto do seu corpo é gordura, em porcentagem.'],
  ['Massa magra', 'Músculos, ossos e água: tudo o que não é gordura.'],
];

/** "4 meses e 12 dias", "3 semanas", "5 dias". */
function tempoDe(dias) {
  if (dias < 1) return 'hoje';
  if (dias < 14) return `${dias} dia${dias === 1 ? '' : 's'}`;
  if (dias < 60) { const s = Math.floor(dias / 7); return `${s} semanas`; }
  const m = Math.floor(dias / 30);
  return `${m} meses`;
}

export default function Progresso() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [registros, setRegistros] = useState(undefined);
  const [metrica, setMetrica] = useState('kg');
  const [obsExpandido, setObsExpandido] = useState(new Set());
  const [verTodas, setVerTodas] = useState(false);
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
        .select('id, data, kg, cintura_cm, quadril_cm, braco_cm, coxa_cm, pgc, mm_kg, gordura_kg, obs')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: true });
      if (!active) return;
      setRegistros(data ?? []);
    }
    load();
    return () => { active = false; };
  }, [pacienteId]);

  // Em oncologia o foco é função e força: peso nunca é "bom" nem "ruim".
  const pesoNeutro = !ehEmagrecimento(profile);

  const series = useMemo(() => {
    const out = {};
    for (const c of ORDEM) out[c] = serieDaMetrica(registros ?? [], c);
    return out;
  }, [registros]);
  const comps = useMemo(() => {
    const out = {};
    for (const c of ORDEM) out[c] = comparar(series[c], 'inicio');
    return out;
  }, [series]);
  const composicao = useMemo(
    () => (pesoNeutro ? null : composicaoCorporal(registros ?? [], 'inicio')),
    [registros, pesoNeutro],
  );

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

  const disponiveis = ORDEM.filter(c => series[c].length > 0);
  const campo = disponiveis.includes(metrica) ? metrica : disponiveis[0];
  const serie = series[campo] ?? [];

  const primeiraData = registros[0].data;
  const ultimaData = registros[registros.length - 1].data;
  const diasTotal = diasEntre(primeiraData, ultimaData);
  const pesoComp = comps.kg;
  const registrosRev = [...registros].reverse();
  const visiveis = verTodas ? registrosRev : registrosRev.slice(0, 3);

  return (
    <>
      {/* ─── RESUMO EM LINGUAGEM SIMPLES ─────────────────────── */}
      <div className="card dark" style={{ padding: '16px 18px', marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', opacity: .7, marginBottom: 6 }}>
          Sua jornada
        </div>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.25, fontWeight: 500 }}>
          {registros.length === 1
            ? 'Sua primeira avaliação foi registrada.'
            : `Você está há ${tempoDe(diasTotal)} em acompanhamento.`}
        </div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 6, lineHeight: 1.5 }}>
          {registros.length} avaliaç{registros.length === 1 ? 'ão' : 'ões'} registrada{registros.length === 1 ? '' : 's'}
          {pesoComp && <> · seu peso foi de <strong>{fmtValor('kg', pesoComp.base.valor)}</strong> para <strong>{fmtValor('kg', pesoComp.atual.valor)}</strong></>}
          {composicao && <><br />{fraseComposicao(composicao)}</>}
        </div>
      </div>

      {/* ─── "ONDE VOCÊ COMEÇOU → ONDE ESTÁ" ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {disponiveis.filter(c => CARTOES.includes(c)).map(c => {
          const mc = METRICAS[c];
          const atual = series[c][series[c].length - 1];
          const comp = comps[c];
          const sinal = sinalDe(c, comp, pesoNeutro);
          const ativo = c === campo;
          return (
            <button key={c} type="button" onClick={() => setMetrica(c)} aria-pressed={ativo}
              style={{
                textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                background: 'var(--paper)', color: 'var(--ink)', borderRadius: 16, padding: '12px 14px',
                border: ativo ? '1.5px solid var(--gold-deep)' : '0.5px solid var(--hair)',
              }}>
              <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
                {mc.rotulo}
              </div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1, marginTop: 2 }}>
                {fmtNum(atual.valor, mc.casas)}
                <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 3 }}>{mc.unidade}</span>
              </div>
              {comp ? (
                <>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: sinal ? sinal.fundo : 'var(--bg-soft, #f5f0e8)',
                    color: sinal ? sinal.cor : 'var(--ink-soft)',
                  }}>
                    {sinal && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: sinal.cor }} />}
                    {fmtDelta(c, comp.dif)}{sinal && <span style={{ fontWeight: 500 }}> · {sinal.nome}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    começou em {fmtValor(c, comp.base.valor)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                  primeira medida · {dataBR(atual.data)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── BONEQUINHO: toque numa parte do corpo ───────────── */}
      <Bonequinho series={series} comps={comps} pesoNeutro={pesoNeutro}
        onEscolher={(c) => setMetrica(c)} />

      {/* ─── GRÁFICO ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, margin: '0 0 8px' }}>
        {disponiveis.map(c => {
          const ativo = c === campo;
          return (
            <button key={c} type="button" onClick={() => setMetrica(c)} aria-pressed={ativo}
              style={{
                flexShrink: 0, padding: '6px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                background: ativo ? 'var(--ink)' : 'var(--paper)',
                color: ativo ? 'var(--bg-soft)' : 'var(--ink)',
                fontWeight: 500, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                border: ativo ? 'none' : '0.5px solid var(--hair)',
              }}>
              {METRICAS[c].rotulo}
            </button>
          );
        })}
      </div>
      <Grafico campo={campo} serie={serie} sinal={sinalDe(campo, comps[campo], pesoNeutro)} comp={comps[campo]} />

      {/* ─── COMPOSIÇÃO CORPORAL (barras início × agora) ─────── */}
      {composicao && <BarrasComposicao registros={registros} composicao={composicao} />}

      {/* ─── ENTENDA AS MEDIDAS ──────────────────────────────── */}
      <details className="card" style={{ padding: '12px 16px', marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>O que cada medida significa?</summary>
        <div style={{ marginTop: 8 }}>
          {ENTENDA.map(([t, d]) => (
            <div key={t} style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '6px 0', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--ink)' }}>{t}:</strong> {d}
            </div>
          ))}
        </div>
      </details>

      {/* ─── HISTÓRICO ────────────────────────────────────────── */}
      <div style={{ margin: '14px 0 8px', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
        Histórico de avaliações ({registros.length})
      </div>
      <div className="card" style={{ padding: 0 }}>
        {visiveis.map((r, i, arr) => (
          <div key={r.id} style={{
            padding: '12px 16px',
            borderBottom: i === arr.length - 1 ? 'none' : '0.5px solid var(--hair-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{dataBR(r.data)}</span>
              <span className="serif" style={{ fontSize: 17 }}>
                {r.kg != null ? fmtValor('kg', r.kg) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {r.cintura_cm != null && <span>Cintura {fmtValor('cintura_cm', r.cintura_cm)}</span>}
              {r.quadril_cm != null && <span>Quadril {fmtValor('quadril_cm', r.quadril_cm)}</span>}
              {r.braco_cm   != null && <span>Braço {fmtNum(r.braco_cm, 1)} cm</span>}
              {r.coxa_cm    != null && <span>Coxa {fmtNum(r.coxa_cm, 1)} cm</span>}
              {r.pgc        != null && <span>{fmtValor('pgc', r.pgc)} de gordura</span>}
              {r.mm_kg      != null && <span>{fmtValor('mm_kg', r.mm_kg)} de massa magra</span>}
            </div>
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
        {registros.length > 3 && (
          <button type="button" onClick={() => setVerTodas(v => !v)}
            style={{
              width: '100%', padding: '10px', background: 'none', border: 'none', borderTop: '0.5px solid var(--hair-soft)',
              cursor: 'pointer', fontSize: 12, color: 'var(--gold-deep)', fontFamily: 'var(--font-sans)', fontWeight: 500,
            }}>
            {verTodas ? 'Mostrar menos' : `Ver todas as ${registros.length} avaliações`}
          </button>
        )}
      </div>
    </>
  );
}

/* Gráfico "à mão": linha com leve tremor, balão de fala e seta no último ponto. */
function Grafico({ campo, serie, sinal, comp }) {
  const m = METRICAS[campo];
  if (serie.length === 0) {
    return (
      <div className="card" style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
        Ainda não há dados de {m.rotulo.toLowerCase()}.
      </div>
    );
  }
  const L = 320, A = 200, ml = 18, mr = 18, mt = 62, mb = 26;
  const vals = serie.map(p => p.valor);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const folga = (vmax - vmin) * 0.2 || 1;
  const lo = vmin - folga, hi = vmax + folga;
  const n = serie.length;
  const x = (i) => (n === 1 ? L / 2 : ml + (i / (n - 1)) * (L - ml - mr));
  const y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (A - mt - mb);
  const pts = serie.map((p, i) => ({ ...p, cx: x(i), cy: y(p.valor) }));
  const fim = pts[n - 1];
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const cor = sinal ? sinal.cor : '#1c1712';

  // Balão acima do último ponto, sem sair do quadro.
  const bw = 150, bh = 40;
  const bx = Math.min(Math.max(fim.cx - bw / 2, 4), L - bw - 4);
  const by = 6;
  const caudaX = Math.min(Math.max(fim.cx, bx + 18), bx + bw - 18);
  const seta = comp ? (comp.dif > 0 ? '↑' : comp.dif < 0 ? '↓' : '→') : '';
  const frase2 = comp
    ? `${seta} ${fmtDelta(campo, comp.dif)} desde ${dataBR(comp.base.data).slice(0, 5)}`
    : 'ponto de partida';
  return (
    <div className="card" style={{ padding: '12px 8px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', padding: '0 8px 2px' }}>
        {m.rotulo} ao longo do tempo
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label={`${m.rotulo}: de ${fmtValor(campo, serie[0].valor)} em ${dataBR(serie[0].data)} para ${fmtValor(campo, fim.valor)} em ${dataBR(fim.data)}`}>
        <defs>
          <filter id="rab-g" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="r" />
            <feDisplacementMap in="SourceGraphic" in2="r" scale="2.6" />
          </filter>
          <linearGradient id="evo-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c4a882" stopOpacity=".3" />
            <stop offset="100%" stopColor="#c4a882" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.33, 0.66].map(f => (
          <line key={f} x1={ml} x2={L - mr} y1={mt + f * (A - mt - mb)} y2={mt + f * (A - mt - mb)}
            stroke="#d9d3c9" strokeWidth=".8" strokeDasharray="3,4" filter="url(#rab-g)" />
        ))}
        {n >= 2 && (
          <path d={`${linha} L${fim.cx.toFixed(1)},${A - mb} L${pts[0].cx.toFixed(1)},${A - mb} Z`} fill="url(#evo-fade)" />
        )}
        <g filter="url(#rab-g)">
          {n >= 2 && <path d={linha} fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
          {pts.map((p, i) => (
            <circle key={p.id} cx={p.cx} cy={p.cy} r={i === n - 1 ? 6 : 3.8}
              fill={i === n - 1 ? cor : '#fff'} stroke={cor} strokeWidth="2" />
          ))}
        </g>
        {/* primeiro valor, escrito à mão */}
        {n >= 2 && (
          <text x={pts[0].cx} y={pts[0].cy - 12} textAnchor="start" fontSize="16" fontWeight="700" fill="#8c7b6b"
            style={{ fontFamily: MANUSCRITA }}>{fmtNum(pts[0].valor, m.casas)}</text>
        )}
        {/* balão de fala com cauda apontando para o ponto de hoje */}
        <g filter="url(#rab-g)">
          <path d={`M${bx + 10},${by} H${bx + bw - 10} Q${bx + bw},${by} ${bx + bw},${by + 10} V${by + bh - 10} Q${bx + bw},${by + bh} ${bx + bw - 10},${by + bh} H${caudaX + 8} L${fim.cx},${fim.cy - 9} L${caudaX - 8},${by + bh} H${bx + 10} Q${bx},${by + bh} ${bx},${by + bh - 10} V${by + 10} Q${bx},${by} ${bx + 10},${by} Z`}
            fill="#fffdf8" stroke={cor} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
        <text x={bx + bw / 2} y={by + 17} textAnchor="middle" fontSize="19" fontWeight="700" fill="#1c1712"
          style={{ fontFamily: MANUSCRITA }}>{fmtValor(campo, fim.valor)}</text>
        <text x={bx + bw / 2} y={by + 33} textAnchor="middle" fontSize="13" fontWeight="500" fill={cor}
          style={{ fontFamily: MANUSCRITA }}>{frase2}</text>
        <text x={pts[0].cx} y={A - 8} textAnchor={n === 1 ? 'middle' : 'start'} fontSize="10" fill="#8c7b6b">{dataBR(serie[0].data)}</text>
        {n >= 2 && <text x={fim.cx} y={A - 8} textAnchor="end" fontSize="10" fill="#8c7b6b">{dataBR(fim.data)}</text>}
      </svg>
    </div>
  );
}

/* Bonequinho: toque numa parte do corpo para ver a medida e como ela mudou. */
const PARTES = [
  { campo: 'braco_cm',   nome: 'Braço',   x: 80,  y: 112, lado: 'e' },
  { campo: 'cintura_cm', nome: 'Cintura', x: 130, y: 138, lado: 'd' },
  { campo: 'quadril_cm', nome: 'Quadril', x: 130, y: 182, lado: 'd' },
  { campo: 'coxa_cm',    nome: 'Coxa',    x: 114, y: 232, lado: 'e' },
];
function Bonequinho({ series, comps, pesoNeutro, onEscolher }) {
  const partes = PARTES.filter(p => series[p.campo]?.length > 0);
  const [escolhida, setEscolhida] = useState(null);
  if (partes.length === 0) return null;
  const sel = partes.find(p => p.campo === escolhida) ?? partes[0];
  const comp = comps[sel.campo];
  const atual = series[sel.campo][series[sel.campo].length - 1];
  const sinal = sinalDe(sel.campo, comp, pesoNeutro);
  const tr = { stroke: '#1c1712', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: '#faf6ee' };
  return (
    <div className="card" style={{ padding: '14px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, padding: '0 4px 4px' }}>
        Toque no seu corpo
      </div>
      <svg viewBox="0 0 260 330" role="group" aria-label="Figura do corpo com as medidas" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
        <defs>
          <filter id="rab-b" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="9" result="r" />
            <feDisplacementMap in="SourceGraphic" in2="r" scale="2.2" />
          </filter>
        </defs>
        <g filter="url(#rab-b)" {...tr}>
          {/* braços atrás do tronco, levemente afastados (posição anatômica) */}
          <path d="M165.0,72.0 C167.8,70.0 173.8,77.3 177.0,84.0 C180.2,90.7 182.2,102.7 184.0,112.0 C185.8,121.3 186.3,130.3 188.0,140.0 C189.7,149.7 192.2,160.3 194.0,170.0 C195.8,179.7 197.5,191.0 199.0,198.0 C200.5,205.0 203.0,208.0 203.0,212.0 C203.0,216.0 200.7,221.7 199.0,222.0 C197.3,222.3 195.2,217.7 193.0,214.0 C190.8,210.3 188.2,207.3 186.0,200.0 C183.8,192.7 182.0,179.7 180.0,170.0 C178.0,160.3 176.0,151.3 174.0,142.0 C172.0,132.7 170.3,121.7 168.0,114.0 C165.7,106.3 160.5,103.0 160.0,96.0 C159.5,89.0 162.2,74.0 165.0,72.0 Z" />
          <path d="M95.0,72.0 C92.2,70.0 86.2,77.3 83.0,84.0 C79.8,90.7 77.8,102.7 76.0,112.0 C74.2,121.3 73.7,130.3 72.0,140.0 C70.3,149.7 67.8,160.3 66.0,170.0 C64.2,179.7 62.5,191.0 61.0,198.0 C59.5,205.0 57.0,208.0 57.0,212.0 C57.0,216.0 59.3,221.7 61.0,222.0 C62.7,222.3 64.8,217.7 67.0,214.0 C69.2,210.3 71.8,207.3 74.0,200.0 C76.2,192.7 78.0,179.7 80.0,170.0 C82.0,160.3 84.0,151.3 86.0,142.0 C88.0,132.7 89.7,121.7 92.0,114.0 C94.3,106.3 99.5,103.0 100.0,96.0 C100.5,89.0 97.8,74.0 95.0,72.0 Z" />
          {/* tronco e pernas */}
          <path d="M138.0,62.0 C143.0,62.5 147.7,63.5 152.0,65.0 C156.3,66.5 162.7,66.5 164.0,71.0 C165.3,75.5 161.5,85.2 160.0,92.0 C158.5,98.8 156.2,104.7 155.0,112.0 C153.8,119.3 152.5,128.3 153.0,136.0 C153.5,143.7 155.8,150.3 158.0,158.0 C160.2,165.7 164.8,174.2 166.0,182.0 C167.2,189.8 165.7,196.7 165.0,205.0 C164.3,213.3 163.2,223.5 162.0,232.0 C160.8,240.5 158.3,248.0 158.0,256.0 C157.7,264.0 160.3,271.7 160.0,280.0 C159.7,288.3 156.0,299.3 156.0,306.0 C156.0,312.7 162.2,317.0 160.0,320.0 C157.8,323.0 145.8,325.7 143.0,324.0 C140.2,322.3 143.7,317.0 143.0,310.0 C142.3,303.0 140.2,290.7 139.0,282.0 C137.8,273.3 137.0,267.3 136.0,258.0 C135.0,248.7 134.0,234.7 133.0,226.0 C132.0,217.3 131.0,206.0 130.0,206.0 C129.0,206.0 128.0,217.3 127.0,226.0 C126.0,234.7 125.0,248.7 124.0,258.0 C123.0,267.3 122.2,273.3 121.0,282.0 C119.8,290.7 117.7,303.0 117.0,310.0 C116.3,317.0 119.8,322.3 117.0,324.0 C114.2,325.7 102.2,323.0 100.0,320.0 C97.8,317.0 104.0,312.7 104.0,306.0 C104.0,299.3 100.3,288.3 100.0,280.0 C99.7,271.7 102.3,264.0 102.0,256.0 C101.7,248.0 99.2,240.5 98.0,232.0 C96.8,223.5 95.7,213.3 95.0,205.0 C94.3,196.7 92.8,189.8 94.0,182.0 C95.2,174.2 99.8,165.7 102.0,158.0 C104.2,150.3 106.5,143.7 107.0,136.0 C107.5,128.3 106.2,119.3 105.0,112.0 C103.8,104.7 101.5,98.8 100.0,92.0 C98.5,85.2 94.7,75.5 96.0,71.0 C97.3,66.5 103.7,66.5 108.0,65.0 C112.3,63.5 117.0,62.5 122.0,62.0 C127.0,61.5 133.0,61.5 138.0,62.0 Z" />
          {/* pescoço e cabeça */}
          <path d="M121,46 L121,63 Q130,68 139,63 L139,46" />
          <ellipse cx="130" cy="30" rx="16" ry="19" />
        </g>
        {/* detalhes anatômicos: clavículas, umbigo, joelhos */}
        <g filter="url(#rab-b)" fill="none" stroke="#8c7b6b" strokeWidth="1.4" strokeLinecap="round">
          <path d="M124,70 Q112,72 102,78" />
          <path d="M136,70 Q148,72 158,78" />
          <path d="M120,112 Q130,120 140,112" />
          <ellipse cx="130" cy="152" rx="1.8" ry="2.4" />
          <path d="M142,254 Q150,258 157,254" />
          <path d="M118,254 Q110,258 103,254" />
        </g>
        {partes.map(p => {
          const ativo = p.campo === sel.campo;
          const c = comps[p.campo];
          const sn = sinalDe(p.campo, c, pesoNeutro);
          const cor = sn ? sn.cor : '#a08456';
          const lx = p.lado === 'd' ? p.x + 82 : p.x - 52;
          return (
            <g key={p.campo} onClick={() => { setEscolhida(p.campo); onEscolher(p.campo); }} style={{ cursor: 'pointer' }}
              role="button" tabIndex={0} aria-label={`${p.nome}: ver detalhes`} aria-pressed={ativo}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEscolhida(p.campo); onEscolher(p.campo); } }}>
              {/* fita métrica tracejada */}
              {(p.campo === 'cintura_cm' || p.campo === 'quadril_cm') && (
                <line x1={p.x - 34} x2={p.x + 50} y1={p.y} y2={p.y} stroke={cor} strokeWidth="1.6" strokeDasharray="4,3" />
              )}
              <circle cx={p.x} cy={p.y} r={ativo ? 11 : 8} fill={ativo ? cor : '#fff'} stroke={cor} strokeWidth="2.2" />
              <text x={lx} y={p.y + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={ativo ? '#1c1712' : '#8c7b6b'}
                style={{ fontFamily: MANUSCRITA }}>{p.nome}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ background: 'var(--bg-soft, #f5f0e8)', borderRadius: 14, padding: '10px 14px', marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>
            {sel.nome} · {fmtValor(sel.campo, atual.valor)}
          </span>
          {comp && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: sinal ? sinal.fundo : '#fff', color: sinal ? sinal.cor : 'var(--ink-soft)',
            }}>
              {comp.dif > 0 ? '↑' : comp.dif < 0 ? '↓' : '→'} {fmtDelta(sel.campo, comp.dif)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {comp
            ? `Começou em ${fmtValor(sel.campo, comp.base.valor)} (${dataBR(comp.base.data)})`
            : `Primeira medida: ${dataBR(atual.data)}`}
        </div>
      </div>
    </div>
  );
}

function Barra({ rotulo, r, maximo }) {
  const g = Number(r.gordura_kg), mm = Number(r.mm_kg);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{rotulo} · {dataBR(r.data)}</div>
      <div style={{ display: 'flex', height: 22, width: `${((g + mm) / maximo) * 100}%`, borderRadius: 6, overflow: 'hidden' }}
        role="img" aria-label={`${rotulo}: ${fmtNum(g, 1)} kg de gordura e ${fmtNum(mm, 1)} kg de massa magra`}>
        <div style={{ flex: g, background: '#c4a882' }} />
        <div style={{ flex: mm, background: '#1c1712' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
        gordura {fmtNum(g, 1)} kg · massa magra {fmtNum(mm, 1)} kg
      </div>
    </div>
  );
}

/* Duas barras empilhadas (gordura + massa magra, em kg): início × agora. */
function BarrasComposicao({ registros, composicao }) {
  const completas = registros.filter(r => Number(r.gordura_kg) > 0 && Number(r.mm_kg) > 0);
  const ini = completas.find(r => r.data === composicao.deData);
  const fim = completas.find(r => r.data === composicao.ateData);
  if (!ini || !fim) return null;
  const maximo = Math.max(Number(ini.gordura_kg) + Number(ini.mm_kg), Number(fim.gordura_kg) + Number(fim.mm_kg));
  return (
    <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 8 }}>
        Do que seu corpo é feito
      </div>
      <Barra rotulo="Início" r={ini} maximo={maximo} />
      <Barra rotulo="Agora" r={fim} maximo={maximo} />
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--muted)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#c4a882', borderRadius: 2, marginRight: 4 }} />gordura</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1c1712', borderRadius: 2, marginRight: 4 }} />massa magra</span>
      </div>
    </div>
  );
}
