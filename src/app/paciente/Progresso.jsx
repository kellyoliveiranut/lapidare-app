import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import { Jornada, CartoesMetricas, Grafico, Bonequinho, BarrasComposicao, MetasCard } from '../../components/EvolucaoVisual.jsx';
import { sinalDe, tempoDe } from '../../lib/sinaleira.js';
import { diasEntre, ehEmagrecimento } from '../../lib/resultadosClinicos.js';
import { metasPorCodigos } from '../../lib/metasEvolucao.js';
import {
  METRICAS, serieDaMetrica, comparar, composicaoCorporal,
  fmtValor, normalizarAvaliacoes,
} from '../../lib/evolucaoAvaliacoes.js';

// Ordem dos botões/cartões. Quadril só aparece se houver registro.
const ORDEM = ['kg', 'cintura_cm', 'pgc', 'mm_kg', 'quadril_cm', 'abdome_cm', 'braco_cm', 'coxa_cm', 'panturrilha_cm'];
const CARTOES = ['kg', 'cintura_cm', 'pgc', 'mm_kg'];

const ENTENDA = [
  ['Peso', 'Quanto você pesa na balança no dia da avaliação.'],
  ['Cintura', 'A medida ao redor da cintura, feita com fita métrica.'],
  ['% de gordura', 'Quanto do seu corpo é gordura, em porcentagem.'],
  ['Massa magra', 'Músculos, ossos e água: tudo o que não é gordura.'],
];

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
        .select('id, data, kg, cintura_cm, quadril_cm, abdome_cm, panturrilha_cm, braco_cm, braco_dir_cm, coxa_cm, coxa_dir_cm, pgc, mm_kg, gordura_kg, obs')
        .eq('ignorar_calculo', false)
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: true });
      if (!active) return;
      setRegistros(normalizarAvaliacoes(data));
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
      <Jornada
        frase={registros.length === 1
          ? 'Sua primeira avaliação foi registrada.'
          : `Você está há ${tempoDe(diasTotal)} em acompanhamento.`}
        registros={registros.length} pesoComp={pesoComp} composicao={composicao} />

      <MetasCard metas={metasPorCodigos(profile?.metas_evolucao)} />

      <CartoesMetricas campos={CARTOES} series={series} comps={comps} pesoNeutro={pesoNeutro}
        campoAtivo={campo} onEscolher={setMetrica} />

      {/* ─── BONEQUINHO: toque numa parte do corpo ───────────── */}
      <Bonequinho series={series} comps={comps} pesoNeutro={pesoNeutro} sexo={profile?.sexo} campoAtivo={campo}
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
              {r.braco_cm   != null && <span>Braço {fmtValor('braco_cm', r.braco_cm)}</span>}
              {r.coxa_cm    != null && <span>Coxa {fmtValor('coxa_cm', r.coxa_cm)}</span>}
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
