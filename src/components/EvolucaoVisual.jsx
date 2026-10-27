/* ============================================================
   EVOLUÇÃO VISUAL — usada na tela da paciente, na ficha da nutri e no modo
   apresentação. Só estilos inline + tokens (não depende de .paciente-app nem
   .nutri-panel). Dados esperados: séries de serieDaMetrica e comparações de
   comparar() (lib/evolucaoAvaliacoes.js).
   ============================================================ */
import { dataBR } from '../lib/utils.js';
import corpoFeminino from '../assets/corpo-feminino.webp';
import corpoMasculino from '../assets/corpo-masculino.webp';
import { CARD, sinalDe } from '../lib/sinaleira.js';
import { METRICAS, fraseComposicao, fmtNum, fmtValor, fmtDelta } from '../lib/evolucaoAvaliacoes.js';

const MANUSCRITA = "'Caveat', 'Bradley Hand', cursive";

/* Cartão escuro com a frase-resumo da jornada. `titulo`/`frase` mudam entre paciente e nutri. */
export function Jornada({ titulo = 'Sua jornada', frase, registros, pesoComp, composicao, grande = false }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--ink, #1c1712) 0%, #1a1612 100%)', color: 'var(--bg-soft, #f5f0e8)',
      borderRadius: 16, padding: grande ? '24px 28px' : '16px 18px', marginBottom: 12,
    }}>
      <div style={{ fontSize: grande ? 11 : 9, letterSpacing: '.18em', textTransform: 'uppercase', opacity: .7, marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: grande ? 34 : 22, lineHeight: 1.25, fontWeight: 500 }}>
        {frase}
      </div>
      <div style={{ fontSize: grande ? 15 : 12, opacity: .85, marginTop: 6, lineHeight: 1.5 }}>
        {registros} avaliaç{registros === 1 ? 'ão' : 'ões'} registrada{registros === 1 ? '' : 's'}
        {pesoComp && <> · peso de <strong>{fmtValor('kg', pesoComp.base.valor)}</strong> para <strong>{fmtValor('kg', pesoComp.atual.valor)}</strong></>}
        {composicao && <><br />{fraseComposicao(composicao)}</>}
      </div>
    </div>
  );
}

/* Cartões "valor atual + variação + começou em". Tocar escolhe a métrica do gráfico. */
export function CartoesMetricas({ campos, series, comps, pesoNeutro, campoAtivo, onEscolher, colunas = 2, grande = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: 8, marginBottom: 12 }}>
      {campos.filter(c => series[c]?.length > 0).map(c => {
        const mc = METRICAS[c];
        const atual = series[c][series[c].length - 1];
        const comp = comps[c];
        const sinal = sinalDe(c, comp, pesoNeutro);
        const ativo = c === campoAtivo;
        return (
          <button key={c} type="button" onClick={() => onEscolher?.(c)} aria-pressed={ativo}
            style={{
              ...CARD, textAlign: 'left', cursor: onEscolher ? 'pointer' : 'default', fontFamily: 'var(--font-sans)',
              color: 'var(--ink, #1c1712)', padding: grande ? '18px 20px' : '12px 14px',
              border: ativo ? '1.5px solid var(--gold-deep, #a08456)' : CARD.border,
            }}>
            <div style={{ fontSize: grande ? 11 : 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted, #8c7b6b)', fontWeight: 500 }}>
              {mc.rotulo}
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: grande ? 44 : 26, fontWeight: 600, lineHeight: 1.1, marginTop: 2 }}>
              {fmtNum(atual.valor, mc.casas)}
              <span style={{ fontSize: grande ? 16 : 12, fontWeight: 500, marginLeft: 3 }}>{mc.unidade}</span>
            </div>
            {comp ? (
              <>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '2px 8px', borderRadius: 20,
                  fontSize: grande ? 14 : 11, fontWeight: 600,
                  background: sinal ? sinal.fundo : 'var(--bg-soft, #f5f0e8)',
                  color: sinal ? sinal.cor : 'var(--ink-soft, #4a3828)',
                }}>
                  {sinal && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: sinal.cor }} />}
                  {fmtDelta(c, comp.dif)}{sinal && <span style={{ fontWeight: 500 }}> · {sinal.nome}</span>}
                </div>
                <div style={{ fontSize: grande ? 12 : 10, color: 'var(--muted, #8c7b6b)', marginTop: 4 }}>
                  começou em {fmtValor(c, comp.base.valor)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: grande ? 12 : 10, color: 'var(--muted, #8c7b6b)', marginTop: 6 }}>
                primeira medida · {dataBR(atual.data)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* Tabela de cálculos (ficha da nutri): início × atual × variação absoluta e % × dias,
   para todas as medidas extraídas do Shaped que tenham dois registros. */
export function TabelaCalculos({ campos, series, comps, pesoNeutro, rotuloPeriodo, imc }) {
  const linhas = campos.filter(c => series[c]?.length > 0);
  if (linhas.length === 0) return null;
  const th = { textAlign: 'left', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted, #8c7b6b)', fontWeight: 500, padding: '8px 10px', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 13, borderTop: '0.5px solid var(--hair-soft, #e6dfd3)', whiteSpace: 'nowrap' };
  return (
    <div style={{ ...CARD, padding: '12px 4px 6px', marginTop: 12, overflowX: 'auto' }}>
      <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted, #8c7b6b)', fontWeight: 500, padding: '0 10px 6px' }}>
        Cálculos · {rotuloPeriodo}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={th}>Medida</th><th style={th}>Início</th><th style={th}>Atual</th>
            <th style={th}>Variação</th><th style={th}>% do início</th><th style={th}>Dias</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(c => {
            const mc = METRICAS[c];
            const comp = comps[c];
            const atual = series[c][series[c].length - 1];
            const sinal = sinalDe(c, comp, pesoNeutro);
            const pct = comp && comp.base.valor ? (comp.dif / comp.base.valor) * 100 : null;
            return (
              <tr key={c}>
                <td style={{ ...td, fontWeight: 500 }}>{mc.rotulo}</td>
                <td style={td}>{comp ? <>{fmtValor(c, comp.base.valor)} <span style={{ color: 'var(--muted, #8c7b6b)', fontSize: 11 }}>{dataBR(comp.base.data)}</span></> : '—'}</td>
                <td style={td}>{fmtValor(c, atual.valor)} <span style={{ color: 'var(--muted, #8c7b6b)', fontSize: 11 }}>{dataBR(atual.data)}</span></td>
                <td style={{ ...td, fontWeight: 600, color: sinal ? sinal.cor : 'var(--ink, #1c1712)' }}>
                  {comp ? <>{sinal && <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: sinal.cor, marginRight: 6 }} />}{fmtDelta(c, comp.dif)}</> : '—'}
                </td>
                <td style={td}>{pct == null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${fmtNum(Math.abs(pct), 1)}%`}</td>
                <td style={td}>{comp ? comp.dias : '—'}</td>
              </tr>
            );
          })}
          {imc && (
            <tr>
              <td style={{ ...td, fontWeight: 500 }}>IMC</td>
              <td style={td}>{imc.inicio != null ? fmtNum(imc.inicio, 1) : '—'}<ClasseImc c={imc.classeInicio} /></td>
              <td style={td}>{fmtNum(imc.atual, 1)}<ClasseImc c={imc.classeAtual} /></td>
              <td style={td}>{imc.inicio != null ? `${imc.atual - imc.inicio > 0 ? '+' : imc.atual - imc.inicio < 0 ? '−' : ''}${fmtNum(Math.abs(imc.atual - imc.inicio), 1)}` : '—'}</td>
              <td style={td}>—</td><td style={td}>—</td>
            </tr>
          )}
        </tbody>
      </table>
      {imc && (
        <div style={{ fontSize: 11, color: 'var(--muted, #8c7b6b)', padding: '8px 10px 4px', lineHeight: 1.5 }}>
          {imc.semNascimento
            ? 'IMC sem classificação: preencha a data de nascimento no cadastro (adulto: OMS; idoso, a partir de 60 anos: Lipschitz).'
            : (imc.classeAtual || imc.classeInicio)
              ? 'Classificação pela idade na data de cada medida — adulto: OMS; idoso (60 anos ou mais): Lipschitz.'
              : 'IMC sem classificação para menores de 20 anos (usa curvas de percentil/escore-z da OMS).'}
        </div>
      )}
    </div>
  );
}

function ClasseImc({ c }) {
  if (!c) return null;
  return (
    <div style={{ fontSize: 11, color: 'var(--muted, #8c7b6b)', fontWeight: 500 }} title={c.referencia}>
      {c.faixa} <span style={{ fontWeight: 400 }}>· {c.referencia.split(' · ')[0]}</span>
    </div>
  );
}

/* Gráfico "à mão": linha com leve tremor, balão de fala e seta no último ponto. */
export function Grafico({ campo, serie, sinal, comp }) {
  const m = METRICAS[campo];
  if (serie.length === 0) {
    return (
      <div style={{ ...CARD, padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
        Ainda não há dados de {m.rotulo.toLowerCase()}.
      </div>
    );
  }
  const L = 320, A = 215, ml = 18, mr = 18, mt = 74, mb = 26;
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
  const bw = 172, bh = 52;
  const bx = Math.min(Math.max(fim.cx - bw / 2, 4), L - bw - 4);
  const by = 5;
  const caudaX = Math.min(Math.max(fim.cx, bx + 18), bx + bw - 18);
  const seta = comp ? (comp.dif > 0 ? '↑' : comp.dif < 0 ? '↓' : '→') : '';
  const frase2 = comp
    ? `${seta} ${fmtDelta(campo, comp.dif)} desde ${dataBR(comp.base.data).slice(0, 5)}`
    : 'ponto de partida';
  return (
    <div style={{ ...CARD, padding: '12px 8px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', padding: '0 8px 2px' }}>
        {m.rotulo} ao longo do tempo
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label={`${m.rotulo}: de ${fmtValor(campo, serie[0].valor)} em ${dataBR(serie[0].data)} para ${fmtValor(campo, fim.valor)} em ${dataBR(fim.data)}`}>
        <defs>
          <filter id="rab-g" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="r" />
            <feDisplacementMap in="SourceGraphic" in2="r" scale="1.8" />
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
        {/* primeiro valor */}
        {n >= 2 && (
          <text x={pts[0].cx} y={pts[0].cy - 12} textAnchor="start" fontSize="14" fontWeight="600" fill="#8c7b6b"
            style={{ fontFamily: 'var(--font-sans)' }}>{fmtNum(pts[0].valor, m.casas)}</text>
        )}
        {/* balão de fala com cauda apontando para o ponto de hoje */}
        <g filter="url(#rab-g)">
          <path d={`M${bx + 10},${by} H${bx + bw - 10} Q${bx + bw},${by} ${bx + bw},${by + 10} V${by + bh - 10} Q${bx + bw},${by + bh} ${bx + bw - 10},${by + bh} H${caudaX + 8} L${fim.cx},${fim.cy - 9} L${caudaX - 8},${by + bh} H${bx + 10} Q${bx},${by + bh} ${bx},${by + bh - 10} V${by + 10} Q${bx},${by} ${bx + 10},${by} Z`}
            fill="#fffdf8" stroke={cor} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <text x={bx + bw / 2} y={by + 25} textAnchor="middle" fontSize="27" fontWeight="700" fill="#1c1712"
          style={{ fontFamily: 'var(--font-serif)' }}>{fmtValor(campo, fim.valor)}</text>
        <text x={bx + bw / 2} y={by + 43} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={cor}
          style={{ fontFamily: 'var(--font-sans)' }}>{frase2}</text>
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
      { campo: 'abdome_cm',  nome: 'Abdome',  x: 268, y: 330, rot: [98, 336], fita: [250, 350] },
      { campo: 'cintura_cm', nome: 'Cintura', x: 300, y: 295, rot: [520, 300], fita: [248, 352] },
      { campo: 'quadril_cm', nome: 'Quadril', x: 250, y: 372, rot: [535, 352], fita: [218, 382] },
      { campo: 'coxa_cm',    nome: 'Coxa',    x: 268, y: 470, rot: [175, 480] },
      { campo: 'panturrilha_cm', nome: 'Panturrilha', x: 272, y: 610, rot: [170, 618] },
    ],
  },
  masculino: {
    img: corpoMasculino,
    partes: [
      { campo: 'braco_cm',   nome: 'Braço',   x: 195, y: 245, rot: [105, 252] },
      { campo: 'abdome_cm',  nome: 'Abdome',  x: 270, y: 358, rot: [120, 360], fita: [246, 352] },
      { campo: 'cintura_cm', nome: 'Cintura', x: 300, y: 330, rot: [535, 318], fita: [240, 360] },
      { campo: 'quadril_cm', nome: 'Quadril', x: 258, y: 380, rot: [545, 362], fita: [226, 374] },
      { campo: 'coxa_cm',    nome: 'Coxa',    x: 270, y: 480, rot: [185, 490] },
      { campo: 'panturrilha_cm', nome: 'Panturrilha', x: 270, y: 615, rot: [165, 622] },
    ],
  },
};
export function Bonequinho({ series, comps, pesoNeutro, sexo, campoAtivo, onEscolher }) {
  const corpo = CORPOS[sexo === 'masculino' ? 'masculino' : 'feminino'];
  const partes = corpo.partes.filter(p => series[p.campo]?.length > 0);
  // A medida vem de fora (botões do gráfico ou toque no corpo). Medida que não é de uma
  // região (peso, % de gordura, massa magra…) acende o corpo inteiro.
  const campoSel = campoAtivo && series[campoAtivo]?.length > 0 ? campoAtivo : partes[0]?.campo;
  if (!campoSel) return null;
  const regional = partes.some(p => p.campo === campoSel);
  const mSel = METRICAS[campoSel];
  const comp = comps[campoSel];
  const atual = series[campoSel][series[campoSel].length - 1];
  const sinal = sinalDe(campoSel, comp, pesoNeutro);
  const corSel = sinal ? sinal.cor : '#a08456';
  return (
    <div style={{ ...CARD, padding: '14px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, padding: '0 4px 4px' }}>
        Toque no seu corpo
      </div>
      <svg viewBox="0 0 600 768" role="group" aria-label="Figura do corpo com as medidas" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
        <image href={corpo.img} x="0" y="0" width="600" height="768"
          style={{ transition: 'filter .35s ease', filter: regional ? 'none' : `drop-shadow(0 0 14px ${corSel}aa)` }} />
        {!regional && (
          <g aria-hidden="true">
            <rect x="372" y="22" width="216" height="46" rx="23" fill={corSel} />
            <text x="480" y="53" textAnchor="middle" fontSize="24" fontWeight="600" fill="#fff"
              style={{ fontFamily: 'var(--font-sans)' }}>corpo todo · {mSel.rotulo}</text>
          </g>
        )}
        {partes.map(p => {
          const ativo = p.campo === campoSel;
          const c = comps[p.campo];
          const sn = sinalDe(p.campo, c, pesoNeutro);
          const cor = sn ? sn.cor : '#a08456';
          const [lx, ly] = p.rot;
          const noLado = lx > p.x;
          return (
            <g key={p.campo} onClick={() => onEscolher?.(p.campo)} style={{ cursor: 'pointer', opacity: ativo || !regional ? 1 : 0.6, transition: 'opacity .25s' }}
              role="button" tabIndex={0} aria-label={`${p.nome}: ver detalhes`} aria-pressed={ativo}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEscolher?.(p.campo); } }}>
              {p.fita && <line x1={p.fita[0]} x2={p.fita[1]} y1={p.y} y2={p.y} stroke={cor} strokeWidth={ativo ? 6 : 4} strokeDasharray="10,7" strokeLinecap="round" />}
              <circle cx={p.x} cy={p.y} r={ativo ? 24 : 17} fill={ativo ? cor : '#fff'} stroke={cor} strokeWidth="5" />
              {ativo && <circle cx={p.x} cy={p.y} r="36" fill="none" stroke={cor} strokeWidth="3" opacity=".35" />}
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
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600 }}>
            {mSel.rotulo} · {fmtValor(campoSel, atual.valor)}
          </span>
          {comp && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: sinal ? sinal.fundo : '#fff', color: sinal ? sinal.cor : 'var(--ink-soft)',
            }}>
              {comp.dif > 0 ? '↑' : comp.dif < 0 ? '↓' : '→'} {fmtDelta(campoSel, comp.dif)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {comp
            ? `Começou em ${fmtValor(campoSel, comp.base.valor)} (${dataBR(comp.base.data)})`
            : `Primeira medida: ${dataBR(atual.data)}`}
        </div>
      </div>
    </div>
  );
}

/* Recado escrito pela nutri (pacientes.recado_evolucao), em balão de fala.
   O texto é da nutricionista; sem texto, nada aparece. */
export function RecadoBalao({ texto, autora = 'Sua nutricionista' }) {
  const t = (texto ?? '').trim();
  if (!t) return null;
  return (
    <figure style={{ margin: '0 0 14px', padding: 0 }}>
      <blockquote style={{
        position: 'relative', margin: 0, padding: '12px 16px', background: '#fffdf8',
        border: '1.5px solid #a08456', borderRadius: 16, fontFamily: 'var(--font-serif)',
        fontSize: 18, lineHeight: 1.4, color: 'var(--ink, #1c1712)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>
        {t}
        <span aria-hidden="true" style={{
          position: 'absolute', left: 28, bottom: -9, width: 14, height: 14, background: '#fffdf8',
          borderRight: '1.5px solid #a08456', borderBottom: '1.5px solid #a08456', transform: 'rotate(45deg)',
        }} />
      </blockquote>
      <figcaption style={{ fontSize: 11, color: 'var(--muted, #8c7b6b)', margin: '12px 0 0 20px' }}>{autora}</figcaption>
    </figure>
  );
}

export function Barra({ rotulo, r, maximo }) {
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
export function BarrasComposicao({ registros, composicao }) {
  const completas = registros.filter(r => Number(r.gordura_kg) > 0 && Number(r.mm_kg) > 0);
  const ini = completas.find(r => r.data === composicao.deData);
  const fim = completas.find(r => r.data === composicao.ateData);
  if (!ini || !fim) return null;
  const maximo = Math.max(Number(ini.gordura_kg) + Number(ini.mm_kg), Number(fim.gordura_kg) + Number(fim.mm_kg));
  return (
    <div style={{ ...CARD, padding: '14px 16px', marginTop: 12 }}>
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
