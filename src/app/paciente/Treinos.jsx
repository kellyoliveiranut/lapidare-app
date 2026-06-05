import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

const INTENSIDADE_OPTS = ['Fácil', 'Normal', 'Difícil', 'Não consegui'];
const SENTIMENTO_OPTS = [
  { value: 'bem',     label: '😊 Bem' },
  { value: 'regular', label: '😐 Regular' },
  { value: 'cansada', label: '😔 Cansada' },
];
const EMOJI = { bem: '😊', regular: '😐', cansada: '😔' };

const form0 = () => ({ intensidade_sentida: 'Normal', como_se_sentiu: 'bem', observacao: '' });

export default function TreinosPaciente() {
  const { user } = useSession();
  const [treino, setTreino] = useState(undefined);
  const [registros, setRegistros] = useState([]);
  const [form, setForm] = useState(form0());
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [semanaCount, setSemanaCount] = useState(0);

  async function carregar() {
    if (!user?.id) return;
    const [treinoRes, registrosRes] = await Promise.all([
      supabase
        .from('treinos_prescritos')
        .select('*')
        .eq('paciente_id', user.id)
        .eq('ativo', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('treinos_registros')
        .select('*')
        .eq('paciente_id', user.id)
        .order('data_execucao', { ascending: false })
        .limit(30),
    ]);
    setTreino(treinoRes.data ?? null);
    const regs = registrosRes.data ?? [];
    setRegistros(regs);

    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    setSemanaCount(regs.filter(r => new Date(r.data_execucao) >= inicioSemana).length);
  }

  useEffect(() => { carregar(); }, [user?.id]);

  async function registrar() {
    if (!treino) return;
    setSalvando(true);
    setFeedback(null);
    const { error } = await supabase.from('treinos_registros').insert({
      paciente_id: user.id,
      treino_id: treino.id,
      intensidade_sentida: form.intensidade_sentida,
      como_se_sentiu: form.como_se_sentiu,
      observacao: form.observacao.trim() || null,
    });
    setSalvando(false);
    if (error) { setFeedback({ tipo: 'erro', msg: 'Erro ao registrar: ' + error.message }); return; }
    setFeedback({ tipo: 'ok', msg: 'Sessão registrada! Continue assim 💪' });
    setForm(form0());
    carregar();
  }

  if (treino === undefined) {
    return <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>;
  }

  if (!treino) {
    return (
      <div className="card empty-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <i className="ti ti-run" style={{ fontSize: 36, color: 'var(--text3)', marginBottom: 10, display: 'block' }} aria-hidden="true" />
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Nenhum treino prescrito</div>
        <div className="empty-sub">Sua nutri ainda não prescreveu um treino para você.</div>
      </div>
    );
  }

  const embedUrl = youtubeEmbedUrl(treino.video_url);
  const metaAtingida = semanaCount >= treino.frequencia_semanal;
  const pct = treino.frequencia_semanal > 0
    ? Math.min(100, Math.round((semanaCount / treino.frequencia_semanal) * 100))
    : 0;

  return (
    <>
      {/* Aviso de segurança fixo */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', borderRadius: 10, marginBottom: 12,
        background: 'var(--orange-bg)', border: '0.5px solid var(--orange)',
        fontSize: 12, color: 'var(--dark)', lineHeight: 1.5,
      }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: 'var(--orange)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span>
          <strong>Importante:</strong> inicie os exercícios apenas após liberação médica.
          Respeite os limites do seu corpo. Em caso de dor, tontura ou falta de ar,
          pare imediatamente e comunique sua nutricionista.
        </span>
      </div>

      {/* Card do treino prescrito */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11, flexShrink: 0,
            background: 'var(--green-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-run" style={{ fontSize: 22, color: 'var(--green)' }} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>{treino.tipo}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {treino.intensidade} · {treino.frequencia_semanal}×/semana · {treino.duracao_minutos} min/sessão
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{treino.fase_tratamento}</div>
            {treino.dias_semana?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {treino.dias_semana.map(d => (
                  <span key={d} style={{
                    padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                    background: 'var(--green-bg)', color: 'var(--green)',
                  }}>{d}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {treino.objetivo_treino && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 2 }}>
              🎯 Objetivo
            </span>
            {treino.objetivo_treino}
          </div>
        )}

        {treino.precaucoes && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8,
            background: 'var(--orange-bg)', border: '0.5px solid var(--orange)',
            fontSize: 13, color: 'var(--dark)', lineHeight: 1.5,
          }}>
            <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 500, display: 'block', marginBottom: 2 }}>
              ⚠️ Precauções
            </span>
            {treino.precaucoes}
          </div>
        )}

        {treino.observacoes && (
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 8,
            background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 3 }}>
              Orientações da sua nutri
            </span>
            {treino.observacoes}
          </div>
        )}

        {treino.progressao && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8,
            background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 2 }}>
              📈 Como evoluir
            </span>
            {treino.progressao}
          </div>
        )}

        {/* Contador de adesão */}
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: metaAtingida ? 'var(--green-bg)' : 'var(--bg2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {semanaCount} de {treino.frequencia_semanal} sessões esta semana
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: metaAtingida ? 'var(--green)' : 'var(--text2)',
            }}>
              {pct}%{metaAtingida ? ' ✓' : ''}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--hair)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${pct}%`,
              background: metaAtingida ? 'var(--green)' : 'var(--amber)',
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Vídeo embed */}
      {embedUrl && (
        <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', marginBottom: 16 }}>
          <iframe
            src={embedUrl}
            title={treino.tipo}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Registro de sessão */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Registrar sessão de hoje</div>

        <label className="field-label">Como foi a intensidade?</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          {INTENSIDADE_OPTS.map(op => (
            <button
              key={op}
              onClick={() => setForm(f => ({ ...f, intensidade_sentida: op }))}
              style={{
                padding: '10px 8px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', border: 'none',
                background: form.intensidade_sentida === op ? 'var(--ink)' : 'var(--bg2)',
                color: form.intensidade_sentida === op ? 'var(--paper)' : 'var(--text2)',
                fontWeight: form.intensidade_sentida === op ? 600 : 400,
              }}>
              {op}
            </button>
          ))}
        </div>

        <label className="field-label">Como você se sentiu?</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {SENTIMENTO_OPTS.map(op => (
            <button
              key={op.value}
              onClick={() => setForm(f => ({ ...f, como_se_sentiu: op.value }))}
              style={{
                flex: 1, padding: '12px 4px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', border: 'none',
                background: form.como_se_sentiu === op.value ? 'var(--ink)' : 'var(--bg2)',
                color: form.como_se_sentiu === op.value ? 'var(--paper)' : 'var(--text2)',
              }}>
              {op.label}
            </button>
          ))}
        </div>

        <label className="field-label">Observação (opcional)</label>
        <textarea
          rows={2}
          placeholder="Como foi o treino hoje?"
          value={form.observacao}
          onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
          style={{ marginBottom: 10 }}
        />

        {feedback && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 10,
            background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>{feedback.msg}</div>
        )}

        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={registrar}
          disabled={salvando}>
          <i className="ti ti-check" aria-hidden="true" />
          {salvando ? 'Salvando...' : 'Fiz o treino hoje'}
        </button>
      </div>

      {/* Histórico de sessões */}
      <div className="section-label">Histórico de sessões</div>
      {registros.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma sessão registrada ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {registros.map((r, i) => {
            const dt = new Date(r.data_execucao);
            const dataStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const horaStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                borderBottom: i < registros.length - 1 ? '0.5px solid var(--hair)' : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: 'var(--green-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {EMOJI[r.como_se_sentiu] ?? '✅'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {r.intensidade_sentida} · {dataStr} às {horaStr}
                  </div>
                  {r.observacao && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{r.observacao}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
