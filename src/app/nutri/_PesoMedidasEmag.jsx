import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import SvgAreaChart from '../../components/SvgAreaChart.jsx';
import { xLabel } from '../../lib/graficoFormato.js';

// Séries acompanhadas (colunas de peso_registros). Só aparece quem tem ao menos um valor.
const SERIES = [
  { key: 'kg',         label: 'Peso',            unidade: 'kg', dec: 1 },
  { key: 'cintura_cm', label: 'Cintura',         unidade: 'cm', dec: 1 },
  { key: 'abdome_cm',  label: 'Abdome',          unidade: 'cm', dec: 1 },
  { key: 'quadril_cm', label: 'Quadril',         unidade: 'cm', dec: 1 },
  { key: 'pgc',        label: '% de gordura',    unidade: '%',  dec: 1 },
  { key: 'mm_kg',      label: 'Massa magra',     unidade: 'kg', dec: 1 },
];
const COR = '#9A7B3F';
const fmt = (v, dec) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/**
 * Peso e medidas da paciente de Emagrecimento: um gráfico por medida, com o valor atual e a
 * variação desde o primeiro registro. Só descreve os números; não há meta nem julgamento aqui.
 * Os dados vêm de peso_registros (os mesmos da aba Evolução); registros marcados para
 * ignorar no cálculo ficam de fora, como no relatório.
 */
export default function PesoMedidasEmag({ pacienteId }) {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase.from('peso_registros')
      .select('data,kg,cintura_cm,abdome_cm,quadril_cm,pgc,mm_kg')
      .eq('paciente_id', pacienteId).eq('ignorar_calculo', false).order('data')
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setErro(error.message); else setLinhas(data ?? []);
      });
    return () => { vivo = false; };
  }, [pacienteId]);

  const series = useMemo(() => (linhas ?? []).length === 0 ? [] : SERIES.map(s => {
    const pontos = linhas
      .filter(l => l[s.key] != null)
      .map(l => ({ x: xLabel(l.data), v: Number(l[s.key]), data: l.data }));
    return { ...s, pontos };
  }).filter(s => s.pontos.length > 0), [linhas]);

  if (erro) return <div className="card card-body" style={{ fontSize: 13 }}>Não consegui carregar: {erro}</div>;
  if (linhas == null) return <div style={{ padding: 16, opacity: 0.7 }}>Carregando…</div>;
  if (series.length === 0) {
    return (
      <div className="card card-body" style={{ fontSize: 13 }}>
        Ainda não há peso ou medidas registrados. Os registros são feitos na aba <strong>Evolução</strong> e aparecem aqui.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {series.map(s => {
        const ini = s.pontos[0], fim = s.pontos[s.pontos.length - 1];
        const dif = Math.round((fim.v - ini.v) * 100) / 100;
        return (
          <div key={s.key} className="card" style={{ padding: '12px 12px 6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {s.label} <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.55 }}>{s.unidade}</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{fmt(fim.v, s.dec)}</span>
            </div>
            {s.pontos.length >= 2 && (
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
                {dif === 0 ? 'Sem variação' : `${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif), s.dec)} ${s.unidade}`} desde {dataBR(ini.data)}
              </div>
            )}
            <SvgAreaChart
              pontos={s.pontos}
              color={COR}
              gradId={`pm-${s.key}`}
              unidade={s.unidade}
              label={s.label}
              formatarValor={(v) => fmt(v, s.dec)}
              formatarTooltip={(v) => fmt(v, s.dec)}
            />
            {s.pontos.length === 1 && (
              <div style={{ fontSize: 10, opacity: 0.45, textAlign: 'center', paddingBottom: 4 }}>
                1 registro — a linha aparece a partir do segundo
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
