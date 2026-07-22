import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { HabitosHoje, cumpriuHabito } from './_HabitosHoje.jsx';

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
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [habitos, setHabitos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [erroSalvar, setErroSalvar] = useState(null);

  async function carregar(signal) {
    if (!pacienteId) return;
    const [hRes, lRes] = await Promise.all([
      supabase.from('habitos').select('*')
        .eq('paciente_id', pacienteId).eq('ativo', true).order('ordem'),
      supabase.from('habitos_logs').select('*')
        .eq('paciente_id', pacienteId)
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
  }, [pacienteId]);

  // Mapa { habito_id: { data: valor } }
  const logMap = useMemo(() => {
    const m = {};
    for (const l of logs) {
      if (!m[l.habito_id]) m[l.habito_id] = {};
      m[l.habito_id][l.data] = Number(l.valor);
    }
    return m;
  }, [logs]);

  // Valores de hoje no formato { habito_id: valor } — para o HabitosHoje
  const habitosLogsHoje = useMemo(() => {
    const hoje = HOJE();
    const res = {};
    for (const h of (habitos ?? [])) {
      const v = logMap[h.id]?.[hoje];
      if (v !== undefined) res[h.id] = v;
    }
    return res;
  }, [habitos, logMap]);

  // Salva com update otimista (refetch confirma depois)
  async function setValorHabito(habito, valor) {
    const hoje = HOJE();
    setErroSalvar(null);
    // Optimistic: atualiza logs localmente para feedback imediato
    setLogs(prev => {
      const outros = prev.filter(l => !(l.habito_id === habito.id && l.data === hoje));
      return valor > 0
        ? [...outros, { id: '__opt__', habito_id: habito.id, paciente_id: pacienteId, data: hoje, valor }]
        : outros;
    });
    try {
      if (valor === 0 && habito.tipo === 'boolean') {
        const { data: existente } = await supabase.from('habitos_logs')
          .select('id').eq('habito_id', habito.id).eq('data', hoje).maybeSingle();
        if (existente) {
          const { error } = await supabase.from('habitos_logs').delete().eq('id', existente.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from('habitos_logs').upsert({
          habito_id: habito.id, paciente_id: pacienteId,
          data: hoje, valor,
        }, { onConflict: 'habito_id,data' });
        if (error) throw error;
      }
      carregar({ cancelled: false });
    } catch {
      setErroSalvar('Não foi possível salvar. Verifique sua conexão e tente novamente.');
      carregar({ cancelled: false });
    }
  }

  const streak = useMemo(() => {
    if (!habitos?.length) return 0;
    let c = 0;
    for (let i = 0; i < 30; i++) {
      const dia = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      if (habitos.every(h => cumpriuHabito(h, logMap[h.id]?.[dia]))) c++;
      else break;
    }
    return c;
  }, [habitos, logMap]);

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

  const hoje = HOJE();

  return (
    <div style={{ padding: '0' }}>

      {erroSalvar && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5',
          borderRadius: 10, padding: '10px 14px', marginBottom: 10,
          fontSize: 13, color: '#991b1b',
        }}>
          {erroSalvar}
        </div>
      )}

      {/* Tracker interativo — mesmo componente do Início */}
      <HabitosHoje
        habitos={habitos}
        habitosLogs={habitosLogsHoje}
        habitosStreak={streak}
        setValorHabito={setValorHabito}
        showHistoricoLink={false}
        containerStyle={{ margin: '0 0 14px' }}
      />

      {/* Histórico 7 dias */}
      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        color: 'var(--muted)', fontWeight: 500, margin: '4px 4px 8px',
      }}>Últimos 7 dias</div>

      <div style={{
        background: 'var(--paper)', border: '0.5px solid var(--hair)',
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
              {DIAS_7.map(d => {
                const v = logMap[h.id]?.[d.iso];
                const cump = cumpriuHabito(h, v);
                const isHoje = d.iso === hoje;
                return (
                  <div key={d.iso} style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: cump
                      ? 'var(--green, var(--gold-deep))'
                      : (isHoje ? 'var(--bg-soft)' : 'transparent'),
                    border: cump ? 'none' : '0.5px solid var(--hair)',
                    color: cump ? 'var(--paper)' : 'var(--muted-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 500,
                  }} title={d.iso}>
                    {cump
                      ? <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true"></i>
                      : d.num}
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
