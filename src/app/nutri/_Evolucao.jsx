import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { formatarResposta } from '../../lib/checkinDefault.js';
import { diasEntre, ehEmagrecimento } from '../../lib/resultadosClinicos.js';
import {
  METRICAS, PERIODOS, serieDaMetrica, comparar, detectarSuspeitas,
  composicaoCorporal, fmtDelta, rotuloTipoConsulta,
  descricaoAvaliacao, descricaoPlano, resumoCheckin, normalizarAvaliacoes,
} from '../../lib/evolucaoAvaliacoes.js';
import { tempoDe } from '../../lib/sinaleira.js';
import {
  Jornada, CartoesMetricas, TabelaCalculos, Grafico, Bonequinho, BarrasComposicao,
} from '../../components/EvolucaoVisual.jsx';
import { sinalDe } from '../../lib/sinaleira.js';

const CARTOES = ['kg', 'cintura_cm', 'pgc', 'mm_kg'];
// Ordem da tabela de cálculos: tudo o que o Shaped traz.
const TABELA = ['kg', 'pgc', 'gordura_kg', 'mm_kg', 'mm_pct', 'hidratacao_pct', 'cintura_cm', 'abdome_cm',
  'quadril_cm', 'braco_cm', 'coxa_cm', 'panturrilha_cm', 'geb_kcal', 'get_kcal'];
const GRAFICO_ORDEM = ['kg', 'pgc', 'gordura_kg', 'mm_kg', 'cintura_cm', 'abdome_cm', 'quadril_cm', 'braco_cm', 'coxa_cm', 'panturrilha_cm'];

// Avaliações "ignoradas nas contas" ficam só neste navegador (não apagam nada).
const chaveIgnoradas = (pacienteId) => `lapidare:evolucaoIgnoradas:${pacienteId}`;
function lerIgnoradas(pacienteId) {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveIgnoradas(pacienteId)) ?? '[]');
    return new Set(Array.isArray(bruto) ? bruto : []);
  } catch { return new Set(); }
}

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
    setAvaliacoes(normalizarAvaliacoes(avRes.data));
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
  const metricasDoGrafico = GRAFICO_ORDEM.filter((c) => series[c].length >= 2);
  const campoGrafico = metricasDoGrafico.includes(metricaGrafico) ? metricaGrafico : metricasDoGrafico[0];

  // IMC = peso ÷ altura². Só a conta (sem classificação — critério é da nutricionista).
  const imc = useMemo(() => {
    const alt = [...avaliacoes].reverse().find((a) => Number(a.altura_cm) > 0)?.altura_cm;
    const kgs = series.kg;
    if (!alt || !kgs?.length) return null;
    const f = (kg) => kg / ((Number(alt) / 100) ** 2);
    return { atual: f(kgs[kgs.length - 1].valor), inicio: comparacoes.kg ? f(comparacoes.kg.base.valor) : null };
  }, [avaliacoes, series, comparacoes]);
  const sexo = paciente?.sexo;

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

  // Linha do tempo (check-ins, planos, prescrições, consultas): fica recolhida.
  function renderHistorico(aberto) {
    return (
      <details open={aberto || suspeitas.size > 0} style={{ marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
          Histórico de eventos ({eventos.length}) — avaliações, check-ins, planos e consultas
        </summary>
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

      </details>
    );
  }

  if (avaliacoes.length === 0) {
    // Sem avaliações do Shaped ainda: só o histórico de eventos.
    return (
      <>
        <div className="card empty-card" style={{ marginBottom: 14 }}>
          <i className="ti ti-scale empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem avaliações antropométricas ainda</div>
          <div className="empty-sub">Importe o relatório do Shaped em "Registrar avaliação" e a evolução aparece aqui.</div>
        </div>
        {renderHistorico(true)}
      </>
    );
  }

  const rotuloPeriodo = PERIODOS[periodo];
  const frase = avaliacoes.length === 1
    ? 'Primeira avaliação registrada.'
    : `Acompanhamento de ${tempoDe(totalDias)} · ${rotuloPeriodo.toLowerCase()}.`;

  // ─── Modo apresentação ───
  if (apresentacao) {
    return (
      <ModoApresentacao
        paciente={paciente} sexo={sexo} frase={frase} registros={validas.length} avaliacoes={validas}
        series={series} comparacoes={comparacoes} periodo={periodo} pesoNeutro={pesoNeutro}
        composicao={pesoNeutro ? null : composicao} imc={imc} campoGrafico={campoGrafico} metricasDoGrafico={metricasDoGrafico}
        onTrocar={setMetricaGrafico} rotuloPeriodo={rotuloPeriodo}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {validas.length} avaliaç{validas.length === 1 ? 'ão' : 'ões'}
          {totalDias > 0 && <> · <strong style={{ color: 'var(--dark)' }}>{totalDias} dia{totalDias === 1 ? '' : 's'}</strong> de acompanhamento</>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="evo-periodo" style={{ fontSize: 12, color: 'var(--text3)' }}>Comparar</label>
          <select id="evo-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            style={{ width: 'auto', maxWidth: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--white)', color: 'var(--dark)' }}>
            {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn" onClick={() => setApresentacao(true)}>
            <i className="ti ti-presentation" aria-hidden="true"></i> Modo apresentação
          </button>
        </div>
      </div>

      <AvisoSuspeitas suspeitas={suspeitas} porId={avaliacoesPorId}
        ignoradas={ignoradas} onIgnorar={alternarIgnorada} />

      <Jornada titulo="Evolução da paciente" frase={frase} registros={validas.length}
        pesoComp={comparacoes.kg} composicao={composicao} />

      <CartoesMetricas campos={CARTOES} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        campoAtivo={campoGrafico} onEscolher={setMetricaGrafico} colunas={4} />

      <PainelVisual sexo={sexo} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        campoGrafico={campoGrafico} metricasDoGrafico={metricasDoGrafico} onTrocar={setMetricaGrafico}
        composicao={composicao} registros={validas} />

      <TabelaCalculos campos={TABELA} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        rotuloPeriodo={rotuloPeriodo} imc={imc} />

      {renderHistorico(false)}

      {verCheckin && (
        <VerCheckinModal envio={verCheckin} onClose={() => setVerCheckin(null)} />
      )}
    </>
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
   PAINEL VISUAL: bonequinho + gráfico (com seletor de medida) + composição
   ============================================================ */
function PainelVisual({ sexo, series, comps, pesoNeutro, campoGrafico, metricasDoGrafico, onTrocar, composicao, registros, grande = false }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
        <Bonequinho series={series} comps={comps} pesoNeutro={pesoNeutro} sexo={sexo}
          campoAtivo={campoGrafico} onEscolher={onTrocar} />
        <div>
          <div role="group" aria-label="Medida do gráfico" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {metricasDoGrafico.map((c) => (
              <button key={c} type="button" aria-pressed={c === campoGrafico}
                className={c === campoGrafico ? 'btn' : 'btn-outline'} style={{ fontSize: grande ? 14 : 12, padding: '4px 10px' }}
                onClick={() => onTrocar(c)}>
                {METRICAS[c].rotulo}
              </button>
            ))}
          </div>
          {campoGrafico && (
            <Grafico campo={campoGrafico} serie={series[campoGrafico]}
              sinal={sinalDe(campoGrafico, comps[campoGrafico], pesoNeutro)} comp={comps[campoGrafico]} />
          )}
          {composicao && <div style={{ marginTop: 12 }}><BarrasComposicao registros={registros} composicao={composicao} /></div>}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   MODO APRESENTAÇÃO (tela cheia, para mostrar à paciente na consulta)
   Mesmo visual da ficha, em tamanho grande e sem botões de edição.
   ============================================================ */
function ModoApresentacao({ paciente, sexo, frase, registros, avaliacoes, series, comparacoes, pesoNeutro, composicao, imc,
  campoGrafico, metricasDoGrafico, onTrocar, rotuloPeriodo, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, overflow: 'auto', padding: '40px 32px' }}>
      <button onClick={onClose} style={{
        position: 'fixed', top: 20, right: 20, background: 'var(--dark)', color: 'var(--white)',
        border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
        fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 6, zIndex: 201,
      }}>
        <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
      </button>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold-deep, #a08456)', marginBottom: 8 }}>
          Evolução
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500, color: 'var(--dark)', marginBottom: 16, lineHeight: 1.1 }}>
          {paciente?.nome}
        </h1>
        <Jornada titulo="Sua jornada" frase={frase} registros={registros} pesoComp={comparacoes.kg} composicao={composicao} grande />
        <CartoesMetricas campos={CARTOES} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
          campoAtivo={campoGrafico} onEscolher={onTrocar} colunas={4} grande />
        <PainelVisual sexo={sexo} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
          campoGrafico={campoGrafico} metricasDoGrafico={metricasDoGrafico} onTrocar={onTrocar}
          composicao={composicao} registros={avaliacoes} grande />
        <TabelaCalculos campos={TABELA} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
          rotuloPeriodo={rotuloPeriodo} imc={imc} />
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
