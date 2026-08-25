import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Vídeos curados do YouTube em português.
//
// A biblioteca é escolhida pelo objetivo da paciente, por igualdade estrita
// contra o valor canônico de lib/objetivos.js — mesmo critério de
// lib/mensagemAcesso.js. Nunca por negação ("diferente de Oncologia"): foi o
// padrão negativo que entregou conteúdo oncológico a quem não é oncológica.
const VIDEOS_ONCOLOGIA = [
  {
    id: 'durante',
    titulo: 'Durante o tratamento (quimio/radio)',
    videos: [
      { id: '3b1vTs4rfmA', titulo: 'Exercícios para pacientes oncológicos', canal: 'Carol Borba' },
      { id: 'aEkQNqcT8aM', titulo: 'Atividade física durante o câncer', canal: 'Oncologia' },
      { id: 'T0PXiJApuFk', titulo: 'Atividade física durante o tratamento', canal: 'Oncologia' },
    ],
  },
  {
    id: 'forca',
    titulo: 'Força e massa muscular',
    videos: [
      { id: 'l931ja2_vFM', titulo: 'Exercícios com faixa elástica', canal: 'DTUP Fisioterapia' },
      { id: 'mQLT0Zr7pUg', titulo: 'Atividade física — Outubro Rosa', canal: 'Oncologia' },
    ],
  },
  {
    id: 'bemEstar',
    titulo: 'Bem-estar e qualidade de vida',
    videos: [
      { id: 'qv_cV7Y_G2E', titulo: 'Yoga para pacientes oncológicos', canal: 'Globo News' },
      { id: 'O6Nep_KkEQs', titulo: 'Meditação e Ioga no tratamento do câncer', canal: 'Oncologia' },
      { id: 'QQXY2IclvXc', titulo: 'Respiração Diafragmática', canal: 'Dr. Pedro Rosa' },
    ],
  },
];

const VIDEOS_EMAGRECIMENTO = [
  {
    id: 'caminhada',
    titulo: 'Caminhada',
    videos: [
      { id: 'ieAvxnG4UQ8', titulo: 'Caminhada em casa para emagrecer — 15 minutos, exercício para iniciantes', canal: 'Aurélio Alfieri' },
      { id: 'cdWlGYfPq3Q', titulo: 'Caminhada em casa — 30 minutos, exercícios sem impacto', canal: 'Aurélio Alfieri' },
      { id: 'Kb6QdTzMOj4', titulo: 'Caminhada em casa — iniciantes', canal: 'Carol Borba' },
    ],
  },
  {
    id: 'meditacao',
    titulo: 'Meditação',
    // Os dois vídeos abaixo estão sem 'canal' de propósito: a Kelly aprovou os
    // links, mas o nome de quem apresenta não foi confirmado. O render esconde
    // a linha quando o campo falta — melhor sem linha do que com nome errado.
    videos: [
      { id: 'fKO4-wxByFU', titulo: 'Meditação guiada em português — relaxamento profundo' },
      { id: 'vJfwuCB5C8o', titulo: 'Meditação guiada — para calma e equilíbrio' },
    ],
  },
  // Yoga: pendente de confirmação da Kelly sobre um vídeo específico do canal
  // Fernanda Yoga (ela aprovou o canal, não o vídeo). Musculação: sem conteúdo
  // aprovado. Nenhuma das duas entra até haver aprovação.
];

// Map, não objeto literal: objetivo vem do banco e pode ser qualquer texto.
// Em objeto, uma chave como 'constructor' devolveria algo não-nulo.
const BIBLIOTECA_POR_OBJETIVO = new Map([
  ['Oncologia',     VIDEOS_ONCOLOGIA],
  ['Emagrecimento', VIDEOS_EMAGRECIMENTO],
]);

// Sem biblioteca para os demais objetivos — Hipertrofia, Reeducação alimentar,
// Saúde geral, Performance esportiva, Preparo pré-cirúrgico, Outro e objetivo
// nulo. Pendente: conteúdo aprovado para esses casos.
const bibliotecaDe = objetivo => BIBLIOTECA_POR_OBJETIVO.get(objetivo) ?? null;

const INTENSIDADE_OPTS = ['Fácil', 'Normal', 'Difícil', 'Não consegui'];
const SENTIMENTO_OPTS = [
  { value: 'bem',     label: '😊 Bem' },
  { value: 'regular', label: '😐 Regular' },
  { value: 'cansada', label: '😔 Cansada' },
];
const EMOJI = { bem: '😊', regular: '😐', cansada: '😔' };
const form0 = (dia_id = null) => ({ dia_id, intensidade_sentida: 'Normal', como_se_sentiu: 'bem', observacao: '' });

// Mesmas siglas do cadastro da nutri (_TreinoDias.jsx).
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// getDay() devolve 0=domingo…6=sábado; DIAS começa na SEGUNDA. O (+6)%7 gira o
// índice: domingo 0→6 ('Dom'), segunda 1→0 ('Seg'), sábado 6→5 ('Sáb').
const siglaDeHoje = (d = new Date()) => DIAS[(d.getDay() + 6) % 7];

// Um dia só → é ele, e o seletor nem aparece. Vários → o que bate com hoje.
// Nenhum bate → null, e o botão fica travado até ela escolher: registrar sem
// saber qual foi é o que a coluna dia_id existe para evitar.
function diaPadrao(dias) {
  if (!dias?.length) return null;
  if (dias.length === 1) return dias[0].id;
  const hoje = siglaDeHoje();
  return dias.find(d => d.dias_semana?.includes(hoje))?.id ?? null;
}

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function videoLiberado(dataLiberacao) {
  if (!dataLiberacao) return true;
  const h = new Date();
  const hojeStr = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
  return dataLiberacao <= hojeStr;
}

function formatDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function AvisoImportante() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px', borderRadius: 10, marginBottom: 16,
      background: '#fffde7',
      border: '1.5px solid #f5c518',
      fontSize: 12, color: 'var(--ink)', lineHeight: 1.6,
    }}>
      <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: '#d4a017', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>
        <strong>Inicie exercícios apenas após liberação médica.</strong><br />
        Em caso de dor, tontura ou falta de ar, pare imediatamente.
      </span>
    </div>
  );
}

function AvisoASCO() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px', borderRadius: 10, marginBottom: 16,
      background: '#FDECEC',
      border: '1.5px solid #E5A3A3',
      fontSize: 12, color: '#B3261E', lineHeight: 1.6, fontWeight: 600,
    }}>
      <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#B3261E', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>ASCO 2026 recomenda atividade física de 150 a 300 minutos por semana.</span>
    </div>
  );
}

function BibliotecaVideos({ objetivo }) {
  const categorias = bibliotecaDe(objetivo);
  if (!categorias) return null;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
          Movimente-se com segurança 🏃‍♀️
        </div>
        {objetivo === 'Oncologia' && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Conteúdo baseado nas diretrizes ASCO 2022
          </div>
        )}
      </div>

      {categorias.map(cat => (
        <div key={cat.id} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--ink)',
            padding: '6px 0', marginBottom: 10,
            borderBottom: '0.5px solid var(--hair)',
          }}>
            {cat.titulo}
          </div>
          {cat.videos.map(v => (
            <div key={v.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
              {/* Sem canal, o título assume o respiro de 8px que a linha do
                  canal daria — senão o vídeo cola no título nesses dois. */}
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: v.canal ? 2 : 8 }}>{v.titulo}</div>
              {v.canal && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{v.canal}</div>}
              <div style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${v.id}`}
                  title={v.titulo}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export default function TreinosPaciente() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const objetivo   = profile?.objetivo ?? null;
  const isOnco     = objetivo === 'Oncologia';

  const [treino, setTreino] = useState(undefined);
  const [registros, setRegistros] = useState([]);
  const [form, setForm] = useState(form0());
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [semanaCount, setSemanaCount] = useState(0);

  // Dias do plano ativo, na ordem que a nutri montou. Plano antigo (sem dias)
  // devolve [] e a tela fica exatamente como era antes.
  const dias = [...(treino?.treinos_dias ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  async function carregar() {
    if (!pacienteId) return;
    const [treinoRes, registrosRes] = await Promise.all([
      supabase.from('treinos_prescritos').select('*, treinos_dias(id, nome, dias_semana, ordem)')
        .eq('paciente_id', pacienteId).eq('ativo', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      // O aninhado é o que dá NOME ao dia no histórico — sem ele, dia_id
      // apareceria como uuid.
      supabase.from('treinos_registros').select('*, dia:treinos_dias(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_execucao', { ascending: false }).limit(30),
    ]);
    const t = treinoRes.data ?? null;
    setTreino(t);
    // A escolha do dia é reavaliada a cada carga: o padrão depende do dia da
    // semana de hoje, não de quando a tela abriu.
    setForm(f => ({ ...f, dia_id: diaPadrao([...(t?.treinos_dias ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) }));
    const regs = registrosRes.data ?? [];
    setRegistros(regs);
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    setSemanaCount(regs.filter(r => new Date(r.data_execucao) >= inicioSemana).length);
  }

  useEffect(() => { carregar(); }, [pacienteId]);

  async function registrar() {
    if (!treino) return;
    setSalvando(true);
    setFeedback(null);
    const { error } = await supabase.from('treinos_registros').insert({
      paciente_id: pacienteId,
      treino_id: treino.id,
      dia_id: form.dia_id,
      intensidade_sentida: form.intensidade_sentida,
      como_se_sentiu: form.como_se_sentiu,
      observacao: form.observacao.trim() || null,
    });
    setSalvando(false);
    if (error) { setFeedback({ tipo: 'erro', msg: 'Erro ao registrar: ' + error.message }); return; }
    setFeedback({ tipo: 'ok', msg: 'Sessão registrada! Continue assim 💪' });
    // O reset devolve o dia PADRÃO, não null: isto é state, não remontagem —
    // o efeito de carga não roda de novo, e um form0() seco deixaria o botão
    // desabilitado esperando uma escolha que ela acabou de fazer.
    setForm(form0(diaPadrao(dias)));
    carregar();
  }

  if (treino === undefined) {
    return (
      <>
        <AvisoImportante />
        {isOnco && <AvisoASCO />}
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      </>
    );
  }

  const embedUrl = treino ? youtubeEmbedUrl(treino.video_url) : null;
  const metaAtingida = treino && semanaCount >= treino.frequencia_semanal;
  const pct = treino?.frequencia_semanal > 0
    ? Math.min(100, Math.round((semanaCount / treino.frequencia_semanal) * 100))
    : 0;

  return (
    <>
      <AvisoImportante />
      {isOnco && <AvisoASCO />}

      {/* Prescrição da nutri — exibida quando existe */}
      {treino && (
        <>
          <div style={{
            fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
            color: 'var(--muted)', fontWeight: 500, marginBottom: 8,
          }}>
            Recomendação da sua nutri
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                background: 'var(--green-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="ti ti-run" style={{ fontSize: 22, color: 'var(--green)' }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card-title" style={{ marginBottom: 4 }}>{treino.tipo}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {treino.intensidade} · {treino.frequencia_semanal}×/semana · {treino.duracao_minutos} min/sessão
                </div>
                {treino.fase_tratamento && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{treino.fase_tratamento}</div>}
                {treino.dias_semana?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {treino.dias_semana.map(d => (
                      <span key={d} style={{
                        padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                        background: 'var(--green-soft)', color: 'var(--green)',
                      }}>{d}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {treino.objetivo_treino && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-soft)', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 2 }}>🎯 Objetivo</span>
                {treino.objetivo_treino}
              </div>
            )}
            {treino.precaucoes && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--orange-soft)', border: '0.5px solid var(--orange)', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 500, display: 'block', marginBottom: 2 }}>⚠️ Precauções</span>
                {treino.precaucoes}
              </div>
            )}
            {treino.observacoes && (
              <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-soft)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>Orientações da sua nutri</span>
                {treino.observacoes}
              </div>
            )}
            {treino.progressao && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-soft)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 2 }}>📈 Como evoluir</span>
                {treino.progressao}
              </div>
            )}

            {/* Adesão semanal */}
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: metaAtingida ? 'var(--green-soft)' : 'var(--bg-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {semanaCount} de {treino.frequencia_semanal} sessões esta semana
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: metaAtingida ? 'var(--green)' : 'var(--ink-soft)' }}>
                  {pct}%{metaAtingida ? ' ✓' : ''}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--hair)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, width: `${pct}%`,
                  background: metaAtingida ? 'var(--green)' : 'var(--gold)',
                  transition: 'width .3s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Vídeo da prescrição */}
          {embedUrl && (
            videoLiberado(treino.data_liberacao_video) ? (
              <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', marginBottom: 16 }}>
                <iframe
                  src={embedUrl}
                  title={treino.tipo}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{
                borderRadius: 12, marginBottom: 16, padding: '28px 16px',
                background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6, textAlign: 'center',
              }}>
                <span style={{ fontSize: 24 }}>🔒</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)' }}>
                  Vídeo será liberado em {formatDataBR(treino.data_liberacao_video)}
                </span>
              </div>
            )
          )}

          {/* Registrar sessão */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Registrar sessão de hoje</div>

            {/* Some quando há um dia só: nesse caso ele já vem escolhido e
                perguntar seria pedir uma decisão que não existe. */}
            {dias.length > 1 && (
              <>
                <label className="field-label">Qual treino você fez?</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                  {dias.map(d => {
                    const on = form.dia_id === d.id;
                    return (
                      <button key={d.id} onClick={() => setForm(f => ({ ...f, dia_id: d.id }))}
                        style={{
                          padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                          fontFamily: 'var(--font-sans)', border: 'none', textAlign: 'center',
                          background: on ? 'var(--ink)' : 'var(--bg-soft)',
                          color: on ? 'var(--paper)' : 'var(--ink-soft)',
                        }}>
                        <div style={{ fontSize: 13, fontWeight: on ? 600 : 400 }}>{d.nome}</div>
                        {d.dias_semana?.length > 0 && (
                          <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{d.dias_semana.join(' · ')}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label className="field-label">Como foi a intensidade?</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
              {INTENSIDADE_OPTS.map(op => (
                <button key={op} onClick={() => setForm(f => ({ ...f, intensidade_sentida: op }))}
                  style={{
                    padding: '10px 8px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', border: 'none',
                    background: form.intensidade_sentida === op ? 'var(--ink)' : 'var(--bg-soft)',
                    color: form.intensidade_sentida === op ? 'var(--paper)' : 'var(--ink-soft)',
                    fontWeight: form.intensidade_sentida === op ? 600 : 400,
                  }}>{op}</button>
              ))}
            </div>

            <label className="field-label">Como você se sentiu?</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {SENTIMENTO_OPTS.map(op => (
                <button key={op.value} onClick={() => setForm(f => ({ ...f, como_se_sentiu: op.value }))}
                  style={{
                    flex: 1, padding: '12px 4px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', border: 'none',
                    background: form.como_se_sentiu === op.value ? 'var(--ink)' : 'var(--bg-soft)',
                    color: form.como_se_sentiu === op.value ? 'var(--paper)' : 'var(--ink-soft)',
                  }}>{op.label}</button>
              ))}
            </div>

            <label className="field-label">Observação (opcional)</label>
            <textarea rows={2} placeholder="Como foi o treino hoje?" value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              style={{ marginBottom: 10 }} />

            {feedback && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 10,
                background: feedback.tipo === 'ok' ? 'var(--green-soft)' : 'var(--red-soft)',
                color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
              }}>{feedback.msg}</div>
            )}
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
              onClick={registrar} disabled={salvando || (dias.length > 0 && !form.dia_id)}>
              <i className="ti ti-check" aria-hidden="true" />
              {salvando ? 'Salvando...' : 'Fiz o treino hoje'}
            </button>
          </div>

          {/* Histórico de sessões */}
          <div className="section-label">Histórico de sessões</div>
          {registros.length === 0 ? (
            <div className="card empty-card" style={{ marginBottom: 24 }}>
              <div className="empty-sub">Nenhuma sessão registrada ainda.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, marginBottom: 24 }}>
              {registros.map((r, i) => {
                const dt = new Date(r.data_execucao);
                const dataStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const horaStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderBottom: i < registros.length - 1 ? '0.5px solid var(--hair)' : 'none',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: 'var(--green-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>
                      {EMOJI[r.como_se_sentiu] ?? '✅'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {r.dia?.nome ? `${r.dia.nome} · ` : ''}{r.intensidade_sentida} · {dataStr} às {horaStr}
                      </div>
                      {r.observacao && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.observacao}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Biblioteca de exercícios — sempre visível */}
      <BibliotecaVideos objetivo={objetivo} />
    </>
  );
}
