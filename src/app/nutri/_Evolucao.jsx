import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { formatarResposta } from '../../lib/checkinDefault.js';

export default function Evolucao({ pacienteId, paciente, nutriId }) {
  const [carregando, setCarregando] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [apresentacao, setApresentacao] = useState(false);
  const [verCheckin, setVerCheckin] = useState(null);

  async function carregar(signal = { cancelled: false }) {
    const [avRes, ckRes, plRes, prRes, csRes] = await Promise.all([
      supabase.from('peso_registros').select('id,data,kg,altura_cm,pgc,mm_kg,mm_pct,gordura_kg,cintura_cm,quadril_cm,abdome_cm,braco_cm,braco_dir_cm,braco_esq_cm,coxa_cm,coxa_dir_cm,coxa_esq_cm,panturrilha_cm,hidratacao_pct,geb_kcal,get_kcal,obs').eq('paciente_id', pacienteId).order('data'),
      supabase.from('checkin_envios').select('id, perguntas, respostas, respondido_em, enviado_em').eq('paciente_id', pacienteId).not('respondido_em', 'is', null).order('respondido_em'),
      supabase.from('planos').select('id, dados, publicado_em').eq('paciente_id', pacienteId).order('publicado_em'),
      supabase.from('prescricoes').select('id, tipo, titulo, created_at').eq('paciente_id', pacienteId).order('created_at'),
      supabase.from('consultas').select('id, tipo, data_hora, status').eq('paciente_id', pacienteId).order('data_hora'),
    ]);
    if (signal.cancelled) return;
    setAvaliacoes(avRes.data ?? []);
    setCheckins(ckRes.data ?? []);
    setPlanos(plRes.data ?? []);
    setPrescricoes(prRes.data ?? []);
    setConsultas(csRes.data ?? []);
    setCarregando(false);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  // ESC pra sair do modo apresentação
  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e) => { if (e.key === 'Escape') setApresentacao(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  // ─── Highlights ───
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  const totalDias = primeira && ultima
    ? Math.round((new Date(ultima.data) - new Date(primeira.data)) / 86_400_000)
    : 0;

  const delta = (campo) => {
    if (!primeira || !ultima || primeira.id === ultima.id) return null;
    const a = Number(primeira[campo] ?? 0);
    const b = Number(ultima[campo] ?? 0);
    if (!a || !b) return null;
    return { de: a, para: b, dif: b - a };
  };

  const deltaPeso = delta('kg');
  const deltaCintura = delta('cintura_cm');
  const deltaPgc = delta('pgc');

  // ─── Timeline consolidada ───
  const eventos = useMemo(() => {
    const lst = [];
    for (const a of avaliacoes) {
      lst.push({
        data: new Date(a.data + 'T12:00:00').toISOString(),
        tipo: 'avaliacao', icon: 'scale', cor: '#1a5a8c',
        titulo: 'Avaliação antropométrica',
        desc: [
          a.kg && `${Number(a.kg).toFixed(1).replace('.', ',')} kg`,
          a.cintura_cm && `cintura ${a.cintura_cm}cm`,
          a.pgc && `${a.pgc}% gordura`,
        ].filter(Boolean).join(' · ') || 'Registrada',
      });
    }
    for (const c of checkins) {
      lst.push({
        data: c.respondido_em,
        tipo: 'checkin', icon: 'clipboard-check', cor: 'var(--green)',
        titulo: 'Check-in respondido',
        desc: `${c.perguntas?.length ?? 0} perguntas`,
        checkinId: c.id,
        checkin: c,
      });
    }
    for (const p of planos) {
      lst.push({
        data: p.publicado_em,
        tipo: 'plano', icon: 'salad', cor: 'var(--amber)',
        titulo: 'Plano alimentar publicado',
        desc: `${p.dados?.macros?.kcal ?? '—'} kcal · ${p.dados?.refeicoes?.length ?? 0} refeições`,
      });
    }
    for (const p of prescricoes) {
      lst.push({
        data: p.created_at,
        tipo: 'prescricao', icon: 'file-text', cor: 'var(--blue)',
        titulo: `Prescrição · ${p.tipo}`,
        desc: p.titulo,
      });
    }
    for (const c of consultas.filter(c => c.status === 'realizada')) {
      lst.push({
        data: c.data_hora,
        tipo: 'consulta', icon: 'calendar-check', cor: 'var(--green)',
        titulo: 'Consulta realizada',
        desc: `Tipo: ${c.tipo}`,
      });
    }
    return lst.sort((a, b) => b.data.localeCompare(a.data));  // mais recente primeiro
  }, [avaliacoes, checkins, planos, prescricoes, consultas]);

  // ─── Renders auxiliares ───
  function HighlightCard({ titulo, atual, delta, unidade, melhorMenor = true }) {
    if (!atual) {
      return (
        <div className="stat-card" style={{ opacity: .5 }}>
          <div className="stat-label">{titulo}</div>
          <div className="stat-val">—</div>
          <div className="stat-sub">sem registro</div>
        </div>
      );
    }
    let corDelta = 'var(--text3)';
    let setaDelta = '';
    if (delta) {
      const desejado = melhorMenor ? delta.dif < 0 : delta.dif > 0;
      corDelta = desejado ? 'var(--green)' : (delta.dif === 0 ? 'var(--text3)' : 'var(--red)');
      setaDelta = delta.dif > 0 ? '↑' : delta.dif < 0 ? '↓' : '—';
    }
    return (
      <div className="stat-card">
        <div className="stat-label">{titulo}</div>
        <div className="stat-val">{Number(atual).toFixed(1).replace('.', ',')}{unidade && <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 3 }}>{unidade}</span>}</div>
        <div className="stat-sub" style={{ color: corDelta, fontWeight: 500 }}>
          {delta
            ? <>{setaDelta} {Math.abs(delta.dif).toFixed(1).replace('.', ',')}{unidade} vs início</>
            : 'só uma avaliação'}
        </div>
      </div>
    );
  }

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando linha do tempo…</div></div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-history empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Sem registros de evolução ainda</div>
        <div className="empty-sub">
          Conforme você registrar avaliações antropométricas e a paciente responder check-ins,
          tudo vai aparecer aqui em ordem cronológica.
        </div>
      </div>
    );
  }

  // ─── Modo apresentação ───
  if (apresentacao) {
    return (
      <ModoApresentacao
        paciente={paciente}
        avaliacoes={avaliacoes}
        deltaPeso={deltaPeso}
        deltaCintura={deltaCintura}
        deltaPgc={deltaPgc}
        totalDias={totalDias}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {totalDias > 0 && <>Acompanhamento de <strong style={{ color: 'var(--dark)' }}>{totalDias} dia{totalDias === 1 ? '' : 's'}</strong> · </>}
          {eventos.length} evento{eventos.length === 1 ? '' : 's'} no histórico
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setApresentacao(true)}>
            <i className="ti ti-presentation" aria-hidden="true"></i> Modo apresentação
          </button>
        </div>
      </div>

      {/* Highlights */}
      <div className="stats-grid">
        <HighlightCard titulo="Peso atual"      atual={ultima?.kg}         delta={deltaPeso}     unidade=" kg" />
        <HighlightCard titulo="Cintura atual"   atual={ultima?.cintura_cm} delta={deltaCintura}  unidade=" cm" />
        <HighlightCard titulo="% gordura atual" atual={ultima?.pgc}        delta={deltaPgc}      unidade="%" />
        <div className="stat-card">
          <div className="stat-label">Adesão check-ins</div>
          <div className="stat-val">{checkins.length}</div>
          <div className="stat-sub">respondidos no total</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Linha do tempo</div>
        <span className="card-sub">mais recente primeiro</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28, marginTop: 8 }}>
        {/* Linha vertical */}
        <div style={{
          position: 'absolute', left: 11, top: 0, bottom: 0,
          width: 2, background: 'var(--border)',
        }} />
        {eventos.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            {/* Ponto */}
            <div style={{
              position: 'absolute', left: -22, top: 14,
              width: 16, height: 16, borderRadius: '50%',
              background: ev.cor,
              border: '2px solid var(--white)',
              boxShadow: '0 0 0 1px var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`ti ti-${ev.icon}`} style={{ fontSize: 9, color: 'var(--white)' }} aria-hidden="true"></i>
            </div>
            {/* Card do evento */}
            <div
              className="card"
              style={{
                padding: '12px 14px', marginBottom: 0,
                cursor: ev.checkinId ? 'pointer' : 'default',
              }}
              onClick={() => ev.checkinId && setVerCheckin(ev.checkin)}>
              <div style={{
                fontSize: 10, color: ev.cor, letterSpacing: '.5px',
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
              }}>
                {dataBR(ev.data)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>{ev.titulo}</div>
              {ev.desc && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{ev.desc}</div>
              )}
              {ev.checkinId && (
                <div style={{ fontSize: 10, color: 'var(--gold-deep, #a08456)', marginTop: 4 }}>
                  toque para ver respostas →
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {verCheckin && (
        <VerCheckinModal envio={verCheckin} onClose={() => setVerCheckin(null)} />
      )}
    </>
  );
}

/* ============================================================
   MODO APRESENTAÇÃO (fullscreen pra consulta)
   ============================================================ */
function ModoApresentacao({ paciente, avaliacoes, deltaPeso, deltaCintura, deltaPgc, totalDias, onClose }) {
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      zIndex: 200,
      overflow: 'auto',
      padding: '40px 32px',
    }}>
      <button onClick={onClose} style={{
        position: 'fixed', top: 20, right: 20,
        background: 'var(--dark)', color: 'var(--white)',
        border: 'none', borderRadius: 8, padding: '8px 14px',
        cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        zIndex: 201,
      }}>
        <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
      </button>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', marginBottom: 8,
        }}>
          Evolução
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 4, lineHeight: 1.1,
        }}>
          {paciente?.nome}
        </h1>
        {totalDias > 0 && (
          <div style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 32 }}>
            {totalDias} dias de acompanhamento
          </div>
        )}

        {/* Stats grandes */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14, marginBottom: 36,
        }}>
          {[
            { label: 'Peso',      atual: ultima?.kg,         delta: deltaPeso,    un: 'kg', melhorMenor: true },
            { label: 'Cintura',   atual: ultima?.cintura_cm, delta: deltaCintura, un: 'cm', melhorMenor: true },
            { label: '% gordura', atual: ultima?.pgc,        delta: deltaPgc,     un: '%', melhorMenor: true },
          ].map((s, i) => {
            if (!s.atual) return null;
            const corDelta = s.delta
              ? (s.melhorMenor ? s.delta.dif < 0 : s.delta.dif > 0) ? 'var(--green)' : 'var(--red)'
              : 'var(--text3)';
            return (
              <div key={i} style={{
                background: 'var(--white)', border: '0.5px solid var(--border)',
                borderRadius: 14, padding: '24px 28px',
              }}>
                <div style={{
                  fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                }}>{s.label}</div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 600,
                  color: 'var(--dark)', lineHeight: 1,
                }}>
                  {Number(s.atual).toFixed(1).replace('.', ',')}
                  <span style={{ fontSize: 22, color: 'var(--text3)', marginLeft: 6 }}>{s.un}</span>
                </div>
                {s.delta && (
                  <div style={{
                    fontSize: 18, fontWeight: 500, color: corDelta,
                    marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {s.delta.dif > 0 ? '↑' : s.delta.dif < 0 ? '↓' : '—'}{' '}
                    {Math.abs(s.delta.dif).toFixed(1).replace('.', ',')}{s.un}
                    <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 6, fontWeight: 400 }}>
                      desde {dataBR(primeira?.data)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {avaliacoes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            Sem avaliações antropométricas registradas ainda.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MODAL DE VER RESPOSTAS DO CHECK-IN
   ============================================================ */
function VerCheckinModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  return (
    <ModalShell title="Respostas do check-in"
      subtitle={`Respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose} large>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 600 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
