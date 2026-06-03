import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import DateInput from '../../components/DateInput.jsx';
import {
  dataConsultaBR, textoDias, iniciais,
  linkCall, gerarLinkJitsi, gerarGoogleCalendarUrl, consultaEmBreve,
  gerarDiasCalendario, ehMesmoDia, mesAnoExtenso, DIAS_SEMANA_CURTOS,
} from '../../lib/utils.js';

// Opções do dropdown: 1ª, Consulta 02..12, Avaliação, Retorno
const TIPOS = [
  { value: 'primeira', label: '1ª consulta' },
  ...Array.from({ length: 11 }, (_, i) => {
    const n = i + 2;
    return { value: `consulta_${n}`, label: `Consulta ${String(n).padStart(2, '0')}` };
  }),
  { value: 'avaliacao', label: 'Avaliação' },
  { value: 'retorno',   label: 'Retorno' },
];

const STATUS_OPCOES = [
  { value: 'agendada',  label: 'Agendada' },
  { value: 'realizada', label: 'Realizada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function tipoLabel(tipo) {
  if (!tipo) return '—';
  if (tipo === 'primeira') return '1ª consulta';
  if (tipo === 'avaliacao') return 'Avaliação';
  if (tipo === 'retorno') return 'Retorno';
  const m = tipo.match(/^consulta_(\d+)$/);
  if (m) return `Consulta ${String(m[1]).padStart(2, '0')}`;
  return tipo;
}

function tipoColor(tipo) {
  if (tipo === 'primeira') return 'var(--blue)';
  if (tipo === 'avaliacao') return 'var(--orange)';
  return 'var(--green)';
}

export default function Agenda() {
  const { user, profile } = useSession();
  const [consultas, setConsultas] = useState(undefined);
  const [pacientes, setPacientes] = useState([]);
  const [modalState, setModalState] = useState({ open: false, consulta: null });
  const [mesVisivel, setMesVisivel] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState(() => new Date());
  const [lembretes, setLembretes] = useState([]);
  const [enviadosLocais, setEnviadosLocais] = useState(new Set());

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('consultas')
      .select(`
        id, data_hora, duracao_min, tipo, status, obs, meet_link, links_extras,
        lembrete_ativo, lembrete_enviado,
        paciente:pacientes(id, nome)
      `)
      .eq('nutri_id', user.id)
      .order('data_hora', { ascending: true });
    setConsultas(data ?? []);
  }

  async function carregarPacientes() {
    if (!user) return;
    const { data } = await supabase
      .from('pacientes').select('id, nome')
      .eq('nutri_id', user.id).order('nome');
    setPacientes(data ?? []);
  }

  async function verificarLembretes() {
    if (!user) return;
    const { data } = await supabase
      .from('consultas')
      .select('id, data_hora, paciente:pacientes(id, nome, telefone)')
      .eq('nutri_id', user.id)
      .eq('lembrete_ativo', true)
      .eq('lembrete_enviado', false)
      .eq('status', 'agendada')
      .gte('data_hora', new Date(Date.now() + 23 * 3600 * 1000).toISOString())
      .lte('data_hora', new Date(Date.now() + 26 * 3600 * 1000).toISOString());
    setLembretes(data ?? []);
  }

  async function marcarEnviado(consultaId) {
    await supabase.from('consultas').update({ lembrete_enviado: true }).eq('id', consultaId);
    setEnviadosLocais(prev => new Set([...prev, consultaId]));
  }

  useEffect(() => { carregar(); carregarPacientes(); verificarLembretes(); }, [user]);

  const agora = new Date().toISOString();
  const ativas = (consultas ?? []).filter(c => c.status !== 'cancelada');
  const futuras = ativas.filter(c => c.data_hora >= agora);
  const passadas = ativas.filter(c => c.data_hora < agora);
  const canceladas = (consultas ?? []).filter(c => c.status === 'cancelada');

  // Consultas do dia selecionado
  const consultasDoDia = useMemo(() => {
    if (!diaSelecionado) return [];
    return (consultas ?? [])
      .filter(c => c.status !== 'cancelada')
      .filter(c => ehMesmoDia(new Date(c.data_hora), diaSelecionado))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  }, [consultas, diaSelecionado]);

  const abrirNova = () => setModalState({ open: true, consulta: null });
  const abrirEdit = (consulta) => setModalState({ open: true, consulta });
  const fechar = () => setModalState({ open: false, consulta: null });

  return (
    <>
      <div className="page-title">Agenda</div>
      <div className="page-sub">
        {consultas === undefined ? 'Carregando…' :
          `${futuras.length} consulta${futuras.length === 1 ? '' : 's'} agendada${futuras.length === 1 ? '' : 's'}`}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn" onClick={abrirNova} disabled={pacientes.length === 0}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} aria-hidden="true"></i> Nova consulta
        </button>
      </div>

      {pacientes.length === 0 && (
        <div className="al-b" style={{ marginBottom: 12 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--blue)', marginTop: 1 }} aria-hidden="true"></i>
          <div>
            <div className="al-t" style={{ color: 'var(--blue)' }}>Cadastre uma paciente primeiro</div>
            <div className="al-d">A agenda precisa de pelo menos uma paciente para você poder marcar consultas.</div>
          </div>
        </div>
      )}

      {lembretes.filter(l => !enviadosLocais.has(l.id)).length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 10,
          background: 'var(--orange-bg)', border: '0.5px solid var(--orange)',
          borderLeft: '3px solid var(--orange)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <i className="ti ti-bell" style={{ fontSize: 16, color: 'var(--orange)' }} aria-hidden="true"></i>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>
              Lembrete 24h — consultas amanhã
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lembretes.filter(l => !enviadosLocais.has(l.id)).map(l => {
              const hora = new Date(l.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const nutriNome = profile?.nome ?? 'sua nutricionista';
              const pacNome = l.paciente?.nome ?? '';
              const tel = l.paciente?.telefone?.replace(/\D/g, '') ?? '';
              const msg = encodeURIComponent(`Olá ${pacNome.split(' ')[0]}! Lembrando que sua consulta com ${nutriNome} é amanhã às ${hora}. Qualquer dúvida estou à disposição! 😊`);
              return (
                <div key={l.id} style={{
                  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                  background: 'var(--white)', borderRadius: 8, padding: '8px 12px',
                  border: '0.5px solid var(--border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{pacNome}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{hora}</span>
                  </div>
                  {tel ? (
                    <a href={`https://wa.me/55${tel}?text=${msg}`}
                      target="_blank" rel="noreferrer"
                      className="btn-outline"
                      onClick={() => marcarEnviado(l.id)}
                      style={{ fontSize: 11, padding: '3px 10px', textDecoration: 'none' }}>
                      <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
                    </a>
                  ) : null}
                  <button className="btn-outline" style={{ fontSize: 11, padding: '3px 10px' }}
                    onClick={() => marcarEnviado(l.id)}>
                    Marcar enviado
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CalendarioMensal
        mesVisivel={mesVisivel}
        diaSelecionado={diaSelecionado}
        consultas={consultas ?? []}
        onMudarMes={setMesVisivel}
        onSelecionarDia={setDiaSelecionado}
      />

      {/* Consultas do dia selecionado */}
      <div className="section-label">
        Consultas em {diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
      </div>
      {consultasDoDia.length === 0 ? (
        <div className="card" style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          Nenhuma consulta neste dia.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {consultasDoDia.map((c, i) => (
            <ConsultaRow key={c.id} c={c} isLast={i === consultasDoDia.length - 1} onClick={() => abrirEdit(c)} />
          ))}
        </div>
      )}

      {/* Listas tradicionais */}
      {consultas !== undefined && (
        <>
          {futuras.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 20 }}>Todas as próximas</div>
              <div className="card" style={{ padding: 0 }}>
                {futuras.map((c, i) => (
                  <ConsultaRow key={c.id} c={c} isLast={i === futuras.length - 1} onClick={() => abrirEdit(c)} />
                ))}
              </div>
            </>
          )}

          {passadas.length > 0 && (
            <>
              <div className="section-label">Anteriores (10 últimas)</div>
              <div className="card" style={{ padding: 0, opacity: .85 }}>
                {passadas.slice(-10).reverse().map((c, i, arr) => (
                  <ConsultaRow key={c.id} c={c} isLast={i === arr.length - 1} onClick={() => abrirEdit(c)} isPast />
                ))}
              </div>
            </>
          )}

          {canceladas.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{
                fontSize: 13, color: 'var(--text3)', cursor: 'pointer',
                listStyle: 'none', userSelect: 'none', padding: '4px 0',
              }}>
                Mostrar canceladas ({canceladas.length})
              </summary>
              <div className="card" style={{ padding: 0, opacity: .55, marginTop: 8 }}>
                {canceladas.map((c, i) => (
                  <ConsultaRow key={c.id} c={c} isLast={i === canceladas.length - 1} onClick={() => abrirEdit(c)} isCanceled />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {modalState.open && (
        <ConsultaModal
          consulta={modalState.consulta}
          pacientes={pacientes}
          nutriId={user.id}
          onClose={fechar}
          onSaved={async () => { fechar(); await carregar(); }}
        />
      )}
    </>
  );
}

/* ============================================================
   CALENDÁRIO MENSAL
   ============================================================ */
function CalendarioMensal({ mesVisivel, diaSelecionado, consultas, onMudarMes, onSelecionarDia }) {
  const dias = useMemo(() => gerarDiasCalendario(mesVisivel), [mesVisivel]);
  const hoje = new Date();

  // Mapa data → consultas (ativas, ignorando canceladas)
  const consultasPorDia = useMemo(() => {
    const m = new Map();
    for (const c of consultas) {
      if (c.status === 'cancelada') continue;
      const d = new Date(c.data_hora);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    }
    return m;
  }, [consultas]);

  const mudarMes = (delta) => {
    const novo = new Date(mesVisivel);
    novo.setMonth(novo.getMonth() + delta);
    onMudarMes(novo);
  };

  return (
    <div className="card" style={{ padding: '16px 16px 12px', marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <button onClick={() => mudarMes(-1)}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 14,
          }}>
          <i className="ti ti-chevron-left" aria-hidden="true"></i>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--dark)' }}>
            {mesAnoExtenso(mesVisivel)}
          </span>
          <button onClick={() => { onMudarMes(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); onSelecionarDia(hoje); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--gold-deep, #a08456)', fontWeight: 500,
            }}>
            Hoje
          </button>
        </div>
        <button onClick={() => mudarMes(1)}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 14,
          }}>
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2, marginBottom: 4,
      }}>
        {DIAS_SEMANA_CURTOS.map(d => (
          <div key={d} style={{
            fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', textAlign: 'center', padding: '6px 0', fontWeight: 500,
          }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2,
      }}>
        {dias.map((d, i) => {
          const key = `${d.data.getFullYear()}-${d.data.getMonth()}-${d.data.getDate()}`;
          const cs = consultasPorDia.get(key) ?? [];
          const isToday = ehMesmoDia(d.data, hoje);
          const isSelected = ehMesmoDia(d.data, diaSelecionado);
          return (
            <button key={i}
              onClick={() => onSelecionarDia(new Date(d.data))}
              style={{
                background: isSelected ? 'var(--dark)' : isToday ? 'var(--orange-bg)' : 'var(--white)',
                border: '0.5px solid ' + (isSelected ? 'var(--dark)' : 'var(--border)'),
                borderRadius: 6,
                padding: '6px 4px',
                minHeight: 60,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                opacity: d.foraDoMes ? .35 : 1,
                fontFamily: 'var(--font-sans)',
                transition: 'background .15s',
              }}>
              <span style={{
                fontSize: 14,
                fontWeight: isToday || isSelected ? 600 : 400,
                color: isSelected ? 'var(--white)' : isToday ? 'var(--orange)' : 'var(--dark)',
                marginBottom: 4,
              }}>
                {d.data.getDate()}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                {cs.slice(0, 4).map((c, ci) => (
                  <span key={ci} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: tipoColor(c.tipo),
                    boxShadow: isSelected ? '0 0 0 0.5px var(--white)' : 'none',
                  }} title={`${new Date(c.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${c.paciente?.nome}`} />
                ))}
                {cs.length > 4 && (
                  <span style={{
                    fontSize: 10,
                    color: isSelected ? 'var(--white)' : 'var(--text3)',
                    marginLeft: 2,
                  }}>+{cs.length - 4}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Legenda cor="var(--blue)" label="1ª consulta" />
        <Legenda cor="var(--green)" label="Retorno" />
        <Legenda cor="var(--orange)" label="Avaliação" />
      </div>
    </div>
  );
}

function Legenda({ cor, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text3)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} />
      {label}
    </span>
  );
}

/* ============================================================
   LINHA DE CONSULTA
   ============================================================ */
function ConsultaRow({ c, isLast, isPast, isCanceled, onClick }) {
  const cor = tipoColor(c.tipo);
  const emBreve = !isPast && !isCanceled && consultaEmBreve(c.data_hora);
  const link = linkCall(c);

  function abrirCall(e) {
    e.stopPropagation();
    if (link) window.open(link, '_blank', 'noopener');
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
        cursor: 'pointer', transition: 'background .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#faf8f5'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, color: 'var(--dark)', flexShrink: 0,
        textDecoration: isCanceled ? 'line-through' : 'none',
      }}>{iniciais(c.paciente?.nome)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, textDecoration: isCanceled ? 'line-through' : 'none' }}>
          {c.paciente?.nome ?? '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {dataConsultaBR(c.data_hora)} · {c.duracao_min}min
          {isPast && c.status === 'agendada' && ' · sem status'}
          {c.status === 'realizada' && ' · ✓ realizada'}
        </div>
      </div>

      {emBreve && link && (
        <button onClick={abrirCall}
          style={{
            background: 'var(--green)', color: 'var(--white)',
            border: 'none', borderRadius: 6, padding: '5px 10px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <i className="ti ti-video" aria-hidden="true"></i> Entrar
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500,
          background: cor + '20', color: cor,
        }}>
          {tipoLabel(c.tipo)}
        </span>
        {!isPast && !isCanceled && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{textoDias(c.data_hora)}</span>
        )}
        <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text3)' }} aria-hidden="true"></i>
      </div>
    </div>
  );
}

/* ============================================================
   MODAL CONSULTA
   ============================================================ */
function ConsultaModal({ consulta, pacientes, nutriId, onClose, onSaved }) {
  const isEdit = !!consulta;

  const initial = consulta
    ? {
        pacienteId: consulta.paciente?.id ?? '',
        data: consulta.data_hora?.slice(0, 10) ?? '',
        hora: consulta.data_hora ? new Date(consulta.data_hora).toTimeString().slice(0, 5) : '14:00',
        duracao: consulta.duracao_min ?? 45,
        tipo: consulta.tipo ?? 'primeira',
        status: consulta.status ?? 'agendada',
        obs: consulta.obs ?? '',
        meetLink: consulta.meet_link ?? '',
        linksExtras: Array.isArray(consulta.links_extras) ? consulta.links_extras : [],
      }
    : { pacienteId: pacientes[0]?.id ?? '', data: '', hora: '14:00', duracao: 45, tipo: 'primeira', status: 'agendada', obs: '', meetLink: '', linksExtras: [] };

  const [pacienteId, setPacienteId] = useState(initial.pacienteId);
  const [data, setData] = useState(initial.data);
  const [hora, setHora] = useState(initial.hora);
  const [duracao, setDuracao] = useState(initial.duracao);
  const [tipo, setTipo] = useState(initial.tipo);
  const [status, setStatus] = useState(initial.status);
  const [obs, setObs] = useState(initial.obs);
  const [meetLink, setMeetLink] = useState(initial.meetLink);
  const [linksExtras, setLinksExtras] = useState(initial.linksExtras);
  const [lembreteAtivo, setLembreteAtivo] = useState(consulta?.lembrete_ativo ?? true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(false);

  function addLinkExtra() {
    setLinksExtras(curr => [...curr, { label: '', url: '' }]);
  }
  function updateLinkExtra(idx, field, val) {
    setLinksExtras(curr => curr.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }
  function removeLinkExtra(idx) {
    setLinksExtras(curr => curr.filter((_, i) => i !== idx));
  }

  // Auto-sugere o tipo só ao CRIAR
  useEffect(() => {
    if (isEdit || !pacienteId) return;
    let active = true;
    (async () => {
      const { count } = await supabase
        .from('consultas')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', pacienteId)
        .neq('status', 'cancelada')
        .neq('tipo', 'avaliacao');
      if (!active) return;
      const n = (count ?? 0) + 1;
      if (n === 1) setTipo('primeira');
      else if (n <= 12) setTipo(`consulta_${n}`);
      else setTipo('consulta_12');
    })();
    return () => { active = false; };
  }, [pacienteId, isEdit]);

  // Link efetivo da call (custom se preenchido, senão Jitsi auto-gerado)
  const consultaIdEfetiva = consulta?.id ?? null;
  const linkEfetivo = meetLink.trim()
    ? meetLink.trim()
    : (consultaIdEfetiva ? gerarLinkJitsi(consultaIdEfetiva) : '(será gerado após salvar)');

  const pacienteNome = pacientes.find(p => p.id === pacienteId)?.nome ?? '';
  const dataHoraIso = data && hora ? new Date(`${data}T${hora}:00`).toISOString() : null;
  const gcalUrl = dataHoraIso ? gerarGoogleCalendarUrl({
    titulo: `Consulta com ${pacienteNome}`,
    dataHoraInicio: dataHoraIso,
    duracaoMin: Number(duracao),
    descricao: `Link da call: ${linkEfetivo}\n\n${obs || ''}`.trim(),
    local: 'Online',
  }) : null;

  async function salvar() {
    setErro(null);
    if (!pacienteId || !data || !hora) {
      setErro('Preencha paciente, data e horário.');
      return;
    }
    setBusy(true);
    const dataHora = new Date(`${data}T${hora}:00`).toISOString();
    const linksValidos = linksExtras
      .map(l => ({ label: (l.label ?? '').trim(), url: (l.url ?? '').trim() }))
      .filter(l => l.url);
    const payload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      data_hora: dataHora,
      duracao_min: Number(duracao),
      tipo,
      status,
      obs: obs.trim() || null,
      meet_link: meetLink.trim() || null,
      links_extras: linksValidos.length > 0 ? linksValidos : null,
      lembrete_ativo: lembreteAtivo,
    };
    const { error } = isEdit
      ? await supabase.from('consultas').update(payload).eq('id', consulta.id)
      : await supabase.from('consultas').insert(payload);
    setBusy(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSaved();
  }

  async function cancelarConsulta() {
    if (!window.confirm('Tem certeza que deseja cancelar esta consulta?')) return;
    setBusy(true);
    const { error } = await supabase
      .from('consultas')
      .update({ status: 'cancelada' })
      .eq('id', consulta.id);
    setBusy(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSaved();
  }

  async function copiarLink() {
    if (linkEfetivo.startsWith('http')) {
      try {
        await navigator.clipboard.writeText(linkEfetivo);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      } catch (e) { alert('Não foi possível copiar.'); }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>
          {isEdit ? 'Editar consulta' : 'Nova consulta'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          {isEdit ? 'Altere os campos abaixo e salve.' : 'Agende com uma paciente — o número é sugerido pelo histórico.'}
        </div>

        <label className="form-lbl">Paciente</label>
        <select value={pacienteId} onChange={e => setPacienteId(e.target.value)} disabled={isEdit}>
          {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="form-lbl">Tipo</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <label className="form-lbl">Data</label>
        <DateInput value={data} onChange={e => setData(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="form-lbl" style={{ marginTop: 10 }}>Horário</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
          <div>
            <label className="form-lbl" style={{ marginTop: 10 }}>Duração</label>
            <select value={duracao} onChange={e => setDuracao(e.target.value)}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </div>
        </div>

        {isEdit && (
          <>
            <label className="form-lbl">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPCOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={lembreteAtivo}
            onChange={e => setLembreteAtivo(e.target.checked)} />
          Enviar lembrete 24h antes (via WhatsApp)
        </label>

        <label className="form-lbl">Link da call (opcional)</label>
        <input type="url" value={meetLink} onChange={e => setMeetLink(e.target.value)}
          placeholder={consultaIdEfetiva ? gerarLinkJitsi(consultaIdEfetiva) : 'Será auto-gerado (Jitsi)'} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
          Deixe em branco para usar Jitsi automático. Cole link do Google Meet ou Zoom se preferir.
        </div>

        {linkEfetivo.startsWith('http') && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <a href={linkEfetivo} target="_blank" rel="noreferrer" className="btn-outline"
               style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}>
              <i className="ti ti-video" aria-hidden="true"></i> Abrir call
            </a>
            <button onClick={copiarLink} className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}>
              <i className={`ti ti-${copiado ? 'check' : 'copy'}`} aria-hidden="true"></i>
              {copiado ? 'Copiado' : 'Copiar link'}
            </button>
            {gcalUrl && (
              <a href={gcalUrl} target="_blank" rel="noreferrer" className="btn-outline"
                 style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}>
                <i className="ti ti-brand-google" aria-hidden="true"></i> Adicionar ao Google Agenda
              </a>
            )}
          </div>
        )}

        <label className="form-lbl">Links adicionais (Shaped, Trello, formulário…)</label>
        {linksExtras.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            Anexe quantos links forem necessários — a paciente verá no card da consulta dela.
          </div>
        )}
        {linksExtras.map((link, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 6, marginBottom: 6 }}>
            <input value={link.label} onChange={e => updateLinkExtra(idx, 'label', e.target.value)}
              placeholder="Ex: Shaped" style={{ margin: 0 }} />
            <input type="url" value={link.url} onChange={e => updateLinkExtra(idx, 'url', e.target.value)}
              placeholder="https://..." style={{ margin: 0 }} />
            <button onClick={() => removeLinkExtra(idx)} title="Remover"
              style={{
                background: 'none', border: '0.5px solid var(--red)',
                borderRadius: 6, padding: '0 10px', cursor: 'pointer',
                color: 'var(--red)', fontSize: 13,
              }}>
              <i className="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        ))}
        <button type="button" onClick={addLinkExtra} className="btn-outline"
          style={{ fontSize: 11, padding: '4px 10px', marginTop: 4 }}>
          <i className="ti ti-plus" aria-hidden="true"></i> Adicionar link
        </button>

        <label className="form-lbl">Observação (opcional)</label>
        <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Ex: revisão de bioimpedância..." style={{ resize: 'none' }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
            onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : (isEdit ? 'Salvar alterações' : 'Agendar')}
          </button>
        </div>

        {isEdit && consulta.status !== 'cancelada' && (
          <button
            onClick={cancelarConsulta}
            disabled={busy}
            style={{
              marginTop: 14, width: '100%', padding: '10px 14px',
              background: 'transparent', color: 'var(--red)',
              border: '0.5px solid var(--red)', borderRadius: 6,
              fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className="ti ti-x" aria-hidden="true"></i> Cancelar esta consulta
          </button>
        )}
      </div>
    </div>
  );
}
