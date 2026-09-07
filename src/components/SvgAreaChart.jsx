/* ============================================================
   GRÁFICO DE ÁREA — compartilhado

   Saiu de dentro de PacientePerfil.jsx (onde vivia num arquivo de 6 mil
   linhas e não podia ser usado por mais ninguém) para servir também aos
   exames laboratoriais. O desenho é o mesmo, linha por linha; o que é novo
   são `faixa` e `minimoPontos`, e ambos são opcionais.

   `fmtVal` e `xLabel` ficaram em src/lib/graficoFormato.js, e não aqui:
   o chamador precisa das duas para montar pontos e rótulos, e fmtVal é
   usado FORA do gráfico (nos badges de variação de PacientePerfil). Um
   .jsx que exporta componente e função perde o hot reload.
   ============================================================ */
import { fmtVal } from '../lib/graficoFormato.js';

/**
 * @param pontos        [{ x: 'set', v: 12.5 }, ...] em ordem cronológica
 * @param faixa         { min, max } — banda de normalidade. Qualquer um dos
 *                      dois pode faltar: só `max` pinta "tudo abaixo de"
 *                      (é o caso do PCR), só `min` pinta "tudo acima de".
 * @param minimoPontos  quantos pontos exigir para desenhar. Default 1: com
 *                      uma banda de referência, UM ponto já responde "estou
 *                      dentro do normal?". Quem quiser o comportamento antigo
 *                      passa 2 — é o que PacientePerfil faz.
 * @param formatarValor   rótulo escrito acima de cada ponto.
 * @param formatarTooltip texto do <title>. É um formatador SEPARADO porque
 *                        sempre foi: o rótulo usa fmtVal e o tooltip usava
 *                        toFixed(1) cru. Manter os dois preserva o gráfico
 *                        de peso exatamente como ele era.
 */
export default function SvgAreaChart({
  pontos, color, gradId, unidade, label,
  faixa = null, minimoPontos = 1,
  formatarValor = fmtVal,
  formatarTooltip = (v) => Number(v).toFixed(1),
}) {
  const W = 400, H = 100;
  const pad = { t: 24, r: 8, b: 22, l: 8 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const n = pontos.length;
  if (n === 0 || n < minimoPontos) return null;

  const vals = pontos.map(p => p.v);
  // O domínio precisa ENGLOBAR a faixa, senão a banda sai desenhada fora da
  // área visível. O preço é conhecido: paciente muito longe do normal achata
  // a variação dos pontos. É o preço certo aqui — a pergunta que a banda
  // responde ("onde estou em relação ao normal") vale mais que a amplitude.
  const extremos = [...vals];
  if (faixa?.min != null) extremos.push(faixa.min);
  if (faixa?.max != null) extremos.push(faixa.max);
  const span = Math.max(...extremos) - Math.min(...extremos) || 1;
  const lo = Math.min(...extremos) - span * 0.15;
  const hi = Math.max(...extremos) + span * 0.15;

  const tx = i => pad.l + (n < 2 ? pw / 2 : (i / (n - 1)) * pw);
  const ty = v => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
  const pts = pontos.map((p, i) => ({ x: tx(i), y: ty(p.v), v: p.v, lbl: p.x }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const baseY = pad.t + ph;
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  const xStep = Math.max(1, Math.ceil(n / 5));

  // Faixa sem `min` desce até a base; sem `max` sobe até o topo.
  const faixaTopo = faixa ? (faixa.max != null ? ty(faixa.max) : pad.t) : 0;
  const faixaBase = faixa ? (faixa.min != null ? ty(faixa.min) : baseY) : 0;
  const faixaAltura = Math.max(0, faixaBase - faixaTopo);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Banda de referência, atrás de tudo */}
      {faixa && faixaAltura > 0 && (
        <>
          <rect x={pad.l} y={faixaTopo} width={pw} height={faixaAltura}
            fill="#16a34a" opacity={0.07} />
          {[faixa.min, faixa.max].filter(v => v != null).map(v => (
            <line key={v} x1={pad.l} y1={ty(v)} x2={W - pad.r} y2={ty(v)}
              stroke="#16a34a" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />
          ))}
        </>
      )}

      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={i} x1={pad.l} y1={pad.t + ph * f} x2={W - pad.r} y2={pad.t + ph * f} stroke="#f2ede6" strokeWidth={1} />
      ))}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#fff" strokeWidth={2}>
            <title>{`${label}: ${formatarTooltip(p.v)} ${unidade}`}</title>
          </circle>
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={10} fill={color} fontWeight={600}>
            {formatarValor(p.v)}
          </text>
          {i % xStep === 0 && (
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="#9b9087">
              {p.lbl}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
