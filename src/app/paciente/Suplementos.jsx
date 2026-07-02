import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

const DIAS_7 = (() => {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    arr.push({
      iso: d.toISOString().slice(0, 10),
      dia: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 1).toUpperCase(),
      num: d.getDate(),
    });
  }
  return arr;
})();

const HOJE = () => new Date().toISOString().slice(0, 10);

export default function Suplementos() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;

  const [suplementos, setSuplementos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [biblioItems, setBiblioItems] = useState([]);
  const [erro, setErro] = useState(null);

  async function carregar(signal) {
    if (!pacienteId) return;
    const [supRes, logRes] = await Promise.all([
      supabase.from('suplementos').select('*')
        .eq('paciente_id', pacienteId).eq('ativo', true)
        .order('ordem'),
      supabase.from('suplementos_logs').select('*')
        .eq('paciente_id', pacienteId)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
    ]);
    if (signal.cancelled) return;
    setSuplementos(supRes.data ?? []);
    setLogs(logRes.data ?? []);

    // Materiais de suplementação — tags 'manipulados' e 'suplementacao'
    const { data: links } = await supabase
      .from('ebooks_pacientes')
      .select('ebook_id')
      .eq('paciente_id', pacienteId);
    const ids = (links ?? []).map(l => l.ebook_id);
    if (ids.length > 0) {
      const { data: bib } = await supabase
        .from('ebooks')
        .select('*')
        .in('id', ids)
        .in('tag', ['manipulados', 'suplementacao'])
        .order('created_at', { ascending: false });
      if (!signal.cancelled) setBiblioItems(bib ?? []);
    } else {
      if (!signal.cancelled) setBiblioItems([]);
    }
  }

  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  async function toggle(s) {
    const hoje = HOJE();
    const ja = logs.find(l => l.suplemento_id === s.id && l.data === hoje);
    let err;
    if (ja) {
      ({ error: err } = await supabase.from('suplementos_logs').delete().eq('id', ja.id));
    } else {
      ({ error: err } = await supabase.from('suplementos_logs').insert({
        suplemento_id: s.id, paciente_id: pacienteId, data: hoje, tomado: true,
      }));
    }
    if (err) {
      setErro('Não consegui salvar, tente novamente');
      setTimeout(() => setErro(null), 4000);
      return;
    }
    carregar({ cancelled: false });
  }

  async function abrirBiblio(item) {
    const { data } = await supabase.storage.from('ebooks')
      .createSignedUrl(item.storage_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    } else {
      setErro('Não consegui abrir o arquivo, tente novamente');
      setTimeout(() => setErro(null), 4000);
    }
  }

  const logMap = useMemo(() => {
    const m = {};
    for (const l of logs) {
      if (!m[l.suplemento_id]) m[l.suplemento_id] = {};
      m[l.suplemento_id][l.data] = l;
    }
    return m;
  }, [logs]);

  const streak = useMemo(() => {
    if (!suplementos || suplementos.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < 30; i++) {
      const dia = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const todosTomados = suplementos.every(s => logMap[s.id]?.[dia]?.tomado);
      if (todosTomados) count++; else break;
    }
    return count;
  }, [suplementos, logMap]);

  const hoje = HOJE();
  const tomadosHoje = (suplementos ?? []).filter(s => logMap[s.id]?.[hoje]?.tomado).length;
  const total = suplementos?.length ?? 0;

  if (suplementos === null) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Carregando…</div>;
  }

  if (suplementos.length === 0 && biblioItems.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <i className="ti ti-pill" style={{ fontSize: 40, color: 'var(--muted-2)' }} aria-hidden="true"></i>
        <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Nenhum suplemento prescrito</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          A Dra. ainda não cadastrou seus suplementos.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {erro && (
        <div style={{
          background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)',
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {erro}
        </div>
      )}
      {/* Seção de suplementos prescritos */}
      {suplementos.length > 0 && (
        <>
          {/* Resumo do dia */}
          <div style={{
            background: 'linear-gradient(135deg, var(--gold-soft, var(--bg-soft)), var(--white))',
            border: '0.5px solid var(--hair)',
            borderRadius: 16, padding: 18, marginBottom: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>
              Hoje
            </div>
            <div style={{ fontSize: 36, fontWeight: 600, color: 'var(--ink)', lineHeight: 1, margin: '4px 0' }}>
              {tomadosHoje}<span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 400 }}>/{total}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {tomadosHoje === total ? '🎉 Todos tomados!' : `Faltam ${total - tomadosHoje}`}
            </div>
            {streak > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginTop: 10, padding: '4px 10px',
                background: 'var(--orange-bg, var(--bg-soft))',
                borderRadius: 999, fontSize: 11, color: 'var(--orange, var(--gold-deep))',
                fontWeight: 500,
              }}>
                <i className="ti ti-flame" aria-hidden="true"></i>
                {streak} dia{streak === 1 ? '' : 's'} seguido{streak === 1 ? '' : 's'}
              </div>
            )}
          </div>

          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px' }}>
            Suplementos de hoje
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {suplementos.map(s => {
              const tomado = !!logMap[s.id]?.[hoje]?.tomado;
              return (
                <button key={s.id} onClick={() => toggle(s)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 14, borderRadius: 12,
                    background: tomado ? 'var(--green-soft, var(--bg-soft))' : 'var(--white)',
                    border: `1px solid ${tomado ? 'var(--green, var(--hair))' : 'var(--hair)'}`,
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'var(--font-sans)',
                    transition: 'all .15s ease',
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: tomado ? 'var(--green, var(--gold-deep))' : 'var(--bg-soft)',
                    color: tomado ? 'var(--white)' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                    border: tomado ? 'none' : '1.5px solid var(--hair)',
                  }}>
                    {tomado ? <i className="ti ti-check" aria-hidden="true"></i> : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                      textDecoration: tomado ? 'line-through' : 'none',
                      opacity: tomado ? 0.7 : 1,
                    }}>{s.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      {s.dose && <span>{s.dose}</span>}
                      {s.horario && <span>· {s.horario}</span>}
                    </div>
                    {s.obs && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 3 }}>
                        {s.obs}
                      </div>
                    )}
                  </div>
                  {s.foto_url && !/\.pdf(\?|#|$)/i.test(s.foto_url) ? (
                    <img src={s.foto_url} alt={s.nome} loading="lazy" decoding="async"
                      style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <i className="ti ti-pill" style={{ fontSize: 18, color: 'var(--muted-2)', flexShrink: 0 }} aria-hidden="true"></i>
                  )}
                </button>
              );
            })}
          </div>

          {/* Histórico 7 dias */}
          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px' }}>
            Últimos 7 dias
          </div>

          <div style={{ background: 'var(--white)', border: '0.5px solid var(--hair)', borderRadius: 12, padding: 12, marginBottom: 24 }}>
            {suplementos.map((s, idx) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingTop: idx === 0 ? 0 : 10, paddingBottom: 10,
                borderBottom: idx < suplementos.length - 1 ? '0.5px solid var(--hair-soft, var(--hair))' : 'none',
              }}>
                <div style={{ fontSize: 12, fontWeight: 500, flex: 1, color: 'var(--ink)', minWidth: 0 }}>
                  {s.nome}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {DIAS_7.map(d => {
                    const tomado = !!logMap[s.id]?.[d.iso]?.tomado;
                    const isHoje = d.iso === hoje;
                    return (
                      <div key={d.iso} style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: tomado ? 'var(--green, var(--gold-deep))' : (isHoje ? 'var(--bg-soft)' : 'transparent'),
                        border: tomado ? 'none' : '0.5px solid var(--hair)',
                        color: tomado ? 'var(--white)' : 'var(--muted-2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 500,
                      }} title={d.iso}>
                        {tomado ? <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true"></i> : d.num}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Materiais de suplementação da biblioteca */}
      {biblioItems.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px' }}>
            Materiais da Dra.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {biblioItems.map(item => (
              <button key={item.id} onClick={() => abrirBiblio(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 14, borderRadius: 12,
                  background: 'var(--white)', border: '0.5px solid var(--hair)',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-sans)',
                }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: 'var(--bg-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: 22, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                    {item.titulo}
                  </div>
                  {item.descricao && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                      {item.descricao}
                    </div>
                  )}
                </div>
                <i className="ti ti-download" style={{ fontSize: 16, color: 'var(--muted)' }} aria-hidden="true"></i>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
