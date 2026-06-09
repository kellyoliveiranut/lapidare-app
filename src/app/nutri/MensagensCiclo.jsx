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

const EXEMPLOS = {
  quimio: [
    '{nome}, hoje é dia de químio 💚 Vá com calma, capriche na hidratação e lembre: cada sessão é um passo. Estou com você.',
    '{nome}, dia de tratamento hoje. Hidrate-se bem, coma algo leve antes e descanse depois. Você é mais forte do que imagina 🌿',
    'Força hoje, {nome}! 💚 Beba bastante água e respeite seu corpo. Qualquer sintoma, me conte pelo app.',
  ],
  inicio_piora: [
    '{nome}, nos próximos dias seu corpo pode pedir mais descanso — tudo bem. Coma em pequenas porções e mantenha a hidratação 🌿',
    'Se bater enjoo ou cansaço agora, {nome}, é esperado. Vá no seu ritmo, prefira alimentos leves e fracionados. Estou por aqui 💚',
    '{nome}, fase de adaptação. Hidrate-se, descanse e não se cobre demais. Pequenos passos contam.',
  ],
  janela_risco: [
    '{nome}, estamos na janela de maior atenção à imunidade. Capriche na higiene dos alimentos, evite aglomerações e, se tiver febre, avise sua equipe 💚',
    'Fase de cuidado redobrado, {nome}: alimentos bem cozidos, mãos higienizadas e hidratação em dia.',
    '{nome}, atenção extra com a imunidade agora. Comida bem lavada e cozida, e bastante descanso 🌿',
  ],
  pico_risco: [
    '{nome}, este é o período de menor imunidade do ciclo. Redobre os cuidados com a alimentação e evite contato com pessoas doentes. Febre, contate sua equipe na hora 💚',
    'Cuidado máximo nesses dias, {nome}: alimentos seguros, ambientes arejados e muito repouso. Você está indo bem.',
    '{nome}, fase mais sensível da imunidade. Hidrate, descanse e fique atenta a sinais como febre. Conte comigo 🌿',
  ],
  fim_janela: [
    '{nome}, o período mais sensível está passando 💚 Continue se cuidando e aos poucos retome o que te faz bem.',
    'Você atravessou a parte mais difícil do ciclo, {nome}. Mantenha a alimentação e a hidratação — a recuperação está a caminho 🌿',
    '{nome}, fase de recuperação. Capriche nas proteínas e no descanso pra repor as energias. Orgulho de você!',
  ],
  proximo_ciclo: [
    '{nome}, em breve um novo ciclo. Aproveite esses dias pra se fortalecer: alimentação caprichada, hidratação e descanso 💚',
    'Reta final antes do próximo ciclo, {nome}. Vamos chegar bem preparadas — qualquer dúvida, me chama pelo app 🌿',
    '{nome}, fase boa pra recuperar o pique antes da próxima sessão. Continue firme, você está mandando muito bem!',
  ],
};

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

    const comTexto = FASES.filter(f =>  msgs[f.id]?.trim());
    const semTexto = FASES.filter(f => !msgs[f.id]?.trim());

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
            const exemplos = EXEMPLOS[f.id] ?? [];
            return (
              <div key={f.id} style={{ marginBottom: 24 }}>
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
                  placeholder="Digite sua mensagem ou selecione um exemplo abaixo…"
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

                {/* Exemplos prontos */}
                <div style={{ marginTop: 6 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
                    color: 'var(--text3)', fontWeight: 500, marginBottom: 5,
                  }}>
                    Exemplos prontos — toque para usar
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {exemplos.map((ex, i) => {
                      const selecionado = msgs[f.id]?.trim() === ex;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setMsgs(prev => ({ ...prev, [f.id]: ex }))}
                          style={{
                            textAlign: 'left',
                            padding: '8px 11px',
                            borderRadius: 8,
                            border: selecionado
                              ? `1.5px solid ${f.cor}`
                              : '1px solid var(--border)',
                            background: selecionado ? f.cor + '12' : 'var(--bg-soft)',
                            cursor: 'pointer',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'var(--text2)',
                            fontFamily: 'var(--font-sans)',
                            transition: 'border .15s, background .15s',
                          }}
                        >
                          {ex}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
