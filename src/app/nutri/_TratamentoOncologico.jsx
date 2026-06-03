import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import DateInput from '../../components/DateInput.jsx';

const INTENCOES = [
  { v: 'neoadjuvante', l: 'Neoadjuvante' },
  { v: 'adjuvante',    l: 'Adjuvante' },
  { v: 'paliativo',    l: 'Paliativo' },
  { v: 'controle',     l: 'Controle' },
  { v: 'manutencao',   l: 'Manutenção' },
  { v: 'curativo',     l: 'Curativo' },
];

const TIPO_TRAT = [
  { v: 'quimio',         l: 'Quimioterapia' },
  { v: 'imuno',          l: 'Imunoterapia' },
  { v: 'hormonio',       l: 'Hormonioterapia' },
  { v: 'terapia_alvo',   l: 'Terapia-alvo' },
  { v: 'combinado',      l: 'Combinado' },
];

const INTERVALOS = [7, 14, 21, 28];

const ESTADIAMENTOS = ['I', 'II', 'III', 'IV', 'IA', 'IB', 'IIA', 'IIB', 'IIIA', 'IIIB', 'IIIC'];

const AREAS_RADIO = ['Mama', 'Pelve', 'Cabeça e pescoço', 'Abdome', 'Tórax', 'SNC', 'Outro'];

const SECOES = [
  { id: 'diagnostico', label: 'Diagnóstico',         icon: 'dna' },
  { id: 'tratamento',  label: 'Tratamento Sistêmico', icon: 'needle' },
  { id: 'ciclos',      label: 'Ciclos',              icon: 'calendar-event' },
  { id: 'radio',       label: 'Radioterapia',        icon: 'radiation' },
  { id: 'cirurgia',    label: 'Cirurgia',            icon: 'scalpel' },
  { id: 'exames',      label: 'Exames Laboratoriais', icon: 'microscope' },
];

function dadosDefault() {
  return {
    tipo_cancer: '', estadiamento: '', medico: '', hospital: '', data_diagnostico: '',
    data_inicio_acompanhamento: '',
    intencao: '', metastatico: '', locais_metastase: '',
    doenca_atividade: '',
    tipo_trat_sistemico: '', protocolo: '', medicamentos: '', total_ciclos: '', ciclo_atual: '',
    intervalo_ciclos: '', data_ultima_quimio: '',
    usa_corticoide: '', atraso_ciclo: '',
    radio_ativa: false, radio_area: '', radio_sessao_atual: '', radio_total_sessoes: '',
    radio_inicio: '', radio_termino: '',
    cirurgia_status: '', cirurgia_tipo: '',
    cirurgia_indicada: false, cirurgia_realizada: false, cirurgia_data: '',
    cirurgia_complicacoes: '', cirurgia_preparo_nutricional: false,
    acao_semana: '',
  };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function exameDefault() {
  return { data_exame: new Date().toISOString().slice(0, 10), hemoglobina: '', leucocitos: '', neutrofilos: '', linfocitos: '', plaquetas: '', pcr: '', albumina: '', glicemia: '', obs: '' };
}

export default function TratamentoOncologico({ pacienteId, nutriId }) {
  const [secao, setSecao] = useState('diagnostico');
  const [dados, setDados] = useState(dadosDefault());
  const [tratamentoId, setTratamentoId] = useState(null);
  const [ciclos, setCiclos] = useState([]);
  const [exames, setExames] = useState([]);
  const [novoCiclo, setNovoCiclo] = useState({ numero_ciclo: '', data_quimio: '', obs: '' });
  const [novoExame, setNovoExame] = useState(exameDefault());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [comparar, setComparar] = useState(false);
  const [lendoPdf, setLendoPdf] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { carregar(); }, [pacienteId]);

  async function carregar() {
    const [{ data: trat }, { data: cic }, { data: ex }] = await Promise.all([
      supabase.from('tratamentos_oncologicos').select('*').eq('paciente_id', pacienteId).maybeSingle(),
      supabase.from('ciclos_quimio').select('*').eq('paciente_id', pacienteId).order('data_quimio', { ascending: false }),
      supabase.from('exames_laboratoriais').select('*').eq('paciente_id', pacienteId).order('data_exame', { ascending: false }),
    ]);
    if (trat) {
      setTratamentoId(trat.id);
      setDados({
        tipo_cancer: trat.tipo_cancer ?? '', estadiamento: trat.estadiamento ?? '',
        medico: trat.medico ?? '', hospital: trat.hospital ?? '',
        data_diagnostico: trat.data_diagnostico ?? '',
        data_inicio_acompanhamento: trat.data_inicio_acompanhamento ?? '',
        intencao: trat.intencao ?? '', metastatico: trat.metastatico ?? '',
        locais_metastase: (trat.locais_metastase ?? []).join(', '),
        doenca_atividade: trat.doenca_atividade ?? '',
        tipo_trat_sistemico: trat.tipo_trat_sistemico ?? '', protocolo: trat.protocolo ?? '',
        medicamentos: (trat.medicamentos ?? []).join(', '),
        total_ciclos: trat.total_ciclos ?? '', ciclo_atual: trat.ciclo_atual ?? '',
        intervalo_ciclos: trat.intervalo_ciclos ?? '', data_ultima_quimio: trat.data_ultima_quimio ?? '',
        usa_corticoide: trat.usa_corticoide == null ? '' : String(trat.usa_corticoide),
        atraso_ciclo: trat.atraso_ciclo == null ? '' : String(trat.atraso_ciclo),
        radio_ativa: trat.radio_ativa ?? false, radio_area: trat.radio_area ?? '',
        radio_sessao_atual: trat.radio_sessao_atual ?? '', radio_total_sessoes: trat.radio_total_sessoes ?? '',
        radio_inicio: trat.radio_inicio ?? '', radio_termino: trat.radio_termino ?? '',
        cirurgia_status: trat.cirurgia_status ?? (trat.cirurgia_indicada ? 'sim' : ''),
        cirurgia_tipo: trat.cirurgia_tipo ?? '',
        cirurgia_indicada: trat.cirurgia_indicada ?? false, cirurgia_realizada: trat.cirurgia_realizada ?? false,
        cirurgia_data: trat.cirurgia_data ?? '', cirurgia_complicacoes: trat.cirurgia_complicacoes ?? '',
        cirurgia_preparo_nutricional: trat.cirurgia_preparo_nutricional ?? false,
        acao_semana: trat.acao_semana ?? '',
      });
    }
    setCiclos(cic ?? []);
    setExames(ex ?? []);
    if (cic?.length) setNovoCiclo(prev => ({ ...prev, numero_ciclo: (cic[0].numero_ciclo ?? 0) + 1 }));
  }

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDados(d => ({ ...d, [k]: v }));
  };

  function toArr(str) { return str.split(',').map(s => s.trim()).filter(Boolean); }
  function num(v) { const n = parseInt(v); return isNaN(n) ? null : n; }
  function numf(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }

  async function salvarTratamento() {
    setBusy(true); setFeedback(null);
    const payload = {
      paciente_id: pacienteId, nutri_id: nutriId,
      tipo_cancer: dados.tipo_cancer.trim() || null,
      estadiamento: dados.estadiamento || null,
      medico: dados.medico.trim() || null,
      hospital: dados.hospital.trim() || null,
      data_diagnostico: dados.data_diagnostico || null,
      data_inicio_acompanhamento: dados.data_inicio_acompanhamento || null,
      intencao: dados.intencao || null,
      metastatico: dados.metastatico || null,
      locais_metastase: toArr(dados.locais_metastase),
      doenca_atividade: dados.doenca_atividade || null,
      tipo_trat_sistemico: dados.tipo_trat_sistemico || null,
      protocolo: dados.protocolo.trim() || null,
      medicamentos: toArr(dados.medicamentos),
      total_ciclos: num(dados.total_ciclos),
      ciclo_atual: num(dados.ciclo_atual),
      intervalo_ciclos: num(dados.intervalo_ciclos),
      data_ultima_quimio: dados.data_ultima_quimio || null,
      usa_corticoide: dados.usa_corticoide === '' ? null : dados.usa_corticoide === 'true',
      atraso_ciclo: dados.atraso_ciclo === '' ? null : dados.atraso_ciclo === 'true',
      radio_ativa: dados.radio_ativa,
      radio_area: dados.radio_area || null,
      radio_sessao_atual: num(dados.radio_sessao_atual),
      radio_total_sessoes: num(dados.radio_total_sessoes),
      radio_inicio: dados.radio_inicio || null,
      radio_termino: dados.radio_termino || null,
      cirurgia_status: dados.cirurgia_status || null,
      cirurgia_tipo: dados.cirurgia_tipo.trim() || null,
      cirurgia_indicada: dados.cirurgia_status === 'sim',
      cirurgia_realizada: dados.cirurgia_realizada,
      cirurgia_data: dados.cirurgia_data || null,
      cirurgia_complicacoes: dados.cirurgia_complicacoes.trim() || null,
      cirurgia_preparo_nutricional: dados.cirurgia_preparo_nutricional,
      acao_semana: dados.acao_semana.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('tratamentos_oncologicos')
      .upsert(payload, { onConflict: 'paciente_id' }).select('id').single();
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    if (data) setTratamentoId(data.id);
    setFeedback({ tipo: 'ok', msg: 'Dados salvos com sucesso.' });
  }

  async function adicionarCiclo() {
    if (!novoCiclo.data_quimio) return setFeedback({ tipo: 'erro', msg: 'Informe a data da quimio.' });
    if (!tratamentoId) return setFeedback({ tipo: 'erro', msg: 'Salve os dados do tratamento primeiro.' });
    setBusy(true);
    const { error } = await supabase.from('ciclos_quimio').insert({
      tratamento_id: tratamentoId, paciente_id: pacienteId, nutri_id: nutriId,
      numero_ciclo: num(novoCiclo.numero_ciclo) ?? ciclos.length + 1,
      data_quimio: novoCiclo.data_quimio,
      obs: novoCiclo.obs.trim() || null,
    });
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setNovoCiclo(prev => ({ numero_ciclo: (num(prev.numero_ciclo) ?? 0) + 1, data_quimio: '', obs: '' }));
    carregar();
  }

  async function removerCiclo(id) {
    if (!window.confirm('Remover este ciclo?')) return;
    await supabase.from('ciclos_quimio').delete().eq('id', id);
    carregar();
  }

  async function adicionarExame() {
    if (!novoExame.data_exame) return setFeedback({ tipo: 'erro', msg: 'Informe a data do exame.' });
    setBusy(true);
    const { error } = await supabase.from('exames_laboratoriais').insert({
      paciente_id: pacienteId, nutri_id: nutriId,
      data_exame: novoExame.data_exame,
      hemoglobina: numf(novoExame.hemoglobina), leucocitos: numf(novoExame.leucocitos),
      neutrofilos: numf(novoExame.neutrofilos), linfocitos: numf(novoExame.linfocitos),
      plaquetas: numf(novoExame.plaquetas), pcr: numf(novoExame.pcr),
      albumina: numf(novoExame.albumina), glicemia: numf(novoExame.glicemia),
      obs: novoExame.obs.trim() || null,
    });
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setNovoExame(exameDefault());
    carregar();
  }

  async function removerExame(id) {
    if (!window.confirm('Remover este exame?')) return;
    await supabase.from('exames_laboratoriais').delete().eq('id', id);
    carregar();
  }

  async function importarPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLendoPdf(true);
    setFeedback(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const isPdf = file.type === 'application/pdf';
      const contentBlock = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image',    source: { type: 'base64', media_type: file.type,           data: base64 } };
      const promptText = `Analise este exame laboratorial e extraia APENAS os seguintes valores em formato JSON puro, sem texto adicional, sem markdown, sem explicações:
{
  "data_exame": "string (formato YYYY-MM-DD, se encontrar)",
  "hemoglobina": "number ou null",
  "leucocitos": "number ou null",
  "neutrofilos": "number ou null",
  "linfocitos": "number ou null",
  "plaquetas": "number ou null",
  "pcr": "number ou null",
  "albumina": "number ou null",
  "glicemia": "number ou null",
  "obs": "string (valores adicionais relevantes encontrados no exame)"
}
Retorne SOMENTE o JSON, sem nenhum texto antes ou depois.`;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: promptText }] }],
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message ?? 'Erro na API Anthropic');
      }
      const apiData = await resp.json();
      const rawText = apiData.content?.[0]?.text ?? '';
      let parsed;
      try {
        const clean = rawText.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new Error('Não foi possível interpretar a resposta. Tente novamente.');
      }
      setNovoExame(prev => ({
        ...prev,
        data_exame:  parsed.data_exame  || prev.data_exame,
        hemoglobina: parsed.hemoglobina != null ? String(parsed.hemoglobina) : prev.hemoglobina,
        leucocitos:  parsed.leucocitos  != null ? String(parsed.leucocitos)  : prev.leucocitos,
        neutrofilos: parsed.neutrofilos != null ? String(parsed.neutrofilos) : prev.neutrofilos,
        linfocitos:  parsed.linfocitos  != null ? String(parsed.linfocitos)  : prev.linfocitos,
        plaquetas:   parsed.plaquetas   != null ? String(parsed.plaquetas)   : prev.plaquetas,
        pcr:         parsed.pcr         != null ? String(parsed.pcr)         : prev.pcr,
        albumina:    parsed.albumina    != null ? String(parsed.albumina)    : prev.albumina,
        glicemia:    parsed.glicemia    != null ? String(parsed.glicemia)    : prev.glicemia,
        obs:         parsed.obs         || prev.obs,
      }));
      setFeedback({ tipo: 'ok', msg: 'Exame lido com sucesso! Confira os valores antes de salvar.' });
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err.message || 'Erro ao processar o exame.' });
    } finally {
      setLendoPdf(false);
    }
  }

  // Janela de risco atual
  const hoje = new Date().toISOString().slice(0, 10);
  const ultimoCiclo = ciclos[0];
  const emJanelaRisco = ultimoCiclo &&
    hoje >= ultimoCiclo.d7 && hoje <= ultimoCiclo.d14;

  return (
    <div>
      {emJanelaRisco && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: '#fee2e2', border: '1.5px solid #dc2626',
          color: '#991b1b', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 16 }} />
          ⚠️ Paciente em <strong>janela de risco imunológico</strong> (D+7 a D+14 do ciclo {ultimoCiclo.numero_ciclo}).
          Monitorar febre, neutropenia e sintomas.
        </div>
      )}

      {/* Tabs de seção */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 8, padding: 3, marginBottom: 16, overflowX: 'auto' }}>
        {SECOES.map(s => (
          <button key={s.id} onClick={() => setSecao(s.id)} style={{
            flex: '0 0 auto', padding: '6px 12px', fontSize: 12, fontWeight: 500,
            borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: secao === s.id ? 'var(--white)' : 'transparent',
            color: secao === s.id ? 'var(--dark)' : 'var(--text3)',
            boxShadow: secao === s.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-sans)',
          }}>
            <i className={`ti ti-${s.icon}`} style={{ fontSize: 13 }} />
            {s.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
          background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
          color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{feedback.msg}</div>
      )}

      {/* ── Diagnóstico ── */}
      {secao === 'diagnostico' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🧬 Diagnóstico</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
              <F label="Tipo de câncer" value={dados.tipo_cancer} onChange={set('tipo_cancer')} placeholder="ex: Câncer de mama HER2+" />
              <div>
                <label className="field-label">Estadiamento</label>
                <select value={dados.estadiamento} onChange={set('estadiamento')}>
                  <option value="">—</option>
                  {ESTADIAMENTOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <F label="Médico oncologista" value={dados.medico} onChange={set('medico')} />
              <F label="Hospital / Instituição" value={dados.hospital} onChange={set('hospital')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <F label="Data do diagnóstico" type="date" value={dados.data_diagnostico} onChange={set('data_diagnostico')} />
              <F label="Início do acompanhamento nutricional" type="date" value={dados.data_inicio_acompanhamento} onChange={set('data_inicio_acompanhamento')} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="field-label">Intenção do tratamento</label>
                <select value={dados.intencao} onChange={set('intencao')}>
                  <option value="">Selecione</option>
                  {INTENCOES.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Doença em atividade</label>
                <select value={dados.doenca_atividade} onChange={set('doenca_atividade')}>
                  <option value="">Selecione</option>
                  {[{v:'ativa',l:'Ativa'},{v:'nao',l:'Não'},{v:'estavel',l:'Estável'},{v:'progressao',l:'Progressão'},{v:'remissao',l:'Remissão'}].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="field-label">Paciente metastático?</label>
                <select value={dados.metastatico} onChange={set('metastatico')}>
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                  <option value="investigacao">Em investigação</option>
                </select>
              </div>
              {dados.metastatico === 'sim' && (
                <F label="Local(is) das metástases" value={dados.locais_metastase} onChange={set('locais_metastase')} placeholder="Fígado, pulmão, osso... (separe com vírgula)" />
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Ação/foco da semana (para exibir no painel)</label>
              <input value={dados.acao_semana} onChange={set('acao_semana')} placeholder="ex: Priorizar proteína, monitorar náusea pós-ciclo 4" />
            </div>

            <button className="btn" onClick={salvarTratamento} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar diagnóstico'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tratamento Sistêmico ── */}
      {secao === 'tratamento' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">💉 Tratamento Sistêmico</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="field-label">Tipo de tratamento</label>
                <select value={dados.tipo_trat_sistemico} onChange={set('tipo_trat_sistemico')}>
                  <option value="">Selecione</option>
                  {TIPO_TRAT.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </div>
              <F label="Protocolo" value={dados.protocolo} onChange={set('protocolo')} placeholder="ex: AC-T, FOLFOX, BEP" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <F label="Medicamentos (separados por vírgula)" value={dados.medicamentos} onChange={set('medicamentos')} placeholder="Doxorrubicina, Ciclofosfamida, Paclitaxel" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <F label="Total de ciclos" type="number" value={dados.total_ciclos} onChange={set('total_ciclos')} />
              <F label="Ciclo atual" type="number" value={dados.ciclo_atual} onChange={set('ciclo_atual')} />
              <div>
                <label className="field-label">Intervalo (dias)</label>
                <select value={dados.intervalo_ciclos} onChange={set('intervalo_ciclos')}>
                  <option value="">—</option>
                  {INTERVALOS.map(i => <option key={i} value={i}>{i} dias</option>)}
                </select>
              </div>
              <F label="Data última quimio" type="date" value={dados.data_ultima_quimio} onChange={set('data_ultima_quimio')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="field-label">Usa corticoide?</label>
                <select value={dados.usa_corticoide} onChange={set('usa_corticoide')}>
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
              <div>
                <label className="field-label">Teve atraso de ciclo?</label>
                <select value={dados.atraso_ciclo} onChange={set('atraso_ciclo')}>
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
            </div>
            <button className="btn" onClick={salvarTratamento} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar tratamento'}
            </button>
          </div>
        </div>
      )}

      {/* ── Calendário de Ciclos ── */}
      {secao === 'ciclos' && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div className="card-title">📅 Adicionar ciclo</div>
              <div className="card-sub">D+3, D+7, D+10 e D+14 são calculados automaticamente</div>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, alignItems: 'end' }}>
                <div>
                  <label className="field-label">Nº do ciclo</label>
                  <input type="number" value={novoCiclo.numero_ciclo} onChange={e => setNovoCiclo(p => ({ ...p, numero_ciclo: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Data da quimio *</label>
                  <DateInput value={novoCiclo.data_quimio} onChange={e => setNovoCiclo(p => ({ ...p, data_quimio: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Observação</label>
                  <input value={novoCiclo.obs} onChange={e => setNovoCiclo(p => ({ ...p, obs: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
              <button className="btn" style={{ marginTop: 10 }} onClick={adicionarCiclo} disabled={busy}>
                <i className="ti ti-plus" /> Adicionar ciclo
              </button>
            </div>
          </div>

          {ciclos.length > 0 && (() => {
            const uc = ciclos[0];
            const intervalo = num(dados.intervalo_ciclos) || 21;
            const marcos = [
              { d: uc.data_quimio,                   label: 'D0',          desc: 'Quimio',             cor: '#6366f1' },
              { d: uc.d3,                             label: 'D+3',         desc: 'Início da piora',    cor: '#f59e0b' },
              { d: uc.d7,                             label: 'D+7',         desc: 'Janela de risco',    cor: '#ef4444' },
              { d: uc.d10,                            label: 'D+10',        desc: 'Pico de risco',      cor: '#dc2626' },
              { d: uc.d14,                            label: 'D+14',        desc: 'Fim da janela',      cor: '#f97316' },
              { d: addDays(uc.data_quimio, intervalo), label: `D+${intervalo}`, desc: 'Próximo ciclo', cor: '#16a34a' },
            ];
            return (
              <div className="card" style={{ padding: 16, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--dark)' }}>
                  Linha do tempo · Ciclo {uc.numero_ciclo} ({dataBR(uc.data_quimio)})
                </div>
                <div style={{ position: 'relative', padding: '0 6px 32px' }}>
                  <div style={{ position: 'absolute', top: 10, left: 6, right: 6, height: 2, background: 'var(--bg3, #e8e2d8)', borderRadius: 1 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                    {marcos.map((m, i) => {
                      const passado = m.d <= hoje;
                      const isHoje  = m.d === hoje;
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', zIndex: 1, marginBottom: 6,
                            background: passado ? m.cor : '#fff',
                            border: `2px solid ${passado ? m.cor : 'var(--border)'}`,
                            boxShadow: isHoje ? `0 0 0 3px ${m.cor}40` : 'none',
                          }} />
                          <div style={{ fontSize: 10, fontWeight: 700, color: passado ? m.cor : 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>{m.label}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>{dataBR(m.d)}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3, maxWidth: 56 }}>{m.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {ciclos.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ciclo</th>
                    <th>Quimio</th>
                    <th>D+3</th>
                    <th>D+7</th>
                    <th>D+10</th>
                    <th>D+14 (fim da janela)</th>
                    <th>Obs</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ciclos.map(c => {
                    const emRisco = hoje >= c.d7 && hoje <= c.d14;
                    return (
                      <tr key={c.id} style={{ background: emRisco ? '#fef9c3' : undefined }}>
                        <td><strong>C{c.numero_ciclo}</strong></td>
                        <td>{dataBR(c.data_quimio)}</td>
                        <td style={{ color: 'var(--text3)' }}>{dataBR(c.d3)}</td>
                        <td style={{ color: emRisco ? '#d97706' : undefined, fontWeight: emRisco ? 600 : undefined }}>{dataBR(c.d7)}</td>
                        <td style={{ color: 'var(--text3)' }}>{dataBR(c.d10)}</td>
                        <td style={{ color: emRisco ? '#dc2626' : undefined, fontWeight: emRisco ? 600 : undefined }}>{dataBR(c.d14)}</td>
                        <td style={{ color: 'var(--text3)' }}>{c.obs ?? '—'}</td>
                        <td>
                          <button onClick={() => removerCiclo(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                            <i className="ti ti-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Radioterapia ── */}
      {secao === 'radio' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">☢️ Radioterapia</div>
          </div>
          <div className="card-body">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={dados.radio_ativa} onChange={set('radio_ativa')} />
              Paciente em radioterapia ativa
            </label>
            {dados.radio_ativa && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label className="field-label">Área irradiada</label>
                    <select value={dados.radio_area} onChange={set('radio_area')}>
                      <option value="">Selecione</option>
                      {AREAS_RADIO.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <F label="Sessão atual" type="number" value={dados.radio_sessao_atual} onChange={set('radio_sessao_atual')} />
                  <F label="Total de sessões" type="number" value={dados.radio_total_sessoes} onChange={set('radio_total_sessoes')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <F label="Data de início" type="date" value={dados.radio_inicio} onChange={set('radio_inicio')} />
                  <F label="Data de término" type="date" value={dados.radio_termino} onChange={set('radio_termino')} />
                </div>
              </>
            )}
            <button className="btn" style={{ marginTop: 10 }} onClick={salvarTratamento} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar radioterapia'}
            </button>
          </div>
        </div>
      )}

      {/* ── Cirurgia ── */}
      {secao === 'cirurgia' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔪 Cirurgia</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="field-label">Cirurgia indicada?</label>
                <select value={dados.cirurgia_status} onChange={set('cirurgia_status')}>
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                  <option value="avaliacao">Em avaliação</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={dados.cirurgia_preparo_nutricional} onChange={set('cirurgia_preparo_nutricional')} />
                  Necessita preparo nutricional
                </label>
              </div>
            </div>
            {dados.cirurgia_status === 'sim' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <F label="Tipo de cirurgia" value={dados.cirurgia_tipo} onChange={set('cirurgia_tipo')} placeholder="ex: Mastectomia, Histerectomia" />
                  <F label="Data marcada" type="date" value={dados.cirurgia_data} onChange={set('cirurgia_data')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={dados.cirurgia_realizada} onChange={set('cirurgia_realizada')} />
                      Já realizada
                    </label>
                  </div>
                  <F label="Complicações / observações" value={dados.cirurgia_complicacoes} onChange={set('cirurgia_complicacoes')} />
                </div>

                {/* Protocolo Pré-Cirúrgico */}
                <div style={{
                  marginTop: 6, marginBottom: 4,
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #fdf6ec 0%, #fef0d4 100%)',
                  border: '1.5px solid var(--amber)',
                  borderRadius: 10,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    flexShrink: 0,
                    width: 38, height: 38,
                    background: 'var(--amber)',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className="ti ti-shield-check" style={{ fontSize: 19, color: 'var(--dark)' }} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 3, letterSpacing: '.2px' }}>
                      Protocolo Pré-Cirúrgico
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.5 }}>
                      Prescrição de <strong>Impact®</strong> por 7 dias no pré-operatório
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--brown, #8c7b6b)', marginTop: 5, lineHeight: 1.5 }}>
                      Imunonutriente com arginina, ômega-3 e nucleotídeos — indicado no pré-cirúrgico oncológico para melhora da resposta imune e redução de complicações pós-operatórias.
                    </div>
                  </div>
                </div>
              </>
            )}
            <button className="btn" style={{ marginTop: 10 }} onClick={salvarTratamento} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar cirurgia'}
            </button>
          </div>
        </div>
      )}

      {/* ── Exames Laboratoriais ── */}
      {secao === 'exames' && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div className="card-title">🔬 Registrar exame</div>
            </div>
            <div className="card-body">
              <style>{`@keyframes lap-spin { to { transform: rotate(360deg); } }`}</style>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={importarPdf}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={lendoPdf}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginBottom: 16, padding: '7px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 7, cursor: lendoPdf ? 'default' : 'pointer',
                  border: '1.5px solid var(--primary, #6366f1)',
                  background: 'transparent', color: 'var(--primary, #6366f1)',
                  opacity: lendoPdf ? 0.7 : 1,
                }}
              >
                {lendoPdf ? (
                  <>
                    <i className="ti ti-loader-2" style={{ fontSize: 15, animation: 'lap-spin 1s linear infinite', display: 'inline-block' }} />
                    Lendo exame...
                  </>
                ) : (
                  <>📄 Importar PDF do exame</>
                )}
              </button>

              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Data do exame *</label>
                <DateInput value={novoExame.data_exame} onChange={e => setNovoExame(p => ({ ...p, data_exame: e.target.value }))} style={{ maxWidth: 200 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                {[
                  { k: 'hemoglobina', l: 'Hemoglobina (g/dL)', ph: '12,5' },
                  { k: 'leucocitos',  l: 'Leucócitos (/mm³)',  ph: '6500' },
                  { k: 'neutrofilos', l: 'Neutrófilos (/mm³)', ph: '3200' },
                  { k: 'linfocitos',  l: 'Linfócitos (/mm³)',  ph: '1800' },
                  { k: 'plaquetas',   l: 'Plaquetas (/mm³)',   ph: '220000' },
                  { k: 'pcr',         l: 'PCR (mg/L)',         ph: '5,0' },
                  { k: 'albumina',    l: 'Albumina (g/dL)',    ph: '3,8' },
                  { k: 'glicemia',    l: 'Glicemia (mg/dL)',   ph: '95' },
                ].map(({ k, l, ph }) => (
                  <div key={k}>
                    <label className="field-label">{l}</label>
                    <input inputMode="decimal" placeholder={ph} value={novoExame[k]} onChange={e => setNovoExame(p => ({ ...p, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Observações</label>
                <input value={novoExame.obs} onChange={e => setNovoExame(p => ({ ...p, obs: e.target.value }))} />
              </div>
              <button className="btn" onClick={adicionarExame} disabled={busy}>
                <i className="ti ti-plus" /> Registrar exame
              </button>
            </div>
          </div>

          {exames.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text3)', borderBottom: '0.5px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Histórico de exames
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hb</th>
                      <th>Leuco</th>
                      <th>Neutro</th>
                      <th>Linfo</th>
                      <th>Plaq</th>
                      <th>PCR</th>
                      <th>Alb</th>
                      <th>Gli</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {exames.map(e => (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{dataBR(e.data_exame)}</td>
                        <td><ExamVal v={e.hemoglobina} low={11} crit={8} /></td>
                        <td><ExamVal v={e.leucocitos}  low={3500} crit={1000} /></td>
                        <td><ExamVal v={e.neutrofilos} low={1500} crit={500} /></td>
                        <td><ExamVal v={e.linfocitos}  low={800}  crit={300} /></td>
                        <td><ExamVal v={e.plaquetas}   low={100000} crit={50000} /></td>
                        <td><ExamVal v={e.pcr}         low={10} crit={50} reverse /></td>
                        <td><ExamVal v={e.albumina}    low={3.5} crit={3} /></td>
                        <td>{e.glicemia ?? '—'}</td>
                        <td>
                          <button onClick={() => removerExame(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                            <i className="ti ti-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Exibe valor de exame com cor por faixa de referência
function ExamVal({ v, low, crit, reverse }) {
  if (v == null) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const ruim  = reverse ? v >= crit : v <= crit;
  const atenc = reverse ? v >= low  : v <= low;
  const cor   = ruim ? '#dc2626' : atenc ? '#d97706' : '#16a34a';
  return <span style={{ color: cor, fontWeight: ruim || atenc ? 600 : 400 }}>{v}</span>;
}

// Campo de input simples
function F({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
