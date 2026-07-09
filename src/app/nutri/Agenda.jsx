import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import DateInput from '../../components/DateInput.jsx';
import {
  dataConsultaBR, textoDias, iniciais,
  linkCall, gerarLinkJitsi, gerarGoogleCalendarUrl, consultaEmBreve,
  gerarDiasCalendario, ehMesmoDia, mesAnoExtenso, DIAS_SEMANA_CURTOS,
  HORARIOS_CONSULTA, HORARIO_CONSULTA_PADRAO, horaConsultaValida,
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
  { value: 'avulsa',    label: 'Consulta avulsa' },
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
  if (tipo === 'avulsa') return 'Consulta avulsa';
  const m = tipo.match(/^consulta_(\d+)$/);
  if (m) return `Consulta ${String(m[1]).padStart(2, '0')}`;
  return tipo;
}

function tipoColor(tipo) {
  if (tipo === 'primeira') return 'var(--blue)';
  if (tipo === 'avaliacao') return 'var(--orange)';
  return 'var(--green)';
}

// Normaliza número brasileiro para formato wa.me (sem +, sem espaços).
// Aceita: "(11) 99999-9999", "011 9 9999-9999", "+55 11 99999-9999", etc.
function normalizarTelefone(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);            // remove zero à esquerda
  if (n.startsWith('55') && n.length >= 12) return n; // já tem código do país
  return '55' + n;
}

// Texto padrão do lembrete — edite aqui para mudar a mensagem em todos os envios.
function templateLembrete({ nome, data, diaSemana, hora, assinatura }) {
  return `Olá, ${nome}! Passando para lembrar da sua consulta de nutrição em ${data} (${diaSemana}) às ${hora}. Qualquer imprevisto, me avise por aqui. Até breve! — ${assinatura}`;
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
  const [enviadosLocais, setEnviadosLocais] = useState(new Map()); // consultaId → ISO timestamp do envio
  const [erroLembrete, setErroLembrete] = useState(null);

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
      .select('id, data_hora, lembrete_enviado, lembrete_enviado_em, paciente:pacientes(id, nome, telefone)')
      .eq('nutri_id', user.id)
      .eq('lembrete_ativo', true)
      .eq('status', 'agendada')
      .gte('data_hora', new Date(Date.now() + 12 * 3600 * 1000).toISOString())
      .lte('data_hora', new Date(Date.now() + 26 * 3600 * 1000).toISOString())
      .order('data_hora', { ascending: true });
    setLembretes(data ?? []);
  }

  // Marca enviado: persiste no Supabase (fonte da verdade) e atualiza cache local.
  // Só é chamado ao clicar no botão — NUNCA automaticamente ao exibir o painel.
  async function marcarEnviado(consultaId) {
    const agora = new Date().toISOString();
    const { error } = await supabase.from('consultas')
      .update({ lembrete_enviado: true, lembrete_enviado_em: agora })
      .eq('id', consultaId);
    if (error) {
      setErroLembrete('Não consegui salvar, tente novamente');
      setTimeout(() => setErroLembrete(null), 4000);
      return;
    }
    setEnviadosLocais(prev => new Map([...prev, [consultaId, agora]]));
    // Atualiza o dado do DB na lista local sem re-fetch completo
    setLembretes(prev => prev.map(l =>
      l.id === consultaId ? { ...l, lembrete_enviado: true, lembrete_enviado_em: agora } : l
    ));
  }

  async function desfazerEnvio(consultaId) {
    const { error } = await supabase.from('consultas')
      .update({ lembrete_enviado: false, lembrete_enviado_em: null })
      .eq('id', consultaId);
    if (error) {
      setErroLembrete('Não consegui salvar, tente novamente');
      setTimeout(() => setErroLembrete(null), 4000);
      return;
    }
    setEnviadosLocais(prev => { const m = new Map(prev); m.delete(consultaId); return m; });
    setLembretes(prev => prev.map(l =>
      l.id === consultaId ? { ...l, lembrete_enviado: false, lembrete_enviado_em: null } : l
    ));
  }

  useEffect(() => {
    carregar();
    carregarPacientes();
    verificarLembretes();
    const intervalo = setInterval(verificarLembretes, 5 * 60 * 1000);
    return () => clearInterval(intervalo);
  }, [user]);

  const agora = new Date().toISOString();
  const ativas = (consultas ?? []).filter(c => c.status !== 'cancelada');
  const futuras = ativas.filter(c => c.data_hora && c.data_hora >= agora);
  const passadas = ativas.filter(c => c.data_hora && c.data_hora < agora);
  const aDefinir = ativas.filter(c => !c.data_hora);
  const canceladas = (consultas ?? []).filter(c => c.status === 'cancelada');

  // Consultas do dia selecionado
  const consultasDoDia = useMemo(() => {
    if (!diaSelecionado) return [];
    return (consultas ?? [])
      .filter(c => c.status !== 'cancelada')
      .filter(c => c.data_hora)
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

      {erroLembrete && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {erroLembrete}
        </div>
      )}

      {lembretes.length > 0 && (
        <PainelLembretes
          lembretes={lembretes}
          profile={profile}
          enviadosLocais={enviadosLocais}
          onEnviar={marcarEnviado}
          onDesfazer={desfazerEnvio}
        />
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
          {aDefinir.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 20 }}>A definir ({aDefinir.length})</div>
              <div className="card" style={{ padding: 0 }}>
                {aDefinir.map((c, i) => (
                  <ConsultaRow key={c.id} c={c} isLast={i === aDefinir.length - 1} onClick={() => abrirEdit(c)} />
                ))}
              </div>
            </>
          )}

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
   PAINEL DE LEMBRETES DE HOJE
   ============================================================ */
function PainelLembretes({ lembretes, profile, enviadosLocais, onEnviar, onDesfazer }) {
  const [copiadoId, setCopiadoId] = useState(null);

  async function copiarMensagem(id, texto) {
    try { await navigator.clipboard.writeText(texto); }
    catch { alert(texto); } // fallback caso sem permissão (mobile)
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  }

  const assinatura = (profile?.nome?.split(' ')[0] ?? 'Kelly') + ' | Essentia';
  const pendentes = lembretes.filter(l => {
    const localTs = enviadosLocais.get(l.id);
    return !localTs && !l.lembrete_enviado_em && !l.lembrete_enviado;
  }).length;

  return (
    <div style={{
      marginBottom: 16, borderRadius: 12,
      border: '1px solid var(--orange)',
      background: 'var(--orange-bg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px',
        borderBottom: '0.5px solid var(--orange)',
      }}>
        <i className="ti ti-bell" style={{ fontSize: 16, color: 'var(--orange)' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>
            Lembretes de hoje
          </div>
          <div style={{ fontSize: 11, color: 'var(--orange)', opacity: 0.85 }}>
            {pendentes === 0
              ? 'Todos os lembretes enviados ✓'
              : `${pendentes} pendente${pendentes > 1 ? 's' : ''} · toque para enviar`}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lembretes.map(l => {
          const dt = new Date(l.data_hora);
          const horaConsulta = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const dataFormatada = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          const diaSemana = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
          const pacNome = l.paciente?.nome ?? '';
          const temTelefone = !!(l.paciente?.telefone?.trim());
          const telFormatado = temTelefone ? normalizarTelefone(l.paciente.telefone) : '';

          const msgTexto = templateLembrete({
            nome: pacNome.split(' ')[0],
            data: dataFormatada,
            diaSemana,
            hora: horaConsulta,
            assinatura,
          });
          const msgEncoded = encodeURIComponent(msgTexto);

          // Cache local tem prioridade para exibição imediata; fonte da verdade é o Supabase
          const localTs = enviadosLocais.get(l.id);
          const dbTs = l.lembrete_enviado_em;
          const enviado = !!localTs || !!dbTs || l.lembrete_enviado;
          const enviadoTs = localTs ?? dbTs; // ISO string ou null
          const enviadoLabel = enviadoTs
            ? `Enviado em ${new Date(enviadoTs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${new Date(enviadoTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Enviado';

          const copiado = copiadoId === l.id;

          return (
            <div key={l.id} style={{
              background: enviado ? '#f0fdf4' : 'var(--white)',
              borderRadius: 10,
              border: `1px solid ${enviado ? '#bbf7d0' : 'var(--border)'}`,
              padding: '12px 14px',
            }}>
              {/* Info */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dark)' }}>{pacNome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {dataFormatada} ({diaSemana}) às {horaConsulta}
                  </div>
                  {l.paciente?.telefone && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                      <i className="ti ti-phone" style={{ fontSize: 11 }} aria-hidden="true" /> {l.paciente.telefone}
                    </div>
                  )}
                </div>
                {enviado ? (
                  <span style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 500,
                    background: '#dcfce7', color: '#15803d', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <i className="ti ti-check" aria-hidden="true" /> {enviadoLabel}
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 500,
                    background: 'var(--orange-bg)', color: 'var(--orange)', flexShrink: 0,
                  }}>
                    Lembrete pendente
                  </span>
                )}
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!enviado ? (
                  temTelefone ? (
                    <a
                      href={`https://wa.me/${telFormatado}?text=${msgEncoded}`}
                      target="_blank" rel="noreferrer"
                      className="btn"
                      onClick={() => onEnviar(l.id)}
                      style={{
                        flex: 1, minWidth: 160, justifyContent: 'center',
                        textDecoration: 'none', fontSize: 13,
                        minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar pelo WhatsApp
                    </a>
                  ) : (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, color: 'var(--orange)', fontStyle: 'italic',
                    }}>
                      <i className="ti ti-alert-triangle" aria-hidden="true" /> Sem telefone cadastrado
                    </div>
                  )
                ) : (
                  temTelefone && (
                    <a
                      href={`https://wa.me/${telFormatado}?text=${msgEncoded}`}
                      target="_blank" rel="noreferrer"
                      className="btn-outline"
                      onClick={() => onEnviar(l.id)}
                      style={{
                        fontSize: 12, minHeight: 40, padding: '0 14px',
                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <i className="ti ti-refresh" aria-hidden="true" /> Reenviar
                    </a>
                  )
                )}

                <button
                  className="btn-outline"
                  onClick={() => copiarMensagem(l.id, msgTexto)}
                  style={{
                    fontSize: 12, minHeight: enviado ? 40 : 44, padding: '0 14px',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: copiado ? 'var(--green)' : undefined,
                    borderColor: copiado ? 'var(--green)' : undefined,
                  }}
                >
                  <i className={`ti ti-${copiado ? 'check' : 'copy'}`} aria-hidden="true" />
                  {copiado ? 'Copiado!' : 'Copiar mensagem'}
                </button>

                {enviado && (
                  <button
                    className="btn-outline"
                    onClick={() => onDesfazer(l.id)}
                    style={{
                      fontSize: 12, minHeight: 40, padding: '0 14px',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      color: 'var(--text3)',
                    }}
                  >
                    <i className="ti ti-arrow-back-up" aria-hidden="true" /> Desfazer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
          {c.data_hora ? dataConsultaBR(c.data_hora) : 'A definir'} · {c.duracao_min}min
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
        {!isPast && !isCanceled && c.data_hora && (
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
        hora: consulta.data_hora ? new Date(consulta.data_hora).toTimeString().slice(0, 5) : HORARIO_CONSULTA_PADRAO,
        duracao: consulta.duracao_min ?? 45,
        tipo: consulta.tipo ?? 'primeira',
        status: consulta.status ?? 'agendada',
        obs: consulta.obs ?? '',
        meetLink: consulta.meet_link ?? '',
        linksExtras: Array.isArray(consulta.links_extras) ? consulta.links_extras : [],
      }
    : { pacienteId: pacientes[0]?.id ?? '', data: '', hora: HORARIO_CONSULTA_PADRAO, duracao: 45, tipo: 'primeira', status: 'agendada', obs: '', meetLink: '', linksExtras: [] };

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
    if (!horaConsultaValida(hora)) {
      setErro('O horário deve ser um dos valores entre 14:00 e 17:00 (de 30 em 30 min).');
      return;
    }
    setBusy(true);
    try {
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
      if (error) throw error;
      onSaved();
    } catch (err) {
      setErro(err?.message || 'Erro ao salvar consulta');
    } finally {
      setBusy(false);
    }
  }

  async function finalizarConsulta() {
    if (!window.confirm('Marcar esta consulta como realizada?')) return;
    setBusy(true);
    const { error } = await supabase
      .from('consultas')
      .update({ status: 'realizada', encerrada_em: new Date().toISOString() })
      .eq('id', consulta.id);
    setBusy(false);
    if (error) { setErro(error.message); return; }
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
            <select value={hora} onChange={e => setHora(e.target.value)}>
              {!HORARIOS_CONSULTA.includes(hora) && hora && (
                <option value={hora}>{hora} (fora do padrão)</option>
              )}
              {HORARIOS_CONSULTA.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
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

        {isEdit && consulta.status === 'agendada' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={finalizarConsulta}
              disabled={busy}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'transparent', color: 'var(--green)',
                border: '0.5px solid var(--green)', borderRadius: 6,
                fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <i className="ti ti-check" aria-hidden="true"></i> Finalizar consulta
            </button>
            <button
              onClick={cancelarConsulta}
              disabled={busy}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'transparent', color: 'var(--red)',
                border: '0.5px solid var(--red)', borderRadius: 6,
                fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <i className="ti ti-x" aria-hidden="true"></i> Cancelar
            </button>
          </div>
        )}
        {isEdit && consulta.status === 'realizada' && (
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
