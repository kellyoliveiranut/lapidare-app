import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

const TIPOS = [
  'Aeróbico (caminhada, bicicleta ergométrica)',
  'Força/Resistência (musculação leve, faixas elásticas)',
  'Flexibilidade (alongamento, yoga, pilates)',
  'Mobilidade articular',
  'Respiratório',
  'Combinado (aeróbico + força)',
];
const INTENSIDADES = ['Leve', 'Moderada', 'Moderada-alta'];
const FREQUENCIAS  = [1, 2, 3, 4, 5];
const DURACOES     = [10, 15, 20, 30, 45, 60];
const FASES = [
  'Durante quimioterapia',
  'Durante radioterapia',
  'Pré-cirúrgico',
  'Pós-cirúrgico',
  'Pós-tratamento / Sobrevivente',
];
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const VIDEOS_SUGERIDOS = [
  { label: 'Alongamento oncologia',      url: 'https://www.youtube.com/results?search_query=alongamento+pacientes+cancer+oncologia+portugues' },
  { label: 'Caminhada e exercício leve', url: 'https://www.youtube.com/results?search_query=exercicio+leve+pacientes+oncologicos+portugues' },
  { label: 'Yoga oncológico',            url: 'https://www.youtube.com/results?search_query=yoga+pacientes+oncologicos+portugues' },
  { label: 'Faixa elástica força',       url: 'https://www.youtube.com/results?search_query=exercicios+faixa+elastica+cancer+reabilitacao' },
  { label: 'Exercícios respiratórios',   url: 'https://www.youtube.com/results?search_query=exercicios+respiratorios+oncologia+portugues' },
];

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

const form0 = () => ({
  tipo: TIPOS[0],
  intensidade: 'Leve',
  frequencia_semanal: 3,
  duracao_minutos: 30,
  fase_tratamento: FASES[0],
  dias_semana: [],
  objetivo_treino: '',
  precaucoes: '',
  progressao: '',
  observacoes: '',
  video_url: '',
});

export default function Treinos({ pacienteId, nutriId, pacienteNome }) {
  const [treinos, setTreinos] = useState(null);
  const [form, setForm] = useState(form0());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [ascoOpen, setAscoOpen] = useState(false);

  async function carregar() {
    const { data } = await supabase
      .from('treinos_prescritos')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    setTreinos(data ?? []);
  }

  useEffect(() => { carregar(); }, [pacienteId]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDia = dia => setForm(f => ({
    ...f,
    dias_semana: f.dias_semana.includes(dia)
      ? f.dias_semana.filter(d => d !== dia)
      : [...f.dias_semana, dia],
  }));

  async function publicar() {
    setFeedback(null);
    setBusy(true);
    const { error } = await supabase.from('treinos_prescritos').insert({
      paciente_id:      pacienteId,
      nutri_id:         nutriId,
      tipo:             form.tipo,
      intensidade:      form.intensidade,
      frequencia_semanal: form.frequencia_semanal,
      duracao_minutos:  form.duracao_minutos,
      fase_tratamento:  form.fase_tratamento,
      dias_semana:      form.dias_semana.length ? form.dias_semana : null,
      objetivo_treino:  form.objetivo_treino.trim() || null,
      precaucoes:       form.precaucoes.trim() || null,
      progressao:       form.progressao.trim() || null,
      observacoes:      form.observacoes.trim() || null,
      video_url:        form.video_url.trim() || null,
      ativo: true,
    });
    setBusy(false);
    if (error) { setFeedback({ tipo: 'erro', msg: error.message }); return; }
    setFeedback({ tipo: 'ok', msg: `Treino publicado para ${pacienteNome.split(' ')[0]}!` });
    setForm(form0());
    carregar();
  }

  async function desativar(id) {
    if (!window.confirm('Desativar este treino?')) return;
    await supabase.from('treinos_prescritos').update({ ativo: false }).eq('id', id);
    carregar();
  }

  const embedPreview = youtubeEmbedUrl(form.video_url);

  return (
    <>
      {/* Diretrizes ASCO 2022 | Atualização 2026 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <button
          onClick={() => setAscoOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--font-sans)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: 'var(--green-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: 18, color: 'var(--green)' }} aria-hidden="true" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Diretrizes ASCO 2022 | Atualização 2026</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Exercício durante e após o tratamento oncológico</div>
            </div>
          </div>
          <i className={`ti ti-chevron-${ascoOpen ? 'up' : 'down'}`} style={{ color: 'var(--text3)', fontSize: 16 }} aria-hidden="true" />
        </button>
        {ascoOpen && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: '0.5px solid var(--hair)',
            fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
          }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <li>150–300 min/semana de exercício aeróbico moderado</li>
              <li>Treino de resistência muscular 2×/semana</li>
              <li>Exercício é seguro durante tratamento ativo com intenção curativa</li>
              <li>Reduz fadiga, ansiedade, depressão e risco de recidiva</li>
              <li>Preserva capacidade cardiorrespiratória e força muscular</li>
              <li>Baixo risco de eventos adversos quando supervisionado</li>
              <li>Recomendado antes, durante e após o tratamento oncológico</li>
              <li>Início gradual: começar com 10–15 min e progredir semanalmente</li>
              <li>Priorizar exercício supervisionado por profissional capacitado</li>
              <li>Adaptar intensidade conforme hemograma, fadiga e fase do tratamento</li>
            </ul>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              Fonte: Ligibel et al. ASCO Guideline 2022. J Clin Oncol 40:2491-2507
            </div>
          </div>
        )}
      </div>

      {/* Formulário de prescrição */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Prescrever treino</div>
            <div className="card-sub">Visível para {pacienteNome.split(' ')[0]} no portal Essentia</div>
          </div>
        </div>
        <div className="card-body">

          {/* Tipo */}
          <label className="field-label">Tipo de treino</label>
          <select value={form.tipo} onChange={set('tipo')}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Intensidade / Frequência / Duração */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label className="field-label">Intensidade</label>
              <select value={form.intensidade} onChange={set('intensidade')}>
                {INTENSIDADES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Frequência/semana</label>
              <select value={form.frequencia_semanal} onChange={e => setVal('frequencia_semanal', Number(e.target.value))}>
                {FREQUENCIAS.map(f => <option key={f} value={f}>{f}×/sem</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Duração</label>
              <select value={form.duracao_minutos} onChange={e => setVal('duracao_minutos', Number(e.target.value))}>
                {DURACOES.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>

          {/* Fase do tratamento */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Fase do tratamento</label>
            <select value={form.fase_tratamento} onChange={set('fase_tratamento')}>
              {FASES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Dias da semana */}
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Dias da semana (opcional)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {DIAS.map(dia => {
                const ativo = form.dias_semana.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDia(dia)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12,
                      fontFamily: 'var(--font-sans)', cursor: 'pointer',
                      border: ativo ? 'none' : '0.5px solid var(--border)',
                      background: ativo ? 'var(--dark)' : 'var(--bg2)',
                      color: ativo ? 'var(--white)' : 'var(--text2)',
                      fontWeight: ativo ? 600 : 400,
                    }}>
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Objetivo do treino */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Objetivo do treino (opcional)</label>
            <input
              type="text"
              placeholder="ex: Reduzir fadiga, preservar massa muscular"
              value={form.objetivo_treino}
              onChange={set('objetivo_treino')}
            />
          </div>

          {/* Precauções */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: 'var(--orange)' }} aria-hidden="true" />
              Precauções clínicas (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="ex: Evitar exercícios com braço operado. Não fazer se plaquetas < 50.000."
              value={form.precaucoes}
              onChange={set('precaucoes')}
            />
          </div>

          {/* Progressão */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Progressão (opcional)</label>
            <textarea
              rows={2}
              placeholder="ex: Semana 1-2: 10 min. Semana 3-4: 15 min. Aumentar 5 min a cada 2 semanas."
              value={form.progressao}
              onChange={set('progressao')}
            />
          </div>

          {/* Observações */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Observações clínicas (opcional)</label>
            <textarea
              rows={2}
              placeholder="ex: Iniciar com 10 min e progredir conforme tolerância. Evitar durante nadir."
              value={form.observacoes}
              onChange={set('observacoes')}
            />
          </div>

          {/* Vídeo */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Vídeo do YouTube (opcional)</label>
            <input
              type="url"
              placeholder="Cole o link do YouTube aqui"
              value={form.video_url}
              onChange={set('video_url')}
            />
            {embedPreview && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
                <iframe
                  src={embedPreview}
                  title="Preview do vídeo"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>

          {/* Vídeos sugeridos */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 7, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Buscar vídeos sugeridos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {VIDEOS_SUGERIDOS.map(v => (
                <a
                  key={v.label}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--bg2)', border: '0.5px solid var(--border)',
                    fontSize: 12, color: 'var(--text2)', textDecoration: 'none',
                  }}>
                  <i className="ti ti-brand-youtube" style={{ color: '#FF0000', fontSize: 14 }} aria-hidden="true" />
                  {v.label}
                </a>
              ))}
            </div>
          </div>

          {feedback && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
            }}>{feedback.msg}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={publicar} disabled={busy}>
              <i className="ti ti-player-play" aria-hidden="true" />
              {busy ? 'Publicando...' : 'Publicar treino'}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de treinos prescritos */}
      <div className="section-label">Treinos prescritos ({treinos?.length ?? 0})</div>

      {treinos === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : treinos.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum treino prescrito ainda.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {treinos.map(t => (
            <div key={t.id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: t.ativo ? 'var(--green-bg)' : 'var(--bg2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-run" style={{ fontSize: 18, color: t.ativo ? 'var(--green)' : 'var(--text3)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                    {t.tipo}
                    {!t.ativo && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>inativo</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {t.intensidade} · {t.frequencia_semanal}×/semana · {t.duracao_minutos} min
                    {t.dias_semana?.length ? ` · ${t.dias_semana.join(', ')}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.fase_tratamento}</div>
                  {t.objetivo_treino && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                      🎯 {t.objetivo_treino}
                    </div>
                  )}
                  {t.precaucoes && (
                    <div style={{ fontSize: 12, color: 'var(--orange)', marginTop: 3 }}>
                      ⚠️ {t.precaucoes}
                    </div>
                  )}
                  {t.observacoes && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.4 }}>{t.observacoes}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                    Publicado em {dataBR(t.created_at)}
                  </div>
                </div>
                {t.ativo && (
                  <button
                    onClick={() => desativar(t.id)}
                    title="Desativar treino"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, flexShrink: 0 }}>
                    <i className="ti ti-x" style={{ fontSize: 15 }} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
