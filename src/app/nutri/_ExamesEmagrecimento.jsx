import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR, dataLocalISO } from '../../lib/utils.js';
import { callAnthropic } from '../../lib/anthropic.js';
import { gravar } from '../../lib/gravar.js';
import { confirmar } from '../../lib/dialogos.js';
import { textoRef, fmtNumExame } from '../../data/exames_referencia.js';
import ValorExame from '../../components/ValorExame.jsx';
import GraficosExames from '../../components/GraficosExames.jsx';
import DateInput from '../../components/DateInput.jsx';
import ResumoExames from '../../components/ResumoExames.jsx';
import { CAMPOS_EMAG, GRUPOS_EXAME_EMAG, PAINEIS_EMAG, CHAVES_PADRAO_EMAG, PEDIDO_EMAGRECIMENTO, AVISO_GERAL_EXAMES } from '../../data/exames_emagrecimento.js';
import {
  valorDoCampo, homaIr, achatarExame, chavesAtivas, aplicarReferencias, compararExames, rotuloCriterio,
} from '../../lib/examesEmagrecimento.js';

const SolicitacaoExames = lazy(() => import('./_SolicitacaoExames.jsx'));

const TABELA_AUSENTE = (err) => err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''));

const vazio = () => ({ data_exame: dataLocalISO(), obs: '', ...Object.fromEntries(CAMPOS_EMAG.map(c => [c.key, ''])) });

export default function ExamesEmagrecimento({ pacienteId, nutriId, pacienteNome, pacienteSexo }) {
  const [exames, setExames] = useState([]);
  const [refs, setRefs] = useState({});
  const [salvasChaves, setSalvasChaves] = useState(null);      // null = nunca escolheu → todos
  const [semTabelas, setSemTabelas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  // Chaves preenchidas pela leitura do laudo e ainda não conferidas pela nutri (mexer no campo = conferido).
  const [aConferir, setAConferir] = useState(() => new Set());
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
  const ativas = useMemo(() => new Set(chavesAtivas(salvasChaves, CAMPOS_EMAG, CHAVES_PADRAO_EMAG)), [salvasChaves]);
  const camposAtivos = useMemo(() => campos.filter(c => ativas.has(c.key)), [campos, ativas]);

  async function gravarMarcadores(novas) {
    setSalvasChaves(novas);
    const { error } = await supabase.from('exames_emag_marcadores')
      .upsert({ paciente_id: pacienteId, nutri_id: nutriId, chaves: novas, updated_at: new Date().toISOString() });
    if (error) setFeedback({ tipo: 'erro', msg: `Não consegui salvar os marcadores: ${error.message}` });
  }
  function alternarMarcador(chave) {
    const atuais = chavesAtivas(salvasChaves, CAMPOS_EMAG, CHAVES_PADRAO_EMAG);
    gravarMarcadores(atuais.includes(chave) ? atuais.filter(k => k !== chave) : [...atuais, chave]);
  }
  // Painel inteiro: se já está todo marcado, desmarca; senão marca o que faltar.
  function alternarPainel(chaves) {
    const atuais = new Set(chavesAtivas(salvasChaves, CAMPOS_EMAG, CHAVES_PADRAO_EMAG));
    const todos = chaves.every(k => atuais.has(k));
    chaves.forEach(k => { if (todos) atuais.delete(k); else atuais.add(k); });
    gravarMarcadores(CAMPOS_EMAG.map(c => c.key).filter(k => atuais.has(k)));
  }
  function alternarGrupo(grupoId) {
    alternarPainel(CAMPOS_EMAG.filter(c => c.grupo === grupoId).map(c => c.key));
  }

  function setValor(chave, v) {
    setAConferir(prev => { if (!prev.has(chave)) return prev; const n = new Set(prev); n.delete(chave); return n; });
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
      const n = valorDoCampo(c, novo[c.key]);
      if (n != null) valores[c.key] = n;
    }
    if (Object.keys(valores).length === 0) return setFeedback({ tipo: 'erro', msg: 'Preencha ao menos um valor.' });
    if (aConferir.size > 0 && !(await confirmar(`${aConferir.size} valor(es) lido(s) do laudo ainda não foram conferidos. Registrar mesmo assim?`, { confirmarRotulo: 'Registrar', cancelarRotulo: 'Voltar e conferir' }))) return;
    setBusy(true);
    const { error } = await supabase.from('exames_emagrecimento').insert({
      paciente_id: pacienteId, nutri_id: nutriId, data_exame: novo.data_exame,
      valores, obs: novo.obs.trim() || null,
    });
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setNovo(vazio());
    setAConferir(new Set());
    setFeedback({ tipo: 'ok', msg: 'Exame registrado.' });
    carregar();
  }

  async function remover(id) {
    if (!(await confirmar('Remover este exame?'))) return;
    const r = await gravar(supabase.from('exames_emagrecimento').delete().eq('id', id), { rotulo: 'remover o exame' });
    if (!r.ok) return setFeedback({ tipo: 'erro', msg: r.msg });
    carregar();
  }

  // Lê o laudo inteiro: a IA recebe o catálogo COMPLETO (não só os marcadores já escolhidos),
  // devolve tudo o que reconhecer, e os marcadores encontrados passam a ser acompanhados nesta
  // paciente. O formulário é preenchido para conferência: quem grava é você, no "Registrar".
  async function importarArquivo(e) {
    const arquivos = Array.from(e.target.files ?? []).slice(0, 6);
    e.target.value = '';
    if (arquivos.length === 0) return;
    // O envio vai por uma função com limite de ~6 MB (base64 incha o arquivo em 1/3).
    if (arquivos.reduce((t, f) => t + f.size, 0) > 4.2 * 1024 * 1024) {
      return setFeedback({ tipo: 'erro', msg: 'Os arquivos somam mais de 4 MB. Envie menos páginas por vez ou reduza o tamanho das fotos.' });
    }
    setLendo(true); setFeedback(null);
    try {
      const blocos = [];
      for (const file of arquivos) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        blocos.push(file.type === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } });
      }
      const catalogo = CAMPOS_EMAG.filter(c => !c.calculado)
        .map(c => `${c.key} | ${c.label} | ${c.tipo === 'texto' ? 'texto do laudo' : (c.unidade || 'sem unidade')}`)
        .join('\n');
      const prompt = `Você lê laudos de exames laboratoriais. Extraia TODOS os resultados do(s) documento(s) que correspondam ao catálogo abaixo (formato: chave | exame | unidade esperada). Reconheça sinônimos (por exemplo TGO = AST, TGP = ALT, glicose = glicemia, HbA1c = hemoglobina glicada, colesterol não-HDL, PCR-us).
Responda SOMENTE com JSON puro, sem markdown e sem texto extra, neste formato:
{
  "data_exame": "YYYY-MM-DD ou null (data da coleta)",
  "valores": { "<chave>": <número, ou texto exato do laudo nos exames marcados "texto do laudo"> },
  "nao_aproveitados": [ { "exame": "nome no laudo", "valor": "valor no laudo", "unidade": "unidade no laudo", "motivo": "fora do catálogo | unidade diferente da esperada" } ],
  "obs": "string curta com observações relevantes do laudo, ou vazio"
}
Regras:
- Inclua em "valores" apenas as chaves que aparecem no laudo; não invente nem estime nenhum valor.
- Copie o número exatamente como está no laudo, com ponto como separador decimal. Nunca converta unidades: se a unidade do laudo for diferente da esperada, NÃO coloque em "valores"; coloque em "nao_aproveitados" com o motivo.
- Quando o laudo trouxer o mesmo exame em percentual e em valor absoluto (leucograma), use o que corresponde à unidade esperada do catálogo.
- Não inclua o HOMA-IR (é calculado pelo app).
- Resultados que não estão no catálogo vão em "nao_aproveitados" com motivo "fora do catálogo".
Catálogo:
${catalogo}`;
      const bruto = await callAnthropic([{ role: 'user', content: [...blocos, { type: 'text', text: prompt }] }], { maxTokens: 4096 });
      let parsed;
      try { parsed = JSON.parse(bruto.replace(/```json\n?|\n?```/g, '').trim()); }
      catch { throw new Error('Não foi possível interpretar a resposta. Tente novamente.'); }

      // Só vale o que está no catálogo e tem valor utilizável.
      const lidos = {};
      for (const c of CAMPOS_EMAG) {
        if (c.calculado) continue;
        const v = valorDoCampo(c, parsed?.valores?.[c.key]);
        if (v != null) lidos[c.key] = v;
      }
      const chavesLidas = Object.keys(lidos);
      if (chavesLidas.length === 0) throw new Error('Não encontrei nenhum resultado do catálogo nesse arquivo.');

      const jaAtivas = new Set(chavesAtivas(salvasChaves, CAMPOS_EMAG, CHAVES_PADRAO_EMAG));
      const novasAtivas = chavesLidas.filter(k => !jaAtivas.has(k));
      if (novasAtivas.length) {
        await gravarMarcadores(CAMPOS_EMAG.map(c => c.key).filter(k => jaAtivas.has(k) || lidos[k] != null));
      }

      const naoAproveitados = Array.isArray(parsed?.nao_aproveitados) ? parsed.nao_aproveitados : [];
      const textoNao = naoAproveitados
        .map(x => `${x?.exame ?? '?'}: ${x?.valor ?? '?'} ${x?.unidade ?? ''} (${x?.motivo ?? ''})`.trim())
        .join('; ');

      setAConferir(new Set(chavesLidas));
      setNovo(prev => {
        const prox = { ...prev, data_exame: parsed?.data_exame || prev.data_exame };
        for (const [k, v] of Object.entries(lidos)) prox[k] = typeof v === 'string' ? v : String(v).replace('.', ',');
        const h = homaIr(prox.glicemia_jejum, prox.insulina_jejum);
        if (h != null && !prev._homaManual) prox.homa_ir = String(h).replace('.', ',');
        const extras = [parsed?.obs, textoNao ? `Não aproveitados na leitura: ${textoNao}` : ''].filter(Boolean).join(' · ');
        if (extras) prox.obs = [prev.obs, extras].filter(Boolean).join(' · ');
        return prox;
      });
      setFeedback({
        tipo: 'ok',
        msg: `${chavesLidas.length} resultado(s) lido(s)`
          + (novasAtivas.length ? `; ${novasAtivas.length} marcador(es) novo(s) incluído(s) nesta paciente` : '')
          + (naoAproveitados.length ? `; ${naoAproveitados.length} não aproveitado(s) (unidade diferente ou fora do catálogo — veja nas observações)` : '')
          + '. Confira os valores e as unidades antes de registrar.',
      });
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
  const estiloCampo = (chave) => (aConferir.has(chave) ? { ...inputNum, borderColor: '#d97706', background: '#fffaf0' } : inputNum);
  const porGrupo = (lista) => GRUPOS_EXAME_EMAG
    .map(g => ({ grupo: g, campos: lista.filter(c => c.grupo === g.id) }))
    .filter(x => x.campos.length > 0);
  const painelMarcado = (chaves) => chaves.every(k => ativas.has(k));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feedback && (
        <div style={{
          padding: '9px 12px', borderRadius: 8, fontSize: 13,
          background: feedback.tipo === 'ok' ? '#eef5ee' : '#fdf1e7',
          color: feedback.tipo === 'ok' ? '#3f6b46' : '#b45309',
        }}>{feedback.msg}</div>
      )}

      <ResumoExames exames={exames} campos={camposAtivos} sexo={pacienteSexo} />

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

      {/* Registrar — logo abaixo do pedido */}
      <div className="card">
        <div className="card-header"><div className="card-title">🔬 Registrar exame</div></div>
        <div className="card-body">
          <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png" multiple style={{ display: 'none' }} onChange={importarArquivo} />
          <button type="button" className="btn-outline" style={{ marginBottom: 14 }} onClick={() => fileRef.current?.click()} disabled={lendo}>
            <i className="ti ti-file-import" aria-hidden="true" /> {lendo ? 'Lendo o exame…' : 'Importar laudo (PDF ou fotos)'}
          </button>
          <div style={{ maxWidth: 200, marginBottom: 12 }}>
            <label className="field-label">Data do exame</label>
            <DateInput value={novo.data_exame} onChange={e => setNovo(p => ({ ...p, data_exame: e.target.value }))} />
          </div>
          {aConferir.size > 0 && (
            <div style={{ background: '#fdf1e7', color: '#b45309', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>
                <strong>{aConferir.size} valor(es) lido(s) do laudo</strong> (campos destacados). Compare com o documento — número e unidade —
                antes de registrar. Ao editar um campo, ele sai do destaque.
              </span>
              <button type="button" className="btn-outline" onClick={() => setAConferir(new Set())}>Conferi tudo</button>
            </div>
          )}
          {camposAtivos.length === 0 && <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>Escolha abaixo os marcadores que você acompanha nesta paciente.</div>}
          {porGrupo(camposAtivos).map(({ grupo, campos: cs }) => (
            <div key={grupo.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 6 }}>{grupo.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {cs.map(c => (
                  <label key={c.key} style={{ fontSize: 12 }}>
                    {c.curto}{c.unidade ? ` (${c.unidade})` : ''}{c.calculado ? ' · calculado' : ''}
                    {c.tipo === 'texto'
                      ? (
                        <>
                          <input style={estiloCampo(c.key)} list={c.opcoes ? `op-${c.key}` : undefined} placeholder={c.refTexto}
                            value={novo[c.key] ?? ''} onChange={e => setValor(c.key, e.target.value)} />
                          {c.opcoes && <datalist id={`op-${c.key}`}>{c.opcoes.map(o => <option key={o} value={o} />)}</datalist>}
                        </>
                      )
                      : <input style={estiloCampo(c.key)} inputMode="decimal" value={novo[c.key] ?? ''} onChange={e => setValor(c.key, e.target.value)} />}
                    {/* A faixa fica à vista já na digitação, como na Oncologia:
                        é onde se percebe o valor estranho antes de gravar. */}
                    {(() => {
                      const ref = textoRef(c, pacienteSexo) ?? c.refTexto;
                      return ref ? (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }} title={c.refNota || undefined}>
                          ref. {ref}{c.personalizada ? ' (sua)' : ''}
                        </div>
                      ) : null;
                    })()}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <label className="field-label">Observações</label>
            <input style={inputNum} value={novo.obs} onChange={e => setNovo(p => ({ ...p, obs: e.target.value }))} />
          </div>
          <button className="btn" onClick={registrar} disabled={busy}><i className="ti ti-plus" /> Registrar exame</button>
        </div>
      </div>

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
                    const ref = textoRef(c, pacienteSexo) ?? c.refTexto;
                    return (
                      <th key={c.key} style={{ whiteSpace: 'nowrap' }} title={c.refNota || undefined}>
                        {c.curto}
                        {ref && <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>{ref}{c.personalizada ? ' (sua)' : ''}</div>}
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
                    {camposAtivos.map(c => {
                      const rot = rotuloCriterio(c, e[c.key]);
                      return (
                        <td key={c.key}>
                          <ValorExame campo={c} valor={e[c.key]} sexo={pacienteSexo} />
                          {rot && <div style={{ fontSize: 10, opacity: 0.65, maxWidth: 110, whiteSpace: 'normal' }}>{rot}</div>}
                        </td>
                      );
                    })}
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
          <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, opacity: 0.75 }}>
              <span><span style={{ color: '#16a34a' }}>●</span> dentro da referência</span>
              <span><span style={{ color: '#d97706' }}>●</span> fora da referência</span>
              <span><span style={{ color: '#dc2626' }}>●</span> crítico (só se você definir um limite)</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{AVISO_GERAL_EXAMES}</div>
          </div>
        </div>
      )}

      <GraficosExames exames={exames} sexo={pacienteSexo} campos={camposAtivos.filter(c => c.tipo !== 'texto')} />

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

      {/* Marcadores acompanhados nesta paciente */}
      <details className="card" style={{ padding: '12px 16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Marcadores acompanhados <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>— {ativas.size} nesta paciente</span>
        </summary>
        <div style={{ fontSize: 12, opacity: 0.7, margin: '10px 0' }}>
          Comece pelos três painéis prioritários e acrescente os demais conforme a indicação e o contexto da paciente.
          O formulário, o histórico e os gráficos mostram só os marcados.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {PAINEIS_EMAG.map(pn => (
            <button key={pn.id} type="button" className="btn-outline" style={{ fontSize: 12 }} onClick={() => alternarPainel(pn.chaves)}>
              {painelMarcado(pn.chaves) ? '✓ ' : ''}{pn.label}
            </button>
          ))}
        </div>
        {porGrupo(CAMPOS_EMAG).map(({ grupo, campos: cs }) => (
          <div key={grupo.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.6 }}>{grupo.label}</span>
              <button type="button" onClick={() => alternarGrupo(grupo.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text3)', textDecoration: 'underline' }}>
                {cs.every(c => ativas.has(c.key)) ? 'desmarcar todos' : 'marcar todos'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cs.map(c => {
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
            {(grupo.nota || grupo.aviso) && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, opacity: 0.7 }}>Sobre este grupo</summary>
                {grupo.nota && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{grupo.nota}</div>}
                {grupo.aviso && <div style={{ fontSize: 12, marginTop: 4, color: '#b45309' }}>Atenção: {grupo.aviso}</div>}
              </details>
            )}
          </div>
        ))}
      </details>

    </div>
  );
}
