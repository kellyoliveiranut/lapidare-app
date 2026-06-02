import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

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
    intencao: '', metastatico: '', locais_metastase: '',
    doenca_atividade: '',
    tipo_trat_sistemico: '', protocolo: '', medicamentos: '', total_ciclos: '', ciclo_atual: '',
    intervalo_ciclos: '', data_ultima_quimio: '',
    radio_ativa: false, radio_area: '', radio_sessao_atual: '', radio_total_sessoes: '',
    radio_inicio: '', radio_termino: '',
    cirurgia_indicada: false, cirurgia_realizada: false, cirurgia_data: '',
    cirurgia_complicacoes: '', cirurgia_preparo_nutricional: false,
    acao_semana: '',
  };
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
        intencao: trat.intencao ?? '', metastatico: trat.metastatico ?? '',
        locais_metastase: (trat.locais_metastase ?? []).join(', '),
        doenca_atividade: trat.doenca_atividade ?? '',
        tipo_trat_sistemico: trat.tipo_trat_sistemico ?? '', protocolo: trat.protocolo ?? '',
        medicamentos: (trat.medicamentos ?? []).join(', '),
        total_ciclos: trat.total_ciclos ?? '', ciclo_atual: trat.ciclo_atual ?? '',
        intervalo_ciclos: trat.intervalo_ciclos ?? '', data_ultima_quimio: trat.data_ultima_quimio ?? '',
        radio_ativa: trat.radio_ativa ?? false, radio_area: trat.radio_area ?? '',
        radio_sessao_atual: trat.radio_sessao_atual ?? '', radio_total_sessoes: trat.radio_total_sessoes ?? '',
        radio_inicio: trat.radio_inicio ?? '', radio_termino: trat.radio_termino ?? '',
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
      radio_ativa: dados.radio_ativa,
      radio_area: dados.radio_area.trim() || null,
      radio_sessao_atual: num(dados.radio_sessao_atual),
      radio_total_sessoes: num(dados.radio_total_sessoes),
      radio_inicio: dados.radio_inicio || null,
      radio_termino: dados.radio_termino || null,
      cirurgia_indicada: dados.cirurgia_indicada,
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <F label="Médico oncologista" value={dados.medico} onChange={set('medico')} />
              <F label="Hospital / Instituição" value={dados.hospital} onChange={set('hospital')} />
              <F label="Data do diagnóstico" type="date" value={dados.data_diagnostico} onChange={set('data_diagnostico')} />
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
                  <input type="date" value={novoCiclo.data_quimio} onChange={e => setNovoCiclo(p => ({ ...p, data_quimio: e.target.value }))} />
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

          {ciclos.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
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
                  <F label="Área irradiada" value={dados.radio_area} onChange={set('radio_area')} placeholder="ex: Mama direita + axilas" />
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
            <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={dados.cirurgia_indicada} onChange={set('cirurgia_indicada')} />
                Indicada
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={dados.cirurgia_realizada} onChange={set('cirurgia_realizada')} />
                Já realizada
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={dados.cirurgia_preparo_nutricional} onChange={set('cirurgia_preparo_nutricional')} />
                Necessita preparo nutricional
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <F label="Data da cirurgia" type="date" value={dados.cirurgia_data} onChange={set('cirurgia_data')} />
              <F label="Complicações / observações" value={dados.cirurgia_complicacoes} onChange={set('cirurgia_complicacoes')} />
            </div>
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
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Data do exame *</label>
                <input type="date" value={novoExame.data_exame} onChange={e => setNovoExame(p => ({ ...p, data_exame: e.target.value }))} style={{ maxWidth: 200 }} />
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
