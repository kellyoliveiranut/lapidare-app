import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { dataBR } from '../../lib/utils.js';
import { diasEntre, ehEmagrecimento } from '../../lib/resultadosClinicos.js';
import {
  METRICAS, PERIODOS, serieDaMetrica, comparar, detectarSuspeitas,
  composicaoCorporal, fmtDelta, fmtValor,
  normalizarAvaliacoes, idadeEm, classificarImc,
} from '../../lib/evolucaoAvaliacoes.js';
import { tempoDe } from '../../lib/sinaleira.js';
import { METAS, TEMAS, MAX_METAS, temaDoObjetivo } from '../../lib/metasEvolucao.js';
import {
  Jornada, CartoesMetricas, TabelaCalculos, Grafico, Bonequinho, BarrasComposicao,
} from '../../components/EvolucaoVisual.jsx';
import { sinalDe } from '../../lib/sinaleira.js';

const CARTOES = ['kg', 'cintura_cm', 'pgc', 'mm_kg'];
// Ordem da tabela de cálculos: tudo o que o Shaped traz.
const TABELA = ['kg', 'pgc', 'gordura_kg', 'mm_kg', 'mm_pct', 'hidratacao_pct', 'cintura_cm', 'abdome_cm',
  'quadril_cm', 'braco_cm', 'coxa_cm', 'panturrilha_cm', 'geb_kcal', 'get_kcal'];
const GRAFICO_ORDEM = ['kg', 'pgc', 'gordura_kg', 'mm_kg', 'cintura_cm', 'abdome_cm', 'quadril_cm', 'braco_cm', 'coxa_cm', 'panturrilha_cm'];

// "Ignorar nas contas" agora fica no banco (peso_registros.ignorar_calculo). A marcação antiga,
// guardada só neste navegador, é migrada para o banco na primeira carga e depois apagada.
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
  const [apresentacao, setApresentacao] = useState(false);
  const [periodo, setPeriodo] = useState('inicio');
  const [metricaGrafico, setMetricaGrafico] = useState('kg');
  const [erroIgnorar, setErroIgnorar] = useState('');
  const [sexoLocal, setSexoLocal] = useState(null);
  const [erroSexo, setErroSexo] = useState('');
  const [metas, setMetas] = useState(() => paciente?.metas_evolucao ?? []);
  const [metasSalvas, setMetasSalvas] = useState(() => paciente?.metas_evolucao ?? []);
  const [metasMsg, setMetasMsg] = useState('');

  // Deriva do que veio do banco: não há estado paralelo para ficar fora de sincronia.
  const ignoradas = useMemo(
    () => new Set(avaliacoes.filter((a) => a.ignorar_calculo).map((a) => a.id)),
    [avaliacoes],
  );

  async function alternarIgnorada(id) {
    const marcar = !ignoradas.has(id);
    setErroIgnorar('');
    const r = await gravar(
      supabase.from('peso_registros').update({ ignorar_calculo: marcar }).eq('id', id),
      { rotulo: marcar ? 'ignorar a avaliação nas contas' : 'voltar a usar a avaliação' },
    );
    if (!r.ok) { setErroIgnorar(r.msg); return; }
    setAvaliacoes((lst) => lst.map((a) => (a.id === id ? { ...a, ignorar_calculo: marcar } : a)));
  }

  async function salvarSexo(v) {
    setErroSexo('');
    const r = await gravar(supabase.from('pacientes').update({ sexo: v }).eq('id', pacienteId), { rotulo: 'salvar o sexo' });
    if (!r.ok) { setErroSexo(r.msg); return; }
    setSexoLocal(v);
  }

  function alternarMeta(id) {
    setMetasMsg('');
    setMetas((lst) => {
      if (lst.includes(id)) return lst.filter((x) => x !== id);
      return lst.length >= MAX_METAS ? lst : [...lst, id];
    });
  }

  async function salvarMetas() {
    setMetasMsg('');
    const r = await gravar(
      supabase.from('pacientes').update({ metas_evolucao: metas }).eq('id', pacienteId),
      { rotulo: 'salvar as metas' },
    );
    if (!r.ok) { setMetasMsg(r.msg); return; }
    setMetasSalvas(metas);
    setMetasMsg(metas.length ? 'Metas salvas. A paciente vê na tela de evolução dela.' : 'Metas removidas.');
  }

  async function carregar(signal = { cancelled: false }) {
    const avRes = await supabase.from('peso_registros').select('id,data,kg,altura_cm,pgc,mm_kg,mm_pct,gordura_kg,cintura_cm,quadril_cm,abdome_cm,braco_cm,braco_dir_cm,braco_esq_cm,coxa_cm,coxa_dir_cm,coxa_esq_cm,panturrilha_cm,hidratacao_pct,geb_kcal,get_kcal,obs,ignorar_calculo').eq('paciente_id', pacienteId).order('data');
    if (signal.cancelled) return;
    let lista = normalizarAvaliacoes(avRes.data);
    // Migra o que a Kelly marcou antes neste navegador (uma vez; depois apaga a chave).
    const antigas = lerIgnoradas(pacienteId);
    if (antigas.size > 0) {
      const ids = lista.filter((a) => antigas.has(a.id) && !a.ignorar_calculo).map((a) => a.id);
      let ok = true;
      if (ids.length > 0) {
        const r = await gravar(supabase.from('peso_registros').update({ ignorar_calculo: true }).in('id', ids), { esperado: ids.length, rotulo: 'migrar as avaliações ignoradas' });
        ok = r.ok;
        if (ok) lista = lista.map((a) => (ids.includes(a.id) ? { ...a, ignorar_calculo: true } : a));
      }
      if (ok) { try { localStorage.removeItem(chaveIgnoradas(pacienteId)); } catch { /* sem storage */ } }
    }
    if (signal.cancelled) return;
    setAvaliacoes(lista);
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

  // IMC = peso ÷ altura², classificado pela idade em cada data (adulto OMS / idoso Lipschitz).
  const imc = useMemo(() => {
    const alt = [...avaliacoes].reverse().find((a) => Number(a.altura_cm) > 0)?.altura_cm;
    const kgs = series.kg;
    if (!alt || !kgs?.length) return null;
    const f = (kg) => kg / ((Number(alt) / 100) ** 2);
    const ult = kgs[kgs.length - 1];
    const nasc = paciente?.nascimento;
    const base = comparacoes.kg?.base;
    const vAtual = f(ult.valor), vInicio = base ? f(base.valor) : null;
    return {
      atual: vAtual, inicio: vInicio,
      classeAtual: classificarImc(vAtual, idadeEm(nasc, ult.data)),
      classeInicio: vInicio != null ? classificarImc(vInicio, idadeEm(nasc, base.data)) : null,
      semNascimento: !nasc,
    };
  }, [avaliacoes, series, comparacoes, paciente?.nascimento]);
  const sexo = sexoLocal ?? paciente?.sexo;

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando evolução…</div></div>;
  }

  if (avaliacoes.length === 0) {
    return (
      <>
        <div className="card empty-card" style={{ marginBottom: 14 }}>
          <i className="ti ti-scale empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem avaliações antropométricas ainda</div>
          <div className="empty-sub">Importe o relatório do Shaped em "Registrar avaliação" e a evolução aparece aqui.</div>
        </div>
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

      {!sexo && (
        <div className="card" role="status" style={{ padding: '12px 16px', marginBottom: 12, borderColor: 'var(--amber, #d97706)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Sexo não informado.</strong> A silhueta do corpo e o check-in dependem dele. Enquanto isso aparece a silhueta feminina.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-outline" type="button" onClick={() => salvarSexo('feminino')}>Feminino</button>
            <button className="btn-outline" type="button" onClick={() => salvarSexo('masculino')}>Masculino</button>
            {erroSexo && <span role="alert" style={{ fontSize: 12, color: '#a2442b' }}>{erroSexo}</span>}
          </div>
        </div>
      )}

      <AvisoSuspeitas suspeitas={suspeitas} porId={avaliacoesPorId}
        ignoradas={ignoradas} onIgnorar={alternarIgnorada} />
      {erroIgnorar && <div role="alert" style={{ fontSize: 12, color: '#a2442b', margin: '-4px 0 10px' }}>{erroIgnorar}</div>}

      <Jornada titulo="Evolução da paciente" frase={frase} registros={validas.length}
        pesoComp={comparacoes.kg} composicao={composicao} />

      <CampoMetas objetivo={paciente?.objetivo} escolhidas={metas} salvas={metasSalvas} msg={metasMsg}
        onAlternar={alternarMeta} onSalvar={salvarMetas} />

      <CartoesMetricas campos={CARTOES} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        campoAtivo={campoGrafico} onEscolher={setMetricaGrafico} colunas={4} />

      <PainelVisual sexo={sexo} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        campoGrafico={campoGrafico} metricasDoGrafico={metricasDoGrafico} onTrocar={setMetricaGrafico}
        composicao={composicao} registros={validas} />

      <ListaAvaliacoes avaliacoes={avaliacoes} ignoradas={ignoradas} suspeitas={suspeitas} onAlternar={alternarIgnorada} />

      <TabelaCalculos campos={TABELA} series={series} comps={comparacoes} pesoNeutro={pesoNeutro}
        rotuloPeriodo={rotuloPeriodo} imc={imc} />

    </>
  );
}

/* ============================================================
   AVISO "CONFERIR" (salto improvável) — não apaga nada
   ============================================================ */
// Todas as avaliações, recolhidas, cada uma com "Ignorar nas contas" / "Voltar a usar".
function ListaAvaliacoes({ avaliacoes, ignoradas, suspeitas, onAlternar }) {
  const lista = [...avaliacoes].reverse();
  return (
    <details className="card" style={{ padding: '12px 16px', marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
        Avaliações registradas ({avaliacoes.length})
      </summary>
      <div style={{ marginTop: 8 }}>
        {lista.map((a) => {
          const ign = ignoradas.has(a.id);
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '0.5px solid var(--hair-soft, #e6dfd3)', opacity: ign ? 0.6 : 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 84 }}>{dataBR(a.data)}</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 80 }}>{a.kg != null ? fmtValor('kg', a.kg) : '—'}</span>
              {suspeitas.has(a.id) && <span style={{ fontSize: 11, color: '#a2442b' }}>conferir</span>}
              {ign && <span style={{ fontSize: 11, color: 'var(--text3)' }}>ignorada nas contas</span>}
              <button className="btn-outline" type="button" onClick={() => onAlternar(a.id)}>
                {ign ? 'Voltar a usar' : 'Ignorar nas contas'}
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// Metas da paciente: a nutri marca no catálogo (lib/metasEvolucao.js), até MAX_METAS.
// Começa pelo tema do objetivo da paciente; os outros temas ficam um clique abaixo.
function CampoMetas({ objetivo, escolhidas, salvas, msg, onAlternar, onSalvar }) {
  const sugerido = temaDoObjetivo(objetivo);
  const [verTodos, setVerTodos] = useState(false);
  const mudou = escolhidas.length !== salvas.length || escolhidas.some((c) => !salvas.includes(c));
  const temas = TEMAS.filter((t) => verTodos || t.id === sugerido || t.id === 'geral'
    || METAS.some((m) => m.tema === t.id && escolhidas.includes(m.id)));
  const cheio = escolhidas.length >= MAX_METAS;
  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500, marginBottom: 8 }}>
        Metas da paciente ({escolhidas.length}/{MAX_METAS}) · a paciente vê na evolução dela
      </div>
      {temas.map((t) => (
        <fieldset key={t.id} style={{ border: 'none', padding: 0, margin: '0 0 8px' }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 4, padding: 0 }}>{t.rotulo}</legend>
          {METAS.filter((m) => m.tema === t.id).map((m) => {
            const marcada = escolhidas.includes(m.id);
            return (
              <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, padding: '3px 0', opacity: !marcada && cheio ? 0.5 : 1 }}>
                <input type="checkbox" checked={marcada} disabled={!marcada && cheio}
                  onChange={() => onAlternar(m.id)} style={{ marginTop: 3, width: 'auto' }} />
                <span>{m.texto}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <button type="button" className="btn-outline" onClick={() => setVerTodos((v) => !v)} style={{ marginBottom: 8 }}>
        {verTodos ? 'Mostrar só o tema da paciente' : 'Ver metas de outros temas'}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="button" disabled={!mudou} onClick={onSalvar}>Salvar metas</button>
        {cheio && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Limite de {MAX_METAS} metas: desmarque uma para trocar.</span>}
        {msg && <span role="status" style={{ fontSize: 12, color: msg.startsWith('Não consegui') ? '#a2442b' : 'var(--text3)' }}>{msg}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
        Os textos das metas são um rascunho para a sua revisão (src/lib/metasEvolucao.js). Nenhuma tem número, prazo ou promessa de resultado.
      </div>
    </div>
  );
}

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
