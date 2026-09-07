import { useMemo } from 'react';
import SvgAreaChart from './SvgAreaChart.jsx';
import { xLabel } from '../lib/graficoFormato.js';
import { CAMPOS_EXAME, fmtNumExame, textoRef, refDoCampo } from '../data/exames_referencia.js';
import ValorExame from './ValorExame.jsx';

/* ============================================================
   EVOLUÇÃO DOS EXAMES — a mesma grade para a nutri e para a paciente

   Um gráfico por campo que tenha ao menos um valor, na ordem do catálogo.
   A banda verde é a faixa de referência do campo (por sexo, no caso da
   hemoglobina); o número em destaque é o exame mais recente, colorido pela
   mesma regra da tabela e do card.

   Sem className de tela específica: as duas telas definem tokens diferentes
   (--text3 é da nutri, --muted é da paciente), então o que é cor aqui é
   literal ou herdado.
   ============================================================ */

// O mesmo dourado da borda dos cards de exame na tela da paciente.
const COR_EXAME = '#9A7B3F';

export default function GraficosExames({ exames, sexo, style }) {
  // As duas telas carregam em data_exame DESC (mais recente primeiro) e o
  // gráfico precisa do tempo crescendo para a direita.
  const asc = useMemo(() => [...(exames ?? [])].reverse(), [exames]);

  const series = useMemo(() => CAMPOS_EXAME.map(campo => {
    const pontos = asc
      // Number() de defesa: se o PostgREST devolver o numeric como string,
      // o toFixed do gráfico quebraria em silêncio.
      .map(e => ({ x: xLabel(e.data_exame), v: e[campo.key] == null ? null : Number(e[campo.key]) }))
      .filter(p => p.v != null);
    return { campo, pontos };
  }).filter(s => s.pontos.length > 0), [asc]);

  if (series.length === 0) return null;

  return (
    <div style={{ marginTop: 20, ...style }}>
      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        opacity: .55, fontWeight: 500, marginBottom: 10,
      }}>
        Evolução dos exames
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {series.map(({ campo, pontos }) => {
          const atual = pontos[pontos.length - 1].v;
          const ref = textoRef(campo, sexo);
          return (
            <div key={campo.key} className="card" style={{ padding: '12px 12px 6px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', gap: 8, marginBottom: 2,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {campo.label}
                  {campo.unidade && (
                    <span style={{ fontSize: 11, fontWeight: 400, opacity: .55, marginLeft: 4 }}>
                      {campo.unidade}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 15 }}>
                  <ValorExame campo={campo} valor={atual} sexo={sexo} />
                </span>
              </div>

              {/* A faixa aparece como número aqui e como banda no gráfico:
                  a cor do valor acima nunca fica sem explicação. */}
              {ref && (
                <div style={{ fontSize: 11, opacity: .5, marginBottom: 2 }}>
                  referência {ref}
                </div>
              )}

              <SvgAreaChart
                pontos={pontos}
                color={COR_EXAME}
                gradId={`ex-${campo.key}`}
                unidade={campo.unidade}
                label={campo.label}
                faixa={refDoCampo(campo, sexo)}
                formatarValor={(v) => fmtNumExame(v, campo.dec ?? 0)}
                formatarTooltip={(v) => fmtNumExame(v, campo.dec ?? 0)}
              />

              {pontos.length === 1 && (
                <div style={{ fontSize: 10, opacity: .45, textAlign: 'center', paddingBottom: 4 }}>
                  1 exame — a linha aparece a partir do segundo
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
