import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR, dataLocalISO } from '../../lib/utils.js';
import { callAnthropic } from '../../lib/anthropic.js';
import { gravar } from '../../lib/gravar.js';
import { confirmar } from '../../lib/dialogos.js';
import { textoRef, fmtNumExame } from '../../data/exames_referencia.js';
import ValorExame, { LegendaExames } from '../../components/ValorExame.jsx';
import GraficosExames from '../../components/GraficosExames.jsx';
import DateInput from '../../components/DateInput.jsx';
import { CAMPOS_EMAG, GRUPOS_EXAME_EMAG, PEDIDO_EMAGRECIMENTO } from '../../data/exames_emagrecimento.js';
import {
  numeroDe, homaIr, achatarExame, chavesAtivas, normalizarRefs, aplicarReferencias, compararExames,
} from '../../lib/examesEmagrecimento.js';

const SolicitacaoExames = lazy(() => import('./_SolicitacaoExames.jsx'));

const TABELA_AUSENTE = (err) => err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''));

const LIMITES = [
  ['min', 'Faixa: mínimo'], ['max', 'Faixa: máximo'],
  ['baixo', 'Atenção se ≤'], ['critico', 'Crítico se ≤'],
  ['alto', 'Atenção se ≥'], ['criticoAlto', 'Crítico se ≥'],
];

const vazio = () => ({ data_exame: dataLocalISO(), obs: '', ...Object.fromEntries(CAMPOS_EMAG.map(c => [c.key, ''])) });

export default function ExamesEmagrecimento({ pacienteId, nutriId, pacienteNome, pacienteSexo }) {
  const [exames, setExames] = useState([]);
  const [refs, setRefs] = useState({});
  const [salvasChaves, setSalvasChaves] = useState(null);      // null = nunca escolheu → todos
  const [semTabelas, setSemTabelas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(vazio);
  const [refsEdit, setRefsEdit] = useState({});
  const [busy, setBusy] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const fileRef = useRef(null);

  async function carregar() {
    const [ex, rf, mc] = await Promise.all([
      supabase.from('exames_emagrecimento').select('id,data_exame,valores,obs').eq('paciente_id', pacienteId).order('data_exame', { ascending: false }),
      supabase.from('exames_emag_referencias').select('dados').eq('nutri_id', nutriId).maybeSingle(),
      supabase.from('exames_emag_marcadores').select('chaves').eq('paciente_id', pacienteId).maybeSingle(),
    ]);
    if (TABELA_AUSENTE(ex.error) || TABELA_AUSENTE(rf.error) || TABELA_AUSENTE(mc.error)) {
      setSemTabelas(true); setCarregando(false); return;
    }
    setExames((ex.data ?? []).map(achatarExame));
    setRefs(rf.data?.dados ?? {});
    setRefsEdit(rf.data?.dados ?? {});
    setSalvasChaves(Array.isArray(mc.data?.chaves) ? mc.data.chaves : null);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);
  useEffect(() => {
    if (!feedback) return undefined;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  const campos = useMemo(() => aplicarReferencias(CAMPOS_EMAG, refs), [refs]);
  const ativas = useMemo(() => new Set(chavesAtivas(salvasChaves, CAMPOS_EMAG)), [salvasChaves]);
  const camposAtivos = useMemo(() => campos.filter(c => ativas.has(c.key)), [campos, ativas]);

  async function alternarMarcador(chave) {
    const atuais = chavesAtivas(salvasChaves, CAMPOS_EMAG);
    const novas = atuais.includes(chave) ? atuais.filter(k => k !== chave) : [...atuais, chave];
    setSalvasChaves(novas);
    const { error } = await supabase.from('exames_emag_marcadores')
      .upsert({ paciente_id: pacienteId, nutri_id: nutriId, chaves: novas, updated_at: new Date().toISOString() });
    if (error) setFeedback({ tipo: 'erro', msg: `Não consegui salvar os marcadores: ${error.message}` });
  }

  async function salvarReferencias() {
    const limpas = normalizarRefs(refsEdit);
    const { error } = await supabase.from('exames_emag_referencias')
      .upsert({ nutri_id: nutriId, dados: limpas, updated_at: new Date().toISOString() });
    if (error) return setFeedback({ tipo: 'erro', msg: `Não consegui salvar as referências: ${error.message}` });
    setRefs(limpas); setRefsEdit(limpas);
    setFeedback({ tipo: 'ok', msg: 'Referências salvas. Valem para todas as suas pacientes.' });
  }

  function setValor(chave, v) {
    setNovo(prev => {
      const prox = { ...prev, [chave]: v };
      // HOMA-IR é calculado a partir de glicemia e insulina — só enquanto o campo não foi digitado à mão.
      if ((chave === 'glicemia_jejum' || chave === 'insulina_jejum') && !prev._homaManual) {
        const h = homaIr(prox.glicemia_jejum, prox.insulina_jejum);
        prox.homa_ir = h == null ? '' : String(h).replace('.', ',');
      }
      if (chave === 'homa_ir') prox._homaManual = v !== '';
      return prox;
    });
  }

  async function registrar() {
    if (!novo.data_exame) return setFeedback({ tipo: 'erro', msg: 'Informe a data do exame.' });
    const valores = {};
    for (const c of CAMPOS_EMAG) {
      const n = numeroDe(novo[c.key]);
      if (n != null) valores[c.key] = n;
    }
    if (Object.keys(valores).length === 0) return setFeedback({ tipo: 'erro', msg: 'Preencha ao menos um valor.' });
    setBusy(true);
    const { error } = await supabase.from('exames_emagrecimento').insert({
      paciente_id: pacienteId, nutri_id: nutriId, data_exame: novo.data_exame,
      valores, obs: novo.obs.trim() || null,
    });
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setNovo(vazio());
    setFeedback({ tipo: 'ok', msg: 'Exame registrado.' });
    carregar();
  }

  async function remover(id) {
    if (!(await confirmar('Remover este exame?'))) return;
    const r = await gravar(supabase.from('exames_emagrecimento').delete().eq('id', id), { rotulo: 'remover o exame' });
    if (!r.ok) return setFeedback({ tipo: 'erro', msg: r.msg });
    carregar();
  }

  async function importarArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLendo(true); setFeedback(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const bloco = file.type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } };
      const lista = camposAtivos.filter(c => !c.calculado)
        .map(c => `  "${c.key}": number ou null   // ${c.label}, em ${c.unidade}`).join(',\n');
      const prompt = `Analise este exame laboratorial e extraia APENAS os valores abaixo, em JSON puro, sem markdown e sem texto extra.
Regras: use o número exatamente como está no laudo. Se o laudo trouxer a unidade diferente da indicada, ou o exame não estiver no laudo, retorne null (nunca converta unidades). Use ponto como separador decimal.
{
  "data_exame": "YYYY-MM-DD ou null",
${lista},
  "obs": "string curta com outros achados relevantes, ou vazio"
}`;
      const bruto = await callAnthropic([{ role: 'user', content: [bloco, { type: 'text', text: prompt }] }], { maxTokens: 1024 });
      let parsed;
      try { parsed = JSON.parse(bruto.replace(/```json\n?|\n?```/g, '').trim()); }
      catch { throw new Error('Não foi possível interpretar a resposta. Tente novamente.'); }
      setNovo(prev => {
        const prox = { ...prev, data_exame: parsed.data_exame || prev.data_exame, obs: parsed.obs || prev.obs };
        for (const c of camposAtivos) {
          if (c.calculado) continue;
          const n = numeroDe(parsed[c.key]);
          if (n != null) prox[c.key] = String(n).replace('.', ',');
        }
        const h = homaIr(prox.glicemia_jejum, prox.insulina_jejum);
        if (h != null && !prev._homaManual) prox.homa_ir = String(h).replace('.', ',');
        return prox;
      });
      setFeedback({ tipo: 'ok', msg: 'Exame lido. Confira os valores e as unidades antes de salvar.' });
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err.message || 'Erro ao processar o exame.' });
    } finally {
      setLendo(false);
    }
  }

  const comparacao = useMemo(() => {
    const a = exames.find(x => String(x.id) === cmpA);
    const b = exames.find(x => String(x.id) === cmpB);
    if (!a || !b) return null;
    const [antigo, novoEx] = a.data_exame <= b.data_exame ? [a, b] : [b, a];
    return { antigo, novo: novoEx, linhas: compararExames(antigo, novoEx, camposAtivos) };
  }, [cmpA, cmpB, exames, camposAtivos]);

  if (carregando) return <div style={{ padding: 16, opacity: 0.7 }}>Carregando…</div>;
  if (semTabelas) {
    return (
      <div className="card card-body" style={{ fontSize: 13 }}>
        As tabelas dos exames de emagrecimento ainda não existem no banco. Rode no Supabase a migration
        <strong> 2026-10-29e_exames_emagrecimento.sql</strong> e recarregue a página.
      </div>
    );
  }

  const inputNum = { width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feedback && (
        <div style={{
          padding: '9px 12px', borderRadius: 8, fontSize: 13,
          background: feedback.tipo === 'ok' ? '#eef5ee' : '#fdf1e7',
          color: feedback.tipo === 'ok' ? '#3f6b46' : '#b45309',
        }}>{feedback.msg}</div>
      )}

      {/* Marcadores acompanhados nesta paciente */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Marcadores acompanhados</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
          Marque só o que você acompanha nesta paciente. A tabela, o formulário e os gráficos mostram apenas esses.
        </div>
        {GRUPOS_EXAME_EMAG.map(g => (
          <div key={g.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CAMPOS_EMAG.filter(c => c.grupo === g.id).map(c => {
                const on = ativas.has(c.key);
                return (
                  <button key={c.key} type="button" onClick={() => alternarMarcador(c.key)} aria-pressed={on}
                    style={{
                      padding: '5px 11px', fontSize: 12, borderRadius: 999, cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: on ? 'var(--dark)' : 'var(--white)',
                      color: on ? '#fff' : 'var(--dark)',
                    }}>{c.label}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Referências da nutri */}
      <details className="card" style={{ padding: '12px 16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Faixas de referência e alertas <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>— você define; valem para todas as pacientes</span>
        </summary>
        <div style={{ fontSize: 12, opacity: 0.75, margin: '10px 0' }}>
          O app não traz nenhuma faixa pronta. Sem faixa, o valor aparece sem cor. Preencha só o que quiser usar.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CAMPOS_EMAG.map(c => (
            <div key={c.key} style={{ borderTop: '0.5px solid var(--border)', paddingTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                {c.label} {c.unidade && <span style={{ opacity: 0.6, fontWeight: 400 }}>({c.unidade})</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                {LIMITES.map(([k, rot]) => (
                  <label key={k} style={{ fontSize: 11, opacity: 0.85 }}>
                    {rot}
                    <input style={inputNum} inputMode="decimal"
                      value={refsEdit[c.key]?.[k] ?? ''}
                      onChange={e => setRefsEdit(p => ({ ...p, [c.key]: { ...(p[c.key] ?? {}), [k]: e.target.value } }))} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={salvarReferencias}>Salvar referências</button>
      </details>

      {/* Solicitar exames */}
      <details className="card" style={{ padding: '12px 16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          📋 Solicitar exames <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>— gerar o pedido para a paciente</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <Suspense fallback={<div style={{ padding: 12 }}>Carregando…</div>}>
            <SolicitacaoExames pacienteId={pacienteId} nutriId={nutriId} pacienteNome={pacienteNome}
              preSelecao={PEDIDO_EMAGRECIMENTO} rotuloPreSelecao="Pré-selecionar exames de emagrecimento" />
          </Suspense>
        </div>
      </details>

      {/* Registrar */}
      <div className="card">
        <div className="card-header"><div className="card-title">🔬 Registrar exame</div></div>
        <div className="card-body">
          <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png" style={{ display: 'none' }} onChange={importarArquivo} />
          <button type="button" className="btn-outline" style={{ marginBottom: 14 }} onClick={() => fileRef.current?.click()} disabled={lendo}>
            <i className="ti ti-file-import" aria-hidden="true" /> {lendo ? 'Lendo o exame…' : 'Importar PDF ou foto do laudo'}
          </button>
          <div style={{ maxWidth: 200, marginBottom: 12 }}>
            <label className="field-label">Data do exame</label>
            <DateInput value={novo.data_exame} onChange={e => setNovo(p => ({ ...p, data_exame: e.target.value }))} />
          </div>
          {camposAtivos.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Marque ao menos um marcador acima.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            {camposAtivos.map(c => (
              <label key={c.key} style={{ fontSize: 12 }}>
                {c.curto}{c.unidade ? ` (${c.unidade})` : ''}{c.calculado ? ' · calculado' : ''}
                <input style={inputNum} inputMode="decimal" value={novo[c.key] ?? ''} onChange={e => setValor(c.key, e.target.value)} />
              </label>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="field-label">Observações</label>
            <input style={inputNum} value={novo.obs} onChange={e => setNovo(p => ({ ...p, obs: e.target.value }))} />
          </div>
          <button className="btn" onClick={registrar} disabled={busy}><i className="ti ti-plus" /> Registrar exame</button>
        </div>
      </div>

      {/* Comparar duas datas */}
      {exames.length >= 2 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Comparar duas datas</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {[[cmpA, setCmpA], [cmpB, setCmpB]].map(([val, set], i) => (
              <select key={i} value={val} onChange={e => set(e.target.value)}>
                <option value="">Escolha o exame {i + 1}</option>
                {exames.map(x => <option key={x.id} value={x.id}>{dataBR(x.data_exame)}</option>)}
              </select>
            ))}
          </div>
          {comparacao && (comparacao.linhas.length === 0
            ? <div style={{ fontSize: 13, opacity: 0.7 }}>Os dois exames não têm marcadores em comum entre os acompanhados.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Marcador</th><th>{dataBR(comparacao.antigo.data_exame)}</th><th>{dataBR(comparacao.novo.data_exame)}</th><th>Diferença</th></tr></thead>
                  <tbody>
                    {comparacao.linhas.map(l => (
                      <tr key={l.campo.key}>
                        <td>{l.campo.label}</td>
                        <td><ValorExame campo={l.campo} valor={l.a} sexo={pacienteSexo} /></td>
                        <td><ValorExame campo={l.campo} valor={l.b} sexo={pacienteSexo} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {l.dif > 0 ? '+' : ''}{fmtNumExame(l.dif, l.campo.dec ?? 0)}
                          {l.pct != null && <span style={{ opacity: 0.6 }}> ({l.pct > 0 ? '+' : ''}{fmtNumExame(l.pct, 1)}%)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}

      {/* Histórico */}
      {exames.length > 0 && camposAtivos.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, opacity: 0.7, borderBottom: '0.5px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Histórico de exames
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  {camposAtivos.map(c => {
                    const ref = textoRef(c, pacienteSexo);
                    return (
                      <th key={c.key} style={{ whiteSpace: 'nowrap' }}>
                        {c.curto}
                        {ref && <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>{ref}</div>}
                      </th>
                    );
                  })}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exames.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataBR(e.data_exame)}</td>
                    {camposAtivos.map(c => <td key={c.key}><ValorExame campo={c} valor={e[c.key]} sexo={pacienteSexo} /></td>)}
                    <td>
                      <button type="button" onClick={() => remover(e.id)} aria-label="Remover exame"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                        <i className="ti ti-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px 10px' }}><LegendaExames /></div>
        </div>
      )}

      <GraficosExames exames={exames} sexo={pacienteSexo} campos={camposAtivos} />
    </div>
  );
}
