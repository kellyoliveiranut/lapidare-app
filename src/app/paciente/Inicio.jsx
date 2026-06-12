import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { textoDias, dataConsultaBR, diasAte, linkCall, consultaEmBreve, gerarGoogleCalendarUrl } from '../../lib/utils.js';
import { cumpriuHabito } from './_HabitosHoje.jsx';


const DIAS_SEG = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const HUMOR_OPCOES = [
  { label: 'Cansada', emoji: '😔', valEscala: 1, valMon: 2 },
  { label: 'Regular', emoji: '😐', valEscala: 2, valMon: 4 },
  { label: 'Bem',     emoji: '🙂', valEscala: 4, valMon: 7 },
  { label: 'Ótima',   emoji: '😄', valEscala: 5, valMon: 9 },
];

function labelTipo(tipo) {
  if (!tipo) return '';
  if (tipo === 'primeira')  return '1ª consulta';
  if (tipo === 'avaliacao') return 'Avaliação';
  if (tipo === 'retorno')   return 'Retorno';
  const m = tipo.match(/^consulta_(\d+)$/);
  return m ? `Consulta ${m[1]}` : tipo;
}


export default function Inicio() {
  const tema = useTheme();
  const nutriNome = tema.nutri_nome ?? 'Sua nutri';
  const navigate = useNavigate();
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const [plano, setPlano] = useState(null);
  const [compras, setCompras] = useState(null);
  const [proximaConsulta, setProximaConsulta] = useState(null);
  const [checkinPendente, setCheckinPendente] = useState(null);
  const [ebooksNovos, setEbooksNovos] = useState(0);
  const [habitos, setHabitos] = useState([]);
  const [habitosLogs, setHabitosLogs] = useState({});  // { habito_id: valor } — hoje
  const [todosLogs, setTodosLogs] = useState([]);      // 30 dias — pra streak
  const [mensagemCiclo, setMensagemCiclo] = useState(null);
  const [monHoje, setMonHoje] = useState(null);        // { id, disposicao } do monitoramento

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pacienteId) return;
      const agora = new Date().toISOString();
      const hoje  = new Date().toISOString().slice(0, 10);
      const [planoRes, comprasRes, consultaRes, checkinRes, ebooksRes, habitosRes, logsHojeRes, monRes] = await Promise.all([
        supabase.from('planos').select('dados, publicado_em')
          .eq('paciente_id', pacienteId).order('publicado_em', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('listas_compras').select('dados, publicado_em')
          .eq('paciente_id', pacienteId).order('publicado_em', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('consultas').select('id, data_hora, tipo, duracao_min, meet_link, links_extras')
          .eq('paciente_id', pacienteId).eq('status', 'agendada')
          .gte('data_hora', agora).order('data_hora', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('checkin_envios').select('id, enviado_em, lembrete_enviado_em, nome, tipo')
          .eq('paciente_id', pacienteId).is('respondido_em', null)
          .order('enviado_em', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('ebooks_pacientes').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).is('visto_em', null),
        supabase.from('habitos').select('id, nome, emoji, tipo, meta, unidade, ordem')
          .eq('paciente_id', pacienteId).eq('ativo', true).order('ordem'),
        supabase.from('habitos_logs').select('habito_id, valor, data')
          .eq('paciente_id', pacienteId)
          .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)),
        supabase.from('monitoramento_oncologico')
          .select('id, disposicao')
          .eq('paciente_id', pacienteId)
          .eq('data', hoje)
          .maybeSingle(),
      ]);
      if (!active) return;
      setPlano(planoRes.data?.dados ?? null);
      setCompras(comprasRes.data?.dados ?? null);
      setProximaConsulta(consultaRes.data ?? null);
      setCheckinPendente(checkinRes.data ?? null);
      setEbooksNovos(ebooksRes.count ?? 0);
      setMonHoje(monRes.data ?? null);

      const habitosLista = habitosRes.data ?? [];
      const logsHoje = {};
      for (const l of (logsHojeRes.data ?? [])) {
        if (l.data === hoje) logsHoje[l.habito_id] = Number(l.valor);
      }
      setHabitos(habitosLista);
      setHabitosLogs(logsHoje);
      setTodosLogs(logsHojeRes.data ?? []);
    }
    load();
    return () => { active = false; };
  }, [pacienteId]);

  // Mensagem motivacional ativa da nutri (vale para todos os pacientes)
  useEffect(() => {
    if (!profile?.nutri_id) return;
    let active = true;

    supabase
      .from('mensagens_ciclo')
      .select('mensagem')
      .eq('nutri_id', profile.nutri_id)
      .eq('fase', 'ativa')
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data?.mensagem) return;
        const primeiroNome = profile.apelido || profile.nome?.split(' ')[0] || '';
        const texto = data.mensagem.replace(/\{nome\}/g, primeiroNome);
        setMensagemCiclo({ texto });
      });

    return () => { active = false; };
  }, [profile?.nutri_id]);

  // ─── Derivados básicos ────────────────────────────────────────────────────
  const proximaRef = plano?.refeicoes?.find(r => !r.feita) ?? plano?.refeicoes?.[0] ?? null;
  const totalCompras = compras?.lista?.reduce((a, c) => a + (c.itens?.length ?? 0), 0) ?? 0;

  const dias = proximaConsulta ? diasAte(proximaConsulta.data_hora) : null;
  const urgente = dias !== null && dias <= 1;
  const emBreve = proximaConsulta ? consultaEmBreve(proximaConsulta.data_hora) : false;
  const callUrl = proximaConsulta ? linkCall(proximaConsulta) : null;
  const gcalUrl = proximaConsulta ? gerarGoogleCalendarUrl({
    titulo: `Consulta com ${nutriNome}`,
    dataHoraInicio: proximaConsulta.data_hora,
    duracaoMin: proximaConsulta.duracao_min,
    descricao: `Link da call: ${callUrl ?? ''}`,
    local: 'Online',
  }) : null;

  const ckUrgente = !!checkinPendente?.lembrete_enviado_em;

  const habitosCumpridos = habitos.filter(h => cumpriuHabito(h, habitosLogs[h.id])).length;

  // ─── Streak ───────────────────────────────────────────────────────────────
  const habitosStreak = useMemo(() => {
    if (!habitos.length) return 0;
    const m = new Map();
    for (const l of todosLogs) m.set(`${l.habito_id}|${l.data}`, Number(l.valor));
    let count = 0;
    for (let i = 0; i < 30; i++) {
      const dia = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const todos = habitos.every(h => {
        const v = m.get(`${h.id}|${dia}`);
        if (v === undefined) return false;
        if (h.tipo === 'boolean') return v >= 1;
        if (h.tipo === 'numero')  return h.meta ? v >= h.meta : v > 0;
        if (h.tipo === 'escala')  return v >= 4;
        return false;
      });
      if (todos) count++; else break;
    }
    return count;
  }, [habitos, todosLogs]);

  // ─── Calendário semanal (seg→dom da semana corrente) ─────────────────────
  const semanaCalendar = useMemo(() => {
    if (!habitos.length) return [];
    const hoje = new Date();
    const hojeIso = hoje.toISOString().slice(0, 10);
    const dow = hoje.getDay(); // 0=Dom
    const offsetSeg = dow === 0 ? -6 : 1 - dow;
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() + offsetSeg);

    const logMap = new Map();
    for (const l of todosLogs) logMap.set(`${l.habito_id}|${l.data}`, Number(l.valor));

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(segunda);
      d.setDate(segunda.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const ehHoje  = iso === hojeIso;
      const isFuturo = iso > hojeIso;
      const cumprido = !isFuturo && habitos.every(h => cumpriuHabito(h, logMap.get(`${h.id}|${iso}`) ?? 0));
      const temAlgum = !isFuturo && habitos.some(h => (logMap.get(`${h.id}|${iso}`) ?? 0) > 0);
      return { iso, dia: d, ehHoje, isFuturo, cumprido, temAlgum };
    });
  }, [habitos, todosLogs]);

  // ─── Adesão semanal ───────────────────────────────────────────────────────
  const adesaoSemana = useMemo(() => {
    if (!habitos.length || !semanaCalendar.length) return null;
    const hojeIso = new Date().toISOString().slice(0, 10);
    const diasPassados = semanaCalendar.filter(d => !d.isFuturo && d.iso <= hojeIso);
    if (!diasPassados.length) return null;
    const logMap = new Map();
    for (const l of todosLogs) logMap.set(`${l.habito_id}|${l.data}`, Number(l.valor));
    let cumpridos = 0;
    const total = diasPassados.length * habitos.length;
    for (const d of diasPassados) {
      for (const h of habitos) {
        if (cumpriuHabito(h, logMap.get(`${h.id}|${d.iso}`) ?? 0)) cumpridos++;
      }
    }
    return total > 0 ? Math.round((cumpridos / total) * 100) : null;
  }, [habitos, todosLogs, semanaCalendar]);

  // ─── Hábitos especiais ────────────────────────────────────────────────────
  const habiToAgua = useMemo(() =>
    habitos.find(h => /água|agua|water/i.test(h.nome)),
  [habitos]);

  // Primeiro hábito de escala → usado como "humor do dia"
  const habiToHumor = useMemo(() =>
    habitos.find(h => h.tipo === 'escala'),
  [habitos]);

  // ─── Humor: índice selecionado (0-3) ─────────────────────────────────────
  const humorAtualIdx = useMemo(() => {
    if (habiToHumor) {
      const v = habitosLogs[habiToHumor.id] ?? 0;
      return HUMOR_OPCOES.findIndex(o => o.valEscala === v);
    }
    const dis = monHoje?.disposicao;
    if (!dis) return -1;
    if (dis <= 3) return 0;
    if (dis <= 5) return 1;
    if (dis <= 7) return 2;
    return 3;
  }, [habiToHumor, habitosLogs, monHoje]);

  // ─── Ações ────────────────────────────────────────────────────────────────
  async function marcarEbooksComoVistos() {
    await supabase.from('ebooks_pacientes')
      .update({ visto_em: new Date().toISOString() })
      .eq('paciente_id', pacienteId).is('visto_em', null);
    navigate('/paciente/ebooks');
  }

  async function setValorHabito(habito, valor) {
    const hoje = new Date().toISOString().slice(0, 10);
    setHabitosLogs(prev => ({ ...prev, [habito.id]: valor }));
    setTodosLogs(prev => {
      const sem = prev.filter(l => !(l.habito_id === habito.id && l.data === hoje));
      return valor > 0 ? [...sem, { habito_id: habito.id, valor, data: hoje }] : sem;
    });
    if (valor === 0 && habito.tipo === 'boolean') {
      const { data: existente } = await supabase.from('habitos_logs')
        .select('id').eq('habito_id', habito.id).eq('data', hoje).maybeSingle();
      if (existente) await supabase.from('habitos_logs').delete().eq('id', existente.id);
      setHabitosLogs(prev => { const n = { ...prev }; delete n[habito.id]; return n; });
    } else {
      await supabase.from('habitos_logs').upsert({
        habito_id: habito.id, paciente_id: pacienteId,
        data: hoje, valor,
      }, { onConflict: 'habito_id,data' });
    }
  }

  async function salvarHumor(idx) {
    const opcao = HUMOR_OPCOES[idx];
    if (!opcao) return;
    if (habiToHumor) {
      await setValorHabito(habiToHumor, opcao.valEscala);
    } else {
      if (!profile?.nutri_id) return;
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from('monitoramento_oncologico')
        .upsert(
          { paciente_id: pacienteId, nutri_id: profile.nutri_id, data: hoje, disposicao: opcao.valMon },
          { onConflict: 'paciente_id,data' }
        )
        .select('id, disposicao').maybeSingle();
      if (data) setMonHoje(data);
    }
  }

  // ─── Helpers de exibição ─────────────────────────────────────────────────
  const mostrarHumor = habiToHumor != null || !!profile?.nutri_id;

  function fmtNum(v, unidade) {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
    return unidade ? `${s} ${unidade}` : s;
  }

  return (
    <>
      {/* 1 — Próxima consulta — sempre estilo creme claro */}
      {proximaConsulta && (
        <div style={{
          margin: '0 0 12px',
          background: 'var(--bg-soft)',
          border: '0.5px solid var(--gold)',
          borderRadius: 14,
          padding: '16px',
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
            color: 'var(--gold-deep)', fontWeight: 500, marginBottom: 6,
          }}>Próxima consulta</div>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 4, color: 'var(--ink)' }}>
            {textoDias(proximaConsulta.data_hora)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: gcalUrl || (Array.isArray(proximaConsulta.links_extras) && proximaConsulta.links_extras.length > 0) ? 10 : 0 }}>
            {labelTipo(proximaConsulta.tipo)} · {dataConsultaBR(proximaConsulta.data_hora)} · {nutriNome}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {gcalUrl && (
              <a href={gcalUrl} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'transparent', color: 'var(--muted)',
                  border: '0.5px solid var(--hair)',
                  padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 500, textDecoration: 'none',
                }}>
                <i className="ti ti-calendar-plus" style={{ fontSize: 13 }} aria-hidden="true"></i>
                Adicionar à agenda
              </a>
            )}
            {Array.isArray(proximaConsulta.links_extras) && proximaConsulta.links_extras.map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'transparent', color: 'var(--gold-deep)',
                  border: '0.5px solid var(--gold)',
                  padding: '5px 10px', borderRadius: 10, fontSize: 11, fontWeight: 500, textDecoration: 'none',
                }}>
                <i className="ti ti-external-link" style={{ fontSize: 12 }} aria-hidden="true"></i>
                {link.label || 'Link'}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 2 — Banner motivacional */}
      {mensagemCiclo && (
        <div style={{
          margin: '0 0 12px', padding: '14px 16px',
          background: '#FFFFFF', borderRadius: 14,
          borderLeft: '3px solid var(--gold-deep, #c4a882)',
          boxShadow: '0 1px 6px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
            {mensagemCiclo.texto}
          </div>
        </div>
      )}

      {/* 3 — Aviso de e-books novos */}
      {ebooksNovos > 0 && (
        <div onClick={marcarEbooksComoVistos}
          style={{
            margin: '0 0 12px', padding: '14px 16px',
            background: 'linear-gradient(135deg, var(--gold-soft, var(--bg-soft)), var(--paper))',
            border: '0.5px solid var(--gold-deep)',
            borderRadius: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--gold-deep)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>📚</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
              color: 'var(--gold-deep)', fontWeight: 500, marginBottom: 2,
            }}>Novo material</div>
            <div className="serif" style={{ fontSize: 17, lineHeight: 1.1 }}>
              {ebooksNovos === 1 ? 'Você tem 1 e-book novo' : `Você tem ${ebooksNovos} e-books novos`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Toque para abrir</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--muted)' }} aria-hidden="true"></i>
        </div>
      )}


      {/* 5 — BLOCO B: Água + Adesão compactos lado a lado, Sequência abaixo */}
      {habitos.length > 0 && (habiToAgua || habitosStreak > 0 || adesaoSemana !== null) && (
        <div style={{ margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Água + Adesão — dois cards compactos lado a lado */}
          {(habiToAgua || adesaoSemana !== null) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: habiToAgua && adesaoSemana !== null ? '1fr 1fr' : '1fr',
              gap: 8,
            }}>
              {habiToAgua && (() => {
                const v   = habitosLogs[habiToAgua.id] ?? 0;
                const meta = habiToAgua.meta ?? 0;
                const uni  = habiToAgua.unidade ?? '';
                const pct  = meta > 0 ? Math.min(100, Math.round((v / meta) * 100)) : 0;
                return (
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--paper)', border: '0.5px solid var(--hair)' }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>💧</div>
                    <div style={{
                      fontSize: 22, fontWeight: 700, lineHeight: 1,
                      color: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--gold-deep)' : 'var(--ink)',
                    }}>
                      {fmtNum(v, uni)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                      {meta > 0 ? `meta ${fmtNum(meta, uni)}` : 'água hoje'}
                    </div>
                  </div>
                );
              })()}
              {adesaoSemana !== null && (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--paper)', border: '0.5px solid var(--hair)' }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📊</div>
                  <div style={{
                    fontSize: 22, fontWeight: 700, lineHeight: 1,
                    color: adesaoSemana >= 80 ? 'var(--green)' : adesaoSemana >= 50 ? 'var(--gold-deep)' : 'var(--ink)',
                  }}>
                    {adesaoSemana}<span style={{ fontSize: 14, fontWeight: 400 }}>%</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>esta semana</div>
                </div>
              )}
            </div>
          )}

          {/* Sequência — card separado */}
          {habitosStreak > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--paper)', border: '0.5px solid var(--hair)' }}>
              <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 4 }}>🔥 Sequência</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
                {habitosStreak}
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, marginLeft: 3 }}>dia{habitosStreak === 1 ? '' : 's'}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>seguidos</div>
            </div>
          )}
        </div>
      )}

      {/* 6 — Hero: próxima refeição */}
      {proximaRef ? (
        <div className="card dark" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--bg-soft)', opacity: .6 }}>
              Próxima refeição{proximaRef.horario ? ` · ${proximaRef.horario}` : ''}
            </span>
            {proximaRef.emoji && (
              <span className="pill" style={{ background: 'var(--gold)', color: 'var(--ink)' }}>{proximaRef.emoji}</span>
            )}
          </div>
          <div className="serif" style={{ fontSize: 22, color: 'var(--bg-soft)', lineHeight: 1.1, marginBottom: 4 }}>
            {proximaRef.nome}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-2)', marginBottom: 10 }}>
            {proximaRef.alimentos?.slice(0, 2).map(a => a.nome).join(' · ')}
          </div>
          <button className="btn gold sm" onClick={() => navigate('/paciente/plano')}>Ver plano completo</button>
        </div>
      ) : (
        <div className="card" style={{ padding: '20px 18px', textAlign: 'center' }}>
          <i className="ti ti-sparkles" style={{ fontSize: 28, color: 'var(--gold-deep)', display: 'block', marginBottom: 8 }}></i>
          <div className="serif" style={{ fontSize: 18, marginBottom: 4 }}>Seu acompanhamento nutricional começa aqui.</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Sua nutricionista publicará seu plano em breve. Você será notificada!
          </div>
        </div>
      )}

      {/* 7 — BLOCO C: Check-in rápido de humor */}
      {mostrarHumor && (
        <div style={{
          margin: '0 0 12px', padding: '14px 16px',
          background: 'var(--paper)', border: '0.5px solid var(--hair)', borderRadius: 16,
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
            color: 'var(--muted)', fontWeight: 500, marginBottom: 10,
          }}>Como você está hoje?</div>

          <div style={{ display: 'flex', gap: 6 }}>
            {HUMOR_OPCOES.map((o, i) => {
              const ativo = humorAtualIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => salvarHumor(i)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    cursor: 'pointer',
                    background: ativo ? 'var(--gold-soft)' : 'var(--bg-soft)',
                    border: ativo ? '1.5px solid var(--gold-deep)' : '1.5px solid transparent',
                    fontFamily: 'var(--font-sans)',
                    transition: 'background .15s, border-color .15s',
                  }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{o.emoji}</span>
                  <span style={{
                    fontSize: 9, fontWeight: ativo ? 700 : 400,
                    color: ativo ? 'var(--gold-deep)' : 'var(--muted)',
                    letterSpacing: '.01em',
                  }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 8 — Atalho: Hábitos de hoje */}
      {habitos.length > 0 && (
        <div
          onClick={() => navigate('/paciente/habitos')}
          style={{
            margin: '0 0 12px', padding: '12px 16px',
            background: habitosCumpridos === habitos.length ? 'var(--green-bg, #f0fdf4)' : 'var(--paper)',
            border: `0.5px solid ${habitosCumpridos === habitos.length ? 'var(--green)' : 'var(--hair)'}`,
            borderRadius: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: habitosCumpridos === habitos.length ? 'var(--green)' : 'var(--bg-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`ti ti-${habitosCumpridos === habitos.length ? 'check' : 'checklist'}`}
               style={{ fontSize: 20, color: habitosCumpridos === habitos.length ? '#fff' : 'var(--muted)' }}
               aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase',
              color: 'var(--muted)', fontWeight: 500, marginBottom: 3,
            }}>Hábitos de hoje</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
              {habitosCumpridos}
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>/{habitos.length} concluídos</span>
              {habitosCumpridos === habitos.length && (
                <span style={{ marginLeft: 6, fontSize: 13 }}>🎉</span>
              )}
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--hair)', overflow: 'hidden', marginTop: 5 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.round((habitosCumpridos / habitos.length) * 100)}%`,
                background: habitosCumpridos === habitos.length ? 'var(--green)' : 'var(--gold-deep)',
                transition: 'width .3s ease',
              }} />
            </div>
          </div>
          {habitosStreak > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flexShrink: 0, fontSize: 10,
              color: 'var(--orange, var(--gold-deep))', fontWeight: 600,
            }}>
              <i className="ti ti-flame" style={{ fontSize: 16 }} aria-hidden="true" />
              {habitosStreak}d
            </div>
          )}
          <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />
        </div>
      )}

      {/* 9 — Cards 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 0 10px' }}>
        <div className="card" style={{ margin: 0, padding: '12px 14px', cursor: 'pointer' }} onClick={() => navigate('/paciente/plano')}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <i className="ti ti-salad" style={{ fontSize: 14, color: 'var(--green)' }}></i>
            <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>Plano</span>
          </div>
          {plano ? (
            <>
              <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>
                {plano.macros?.kcal}<span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>kcal</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                P {plano.macros?.prot_g}g · C {plano.macros?.cho_g}g · G {plano.macros?.lip_g}g
              </div>
            </>
          ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Aguardando plano</div>}
        </div>

        <div className="card" style={{ margin: 0, padding: '12px 14px', cursor: 'pointer' }} onClick={() => navigate('/paciente/compras')}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <i className="ti ti-shopping-cart" style={{ fontSize: 14, color: 'var(--orange)' }}></i>
            <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>Compras</span>
          </div>
          {compras ? (
            <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>
              {totalCompras}<span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 2 }}>itens</span>
            </div>
          ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Lista não enviada</div>}
        </div>

        <div className="card" style={{ margin: 0, padding: '12px 14px', cursor: 'pointer' }} onClick={() => navigate('/paciente/progresso')}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <i className="ti ti-trending-up" style={{ fontSize: 14, color: 'var(--blue)' }}></i>
            <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>Progresso</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Veja sua evolução</div>
        </div>

        <div className="card" style={{ margin: 0, padding: '12px 14px', cursor: 'pointer' }} onClick={() => navigate('/paciente/chat')}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <i className="ti ti-message-circle" style={{ fontSize: 14, color: 'var(--gold-deep)' }}></i>
            <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>Chat</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Falar com a Dra.</div>
        </div>
      </div>

      {/* 10 — Check-in pendente */}
      {checkinPendente && (
        <div
          onClick={() => navigate(`/paciente/checkin/${checkinPendente.id}`)}
          style={{
            margin: '0 0 12px',
            background: ckUrgente
              ? 'linear-gradient(135deg, #ffd9c4 0%, #f5a373 100%)'
              : 'var(--paper)',
            border: ckUrgente ? 'none' : '1.5px dashed var(--gold)',
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer',
          }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: ckUrgente ? 'rgba(28,23,18,.12)' : 'var(--gold-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="ti ti-clipboard-text" style={{
              fontSize: 20, color: ckUrgente ? 'var(--ink)' : 'var(--gold-deep)',
            }} aria-hidden="true"></i>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
              color: ckUrgente ? 'var(--ink)' : 'var(--gold-deep)',
              fontWeight: 500, marginBottom: 2,
            }}>
              {ckUrgente
                ? 'Lembrete · pendente'
                : checkinPendente.tipo === 'pre_consulta'
                  ? 'Check-in pré-consulta'
                  : 'Check-in pendente'}
            </div>
            <div className="serif" style={{ fontSize: 18, lineHeight: 1.1, marginBottom: 2 }}>
              {checkinPendente.tipo === 'pre_consulta'
                ? 'Antes da nossa primeira consulta'
                : 'Você tem um check-in nutricional pendente'}
            </div>
            <div style={{ fontSize: 11, color: ckUrgente ? 'var(--ink)' : 'var(--muted)', opacity: ckUrgente ? .8 : 1, marginBottom: 8 }}>
              {checkinPendente.tipo === 'pre_consulta'
                ? 'Leva uns 5 minutos'
                : (checkinPendente.nome ? checkinPendente.nome + ' · ' : '') + 'Leva uns 3 minutos'}
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600,
              background: ckUrgente ? 'rgba(28,23,18,.15)' : 'var(--gold-soft)',
              color: ckUrgente ? 'var(--ink)' : 'var(--gold-deep)',
              padding: '5px 12px', borderRadius: 20,
            }}>
              Responder agora
              <i className="ti ti-arrow-right" style={{ fontSize: 12 }} aria-hidden="true" />
            </span>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: ckUrgente ? 'var(--ink)' : 'var(--muted)', flexShrink: 0 }} aria-hidden="true"></i>
        </div>
      )}
    </>
  );
}
