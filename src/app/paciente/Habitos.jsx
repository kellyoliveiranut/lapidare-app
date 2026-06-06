import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

function cumpriu(h, valor) {
  if (valor === undefined || valor === null) return false;
  if (h.tipo === 'boolean') return valor >= 1;
  if (h.tipo === 'numero') return h.meta ? valor >= h.meta : valor > 0;
  if (h.tipo === 'escala') return valor >= 4;
  return false;
}

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

export default function Habitos() {
  const { user } = useSession();
  const [habitos, setHabitos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [erroSalvar, setErroSalvar] = useState(null);

  async function carregar(signal) {
    if (!user) return;
    const [hRes, lRes] = await Promise.all([
      supabase.from('habitos').select('*')
        .eq('paciente_id', user.id).eq('ativo', true).order('ordem'),
      supabase.from('habitos_logs').select('*')
        .eq('paciente_id', user.id)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
    ]);
    if (signal.cancelled) return;
    setHabitos(hRes.data ?? []);
    setLogs(lRes.data ?? []);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

  // Mapa { habito_id: { data: valor } }
  const logMap = useMemo(() => {
    const m = {};
    for (const l of logs) {
      if (!m[l.habito_id]) m[l.habito_id] = {};
      m[l.habito_id][l.data] = Number(l.valor);
    }
    return m;
  }, [logs]);

  async function setValor(habito, valor) {
    setErroSalvar(null);
    try {
      const hoje = HOJE();
      const atual = logMap[habito.id]?.[hoje];
      if (atual !== undefined && atual === valor) {
        if (habito.tipo === 'boolean') {
          const { data: existente } = await supabase.from('habitos_logs')
            .select('id').eq('habito_id', habito.id).eq('data', hoje).maybeSingle();
          if (existente) {
            const { error } = await supabase.from('habitos_logs').delete().eq('id', existente.id);
            if (error) throw error;
          }
        }
      } else {
        const { error } = await supabase.from('habitos_logs').upsert({
          habito_id: habito.id, paciente_id: user.id,
          data: hoje, valor,
        }, { onConflict: 'habito_id,data' });
        if (error) throw error;
      }
      carregar({ cancelled: false });
    } catch (err) {
      setErroSalvar('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    }
  }

  const hoje = HOJE();
  const total = habitos?.length ?? 0;
  const cumpridos = (habitos ?? []).filter(h => cumpriu(h, logMap[h.id]?.[hoje])).length;

  // Streak (dias seguidos com TUDO cumprido)
  const streak = useMemo(() => {
    if (!habitos || habitos.length === 0) return 0;
    let c = 0;
    for (let i = 0; i < 30; i++) {
      const dia = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const todos = habitos.every(h => cumpriu(h, logMap[h.id]?.[dia]));
      if (todos) c++; else break;
    }
    return c;
  }, [habitos, logMap]);

  const dias7 = DIAS_7;

  if (habitos === null) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Carregando…</div>;
  }
  if (habitos.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <i className="ti ti-checklist" style={{ fontSize: 40, color: 'var(--muted-2)' }} aria-hidden="true"></i>
        <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Nenhum hábito cadastrado</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          A Dra. ainda não configurou seus hábitos diários.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Card resumo */}
      <div style={{
        background: 'linear-gradient(135deg, var(--gold-soft, var(--bg-soft)), var(--white))',
        border: '0.5px solid var(--hair)',
        borderRadius: 16,
        padding: 18, marginBottom: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>
          Hoje
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: 'var(--ink)', lineHeight: 1, margin: '4px 0' }}>
          {cumpridos}<span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 400 }}>/{total}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {cumpridos === total ? '🎉 Dia perfeito!' : `Faltam ${total - cumpridos}`}
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

      {/* Lista de hábitos */}
      {erroSalvar && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5',
          borderRadius: 10, padding: '10px 14px', marginBottom: 10,
          fontSize: 13, color: '#991b1b',
        }}>
          {erroSalvar}
        </div>
      )}

      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px',
      }}>Hábitos de hoje</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {habitos.map(h => {
          const valor = logMap[h.id]?.[hoje];
          const ok = cumpriu(h, valor);
          return (
            <div key={h.id} style={{
              padding: 14, borderRadius: 12,
              background: ok ? 'var(--green-soft, var(--bg-soft))' : 'var(--white)',
              border: `1px solid ${ok ? 'var(--green, var(--hair))' : 'var(--hair)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>{h.emoji ?? '✨'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                    textDecoration: ok && h.tipo === 'boolean' ? 'line-through' : 'none',
                    opacity: ok && h.tipo === 'boolean' ? 0.7 : 1,
                  }}>{h.nome}</div>
                  {h.tipo === 'numero' && h.meta && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Meta: {h.meta} {h.unidade ?? ''}
                    </div>
                  )}
                  {h.tipo === 'escala' && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Como você se sente?
                    </div>
                  )}
                </div>
                {ok && <i className="ti ti-check" style={{ fontSize: 20, color: 'var(--green, var(--gold-deep))' }} aria-hidden="true"></i>}
              </div>

              {/* Controle por tipo */}
              <div style={{ marginTop: 12 }}>
                {h.tipo === 'boolean' && (
                  <button onClick={() => setValor(h, ok ? 0 : 1)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      background: ok ? 'var(--green, var(--gold-deep))' : 'var(--white)',
                      color: ok ? 'var(--white)' : 'var(--ink)',
                      border: `1px solid ${ok ? 'var(--green, var(--gold-deep))' : 'var(--hair)'}`,
                      fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}>
                    {ok ? '✓ Cumprido' : 'Marcar como feito'}
                  </button>
                )}

                {h.tipo === 'numero' && (
                  <ContadorNumero h={h} valor={valor ?? 0} setValor={v => setValor(h, v)} ok={ok} />
                )}

                {h.tipo === 'escala' && (
                  <EscalaEmoji valor={valor ?? 0} onChange={v => setValor(h, v)} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Histórico 7 dias */}
      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px',
      }}>Últimos 7 dias</div>

      <div style={{
        background: 'var(--white)', border: '0.5px solid var(--hair)',
        borderRadius: 12, padding: 12, marginBottom: 24,
      }}>
        {habitos.map((h, idx) => (
          <div key={h.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingTop: idx === 0 ? 0 : 10, paddingBottom: 10,
            borderBottom: idx < habitos.length - 1 ? '0.5px solid var(--hair-soft, var(--hair))' : 'none',
          }}>
            <div style={{ fontSize: 16 }}>{h.emoji ?? '✨'}</div>
            <div style={{ fontSize: 12, fontWeight: 500, flex: 1, color: 'var(--ink)', minWidth: 0 }}>
              {h.nome}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {dias7.map(d => {
                const v = logMap[h.id]?.[d.iso];
                const cump = cumpriu(h, v);
                const isHoje = d.iso === hoje;
                return (
                  <div key={d.iso} style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: cump
                      ? 'var(--green, var(--gold-deep))'
                      : (isHoje ? 'var(--bg-soft)' : 'transparent'),
                    border: cump ? 'none' : '0.5px solid var(--hair)',
                    color: cump ? 'var(--white)' : 'var(--muted-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 500,
                  }} title={d.iso}>
                    {cump ? <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true"></i> : d.num}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function ContadorNumero({ h, valor, setValor, ok }) {
  const meta = h.meta ?? 0;
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const passo = meta && meta < 5 ? 0.5 : 1;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setValor(Math.max(0, Number((valor - passo).toFixed(1))))}
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--white)', border: '1px solid var(--hair)',
            cursor: 'pointer', fontSize: 18, color: 'var(--ink)',
          }}>−</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>
            {valor}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
              {h.unidade ?? ''}{meta ? ` / ${meta}` : ''}
            </span>
          </div>
        </div>
        <button onClick={() => setValor(Number((valor + passo).toFixed(1)))}
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--white)', border: '1px solid var(--hair)',
            cursor: 'pointer', fontSize: 18, color: 'var(--ink)',
          }}>+</button>
      </div>
      {meta > 0 && (
        <div style={{
          marginTop: 8, height: 6, borderRadius: 999,
          background: 'var(--bg-soft)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: ok ? 'var(--green, var(--gold-deep))' : 'var(--gold-deep)',
            transition: 'width .25s ease',
          }} />
        </div>
      )}
    </>
  );
}


function EscalaEmoji({ valor, onChange }) {
  const emojis = [
    { v: 1, e: '😞', label: 'Muito ruim' },
    { v: 2, e: '😕', label: 'Ruim' },
    { v: 3, e: '😐', label: 'Neutro' },
    { v: 4, e: '🙂', label: 'Bom' },
    { v: 5, e: '😄', label: 'Ótimo' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
      {emojis.map(({ v, e, label }) => (
        <button key={v} onClick={() => onChange(v)} title={label}
          style={{
            flex: 1, padding: 10, borderRadius: 10,
            background: valor === v ? 'var(--gold-deep)' : 'var(--white)',
            border: `1px solid ${valor === v ? 'var(--gold-deep)' : 'var(--hair)'}`,
            cursor: 'pointer', fontSize: 22,
            transition: 'all .15s ease',
          }}>
          {e}
        </button>
      ))}
    </div>
  );
}
