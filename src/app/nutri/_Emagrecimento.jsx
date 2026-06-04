import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const HOJE = () => new Date().toISOString().slice(0, 10);

const CATEGORIAS = [
  {
    id: 'corpo',
    label: 'Composição Corporal',
    icon: 'scale',
    emoji: '⚖️',
    sintomas: [
      { id: 'ganho_peso',          label: 'Ganho de peso',                         campos: [] },
      { id: 'sobrepeso',           label: 'Sobrepeso/obesidade pós-tratamento',     campos: [] },
      { id: 'gordura_abdominal',   label: 'Aumento de gordura abdominal',           campos: [] },
      { id: 'dific_emagrecer',     label: 'Dificuldade para emagrecer',             campos: [] },
      { id: 'perda_massa',         label: 'Perda de massa muscular',                campos: [] },
      { id: 'sarcopenia',          label: 'Obesidade sarcopênica',                  campos: [] },
      { id: 'retencao_liquidos',   label: 'Retenção de líquidos',                   campos: [] },
      { id: 'piora_composicao',    label: 'Piora da composição corporal',           campos: [] },
    ],
  },
  {
    id: 'dor',
    label: 'Dor e Movimento',
    icon: 'run',
    emoji: '🦴',
    sintomas: [
      { id: 'dor_articular', label: 'Dor articular', campos: [
        { key: 'escala',       label: 'Escala de dor (0–10)', type: 'escala' },
        { key: 'localizacao',  label: 'Localização',          type: 'text',  placeholder: 'ex: joelhos, ombros' },
        { key: 'rigidez',      label: 'Rigidez matinal',      type: 'check' },
      ]},
      { id: 'rigidez_matinal', label: 'Rigidez matinal', campos: [
        { key: 'tempo', label: 'Tempo até melhorar', type: 'text', placeholder: 'ex: 30 min, 1h' },
      ]},
      { id: 'dor_muscular',      label: 'Dor muscular',                      campos: [] },
      { id: 'reducao_atividade', label: 'Redução de atividade física',        campos: [] },
      { id: 'baixa_disposicao',  label: 'Baixa disposição para treinar',      campos: [] },
      { id: 'dor_exercicio',     label: 'Dor que reduz o exercício',          campos: [] },
    ],
  },
  {
    id: 'energia',
    label: 'Energia e Sono',
    icon: 'moon',
    emoji: '🌙',
    sintomas: [
      { id: 'fadiga', label: 'Fadiga persistente', campos: [
        { key: 'energia_acordar',     label: 'Energia ao acordar (0–10)',      type: 'escala' },
        { key: 'energia_dia',         label: 'Energia ao longo do dia (0–10)', type: 'escala' },
        { key: 'energia_pos_esforco', label: 'Energia pós-esforço (0–10)',     type: 'escala' },
      ]},
      { id: 'fogachos', label: 'Fogachos', campos: [
        { key: 'frequencia',  label: 'Frequência',           type: 'text',  placeholder: 'ex: 5x ao dia' },
        { key: 'intensidade', label: 'Intensidade (0–10)',   type: 'escala' },
        { key: 'horario',     label: 'Horário predominante', type: 'text',  placeholder: 'ex: manhã, noite' },
        { key: 'gatilhos',    label: 'Gatilhos',             type: 'text',  placeholder: 'ex: café, estresse' },
      ]},
      { id: 'suor_noturno', label: 'Suor noturno', campos: [
        { key: 'despertares', label: 'Despertares por noite', type: 'text',  placeholder: 'ex: 2–3x' },
        { key: 'intensidade', label: 'Intensidade (0–10)',    type: 'escala' },
      ]},
      { id: 'insonia', label: 'Insônia', campos: [
        { key: 'horario_dormir',   label: 'Horário de dormir',          type: 'text', placeholder: 'ex: 23h' },
        { key: 'tempo_adormecer',  label: 'Tempo para pegar no sono',   type: 'text', placeholder: 'ex: 1h' },
        { key: 'despertares',      label: 'Despertares noturnos',       type: 'text', placeholder: 'ex: 2x' },
      ]},
      { id: 'sono_nao_reparador', label: 'Sono não reparador', campos: [
        { key: 'qualidade',       label: 'Qualidade do sono (0–10)',  type: 'escala' },
        { key: 'energia_acordar', label: 'Energia ao acordar (0–10)', type: 'escala' },
      ]},
    ],
  },
  {
    id: 'mente',
    label: 'Mente e Humor',
    icon: 'brain',
    emoji: '🧠',
    sintomas: [
      { id: 'nevoa_mental', label: 'Névoa mental', campos: [
        { key: 'clareza', label: 'Clareza mental (0–10)', type: 'escala' },
      ]},
      { id: 'concentracao',    label: 'Dificuldade de concentração',       campos: [] },
      { id: 'esquecimento',    label: 'Esquecimento / alteração de memória', campos: [] },
      { id: 'oscilacao_humor', label: 'Oscilação de humor',                campos: [] },
      { id: 'irritabilidade',  label: 'Irritabilidade e ansiedade',        campos: [] },
    ],
  },
  {
    id: 'alimentar',
    label: 'Comportamento Alimentar',
    icon: 'apple',
    emoji: '🍎',
    sintomas: [
      { id: 'fome_emocional', label: 'Fome emocional', campos: [
        { key: 'tipo',     label: 'Tipo predominante',   type: 'select', options: ['Física', 'Emocional', 'Mista'] },
        { key: 'horario',  label: 'Horário',             type: 'text',   placeholder: 'ex: tarde, noite' },
        { key: 'gatilhos', label: 'Gatilhos',            type: 'text',   placeholder: 'ex: estresse, tédio' },
      ]},
      { id: 'vontade_doces',      label: 'Vontade aumentada de doces e carboidratos', campos: [] },
      { id: 'beliscos_noturnos',  label: 'Beliscos noturnos',                         campos: [] },
      { id: 'compulsao', label: 'Compulsão alimentar', campos: [
        { key: 'frequencia', label: 'Episódios por semana', type: 'text',  placeholder: 'ex: 2–3x' },
        { key: 'culpa',      label: 'Culpa após episódio',  type: 'check' },
        { key: 'gatilho',    label: 'Gatilho',              type: 'text',  placeholder: 'ex: estresse, solidão' },
      ]},
      { id: 'constipacao', label: 'Constipação', campos: [
        { key: 'frequencia',   label: 'Frequência intestinal', type: 'text',   placeholder: 'ex: 1x/semana' },
        { key: 'consistencia', label: 'Consistência (Bristol)', type: 'select', options: ['Tipo 1–2 (dura)', 'Tipo 3–4 (normal)', 'Tipo 5–7 (mole)'] },
      ]},
    ],
  },
  {
    id: 'qualidade',
    label: 'Qualidade de Vida',
    icon: 'heart',
    emoji: '💛',
    sintomas: [
      { id: 'autoestima', label: 'Autoestima corporal', campos: [
        { key: 'percepcao',      label: 'Percepção corporal (0–10)', type: 'escala' },
        { key: 'impacto_roupas', label: 'Impacto nas roupas',        type: 'check' },
        { key: 'impacto_social', label: 'Impacto na vida social',    type: 'check' },
      ]},
      { id: 'qualidade_vida', label: 'Redução da qualidade de vida', campos: [
        { key: 'impacto_rotina', label: 'Impacto na rotina (0–10)', type: 'escala' },
      ]},
      { id: 'adesao_hormonio', label: 'Risco de baixa adesão à hormonioterapia', campos: [] },
    ],
  },
];

export default function Emagrecimento({ pacienteId, nutriId }) {
  const [secao, setSecao]       = useState('corpo');
  const [registros, setRegistros] = useState({});
  const [busy, setBusy]         = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => { carregar(); }, [pacienteId]);

  async function carregar() {
    const { data } = await supabase
      .from('emagrecimento_sintomas')
      .select('*')
      .eq('paciente_id', pacienteId);

    const mapa = {};
    for (const r of data ?? []) {
      let valor_obj = {};
      try { valor_obj = JSON.parse(r.valor || '{}'); } catch { /* noop */ }
      mapa[r.sintoma] = {
        presente:      r.presente,
        valor_obj,
        data_registro: r.data_registro || HOJE(),
      };
    }
    setRegistros(mapa);
  }

  function setPresente(sintomaId, v) {
    setRegistros(prev => ({
      ...prev,
      [sintomaId]: {
        presente:      v,
        valor_obj:     prev[sintomaId]?.valor_obj || {},
        data_registro: prev[sintomaId]?.data_registro || HOJE(),
      },
    }));
  }

  function setCampo(sintomaId, key, val) {
    setRegistros(prev => ({
      ...prev,
      [sintomaId]: {
        presente:      prev[sintomaId]?.presente || false,
        data_registro: prev[sintomaId]?.data_registro || HOJE(),
        ...(prev[sintomaId] || {}),
        valor_obj: {
          ...(prev[sintomaId]?.valor_obj || {}),
          [key]: val,
        },
      },
    }));
  }

  async function salvar() {
    setBusy(true);
    setFeedback(null);
    const catAtual = CATEGORIAS.find(c => c.id === secao);
    const rows = catAtual.sintomas.map(s => {
      const reg = registros[s.id] || {};
      return {
        paciente_id:   pacienteId,
        nutri_id:      nutriId,
        categoria:     secao,
        sintoma:       s.id,
        presente:      reg.presente || false,
        valor:         JSON.stringify(reg.valor_obj || {}),
        data_registro: reg.data_registro || HOJE(),
      };
    });

    const { error } = await supabase
      .from('emagrecimento_sintomas')
      .upsert(rows, { onConflict: 'paciente_id,sintoma' });

    setBusy(false);
    if (error) setFeedback({ tipo: 'erro', msg: error.message });
    else       setFeedback({ tipo: 'ok',  msg: 'Dados salvos com sucesso.' });
  }

  const catAtual = CATEGORIAS.find(c => c.id === secao);
  const nPresentes = catAtual.sintomas.filter(s => registros[s.id]?.presente).length;

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 8, padding: 3, marginBottom: 16,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {CATEGORIAS.map(c => {
          const n = c.sintomas.filter(s => registros[s.id]?.presente).length;
          return (
            <button key={c.id} onClick={() => { setSecao(c.id); setFeedback(null); }} style={{
              flex: '0 0 auto', padding: '6px 12px', fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: secao === c.id ? 'var(--white)' : 'transparent',
              color: secao === c.id ? 'var(--dark)' : 'var(--text3)',
              boxShadow: secao === c.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-sans)',
            }}>
              <i className={`ti ti-${c.icon}`} style={{ fontSize: 13 }} />
              {c.label}
              {n > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 10, fontWeight: 600,
                  background: secao === c.id ? 'var(--amber-bg, #fff3cd)' : 'var(--bg3)',
                  color: 'var(--amber, #d97706)',
                }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
          background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
          color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{feedback.msg}</div>
      )}

      {/* Card da categoria */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{catAtual.emoji}</span>
            <div>
              <div className="card-title">{catAtual.label}</div>
              <div className="card-sub">
                {nPresentes === 0
                  ? 'Nenhum sintoma marcado como presente'
                  : `${nPresentes} sintoma${nPresentes > 1 ? 's' : ''} presente${nPresentes > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
        </div>

        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {catAtual.sintomas.map(s => (
              <SintomaCard
                key={s.id}
                sintoma={s}
                reg={registros[s.id]}
                onToggle={v => setPresente(s.id, v)}
                onCampo={(key, val) => setCampo(s.id, key, val)}
              />
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn" onClick={salvar} disabled={busy}>
              {busy ? 'Salvando…' : `Salvar ${catAtual.label}`}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Data de registro: {new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cartão de um sintoma ──────────────────────────────────────

function SintomaCard({ sintoma, reg, onToggle, onCampo }) {
  const presente = reg?.presente || false;
  const v = reg?.valor_obj || {};

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${presente ? 'var(--amber, #d97706)' : 'var(--border)'}`,
      background: presente ? 'var(--amber-bg, #fffbf0)' : 'var(--bg)',
      overflow: 'hidden',
      transition: 'border-color .15s, background .15s',
    }}>
      {/* Header — toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={presente}
          onChange={e => onToggle(e.target.checked)}
          style={{ accentColor: 'var(--amber, #d97706)', width: 15, height: 15, flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, fontWeight: presente ? 600 : 400, color: 'var(--dark)', flex: 1 }}>
          {sintoma.label}
        </span>
        {presente && (
          <span style={{
            fontSize: 10, padding: '1px 7px', borderRadius: 10,
            background: 'var(--amber, #d97706)', color: '#fff', fontWeight: 600,
          }}>Presente</span>
        )}
      </label>

      {/* Campos específicos + observação */}
      {presente && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: '0.5px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 10,
          marginTop: 2,
        }}>
          {sintoma.campos.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 10,
              paddingTop: 10,
            }}>
              {sintoma.campos.map(c => (
                <Campo
                  key={c.key}
                  campo={c}
                  value={v[c.key]}
                  onChange={val => onCampo(c.key, val)}
                />
              ))}
            </div>
          )}

          <div>
            <label className="field-label">Observação</label>
            <input
              value={v.obs || ''}
              onChange={e => onCampo('obs', e.target.value)}
              placeholder="Detalhes, contexto, evolução…"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campo individual ──────────────────────────────────────────

function Campo({ campo, value, onChange }) {
  const { label, type, placeholder, options } = campo;

  if (type === 'escala') {
    const val = value != null ? Number(value) : 5;
    const cor = val <= 3 ? '#16a34a' : val <= 6 ? '#d97706' : '#dc2626';
    return (
      <div>
        <label className="field-label">{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range" min="0" max="10" step="1"
            value={val}
            onChange={e => onChange(e.target.value)}
            style={{ flex: 1, accentColor: cor }}
          />
          <span style={{ minWidth: 22, fontWeight: 700, color: cor, fontSize: 14 }}>{val}</span>
        </div>
      </div>
    );
  }

  if (type === 'check') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingTop: 18, fontSize: 13, color: 'var(--dark)' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ accentColor: 'var(--amber, #d97706)' }}
        />
        {label}
      </label>
    );
  }

  if (type === 'select') {
    return (
      <div>
        <label className="field-label">{label}</label>
        <select value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">Selecione</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  // default: text
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
