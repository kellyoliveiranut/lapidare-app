import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import corpoFeminino from '../../assets/corpo-feminino.webp';
import corpoMasculino from '../../assets/corpo-masculino.webp';
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
      <Bonequinho series={series} comps={comps} pesoNeutro={pesoNeutro} sexo={profile?.sexo}
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

/* Bonequinho: toque numa parte do corpo para ver a medida e como ela mudou.
   Desenho feminino/masculino (tela 600×768); os pontos foram marcados sobre o desenho.
   Sexo não informado no cadastro → desenho feminino. */
const CORPOS = {
  feminino: {
    img: corpoFeminino,
    partes: [
      { campo: 'braco_cm',   nome: 'Braço',   x: 214, y: 255, rot: [112, 262] },
      { campo: 'cintura_cm', nome: 'Cintura', x: 300, y: 295, rot: [520, 300], fita: [248, 352] },
      { campo: 'quadril_cm', nome: 'Quadril', x: 300, y: 385, rot: [535, 352], fita: [218, 382] },
      { campo: 'coxa_cm',    nome: 'Coxa',    x: 268, y: 470, rot: [175, 480] },
    ],
  },
  masculino: {
    img: corpoMasculino,
    partes: [
      { campo: 'braco_cm',   nome: 'Braço',   x: 195, y: 245, rot: [105, 252] },
      { campo: 'cintura_cm', nome: 'Cintura', x: 300, y: 330, rot: [535, 318], fita: [240, 360] },
      { campo: 'quadril_cm', nome: 'Quadril', x: 300, y: 405, rot: [545, 362], fita: [224, 376] },
      { campo: 'coxa_cm',    nome: 'Coxa',    x: 270, y: 480, rot: [185, 490] },
    ],
  },
};
function Bonequinho({ series, comps, pesoNeutro, sexo, onEscolher }) {
  const corpo = CORPOS[sexo === 'masculino' ? 'masculino' : 'feminino'];
  const partes = corpo.partes.filter(p => series[p.campo]?.length > 0);
  const [escolhida, setEscolhida] = useState(null);
  if (partes.length === 0) return null;
  const sel = partes.find(p => p.campo === escolhida) ?? partes[0];
  const comp = comps[sel.campo];
  const atual = series[sel.campo][series[sel.campo].length - 1];
  const sinal = sinalDe(sel.campo, comp, pesoNeutro);
  return (
    <div className="card" style={{ padding: '14px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, padding: '0 4px 4px' }}>
        Toque no seu corpo
      </div>
      <svg viewBox="0 0 600 768" role="group" aria-label="Figura do corpo com as medidas" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
        <image href={corpo.img} x="0" y="0" width="600" height="768" />
        {partes.map(p => {
          const ativo = p.campo === sel.campo;
          const c = comps[p.campo];
          const sn = sinalDe(p.campo, c, pesoNeutro);
          const cor = sn ? sn.cor : '#a08456';
          const [lx, ly] = p.rot;
          const noLado = lx > p.x;
          return (
            <g key={p.campo} onClick={() => { setEscolhida(p.campo); onEscolher(p.campo); }} style={{ cursor: 'pointer' }}
              role="button" tabIndex={0} aria-label={`${p.nome}: ver detalhes`} aria-pressed={ativo}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEscolhida(p.campo); onEscolher(p.campo); } }}>
              {p.fita && <line x1={p.fita[0]} x2={p.fita[1]} y1={p.y} y2={p.y} stroke={cor} strokeWidth="4" strokeDasharray="10,7" strokeLinecap="round" />}
              <circle cx={p.x} cy={p.y} r={ativo ? 24 : 17} fill={ativo ? cor : '#fff'} stroke={cor} strokeWidth="5" />
              {p.fita && noLado && (
                <line x1={p.fita[1] + 6} y1={p.y} x2={lx - 52} y2={ly - 8} stroke={cor} strokeWidth="2.5" strokeDasharray="2,6" strokeLinecap="round" />
              )}
              <text x={lx} y={ly + 4} textAnchor="middle" fontSize="34" fontWeight="700" fill={ativo ? '#1c1712' : '#8c7b6b'}
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
