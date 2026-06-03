import { useState } from 'react';
import { dataBR } from '../../lib/utils.js';
import { callAnthropic, urlToBase64 } from '../../lib/anthropic.js';

function fmt(v, decimals = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

function buildDadosGrafico(historico) {
  return [...historico]
    .reverse()
    .map(a => ({
      data: a.data ? new Date(a.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—',
      Peso: a.kg ?? null,
      'Massa magra': a.mm_kg ?? null,
      'Gordura': a.gordura_kg ?? null,
      'Cintura': a.cintura_cm ?? null,
      'Quadril': a.quadril_cm ?? null,
      'Abdome': a.abdome_cm ?? null,
      'Hidratação %': a.hidratacao_pct ?? null,
      '% Gordura': a.pgc ?? null,
    }));
}

function buildPromptDados(historico, paciente) {
  const atual = historico[0];
  const ant = historico[1];
  const imc = atual?.kg && atual?.altura_cm
    ? (atual.kg / Math.pow(atual.altura_cm / 100, 2)).toFixed(1)
    : '—';

  const linhaAtual = `
AVALIAÇÃO ATUAL (${dataBR(atual?.data)}):
- Peso: ${fmt(atual?.kg)} kg | Altura: ${fmt(atual?.altura_cm)} cm | IMC: ${imc} kg/m²
- Massa magra: ${fmt(atual?.mm_kg)} kg (${fmt(atual?.mm_pct)}%) | Gordura: ${fmt(atual?.gordura_kg)} kg (${fmt(atual?.pgc)}%)
- Hidratação: ${fmt(atual?.hidratacao_pct)}%
- GEB: ${atual?.geb_kcal ?? '—'} kcal | GET: ${atual?.get_kcal ?? '—'} kcal
- Circunferências (cm): cintura ${fmt(atual?.cintura_cm)} | quadril ${fmt(atual?.quadril_cm)} | abdome ${fmt(atual?.abdome_cm)} | braço D ${fmt(atual?.braco_dir_cm)} | braço E ${fmt(atual?.braco_esq_cm)} | coxa D ${fmt(atual?.coxa_dir_cm)} | coxa E ${fmt(atual?.coxa_esq_cm)} | panturrilha ${fmt(atual?.panturrilha_cm)}
- Observação: ${atual?.obs ?? 'nenhuma'}`;

  const linhaAnt = ant ? `
AVALIAÇÃO ANTERIOR (${dataBR(ant?.data)}):
- Peso: ${fmt(ant?.kg)} kg | IMC: ${ant?.kg && ant?.altura_cm ? (ant.kg / Math.pow(ant.altura_cm / 100, 2)).toFixed(1) : '—'} kg/m²
- Massa magra: ${fmt(ant?.mm_kg)} kg (${fmt(ant?.mm_pct)}%) | Gordura: ${fmt(ant?.gordura_kg)} kg (${fmt(ant?.pgc)}%)
- Hidratação: ${fmt(ant?.hidratacao_pct)}%
- Circunferências (cm): cintura ${fmt(ant?.cintura_cm)} | quadril ${fmt(ant?.quadril_cm)} | abdome ${fmt(ant?.abdome_cm)}` : '';

  return `Você é uma nutricionista clínica especializada em oncologia. Analise os dados antropométricos abaixo e gere um relatório clínico em português com:

1) Estado nutricional atual — interpretação de IMC, composição corporal, hidratação e gasto energético
2) Evolução comparando com avaliações anteriores — perdas/ganhos de massa magra, gordura, circunferências e peso
3) Pontos de atenção clínica — especialmente sinais de desnutrição, sarcopenia, desidratação ou excesso de gordura
4) Sugestões de conduta nutricional para a próxima consulta

Use linguagem clínica profissional e objetiva.

PACIENTE: ${paciente?.nome ?? '—'}
TOTAL DE AVALIAÇÕES: ${historico.length}
${linhaAtual}
${linhaAnt}`;
}

function parseSecoes(texto) {
  if (!texto) return [];
  const linhas = texto.split('\n');
  const secoes = [];
  let atual = null;
  for (const l of linhas) {
    const titulo = l.match(/^\*\*(.+)\*\*$/) || l.match(/^#{1,3}\s+(.+)$/) || l.match(/^\d+\)\s+(.+)$/);
    if (titulo) {
      if (atual) secoes.push(atual);
      atual = { titulo: titulo[1].replace(/\*\*/g, ''), linhas: [] };
    } else if (atual) {
      if (l.trim()) atual.linhas.push(l);
    } else {
      if (l.trim()) secoes.push({ titulo: null, linhas: [l] });
    }
  }
  if (atual) secoes.push(atual);
  return secoes.length ? secoes : [{ titulo: null, linhas: texto.split('\n').filter(Boolean) }];
}

export default function AnalisarAvaliacao({ historico, fotos, paciente, onClose }) {
  const [analise, setAnalise] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState(null);
  const [analiseFotos, setAnaliseFotos] = useState(null);
  const [analisandoFotos, setAnalisandoFotos] = useState(false);
  const [erroFotos, setErroFotos] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoFotos, setCopiadoFotos] = useState(false);

  const dados = buildDadosGrafico(historico);
  const temDados = dados.length > 0;
  const avaliacaoAtual = historico[0];
  const fotosAtuais = avaliacaoAtual ? (fotos[avaliacaoAtual.id] ?? []) : [];
  const fotosDisp = fotosAtuais.filter(f => f.tipo === 'frente' || f.tipo === 'lado');

  async function analisarDados() {
    setErroAnalise(null);
    setAnalisando(true);
    try {
      const prompt = buildPromptDados(historico, paciente);
      const texto = await callAnthropic([{ role: 'user', content: prompt }]);
      setAnalise(texto);
    } catch (e) {
      setErroAnalise(e.message);
    } finally {
      setAnalisando(false);
    }
  }

  async function analisarFotos() {
    if (!fotosDisp.length) return;
    setErroFotos(null);
    setAnalisandoFotos(true);
    try {
      const atual = historico[0];
      const imc = atual?.kg && atual?.altura_cm
        ? (atual.kg / Math.pow(atual.altura_cm / 100, 2)).toFixed(1) : '—';

      const conteudo = [
        {
          type: 'text',
          text: `Você é uma nutricionista clínica. Analise as fotos de avaliação física abaixo (frente e lado) junto com as medidas informadas. Gere um relatório em português com:

1) Observações visuais sobre postura, distribuição de gordura corporal e tônus muscular aparente
2) Correlação entre o que as fotos mostram e os dados de composição corporal
3) Pontos de atenção visual
4) Evolução visual comparada à avaliação anterior se disponível

Use linguagem clínica profissional.

Dados da paciente: peso ${fmt(atual?.kg)} kg | altura ${fmt(atual?.altura_cm)} cm | IMC ${imc} | gordura ${fmt(atual?.pgc)}% | massa magra ${fmt(atual?.mm_kg)} kg`,
        },
      ];

      for (const f of fotosDisp) {
        try {
          const b64 = await urlToBase64(f.url.split('?')[0]);
          conteudo.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
          });
          conteudo.push({ type: 'text', text: `(foto: ${f.tipo})` });
        } catch {
          // foto inacessível, pula
        }
      }

      const texto = await callAnthropic([{ role: 'user', content: conteudo }], { maxTokens: 1500 });
      setAnaliseFotos(texto);
    } catch (e) {
      setErroFotos(e.message);
    } finally {
      setAnalisandoFotos(false);
    }
  }

  function copiar(texto, setCop) {
    navigator.clipboard.writeText(texto).then(() => {
      setCop(true);
      setTimeout(() => setCop(false), 2000);
    });
  }

  const CORES = ['#a08456', '#3a6b1a', '#1a5a8c', '#854f0b', '#6b3a8c'];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 200, padding: '20px 16px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 860,
        border: '0.5px solid var(--border)', marginBottom: 20,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: '0.5px solid var(--border)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--dark)' }}>
              Análise de Avaliação
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {historico.length} avaliação{historico.length !== 1 ? 'ões' : ''} · {paciente?.nome}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 6,
          }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ padding: '20px 20px 24px' }}>

          {/* ── GRÁFICOS ── */}
          {!temDados ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>
              Nenhuma avaliação registrada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Evolução do peso */}
              <GraficoCard titulo="Evolução do Peso (kg)">
                <SvgLineChart
                  data={dados}
                  lines={[{ key: 'Peso', color: '#a08456', label: 'Peso (kg)' }]}
                />
              </GraficoCard>

              {/* Composição corporal */}
              {dados.some(d => d['Massa magra'] != null || d['Gordura'] != null) && (
                <GraficoCard titulo="Composição Corporal (kg) — Massa Magra vs Gordura">
                  <SvgBarChart
                    data={dados}
                    bars={[
                      { key: 'Massa magra', color: '#3a6b1a', label: 'Massa magra' },
                      { key: 'Gordura',     color: '#8c1a1a', label: 'Gordura' },
                    ]}
                  />
                  <ChartLegend items={[
                    { color: '#3a6b1a', label: 'Massa magra' },
                    { color: '#8c1a1a', label: 'Gordura' },
                  ]} />
                </GraficoCard>
              )}

              {/* Circunferências */}
              {dados.some(d => d['Cintura'] != null || d['Quadril'] != null || d['Abdome'] != null) && (
                <GraficoCard titulo="Circunferências Principais (cm)">
                  <SvgLineChart
                    data={dados}
                    lines={[
                      { key: 'Cintura', color: CORES[0], label: 'Cintura' },
                      { key: 'Quadril', color: CORES[1], label: 'Quadril' },
                      { key: 'Abdome',  color: CORES[2], label: 'Abdome' },
                    ]}
                  />
                  <ChartLegend items={[
                    { color: CORES[0], label: 'Cintura' },
                    { color: CORES[1], label: 'Quadril' },
                    { color: CORES[2], label: 'Abdome' },
                  ]} />
                </GraficoCard>
              )}

              {/* Hidratação e gordura % */}
              {dados.some(d => d['Hidratação %'] != null || d['% Gordura'] != null) && (
                <GraficoCard titulo="Hidratação (%) e Gordura Corporal (%)">
                  <SvgLineChart
                    data={dados}
                    lines={[
                      { key: 'Hidratação %', color: '#1a5a8c', label: 'Hidratação %' },
                      { key: '% Gordura',    color: '#8c1a1a', label: '% Gordura' },
                    ]}
                  />
                  <ChartLegend items={[
                    { color: '#1a5a8c', label: 'Hidratação %' },
                    { color: '#8c1a1a', label: '% Gordura' },
                  ]} />
                </GraficoCard>
              )}
            </div>
          )}

          {/* ── ANÁLISE DE DADOS COM IA ── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dark)' }}>
                <i className="ti ti-sparkles" style={{ color: 'var(--amber, #c9a96e)', marginRight: 6 }} />
                Análise clínica por IA
              </div>
              {!analise && (
                <button
                  onClick={analisarDados}
                  disabled={analisando || !historico.length}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: analisando ? 'var(--bg2)' : 'var(--dark)',
                    color: analisando ? 'var(--text3)' : '#fff',
                    fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                  }}>
                  <i className="ti ti-sparkles" />
                  {analisando ? 'Analisando dados...' : 'Analisar com IA'}
                </button>
              )}
            </div>

            {analisando && <Spinner texto="Analisando dados antropométricos..." />}

            {erroAnalise && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12,
              }}>
                {erroAnalise}
              </div>
            )}

            {analise && (
              <ResultadoAnalise
                texto={analise}
                copiado={copiado}
                onCopiar={() => copiar(analise, setCopiado)}
                onLimpar={() => setAnalise(null)}
              />
            )}
          </div>

          {/* ── ANÁLISE DE FOTOS COM IA ── */}
          {fotosDisp.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dark)' }}>
                  <i className="ti ti-camera" style={{ color: 'var(--amber, #c9a96e)', marginRight: 6 }} />
                  Análise visual das fotos por IA
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>
                    ({fotosDisp.length} foto{fotosDisp.length > 1 ? 's' : ''} disponível{fotosDisp.length > 1 ? 'eis' : ''})
                  </span>
                </div>
                {!analiseFotos && (
                  <button
                    onClick={analisarFotos}
                    disabled={analisandoFotos}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: analisandoFotos ? 'var(--bg2)' : 'var(--dark)',
                      color: analisandoFotos ? 'var(--text3)' : '#fff',
                      fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    }}>
                    <i className="ti ti-camera-spark" style={{ fontSize: 14 }} />
                    {analisandoFotos ? 'Analisando fotos...' : 'Analisar fotos com IA'}
                  </button>
                )}
              </div>

              {analisandoFotos && <Spinner texto="Processando imagens e gerando análise visual..." />}

              {erroFotos && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, fontSize: 13,
                  background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12,
                }}>
                  {erroFotos}
                </div>
              )}

              {analiseFotos && (
                <ResultadoAnalise
                  texto={analiseFotos}
                  copiado={copiadoFotos}
                  onCopiar={() => copiar(analiseFotos, setCopiadoFotos)}
                  onLimpar={() => setAnaliseFotos(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GraficoCard({ titulo, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: '.03em' }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

/* ── SVG charts (sem dependência externa) ── */

function SvgLineChart({ data, lines }) {
  const W = 560, H = 180;
  const pad = { t: 20, r: 16, b: 32, l: 42 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const n = data.length;
  if (n === 0) return null;
  const allVals = lines.flatMap(l => data.map(d => d[l.key]).filter(v => v != null));
  if (!allVals.length) return null;
  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const span = rawMax - rawMin || 1;
  const lo = rawMin - span * 0.1, hi = rawMax + span * 0.1;
  const tx = i => pad.l + (n < 2 ? pw / 2 : (i / (n - 1)) * pw);
  const ty = v => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
  const yTicks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const xStep = Math.max(1, Math.ceil(n / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} y1={ty(v)} x2={W - pad.r} y2={ty(v)} stroke="#eae4dc" strokeWidth={1} />
          <text x={pad.l - 5} y={ty(v) + 4} textAnchor="end" fontSize={10} fill="#aaa">
            {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}
          </text>
        </g>
      ))}
      {data.map((d, i) => i % xStep === 0 && (
        <text key={i} x={tx(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#aaa">{d.data}</text>
      ))}
      {lines.map(l => {
        let path = '';
        data.forEach((pt, i) => {
          const v = pt[l.key];
          if (v == null) return;
          path += path === '' ? `M ${tx(i)} ${ty(v)}` : ` L ${tx(i)} ${ty(v)}`;
        });
        return path ? <path key={l.key} d={path} fill="none" stroke={l.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null;
      })}
      {lines.flatMap(l =>
        data.map((pt, i) => {
          const v = pt[l.key];
          if (v == null) return null;
          return (
            <circle key={`${l.key}-${i}`} cx={tx(i)} cy={ty(v)} r={4} fill={l.color} stroke="#fff" strokeWidth={1.5}>
              <title>{`${l.label}: ${v.toFixed(1)}`}</title>
            </circle>
          );
        })
      )}
    </svg>
  );
}

function SvgBarChart({ data, bars }) {
  const W = 560, H = 180;
  const pad = { t: 20, r: 16, b: 32, l: 42 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const n = data.length;
  if (n === 0) return null;
  const allVals = bars.flatMap(b => data.map(d => d[b.key]).filter(v => v != null && v > 0));
  if (!allVals.length) return null;
  const maxVal = Math.max(...allVals) * 1.1;
  const ty = v => pad.t + ph - (v / maxVal) * ph;
  const th = v => (v / maxVal) * ph;
  const nB = bars.length;
  const groupW = pw / n;
  const barW = Math.min((groupW * 0.65) / nB, 28);
  const gx = i => pad.l + i * groupW + (groupW - barW * nB - (nB - 1) * 2) / 2;
  const xStep = Math.max(1, Math.ceil(n / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {[0, 0.33, 0.67, 1].map((f, i) => (
        <line key={i} x1={pad.l} y1={pad.t + ph * (1 - f)} x2={W - pad.r} y2={pad.t + ph * (1 - f)} stroke="#eae4dc" strokeWidth={1} />
      ))}
      {data.map((pt, i) =>
        bars.map((b, bi) => {
          const v = pt[b.key];
          if (!v || v <= 0) return null;
          return (
            <rect key={`${b.key}-${i}`} x={gx(i) + bi * (barW + 2)} y={ty(v)} width={barW} height={th(v)} fill={b.color} rx={2}>
              <title>{`${b.label}: ${v.toFixed(1)}`}</title>
            </rect>
          );
        })
      )}
      {data.map((pt, i) => i % xStep === 0 && (
        <text key={i} x={pad.l + i * groupW + groupW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#aaa">{pt.data}</text>
      ))}
    </svg>
  );
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, justifyContent: 'center' }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

function Spinner({ texto }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
      borderRadius: 8, background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)',
      marginBottom: 12,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: '2px solid var(--border)', borderTopColor: 'var(--amber, #c9a96e)',
        animation: 'spin .8s linear infinite',
      }} />
      {texto}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function ResultadoAnalise({ texto, copiado, onCopiar, onLimpar }) {
  const secoes = parseSecoes(texto);
  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 10, padding: '16px 18px',
      border: '0.5px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button onClick={onCopiar} style={{
          background: copiado ? 'var(--green-bg)' : 'var(--white)',
          border: '0.5px solid var(--border)', borderRadius: 6,
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          color: copiado ? 'var(--green)' : 'var(--text2)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: 'var(--font-sans)',
        }}>
          <i className={`ti ti-${copiado ? 'check' : 'copy'}`} />
          {copiado ? 'Copiado!' : 'Copiar análise'}
        </button>
        <button onClick={onLimpar} style={{
          background: 'var(--white)', border: '0.5px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          color: 'var(--text3)', fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <i className="ti ti-refresh" /> Nova análise
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {secoes.map((s, i) => (
          <div key={i}>
            {s.titulo && (
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 6 }}>
                {s.titulo}
              </div>
            )}
            {s.linhas.map((l, j) => (
              <div key={j} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 2 }}>
                {l.startsWith('- ') ? (
                  <span>· {l.slice(2)}</span>
                ) : l.replace(/\*\*/g, '')}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
