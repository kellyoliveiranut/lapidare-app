import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

const FASES = [
  { id: 'quimio',        label: 'Dia da quimio (D0)',            cor: '#16a34a' },
  { id: 'inicio_piora',  label: 'Início da piora (D+1 a D+3)',   cor: '#eab308' },
  { id: 'janela_risco',  label: 'Janela de risco (D+4 a D+7)',   cor: '#ef4444' },
  { id: 'pico_risco',    label: 'Pico de risco (D+8 a D+10)',    cor: '#dc2626' },
  { id: 'fim_janela',    label: 'Fim da janela (D+11 a D+14)',   cor: '#eab308' },
  { id: 'proximo_ciclo', label: 'Próximo ciclo (D+15+)',          cor: '#16a34a' },
];

export default function MensagensCiclo() {
  const { user } = useSession();
  const [msgs, setMsgs] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('mensagens_ciclo')
      .select('fase, mensagem')
      .eq('nutri_id', user.id)
      .then(({ data }) => {
        const m = {};
        for (const row of (data ?? [])) m[row.fase] = row.mensagem;
        setMsgs(m);
      });
  }, [user]);

  async function salvar() {
    if (!user) return;
    setBusy(true);
    setFeedback(null);

    const comTexto  = FASES.filter(f =>  msgs[f.id]?.trim());
    const semTexto  = FASES.filter(f => !msgs[f.id]?.trim());

    const ops = [];

    if (comTexto.length) {
      ops.push(
        supabase.from('mensagens_ciclo').upsert(
          comTexto.map(f => ({
            nutri_id: user.id,
            fase: f.id,
            mensagem: msgs[f.id].trim(),
            ativo: true,
          })),
          { onConflict: 'nutri_id,fase' }
        )
      );
    }

    for (const f of semTexto) {
      ops.push(
        supabase.from('mensagens_ciclo')
          .delete()
          .eq('nutri_id', user.id)
          .eq('fase', f.id)
      );
    }

    const resultados = await Promise.all(ops);
    setBusy(false);

    const erro = resultados.find(r => r.error)?.error;
    if (erro) return setFeedback({ tipo: 'erro', msg: 'Erro ao salvar: ' + erro.message });

    setFeedback({ tipo: 'ok', msg: 'Mensagens salvas!' });
    setTimeout(() => setFeedback(null), 3000);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">💌 Mensagens do ciclo</div>
          <div className="card-sub">
            Mensagem exibida no app da paciente conforme o dia em que ela está no ciclo.
            Deixe em branco para não exibir em determinada fase.
          </div>
        </div>
        <div className="card-body">

          {/* Dica {nome} */}
          <div style={{
            padding: '9px 13px', borderRadius: 8, marginBottom: 20,
            background: 'var(--bg2)', border: '0.5px solid var(--border)',
            fontSize: 12, color: 'var(--text3)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <i className="ti ti-info-circle" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
            <span>
              Use{' '}
              <code style={{
                background: 'var(--bg3)', borderRadius: 4,
                padding: '1px 5px', fontSize: 11, fontFamily: 'monospace',
              }}>{'{nome}'}</code>
              {' '}para inserir o primeiro nome da paciente automaticamente.
            </span>
          </div>

          {/* Campos por fase */}
          {FASES.map(f => {
            const temTexto = !!msgs[f.id]?.trim();
            return (
              <div key={f.id} style={{ marginBottom: 18 }}>
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: f.cor, flexShrink: 0, display: 'inline-block',
                  }} />
                  {f.label}
                </label>
                <textarea
                  value={msgs[f.id] ?? ''}
                  onChange={e => setMsgs(prev => ({ ...prev, [f.id]: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%', resize: 'vertical', minHeight: 68,
                    padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
                    border: `1.5px solid ${temTexto ? f.cor + '70' : 'var(--border)'}`,
                    background: temTexto ? f.cor + '09' : 'var(--bg-soft)',
                    fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
                    outline: 'none', transition: 'border .2s, background .2s',
                    color: 'var(--ink)',
                  }}
                />
              </div>
            );
          })}

          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
            }}>
              {feedback.msg}
            </div>
          )}

          <button className="btn" onClick={salvar} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar mensagens'}
          </button>
        </div>
      </div>
    </div>
  );
}
