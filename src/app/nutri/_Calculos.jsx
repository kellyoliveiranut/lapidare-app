import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase.js';

/* ── helpers ─────────────────────────────────────── */
const r1 = (v) => Math.round(v * 10) / 10;
const r0 = (v) => Math.round(v);

function harrisBenedict(sexo, peso, altura, idade) {
  if (sexo === 'M') return 66.5 + 13.75 * peso + 5.003 * altura - 6.775 * idade;
  return 655.1 + 9.563 * peso + 1.850 * altura - 4.676 * idade;
}
function mifflinStJeor(sexo, peso, altura, idade) {
  if (sexo === 'M') return 10 * peso + 6.25 * altura - 5 * idade + 5;
  return 10 * peso + 6.25 * altura - 5 * idade - 161;
}
function iretonJones(peso, idade, obeso) {
  return 629 - 11 * idade + 25 * peso - 609 * (obeso ? 1 : 0);
}
function calcIMC(peso, altura) { return peso / Math.pow(altura / 100, 2); }
function classIMC(imc) {
  if (imc < 16)   return { label: 'Magreza Grau III', cor: '#dc2626' };
  if (imc < 17)   return { label: 'Magreza Grau II',  cor: '#dc2626' };
  if (imc < 18.5) return { label: 'Magreza Grau I',   cor: '#d97706' };
  if (imc < 25)   return { label: 'Eutrofia',          cor: '#16a34a' };
  if (imc < 30)   return { label: 'Sobrepeso',         cor: '#d97706' };
  if (imc < 35)   return { label: 'Obesidade I',       cor: '#ea580c' };
  if (imc < 40)   return { label: 'Obesidade II',      cor: '#dc2626' };
  return           { label: 'Obesidade III',            cor: '#7f1d1d' };
}
function pesoIdealLorentz(sexo, altura) {
  if (sexo === 'M') return altura - 100 - (altura - 150) / 4;
  return altura - 100 - (altura - 150) / 2.5;
}
function hollidaySegar(peso) {
  if (peso <= 10) return peso * 100;
  if (peso <= 20) return 1000 + (peso - 10) * 50;
  return 1500 + (peso - 20) * 20;
}
function calcIdade(nascISO) {
  if (!nascISO) return null;
  const n = new Date(nascISO + 'T12:00:00');
  const h = new Date();
  let age = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) age--;
  return age;
}

/* ── shared ui atoms ─────────────────────────────── */
function SubTabs({ tabs, current, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 8, padding: 3, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: '0 0 auto', padding: '6px 12px', fontSize: 12, fontWeight: 500,
          borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          background: current === t.id ? 'var(--white)' : 'transparent',
          color: current === t.id ? 'var(--dark)' : 'var(--text3)',
          boxShadow: current === t.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-sans)',
        }}>
          <i className={`ti ti-${t.icon}`} style={{ fontSize: 13 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ResultCard({ label, value, unit, sub, destaque }) {
  return (
    <div style={{
      background: destaque ? '#fffbeb' : 'var(--bg2)',
      borderRadius: 8, padding: '12px 14px',
      border: destaque ? '1.5px solid var(--amber, #f59e0b)' : '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--dark)', lineHeight: 1.1 }}>
        {value} <span style={{ fontSize: 12, fontWeight: 500 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function EmptyMsg() {
  return (
    <div className="card empty-card">
      <div className="empty-sub">Informe peso, altura e data de nascimento nos Dados Básicos para calcular.</div>
    </div>
  );
}

/* ── NRS-2002 ─────────────────────────────────────── */
function NRS2002({ imc, idade, pacienteId, nutriId }) {
  const [step, setStep] = useState('pre');
  const [pre, setPre] = useState({ q1: false, q2: false, q3: false, q4: false });
  const [scoreNutri, setScoreNutri] = useState('');
  const [scoreDoenca, setScoreDoenca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msgSalvo, setMsgSalvo] = useState(null);

  const prePositivo = pre.q1 || pre.q2 || pre.q3 || pre.q4;
  const correcaoIdade = (idade >= 70) ? 1 : 0;
  const total = (parseInt(scoreNutri) || 0) + (parseInt(scoreDoenca) || 0) + correcaoIdade;
  const emRisco = total >= 3;

  useEffect(() => {
    if (!pacienteId) return;
    supabase
      .from('rastreios_nutricionais')
      .select('respostas')
      .eq('paciente_id', pacienteId)
      .eq('tipo', 'nrs2002')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const r = data.respostas;
        if (r.pre)         setPre(r.pre);
        if (r.scoreNutri)  setScoreNutri(r.scoreNutri);
        if (r.scoreDoenca) setScoreDoenca(r.scoreDoenca);
        if (r.step)        setStep(r.step);
      });
  }, [pacienteId]);

  async function salvar() {
    setSalvando(true);
    setMsgSalvo(null);
    const { error } = await supabase.from('rastreios_nutricionais').insert({
      paciente_id: pacienteId,
      nutri_id:    nutriId,
      tipo:        'nrs2002',
      data:        new Date().toISOString().slice(0, 10),
      respostas:   { step, pre, scoreNutri, scoreDoenca },
      resultado:   { total, emRisco, prePositivo },
    });
    setSalvando(false);
    if (!error) setMsgSalvo('Salvo!');
  }

  function reset() {
    setStep('pre');
    setPre({ q1: false, q2: false, q3: false, q4: false });
    setScoreNutri('');
    setScoreDoenca('');
    setMsgSalvo(null);
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">NRS-2002 — Triagem Nutricional</div>
      </div>
      <div className="card-body">
        {step === 'pre' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, fontWeight: 500 }}>
              Pré-triagem — responda Sim/Não
            </div>
            {[
              { k: 'q1', txt: 'O IMC está < 20,5 kg/m²?' },
              { k: 'q2', txt: 'O paciente perdeu peso nos últimos 3 meses?' },
              { k: 'q3', txt: 'O paciente reduziu a ingestão alimentar na última semana?' },
              { k: 'q4', txt: 'O paciente está gravemente doente (UTI, cirurgia, complicação grave)?' },
            ].map(({ k, txt }) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={pre[k]} onChange={e => setPre(p => ({ ...p, [k]: e.target.checked }))} />
                {txt}
              </label>
            ))}
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setStep(prePositivo ? 'full' : 'resultado')}>
              Avançar
            </button>
          </>
        )}

        {step === 'full' && (
          <>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Estado Nutricional</div>
            {[
              { v: '0', l: '0 — Estado nutricional normal' },
              { v: '1', l: '1 — Perda de peso > 5% em 3 meses OU ingestão 50–75% da necessidade' },
              { v: '2', l: '2 — Perda de peso > 5% em 2 meses OU IMC 18,5–20,5 com estado comprometido OU ingestão 25–60%' },
              { v: '3', l: '3 — Perda > 5% em 1 mês (ou >15% em 3 meses) OU IMC < 18,5 comprometido OU ingestão 0–25%' },
            ].map(o => (
              <label key={o.v} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="nrs_nutri" checked={scoreNutri === o.v} onChange={() => setScoreNutri(o.v)} style={{ marginTop: 2, flexShrink: 0 }} />
                {o.l}
              </label>
            ))}

            <div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 10px' }}>Gravidade da Doença</div>
            {[
              { v: '0', l: '0 — Sem estresse metabólico' },
              { v: '1', l: '1 — Fratura de quadril, DPOC, DRC, DM, câncer estável, hemodiálise, cirrose' },
              { v: '2', l: '2 — Cirurgia abdominal maior, AVC, pneumonia grave, câncer hematológico' },
              { v: '3', l: '3 — TCE, transplante de medula, paciente em UTI (APACHE > 10)' },
            ].map(o => (
              <label key={o.v} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="nrs_doenca" checked={scoreDoenca === o.v} onChange={() => setScoreDoenca(o.v)} style={{ marginTop: 2, flexShrink: 0 }} />
                {o.l}
              </label>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ background: 'var(--bg2)', color: 'var(--dark)' }} onClick={() => setStep('pre')}>Voltar</button>
              <button className="btn" onClick={() => setStep('resultado')} disabled={!scoreNutri || !scoreDoenca}>
                Calcular
              </button>
            </div>
          </>
        )}

        {step === 'resultado' && (
          <>
            {prePositivo ? (
              <div style={{
                padding: '14px 16px', borderRadius: 8, marginBottom: 14,
                background: emRisco ? '#fee2e2' : '#f0fdf4',
                border: `2px solid ${emRisco ? '#dc2626' : '#16a34a'}`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: emRisco ? '#991b1b' : '#15803d', marginBottom: 6 }}>
                  {emRisco ? '⚠️ Em risco nutricional' : '✅ Sem risco nutricional identificado'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  Nutrição ({scoreNutri}) + Doença ({scoreDoenca}) + Idade ({correcaoIdade}) = <strong>{total} pontos</strong>
                </div>
                {emRisco && (
                  <div style={{ fontSize: 13, marginTop: 8, color: '#991b1b' }}>
                    Iniciar plano nutricional individualizado. Reavaliação em 1 semana.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '14px 16px', borderRadius: 8, marginBottom: 14, background: '#f0fdf4', border: '2px solid #16a34a' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d' }}>✅ Sem risco na pré-triagem</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Reavaliação semanal recomendada.</div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button className="btn" style={{ background: 'var(--bg2)', color: 'var(--dark)' }} onClick={reset}>Nova triagem</button>
              <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar triagem'}</button>
              {msgSalvo && <span style={{ fontSize: 12, color: '#16a34a' }}>{msgSalvo}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── MUST ─────────────────────────────────────────── */
function MUST({ imc }) {
  const [perdaScore, setPerdaScore] = useState('');
  const [doencaAguda, setDoencaAguda] = useState(false);

  const imcScore = imc == null ? null : imc > 20 ? 0 : imc >= 18.5 ? 1 : 2;
  const doencaScore = doencaAguda ? 2 : 0;
  const podeCalc = imcScore != null && perdaScore !== '';
  const total = podeCalc ? imcScore + parseInt(perdaScore) + doencaScore : null;

  const risco = total == null ? null
    : total === 0 ? { label: 'Baixo risco', cor: '#16a34a', acao: 'Rotina clínica. Reavaliação semanal hospitalar / mensal comunitário.' }
    : total === 1 ? { label: 'Risco intermediário', cor: '#d97706', acao: 'Monitorar ingestão por 3 dias. Intervir se necessário.' }
    : { label: 'Alto risco', cor: '#dc2626', acao: 'Encaminhar ao nutricionista. Iniciar suporte nutricional.' };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">MUST — Malnutrition Universal Screening Tool</div>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Etapa 1 — IMC</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            IMC calculado: <strong>{imc ? r1(imc) + ' kg/m²' : '—'}</strong>
            {imcScore != null && <span style={{ marginLeft: 10, fontWeight: 700 }}>Score: {imcScore}</span>}
          </div>
          {imc == null && <div style={{ fontSize: 12, color: '#d97706', marginTop: 4 }}>Informe peso e altura nos Dados Básicos.</div>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Etapa 2 — Perda de peso não intencional (3–6 meses)</div>
          <select value={perdaScore} onChange={e => setPerdaScore(e.target.value)} style={{ width: 260 }}>
            <option value="">Selecione</option>
            <option value="0">&lt; 5% — Score 0</option>
            <option value="1">5–10% — Score 1</option>
            <option value="2">&gt; 10% — Score 2</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Etapa 3 — Doença aguda</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={doencaAguda} onChange={e => setDoencaAguda(e.target.checked)} />
            Gravemente doente e sem ingestão alimentar por &gt; 5 dias (+2 pontos)
          </label>
        </div>

        {podeCalc && risco && (
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: risco.cor === '#16a34a' ? '#f0fdf4' : risco.cor === '#d97706' ? '#fffbeb' : '#fee2e2',
            border: `2px solid ${risco.cor}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: risco.cor }}>
              {total} ponto{total !== 1 ? 's' : ''} — {risco.label}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text3)' }}>{risco.acao}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PG-SGA ───────────────────────────────────────── */
const SINT_LISTA = [
  { k: 'sem_apetite',         l: 'Sem apetite',                        pts: 3 },
  { k: 'nausea',              l: 'Náusea',                             pts: 1 },
  { k: 'vomito',              l: 'Vômito',                             pts: 3 },
  { k: 'constipacao',         l: 'Constipação',                        pts: 1 },
  { k: 'diarreia',            l: 'Diarreia',                           pts: 3 },
  { k: 'feridas_boca',        l: 'Feridas na boca',                    pts: 2 },
  { k: 'boca_seca',           l: 'Boca seca',                          pts: 1 },
  { k: 'gosto_diferente',     l: 'Comida com gosto diferente',         pts: 1 },
  { k: 'dific_engolir',       l: 'Dificuldade para engolir',           pts: 2 },
  { k: 'dor',                 l: 'Dor',                                pts: 3 },
  { k: 'fadiga',              l: 'Fadiga / sem energia',               pts: 1 },
  { k: 'sacia_rapido',        l: 'Sente cheio rapidamente',            pts: 1 },
  { k: 'outro',               l: 'Outro',                              pts: 1 },
];

const BOX2_OPT = [
  { l: 'Sem mudança comparado ao normal', pts: 0 },
  { l: 'Mais do que o normal',            pts: 0 },
  { l: 'Menos — alimentos sólidos',       pts: 1 },
  { l: 'Menos — apenas líquidos',         pts: 2 },
  { l: 'Apenas suplementos / muito pouco', pts: 3 },
  { l: 'Quase nada ou nada',              pts: 4 },
];

const BOX4_OPT = [
  { l: 'Normal, sem limitações',                              pts: 0 },
  { l: 'Não é o meu normal, mas capaz de atividades leves',   pts: 1 },
  { l: 'Às vezes acamado, levanta mais da metade do dia',      pts: 2 },
  { l: 'Na cama ou cadeira a maior parte do dia',              pts: 3 },
  { l: 'Acamado, raramente sai da cama',                       pts: 3 },
];

function PGSGA({ pacienteId, nutriId }) {
  const [pesAtual, setPesAtual] = useState('');
  const [pes1mes, setPes1mes] = useState('');
  const [recMudanca, setRecMudanca] = useState('');
  const [box2Idx, setBox2Idx] = useState('');
  const [sintomas, setSintomas] = useState({});
  const [box4Idx, setBox4Idx] = useState('');
  const [scoreDoenca, setScoreDoenca] = useState('0');
  const [scoreMetab, setScoreMetab] = useState('0');
  const [scoreExame, setScoreExame] = useState('0');
  const [salvando, setSalvando] = useState(false);
  const [msgSalvo, setMsgSalvo] = useState(null);

  useEffect(() => {
    if (!pacienteId) return;
    supabase
      .from('rastreios_nutricionais')
      .select('respostas')
      .eq('paciente_id', pacienteId)
      .eq('tipo', 'pgsga')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const r = data.respostas;
        if (r.pesAtual    != null) setPesAtual(r.pesAtual);
        if (r.pes1mes     != null) setPes1mes(r.pes1mes);
        if (r.recMudanca)          setRecMudanca(r.recMudanca);
        if (r.box2Idx     != null) setBox2Idx(r.box2Idx);
        if (r.sintomas)            setSintomas(r.sintomas);
        if (r.box4Idx     != null) setBox4Idx(r.box4Idx);
        if (r.scoreDoenca != null) setScoreDoenca(r.scoreDoenca);
        if (r.scoreMetab  != null) setScoreMetab(r.scoreMetab);
        if (r.scoreExame  != null) setScoreExame(r.scoreExame);
      });
  }, [pacienteId]);

  const box1Score = (() => {
    let s = recMudanca === 'diminuiu' ? 1 : 0;
    if (pesAtual && pes1mes) {
      const perda = ((parseFloat(pes1mes) - parseFloat(pesAtual)) / parseFloat(pes1mes)) * 100;
      if (perda >= 10) s = Math.max(s, 4);
      else if (perda >= 5) s = Math.max(s, 3);
      else if (perda >= 3) s = Math.max(s, 2);
      else if (perda >= 2) s = Math.max(s, 1);
    }
    return s;
  })();

  const box2Score = box2Idx !== '' ? BOX2_OPT[parseInt(box2Idx)].pts : 0;
  const box3Raw = SINT_LISTA.filter(s => sintomas[s.k]).reduce((a, s) => a + s.pts, 0);
  const box3Score = Math.min(box3Raw, 4);
  const box4Score = box4Idx !== '' ? BOX4_OPT[parseInt(box4Idx)].pts : 0;

  const pacienteScore = box1Score + box2Score + box3Score + box4Score;
  const clinicoScore = parseInt(scoreDoenca) + parseInt(scoreMetab) + parseInt(scoreExame);
  const total = pacienteScore + clinicoScore;

  const classif = total <= 1
    ? { cat: 'A', label: 'Bem nutrido',                          cor: '#16a34a', bg: '#f0fdf4' }
    : total <= 8
    ? { cat: 'B', label: 'Desnutrição moderada suspeita/em curso', cor: '#d97706', bg: '#fffbeb' }
    : { cat: 'C', label: 'Desnutrição grave',                     cor: '#dc2626', bg: '#fee2e2' };

  async function salvar() {
    setSalvando(true);
    setMsgSalvo(null);
    const { error } = await supabase.from('rastreios_nutricionais').insert({
      paciente_id: pacienteId,
      nutri_id:    nutriId,
      tipo:        'pgsga',
      data:        new Date().toISOString().slice(0, 10),
      respostas:   { pesAtual, pes1mes, recMudanca, box2Idx, sintomas,
                     box4Idx, scoreDoenca, scoreMetab, scoreExame },
      resultado:   { total, pacienteScore, clinicoScore,
                     categoria: classif.cat, label: classif.label },
    });
    setSalvando(false);
    if (!error) setMsgSalvo('Salvo!');
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">PG-SGA — Patient-Generated Subjective Global Assessment</div>
      </div>
      <div className="card-body">
        {/* Box 1 */}
        <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Caixa 1 — Histórico de Peso</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label className="field-label">Peso atual (kg)</label>
              <input type="number" step="0.1" value={pesAtual} onChange={e => setPesAtual(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Peso há 1 mês (kg)</label>
              <input type="number" step="0.1" value={pes1mes} onChange={e => setPes1mes(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Mudança nas últimas 2 semanas</label>
            <select value={recMudanca} onChange={e => setRecMudanca(e.target.value)}>
              <option value="">Selecione</option>
              <option value="aumentou">Aumentou</option>
              <option value="igual">Sem mudança</option>
              <option value="diminuiu">Diminuiu</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Score: {box1Score}</div>
        </div>

        {/* Box 2 */}
        <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Caixa 2 — Ingestão Alimentar</div>
          {BOX2_OPT.map((o, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="pgsga_box2" checked={box2Idx === String(i)} onChange={() => setBox2Idx(String(i))} />
              {o.l}
            </label>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Score: {box2Score}</div>
        </div>

        {/* Box 3 */}
        <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Caixa 3 — Sintomas (últimas 2 semanas)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {SINT_LISTA.map(s => (
              <label key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!sintomas[s.k]} onChange={e => setSintomas(p => ({ ...p, [s.k]: e.target.checked }))} />
                {s.l} (+{s.pts})
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Score: {box3Score} (cap 4, bruto: {box3Raw})</div>
        </div>

        {/* Box 4 */}
        <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Caixa 4 — Capacidade Funcional</div>
          {BOX4_OPT.map((o, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="pgsga_box4" checked={box4Idx === String(i)} onChange={() => setBox4Idx(String(i))} />
              {o.l}
            </label>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Score: {box4Score}</div>
        </div>

        {/* Seção clínica */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Seção do Nutricionista</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Doença / Condição</label>
              <select value={scoreDoenca} onChange={e => setScoreDoenca(e.target.value)}>
                <option value="0">0 — Sem estresse adicional</option>
                <option value="1">1 — Câncer, AIDS, caquexia cardíaca, DPOC</option>
                <option value="2">2 — Cirurgia abdominal, câncer hematológico</option>
                <option value="3">3 — Transplante de medula óssea</option>
              </select>
            </div>
            <div>
              <label className="field-label">Estresse Metabólico</label>
              <select value={scoreMetab} onChange={e => setScoreMetab(e.target.value)}>
                <option value="0">0 — Sem estresse</option>
                <option value="1">1 — Febre &lt; 38,5°C / corticoide &lt; 10 mg/dia</option>
                <option value="2">2 — Febre 38,5–38,9°C / 10–30 mg/dia</option>
                <option value="3">3 — Febre ≥ 39°C / &gt; 30 mg/dia</option>
              </select>
            </div>
            <div>
              <label className="field-label">Exame Físico (reservas)</label>
              <select value={scoreExame} onChange={e => setScoreExame(e.target.value)}>
                <option value="0">0 — Sem déficit</option>
                <option value="1">1 — Déficit leve</option>
                <option value="2">2 — Déficit moderado</option>
                <option value="3">3 — Déficit grave</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div style={{ padding: '14px 16px', borderRadius: 8, background: classif.bg, border: `2px solid ${classif.cor}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: classif.cor, marginBottom: 4 }}>
            Categoria {classif.cat} — {classif.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Paciente: {pacienteScore} | Clínico: {clinicoScore} | <strong>Total: {total}</strong>
          </div>
          {total >= 9 && (
            <div style={{ fontSize: 13, marginTop: 8, color: '#991b1b', fontWeight: 500 }}>
              Necessidade crítica de manejo de sintomas e intervenção nutricional imediata.
            </div>
          )}
          {total >= 4 && total < 9 && (
            <div style={{ fontSize: 13, marginTop: 8, color: '#92400e', fontWeight: 500 }}>
              Requer intervenção nutricional e monitoramento.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar avaliação'}</button>
          {msgSalvo && <span style={{ fontSize: 12, color: '#16a34a' }}>{msgSalvo}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── proteína configs ────────────────────────────── */
const PROT_ONCO = {
  estavel:    { range: '1,2–1,5', min: 1.2, max: 1.5, desc: 'Oncológico estável' },
  quimio:     { range: '1,5–2,0', min: 1.5, max: 2.0, desc: 'Em quimioterapia' },
  cirurgico:  { range: '1,5–2,0', min: 1.5, max: 2.0, desc: 'Pós-cirúrgico' },
  radio:      { range: '1,5–2,0', min: 1.5, max: 2.0, desc: 'Em radioterapia' },
  sarcopenia: { range: '2,0–2,5', min: 2.0, max: 2.5, desc: 'Sarcopenia / caquexia' },
};
const PROT_EMAG = {
  sedentario: { range: '1,2',     min: 1.2, max: 1.2, desc: 'Sedentária' },
  ativo:      { range: '1,6–2,0', min: 1.6, max: 2.0, desc: 'Ativa' },
  deficit:    { range: '2,0–2,4', min: 2.0, max: 2.4, desc: 'Preservação muscular no déficit' },
  menopausa:  { range: '1,6–2,0', min: 1.6, max: 2.0, desc: 'Pós-menopausa' },
};

/* ── main component ──────────────────────────────── */
export default function Calculos({ pacienteId, nutriId, paciente, onUsarNaDieta }) {
  const [secao, setSecao] = useState('oncologia');
  const [subOnco, setSubOnco] = useState('energia');
  const [subEmag, setSubEmag] = useState('energia');

  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [sexo, setSexo] = useState('F');
  const [cintura, setCintura] = useState('');
  const [quadril, setQuadril] = useState('');
  const [mmKg, setMmKg] = useState('');

  const [fatorAtvd, setFatorAtvd] = useState('1.2');
  const [fatorInj, setFatorInj] = useState('1.0');
  const [situOnco, setSituOnco] = useState('estavel');
  const [perfilEmag, setPerfilEmag] = useState('sedentario');
  const [corrFebre, setCorrFebre] = useState('');
  const [corrPerdas, setCorrPerdas] = useState('');
  const [corrAtiv, setCorrAtiv] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('peso_registros')
        .select('kg, altura_cm, cintura_cm, quadril_cm, mm_kg')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        if (data.kg)        setPeso(String(data.kg));
        if (data.altura_cm) setAltura(String(data.altura_cm));
        if (data.cintura_cm) setCintura(String(data.cintura_cm));
        if (data.quadril_cm) setQuadril(String(data.quadril_cm));
        if (data.mm_kg)     setMmKg(String(data.mm_kg));
      }
    }
    load();
  }, [pacienteId]);

  const idade = useMemo(() => calcIdade(paciente?.nascimento), [paciente?.nascimento]);
  const p  = parseFloat(peso)    || 0;
  const a  = parseFloat(altura)  || 0;
  const ok = p > 0 && a > 0 && (idade ?? 0) > 0;

  const imc      = ok ? calcIMC(p, a) : null;
  const imcClass = imc ? classIMC(imc) : null;
  const pi       = a > 0 ? pesoIdealLorentz(sexo, a) : null;
  const pa       = (pi != null && p > pi && imc && imc >= 30) ? pi + 0.25 * (p - pi) : null;
  const pesoCalc = pa != null ? pa : p;

  const fa = parseFloat(fatorAtvd) || 1;
  const fi = parseFloat(fatorInj)  || 1;

  const hbGEB       = ok ? harrisBenedict(sexo, pesoCalc, a, idade) : null;
  const msGEB       = ok ? mifflinStJeor(sexo, pesoCalc, a, idade)  : null;
  const ijGEB       = ok ? iretonJones(p, idade, imc > 27)           : null;
  const hbGET_onco  = hbGEB ? r0(hbGEB * fa * fi) : null;
  const msGET_onco  = msGEB ? r0(msGEB * fa * fi) : null;
  const hbGET_emag  = hbGEB ? r0(hbGEB * fa)      : null;
  const msGET_emag  = msGEB ? r0(msGEB * fa)       : null;

  const aspenMin = pesoCalc ? r0(25 * pesoCalc) : null;
  const aspenMax = pesoCalc ? r0(30 * pesoCalc) : null;

  const pOnco = PROT_ONCO[situOnco];
  const pEmag = PROT_EMAG[perfilEmag];

  const corrFebreN  = parseFloat(corrFebre)  || 0;
  const corrPerdasN = parseFloat(corrPerdas) || 0;
  const corrAtivN   = parseFloat(corrAtiv)   || 0;
  const hid30 = p ? r0(30 * p) : null;
  const hid35 = p ? r0(35 * p) : null;
  const hidHS = p ? r0(hollidaySegar(p)) : null;
  const hidFeverMin = hid30 ? r0(hid30 * (1 + corrFebreN * 0.12) + corrPerdasN) : null;
  const hidFeverMax = hid35 ? r0(hid35 * (1 + corrFebreN * 0.12) + corrPerdasN) : null;
  const hidEmag     = hid35 ? r0(hid35 + corrAtivN) : null;

  const rcq = (cintura && quadril) ? parseFloat(cintura) / parseFloat(quadril) : null;
  const rcqRisco = rcq ? (sexo === 'M' ? rcq > 1.0 : rcq > 0.85) : null;
  const imm = (mmKg && a) ? parseFloat(mmKg) / Math.pow(a / 100, 2) : null;
  const immRisco = imm ? (sexo === 'M' ? imm < 7 : imm < 5.5) : null;
  const percAdequacao = (pi && p) ? r1((p / pi) * 100) : null;
  const classAdequacao = percAdequacao == null ? null
    : percAdequacao >= 90 ? { label: 'Adequado', cor: '#16a34a' }
    : percAdequacao >= 80 ? { label: 'Magreza leve', cor: '#d97706' }
    : percAdequacao >= 70 ? { label: 'Magreza moderada', cor: '#ea580c' }
    : { label: 'Magreza grave', cor: '#dc2626' };

  const pisoSeguro  = sexo === 'M' ? 1500 : 1200;
  const deficit500  = msGET_emag ? Math.max(msGET_emag - 500, pisoSeguro) : null;
  const deficit1000 = msGET_emag ? Math.max(msGET_emag - 1000, pisoSeguro) : null;

  function handleUsarNaDieta(kcal, proteinas_g) {
    if (!onUsarNaDieta || !kcal) return;
    const rem = kcal - proteinas_g * 4;
    const carbo_g   = rem > 0 ? r0(rem * 0.60 / 4) : 0;
    const gorduras_g = rem > 0 ? r0(rem * 0.30 / 9) : 0;
    onUsarNaDieta({ kcal, proteinas_g, carbo_g, gorduras_g });
  }

  /* render ─────────────────────────────────────── */
  return (
    <div>
      {/* Dados Básicos */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Dados Básicos</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Pré-preenchido da última avaliação · edite se necessário</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div>
              <label className="field-label">Peso atual (kg)</label>
              <input type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Altura (cm)</label>
              <input type="number" step="0.1" value={altura} onChange={e => setAltura(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Sexo</label>
              <select value={sexo} onChange={e => setSexo(e.target.value)}>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </div>
            <div>
              <label className="field-label">Idade</label>
              <input readOnly value={idade != null ? `${idade} anos` : '—'} style={{ background: 'var(--bg2)', color: 'var(--text3)' }} />
            </div>
            <div>
              <label className="field-label">Cintura (cm)</label>
              <input type="number" step="0.1" value={cintura} onChange={e => setCintura(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Quadril (cm)</label>
              <input type="number" step="0.1" value={quadril} onChange={e => setQuadril(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Massa muscular (kg)</label>
              <input type="number" step="0.1" value={mmKg} onChange={e => setMmKg(e.target.value)} />
            </div>
          </div>
          {imc && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              IMC: <strong>{r1(imc)} kg/m²</strong>
              <span style={{ marginLeft: 8, color: imcClass.cor, fontWeight: 600 }}>{imcClass.label}</span>
              {pa != null && <span style={{ marginLeft: 12, color: 'var(--text3)' }}>· Peso ajustado: {r1(pa)} kg</span>}
            </div>
          )}
        </div>
      </div>

      {/* Seção: Oncologia / Emagrecimento */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {[
          { id: 'oncologia',     label: 'Oncologia',     icon: 'dna' },
          { id: 'emagrecimento', label: 'Emagrecimento', icon: 'trending-down' },
        ].map(t => (
          <button key={t.id} onClick={() => setSecao(t.id)} style={{
            flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600,
            borderRadius: 8, border: 'none', cursor: 'pointer',
            color: secao === t.id ? 'var(--dark)' : 'var(--text3)',
            background: secao === t.id ? 'var(--white)' : 'transparent',
            boxShadow: secao === t.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            fontFamily: 'var(--font-sans)',
            display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          }}>
            <i className={`ti ti-${t.icon}`} style={{ fontSize: 15 }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ONCOLOGIA ── */}
      {secao === 'oncologia' && (
        <>
          <SubTabs current={subOnco} onChange={setSubOnco} tabs={[
            { id: 'energia',    label: 'Energia',              icon: 'bolt' },
            { id: 'proteina',   label: 'Proteína',             icon: 'meat' },
            { id: 'hidrica',    label: 'Hídrica',              icon: 'droplet' },
            { id: 'composicao', label: 'Composição Corporal',  icon: 'ruler-measure' },
            { id: 'rastreio',   label: 'Rastreio Nutricional', icon: 'clipboard-check' },
          ]} />

          {/* Energia — Oncologia */}
          {subOnco === 'energia' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="field-label">Fator de atividade</label>
                      <select value={fatorAtvd} onChange={e => setFatorAtvd(e.target.value)}>
                        <option value="1.2">1,2 — Sedentário / acamado</option>
                        <option value="1.375">1,375 — Levemente ativo</option>
                        <option value="1.55">1,55 — Moderadamente ativo</option>
                        <option value="1.725">1,725 — Muito ativo</option>
                        <option value="1.9">1,9 — Extremamente ativo</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Fator de injúria</label>
                      <select value={fatorInj} onChange={e => setFatorInj(e.target.value)}>
                        <option value="1.0">1,0 — Sem injúria</option>
                        <option value="1.1">1,1 — Cirurgia pequena</option>
                        <option value="1.2">1,2 — Infecção leve / quimio</option>
                        <option value="1.3">1,3 — Cirurgia grande / infecção moderada</option>
                        <option value="1.4">1,4 — Sepse</option>
                        <option value="1.5">1,5 — Grande queimado</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {ok ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <ResultCard
                      label="Harris-Benedict GEB"
                      value={r0(hbGEB)}
                      unit="kcal"
                      sub={`GET: ${hbGET_onco} kcal (×${fatorAtvd} ×${fatorInj})`}
                      destaque
                    />
                    <ResultCard
                      label="Mifflin-St Jeor GEB"
                      value={r0(msGEB)}
                      unit="kcal"
                      sub={`GET: ${msGET_onco} kcal (×${fatorAtvd} ×${fatorInj})`}
                      destaque
                    />
                    <ResultCard
                      label="ASPEN (25–30 kcal/kg)"
                      value={`${aspenMin}–${aspenMax}`}
                      unit="kcal"
                      sub={`Peso: ${r1(pesoCalc)} kg${pa != null ? ' (ajustado)' : ''}`}
                    />
                    <ResultCard
                      label="Ireton-Jones (espontâneo)"
                      value={r0(ijGEB)}
                      unit="kcal"
                      sub="GEB · sem fator de atividade"
                    />
                    <ResultCard
                      label="Bolso (25–30 kcal/kg × injúria)"
                      value={`${r0(25 * pesoCalc * fi)}–${r0(30 * pesoCalc * fi)}`}
                      unit="kcal"
                      sub={`Fator injúria ${fatorInj}`}
                    />
                  </div>
                  {onUsarNaDieta && msGET_onco && (
                    <button
                      onClick={() => handleUsarNaDieta(msGET_onco, r0(pOnco.min * pesoCalc))}
                      style={{
                        marginTop: 12, width: '100%',
                        padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                        background: 'linear-gradient(135deg, var(--amber, #c9a96e), var(--gold-deep, #a08456))',
                        color: '#fff', border: 'none',
                        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <i className="ti ti-arrow-right" />
                      Usar esses valores para gerar a dieta
                      <span style={{ opacity: 0.85, fontWeight: 400, fontSize: 12 }}>
                        ({msGET_onco} kcal · {r0(pOnco.min * pesoCalc)}g prot)
                      </span>
                    </button>
                  )}
                </>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Proteína — Oncologia */}
          {subOnco === 'proteina' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <label className="field-label">Situação clínica</label>
                  <select value={situOnco} onChange={e => setSituOnco(e.target.value)}>
                    <option value="estavel">Oncológico estável (1,2–1,5 g/kg)</option>
                    <option value="quimio">Em quimioterapia (1,5–2,0 g/kg)</option>
                    <option value="cirurgico">Pós-cirúrgico (1,5–2,0 g/kg)</option>
                    <option value="radio">Em radioterapia (1,5–2,0 g/kg)</option>
                    <option value="sarcopenia">Sarcopenia / caquexia (2,0–2,5 g/kg)</option>
                  </select>
                </div>
              </div>
              {ok ? (
                <div className="card">
                  <div className="card-body">
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>{pOnco.desc}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                      <ResultCard label="Recomendação" value={pOnco.range} unit="g/kg/dia" destaque />
                      <ResultCard label="Mínimo diário" value={r1(pOnco.min * pesoCalc)} unit="g/dia" sub={`${pOnco.min} g/kg × ${r1(pesoCalc)} kg`} />
                      <ResultCard label="Máximo diário" value={r1(pOnco.max * pesoCalc)} unit="g/dia" sub={`${pOnco.max} g/kg × ${r1(pesoCalc)} kg`} />
                    </div>
                    {pa != null && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10 }}>* Baseado no peso ajustado ({r1(pa)} kg) por obesidade.</div>}
                  </div>
                </div>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Hídrica — Oncologia */}
          {subOnco === 'hidrica' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="field-label">Febre acima de 37°C (graus extras)</label>
                      <input type="number" step="0.1" min="0" max="5" value={corrFebre} onChange={e => setCorrFebre(e.target.value)} placeholder="ex: 1,5" />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>+12% por grau acima de 37°C</div>
                    </div>
                    <div>
                      <label className="field-label">Perdas extras (ml/dia)</label>
                      <input type="number" step="50" min="0" value={corrPerdas} onChange={e => setCorrPerdas(e.target.value)} placeholder="ex: 500" />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Drenagem, ostomia, vômitos, etc.</div>
                    </div>
                  </div>
                </div>
              </div>
              {ok ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  <ResultCard label="30 ml/kg" value={hid30} unit="ml/dia" />
                  <ResultCard label="35 ml/kg" value={hid35} unit="ml/dia" destaque />
                  <ResultCard label="Holliday-Segar" value={hidHS} unit="ml/dia" />
                  {(corrFebreN > 0 || corrPerdasN > 0) && (
                    <ResultCard
                      label="Com correções"
                      value={`${hidFeverMin}–${hidFeverMax}`}
                      unit="ml/dia"
                      sub={`Febre +${corrFebreN}°C${corrPerdasN > 0 ? `, perdas +${corrPerdasN} ml` : ''}`}
                      destaque
                    />
                  )}
                </div>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Composição Corporal — Oncologia */}
          {subOnco === 'composicao' && (
            ok ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                {imc && (
                  <ResultCard label="IMC" value={r1(imc)} unit="kg/m²" sub={imcClass?.label} destaque />
                )}
                {pi != null && (
                  <ResultCard label="Peso Ideal (Lorentz)" value={r1(pi)} unit="kg" />
                )}
                {pa != null && (
                  <ResultCard label="Peso Ajustado" value={r1(pa)} unit="kg" sub="Usado nas fórmulas (obesidade)" />
                )}
                {percAdequacao != null && (
                  <ResultCard
                    label="% Adequação do Peso"
                    value={percAdequacao}
                    unit="%"
                    sub={classAdequacao?.label}
                    destaque={percAdequacao < 90}
                  />
                )}
                {rcq != null && (
                  <ResultCard
                    label="Relação Cintura/Quadril"
                    value={r1(rcq)}
                    unit=""
                    sub={rcqRisco ? `⚠️ Risco aumentado (ref: ${sexo === 'M' ? '≤ 1,0' : '≤ 0,85'})` : `✅ Sem risco (ref: ${sexo === 'M' ? '≤ 1,0' : '≤ 0,85'})`}
                    destaque={!!rcqRisco}
                  />
                )}
                {imm != null && (
                  <ResultCard
                    label="Índice de Massa Muscular"
                    value={r1(imm)}
                    unit="kg/m²"
                    sub={immRisco ? `⚠️ Risco de sarcopenia (ref: ${sexo === 'M' ? '≥ 7,0' : '≥ 5,5'})` : `✅ Adequado (ref: ${sexo === 'M' ? '≥ 7,0' : '≥ 5,5'})`}
                    destaque={!!immRisco}
                  />
                )}
              </div>
            ) : <EmptyMsg />
          )}

          {/* Rastreio Nutricional */}
          {subOnco === 'rastreio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <NRS2002 imc={imc} idade={idade ?? 0} pacienteId={pacienteId} nutriId={nutriId} />
              <PGSGA pacienteId={pacienteId} nutriId={nutriId} />
              <MUST imc={imc} />
            </div>
          )}
        </>
      )}

      {/* ── EMAGRECIMENTO ── */}
      {secao === 'emagrecimento' && (
        <>
          <SubTabs current={subEmag} onChange={setSubEmag} tabs={[
            { id: 'energia',    label: 'Energia',             icon: 'bolt' },
            { id: 'proteina',   label: 'Proteína',            icon: 'meat' },
            { id: 'hidrica',    label: 'Hídrica',             icon: 'droplet' },
            { id: 'composicao', label: 'Composição Corporal', icon: 'ruler-measure' },
          ]} />

          {/* Energia — Emagrecimento */}
          {subEmag === 'energia' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <label className="field-label">Fator de atividade</label>
                  <select value={fatorAtvd} onChange={e => setFatorAtvd(e.target.value)}>
                    <option value="1.2">1,2 — Sedentária (pouco ou nenhum exercício)</option>
                    <option value="1.375">1,375 — Levemente ativa (1–3x/semana)</option>
                    <option value="1.55">1,55 — Moderadamente ativa (3–5x/semana)</option>
                    <option value="1.725">1,725 — Muito ativa (6–7x/semana)</option>
                    <option value="1.9">1,9 — Extremamente ativa (2x/dia ou trabalho pesado)</option>
                  </select>
                </div>
              </div>

              {ok ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
                    <ResultCard label="TMB — Mifflin-St Jeor" value={r0(msGEB)} unit="kcal" sub="Taxa Metabólica Basal" />
                    <ResultCard label="GET — Harris-Benedict" value={hbGET_emag} unit="kcal" sub={`GEB × ${fatorAtvd}`} destaque />
                    <ResultCard label="GET — Mifflin-St Jeor" value={msGET_emag} unit="kcal" sub={`GEB × ${fatorAtvd}`} destaque />
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Déficit Calórico</div>
                    </div>
                    <div className="card-body">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                        <ResultCard
                          label="0,5 kg/semana (–500 kcal/dia)"
                          value={deficit500}
                          unit="kcal"
                          sub={msGET_emag - 500 < pisoSeguro ? '⚠️ Piso de segurança atingido' : undefined}
                          destaque
                        />
                        <ResultCard
                          label="1 kg/semana (–1000 kcal/dia)"
                          value={deficit1000}
                          unit="kcal"
                          sub={msGET_emag - 1000 < pisoSeguro ? '⚠️ Piso de segurança atingido' : undefined}
                        />
                        <ResultCard
                          label={`Piso seguro (${sexo === 'M' ? 'homem' : 'mulher'})`}
                          value={pisoSeguro}
                          unit="kcal"
                          sub="Mínimo recomendado"
                        />
                      </div>
                    </div>
                  </div>

                  {onUsarNaDieta && msGET_emag && (
                    <button
                      onClick={() => handleUsarNaDieta(msGET_emag, r0(pEmag.min * p))}
                      style={{
                        marginTop: 12, width: '100%',
                        padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                        background: 'linear-gradient(135deg, var(--amber, #c9a96e), var(--gold-deep, #a08456))',
                        color: '#fff', border: 'none',
                        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <i className="ti ti-arrow-right" />
                      Usar esses valores para gerar a dieta
                      <span style={{ opacity: 0.85, fontWeight: 400, fontSize: 12 }}>
                        ({msGET_emag} kcal · {r0(pEmag.min * p)}g prot)
                      </span>
                    </button>
                  )}
                </>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Proteína — Emagrecimento */}
          {subEmag === 'proteina' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <label className="field-label">Perfil da paciente</label>
                  <select value={perfilEmag} onChange={e => setPerfilEmag(e.target.value)}>
                    <option value="sedentario">Sedentária (1,2 g/kg)</option>
                    <option value="ativo">Ativa (1,6–2,0 g/kg)</option>
                    <option value="deficit">Preservação muscular no déficit (2,0–2,4 g/kg)</option>
                    <option value="menopausa">Pós-menopausa (1,6–2,0 g/kg)</option>
                  </select>
                </div>
              </div>
              {ok ? (
                <div className="card">
                  <div className="card-body">
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>{pEmag.desc}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                      <ResultCard label="Recomendação" value={pEmag.range} unit="g/kg/dia" destaque />
                      <ResultCard label="Mínimo diário" value={r1(pEmag.min * p)} unit="g/dia" sub={`${pEmag.min} g/kg × ${p} kg`} />
                      {pEmag.max !== pEmag.min && (
                        <ResultCard label="Máximo diário" value={r1(pEmag.max * p)} unit="g/dia" sub={`${pEmag.max} g/kg × ${p} kg`} />
                      )}
                    </div>
                  </div>
                </div>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Hídrica — Emagrecimento */}
          {subEmag === 'hidrica' && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body">
                  <label className="field-label">Correção para atividade física (ml/dia)</label>
                  <input type="number" step="100" min="0" value={corrAtiv} onChange={e => setCorrAtiv(e.target.value)} placeholder="ex: 500" style={{ maxWidth: 200 }} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Adicional por exercício (500–1000 ml típico)</div>
                </div>
              </div>
              {ok ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  <ResultCard label="35 ml/kg" value={hid35} unit="ml/dia" destaque />
                  {corrAtivN > 0 && (
                    <ResultCard label="Com atividade física" value={hidEmag} unit="ml/dia" sub={`+${corrAtivN} ml (exercício)`} destaque />
                  )}
                </div>
              ) : <EmptyMsg />}
            </>
          )}

          {/* Composição Corporal — Emagrecimento */}
          {subEmag === 'composicao' && (
            ok ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                {imc && (
                  <ResultCard label="IMC (OMS)" value={r1(imc)} unit="kg/m²" sub={imcClass?.label} destaque />
                )}
                {pi != null && (
                  <ResultCard label="Peso Ideal (Lorentz)" value={r1(pi)} unit="kg" />
                )}
                {percAdequacao != null && (
                  <ResultCard
                    label="% Adequação do Peso"
                    value={percAdequacao}
                    unit="%"
                    sub={classAdequacao?.label}
                    destaque={percAdequacao < 90}
                  />
                )}
                {rcq != null && (
                  <ResultCard
                    label="Relação Cintura/Quadril"
                    value={r1(rcq)}
                    unit=""
                    sub={rcqRisco ? `⚠️ Risco aumentado (ref: ${sexo === 'M' ? '≤ 1,0' : '≤ 0,85'})` : `✅ Sem risco`}
                    destaque={!!rcqRisco}
                  />
                )}
                {imm != null && (
                  <ResultCard
                    label="Índice de Massa Muscular"
                    value={r1(imm)}
                    unit="kg/m²"
                    sub={immRisco ? '⚠️ Risco de sarcopenia' : '✅ Adequado'}
                    destaque={!!immRisco}
                  />
                )}
              </div>
            ) : <EmptyMsg />
          )}
        </>
      )}
    </div>
  );
}
