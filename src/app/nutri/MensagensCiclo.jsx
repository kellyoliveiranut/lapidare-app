import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Grupos apenas para organizar a biblioteca de exemplos
const GRUPOS = [
  { id: 'quimio',        label: 'Dia da químio' },
  { id: 'inicio_piora',  label: 'Início da piora' },
  { id: 'janela_risco',  label: 'Janela de risco' },
  { id: 'pico_risco',    label: 'Pico de risco' },
  { id: 'fim_janela',    label: 'Fim da janela' },
  { id: 'proximo_ciclo', label: 'Próximo ciclo / fase boa' },
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
  const [ativa, setAtiva] = useState(null);   // texto da mensagem ativa
  const [custom, setCustom] = useState('');   // campo de texto livre
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('mensagens_ciclo')
      .select('mensagem')
      .eq('nutri_id', user.id)
      .eq('fase', 'ativa')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.mensagem) setAtiva(data.mensagem);
      });
  }, [user]);

  async function definirAtiva(texto) {
    if (!texto?.trim() || !user) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase
      .from('mensagens_ciclo')
      .upsert(
        { nutri_id: user.id, fase: 'ativa', mensagem: texto.trim(), ativo: true },
        { onConflict: 'nutri_id,fase' }
      );
    setBusy(false);
    if (error) {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar: ' + error.message });
      return;
    }
    setAtiva(texto.trim());
    setCustom('');
    setFeedback({ tipo: 'ok', msg: 'Mensagem ativa definida!' });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function removerAtiva() {
    if (!user) return;
    setBusy(true);
    await supabase
      .from('mensagens_ciclo')
      .delete()
      .eq('nutri_id', user.id)
      .eq('fase', 'ativa');
    setBusy(false);
    setAtiva(null);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">💌 Mensagem motivacional</div>
          <div className="card-sub">
            A mensagem ativa aparece para <strong>todos os seus pacientes</strong> no topo do app,
            com o nome de cada uma no lugar de <code style={{ fontSize: 11 }}>{'{nome}'}</code>.
            Troque quando quiser.
          </div>
        </div>
        <div className="card-body">

          {/* ── MENSAGEM ATIVA ── */}
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            Mensagem ativa
          </div>

          {ativa ? (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: 'var(--green-bg, #f0fdf4)',
              border: '1.5px solid var(--green, #16a34a)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, color: 'var(--green, #16a34a)',
                    letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5,
                  }}>
                    <i className="ti ti-check" style={{ fontSize: 12 }} />
                    Ativa agora
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
                    {ativa}
                  </div>
                </div>
                <button
                  onClick={removerAtiva}
                  disabled={busy}
                  title="Remover mensagem ativa"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', padding: 4, flexShrink: 0,
                  }}
                >
                  <i className="ti ti-x" style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: 'var(--bg2)', border: '1px dashed var(--border)',
              fontSize: 12, color: 'var(--text3)', textAlign: 'center',
            }}>
              Nenhuma mensagem ativa — escolha um exemplo abaixo ou escreva a sua.
            </div>
          )}

          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
            }}>
              {feedback.msg}
            </div>
          )}

          {/* ── ESCREVER A PRÓPRIA ── */}
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            Escrever a própria
          </div>

          <div style={{ marginBottom: 24 }}>
            <textarea
              value={custom}
              onChange={e => setCustom(e.target.value)}
              rows={3}
              placeholder={`Ex.: {nome}, você está arrasando! 💚 Continue firme e qualquer dúvida me chama.`}
              style={{
                width: '100%', resize: 'vertical', minHeight: 72,
                padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
                border: '1.5px solid var(--border)',
                background: custom.trim() ? 'var(--bg-soft)' : 'var(--bg2)',
                fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
                outline: 'none', color: 'var(--ink)',
                transition: 'border .2s',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>
                Use{' '}
                <code style={{
                  background: 'var(--bg3)', borderRadius: 4,
                  padding: '1px 5px', fontSize: 11, fontFamily: 'monospace',
                }}>{'{nome}'}</code>
                {' '}para o primeiro nome da paciente.
              </span>
              <button
                className="btn"
                onClick={() => definirAtiva(custom)}
                disabled={busy || !custom.trim()}
              >
                {busy ? 'Salvando…' : 'Definir como ativa'}
              </button>
            </div>
          </div>

          {/* ── BIBLIOTECA DE EXEMPLOS ── */}
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 12,
          }}>
            Biblioteca de exemplos
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {GRUPOS.map(g => (
              <div key={g.id}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text2)',
                  marginBottom: 7,
                }}>
                  {g.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(EXEMPLOS[g.id] ?? []).map((ex, i) => {
                    const ehAtiva = ativa === ex;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => definirAtiva(ex)}
                        disabled={busy}
                        style={{
                          textAlign: 'left',
                          padding: '9px 12px',
                          borderRadius: 9,
                          border: ehAtiva
                            ? '1.5px solid var(--green, #16a34a)'
                            : '1px solid var(--border)',
                          background: ehAtiva
                            ? 'var(--green-bg, #f0fdf4)'
                            : 'var(--bg-soft)',
                          cursor: busy ? 'default' : 'pointer',
                          fontSize: 12, lineHeight: 1.55,
                          color: 'var(--text2)',
                          fontFamily: 'var(--font-sans)',
                          transition: 'border .15s, background .15s',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}
                      >
                        {ehAtiva && (
                          <i className="ti ti-check"
                             style={{ fontSize: 13, color: 'var(--green, #16a34a)', flexShrink: 0, marginTop: 1 }} />
                        )}
                        <span>{ex}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
