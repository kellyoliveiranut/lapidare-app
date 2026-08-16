import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import DateInput from '../../components/DateInput.jsx';
import NovaPacienteRapida from './_NovaPacienteRapida.jsx';
import { linkConvite, mensagemConviteEncoded } from '../../lib/convite.js';
import {
  dataConsultaBR, horaConsultaBR, TZ_CLINICA, textoDias, iniciais,
  linkCall, gerarLinkJitsi, gerarGoogleCalendarUrl, consultaEmBreve,
  gerarDiasCalendario, ehMesmoDia, mesAnoExtenso, DIAS_SEMANA_CURTOS,
  HORARIOS_CONSULTA, HORARIO_CONSULTA_PADRAO, horaConsultaValida,
  telefoneValido,
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

// Modalidade da consulta. O banco só aceita 'online' | 'presencial'
// (check consultas_modalidade_check). Híbrido não existe aqui — segue só em
// pacientes.modalidade, no perfil da paciente.
const MODALIDADES_CONSULTA = [
  { value: 'online',     label: 'Online',     icone: 'ti-video'   },
  { value: 'presencial', label: 'Presencial', icone: 'ti-map-pin' },
];

function modalidadeInfo(modalidade) {
  return MODALIDADES_CONSULTA.find(m => m.value === modalidade) ?? MODALIDADES_CONSULTA[0];
}

// pacientes.modalidade é capitalizada ('Online'/'Presencial'/'Híbrido') e a
// coluna da consulta é minúscula. Só 'presencial' é herdado: Híbrido, vazio e
// qualquer valor inesperado caem em 'online', o default do banco.
function modalidadeDaPaciente(modalidade) {
  return (modalidade ?? '').trim().toLowerCase() === 'presencial' ? 'presencial' : 'online';
}

// Local só existe no presencial (check consultas_local_modalidade_check). Um
// único local ativo é escolha óbvia e já vem marcado; com dois ou mais a nutri
// escolhe, e o salvar() trava enquanto ela não escolher.
function localPadrao(locais) {
  const ativos = (locais ?? []).filter(l => l.ativo);
  return ativos.length === 1 ? ativos[0].id : '';
}

// Confirmação de presença só faz sentido para consulta futura, agendada e com
// data marcada — em realizada/cancelada/passada/"a definir" o estado é ruído.
// Fonte única da verdade: usada tanto no contador do topo quanto na linha.
function podeConfirmar(c) {
  return c.status === 'agendada' && !!c.data_hora && new Date(c.data_hora) >= new Date();
}

// Normaliza número brasileiro para formato wa.me (sem +, sem espaços).
// Aceita: "(11) 99999-9999", "011 9 9999-9999", "+55 11 99999-9999", etc.
function normalizarTelefone(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);            // remove zero à esquerda
  if (n.startsWith('55') && n.length >= 12) return n; // já tem código do país
  return '55' + n;
}

// Textos dos lembretes — edite aqui para mudar a mensagem em todos os envios.
// "Thais" e "Dra. Kelly" são fixos de propósito: quem assina é a assistente,
// não o perfil logado.
function templateLembretePresencial({ nome, diaSemana, data, hora, endereco }) {
  return `Oi ${nome}! Aqui é a Thais, assistente da Dra. Kelly. Você tem consulta marcada para ${diaSemana}, ${data}, às ${hora}.

Gostaria de saber se você prefere café ou chá, para deixarmos tudo pronto para te receber

Só lembrando: como faremos avaliação física, pedimos que venha com roupas leves ou de exercício — assim a Dra. consegue fazer a avaliação com mais precisão.
${endereco ? `\nEndereço: ${endereco}\n` : ''}
Aguardo seu retorno. Até breve!`;
}

function templateLembreteOnline({ nome, diaSemana, data, hora }) {
  return `Oi ${nome}! Aqui é a Thais, assistente da Dra. Kelly. Você tem consulta marcada para ${diaSemana}, ${data}, às ${hora}, que será realizada por aqui mesmo.

Qualquer imprevisto, me avise por aqui.

Até breve!`;
}

// Só 'presencial' leva o texto com endereço; qualquer outro valor cai no
// online, mesmo default do banco e de modalidadeDaPaciente().
function templateLembrete({ modalidade, endereco, ...resto }) {
  return modalidade === 'presencial'
    ? templateLembretePresencial({ ...resto, endereco })
    : templateLembreteOnline(resto);
}

// Janela do painel de lembretes. Era 12h→26h a partir do carregamento da tela:
// uma faixa tão estreita que o painel ficava vazio quase toda semana, sem nada
// explicando o porquê. Agora vai de agora até 7 dias, para confirmar com
// antecedência.
const JANELA_LEMBRETE_DIAS = 7;

// Quantos pendentes o painel mostra antes de cortar com "Mostrar mais".
const LIMITE_PENDENTES = 8;

export default function Agenda() {
  const { user } = useSession();
  const [consultas, setConsultas] = useState(undefined);
  const [pacientes, setPacientes] = useState([]);
  const [locais, setLocais] = useState([]);
  const [modalState, setModalState] = useState({ open: false, consulta: null, pacienteInicialId: null });
  const [novaPacienteOpen, setNovaPacienteOpen] = useState(false);
  // Convite da paciente recém-criada pelo cadastro rápido: fica na faixa verde
  // do topo até a nutri dispensar. Sem isso o link de primeiro acesso ficaria
  // escondido na tela Cadastrar, e a paciente nunca receberia.
  const [convite, setConvite] = useState(null);
  const [mesVisivel, setMesVisivel] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState(() => new Date());
  const [lembretes, setLembretes] = useState([]);
  const [enviadosLocais, setEnviadosLocais] = useState(new Map()); // consultaId → ISO timestamp do envio
  const [erroLembrete, setErroLembrete] = useState(null);
  // Separado do erroLembrete: aquele é erro de gravação e se apaga em 4s;
  // este é falha de leitura e some só quando a próxima leitura der certo.
  const [erroLembretesFetch, setErroLembretesFetch] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('consultas')
      .select(`
        id, data_hora, duracao_min, tipo, status, modalidade, local_id, obs, meet_link, links_extras,
        lembrete_ativo, lembrete_enviado,
        confirmada_em, confirmada_por,
        paciente:pacientes(id, nome)
      `)
      .eq('nutri_id', user.id)
      .order('data_hora', { ascending: true });
    setConsultas(data ?? []);
  }

  async function carregarPacientes() {
    if (!user) return;
    const { data } = await supabase
      .from('pacientes').select('id, nome, modalidade')
      .eq('nutri_id', user.id).order('nome');
    setPacientes(data ?? []);
  }

  // Traz os inativos também: consulta antiga pode apontar para um local
  // aposentado, e sem a linha dele o modal exibiria o select vazio.
  async function carregarLocais() {
    if (!user) return;
    const { data } = await supabase
      .from('locais_atendimento').select('id, nome, endereco, ativo')
      .eq('nutri_id', user.id).order('nome');
    setLocais(data ?? []);
  }

  async function verificarLembretes() {
    if (!user) return;
    const agora = new Date();
    const fim = new Date(agora.getTime() + JANELA_LEMBRETE_DIAS * 24 * 3600 * 1000);
    const { data, error } = await supabase
      .from('consultas')
      .select('id, data_hora, modalidade, local_id, lembrete_enviado, lembrete_enviado_em, confirmada_em, paciente:pacientes(id, nome, telefone)')
      .eq('nutri_id', user.id)
      .eq('lembrete_ativo', true)
      .eq('status', 'agendada')
      .gte('data_hora', agora.toISOString())
      .lte('data_hora', fim.toISOString())
      .order('data_hora', { ascending: true });
    if (error) {
      // Não esvazia a lista: painel vazio é indistinguível de "não há
      // lembretes", que é justamente o modo de falha que estamos consertando.
      setErroLembretesFetch('Não consegui carregar os lembretes. Tento de novo em 5 minutos.');
      return;
    }
    setErroLembretesFetch(null);
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

  // Confirmação de presença (a nutri anota o que veio pelo WhatsApp).
  // UPDATE ISOLADO, só com as duas colunas: nunca passa pelo payload completo
  // do salvar() do modal, que sobrescreveria com um state possivelmente velho.
  // Atualiza o state local direto (igual marcarEnviado) — sem carregar(), que
  // refaz a lista inteira e faz o calendário piscar a cada clique.
  async function toggleConfirmada(consultaId, confirmar) {
    const patch = confirmar
      ? { confirmada_em: new Date().toISOString(), confirmada_por: 'nutri' }
      : { confirmada_em: null, confirmada_por: null };

    // Guarda o valor anterior para reverter se o banco recusar
    const anterior = (consultas ?? []).find(c => c.id === consultaId);
    setConsultas(prev => (prev ?? []).map(c => c.id === consultaId ? { ...c, ...patch } : c));
    // Espelha no painel de lembretes: confirmar tira o cartão da lista na hora
    // e desfazer traz de volta, sem esperar o poll de 5 minutos.
    setLembretes(prev => prev.map(l => l.id === consultaId ? { ...l, confirmada_em: patch.confirmada_em } : l));

    const { error } = await supabase.from('consultas').update(patch).eq('id', consultaId);
    if (error) {
      setConsultas(prev => (prev ?? []).map(c => c.id === consultaId ? {
        ...c,
        confirmada_em:  anterior?.confirmada_em  ?? null,
        confirmada_por: anterior?.confirmada_por ?? null,
      } : c));
      setLembretes(prev => prev.map(l => l.id === consultaId
        ? { ...l, confirmada_em: anterior?.confirmada_em ?? null }
        : l));
      setErroLembrete('Não consegui salvar a confirmação, tente novamente');
      setTimeout(() => setErroLembrete(null), 4000);
    }
  }

  useEffect(() => {
    carregar();
    carregarPacientes();
    carregarLocais();
    verificarLembretes();
    const intervalo = setInterval(verificarLembretes, 5 * 60 * 1000);
    return () => clearInterval(intervalo);
  }, [user]);

  // Realtime: a paciente confirma pelo app e o chip vira verde sem F5.
  // Aplica só as duas colunas de confirmação no state, em vez de chamar
  // carregar() — que refaz a lista e faz o calendário piscar (mesma razão do
  // toggleConfirmada). Espalhar payload.new inteiro apagaria o join
  // `paciente:pacientes(...)`, que o realtime não traz.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`agenda-consultas-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'consultas',
        filter: `nutri_id=eq.${user.id}`,
      }, payload => {
        const nova = payload.new;
        if (!nova?.id) return;
        setConsultas(prev => (prev ?? []).map(c => c.id === nova.id
          ? { ...c, confirmada_em: nova.confirmada_em, confirmada_por: nova.confirmada_por }
          : c));
        // A paciente confirma pelo app e o cartão sai do painel sozinho.
        setLembretes(prev => prev.map(l => l.id === nova.id
          ? { ...l, confirmada_em: nova.confirmada_em }
          : l));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const agora = new Date().toISOString();
  const ativas = (consultas ?? []).filter(c => c.status !== 'cancelada');
  const futuras = ativas.filter(c => c.data_hora && c.data_hora >= agora);
  const passadas = ativas.filter(c => c.data_hora && c.data_hora < agora);
  const aDefinir = ativas.filter(c => !c.data_hora);
  const canceladas = (consultas ?? []).filter(c => c.status === 'cancelada');
  const aConfirmar = futuras.filter(c => podeConfirmar(c) && !c.confirmada_em).length;

  // Quem já confirmou presença sai do painel: o lembrete existe para arrancar
  // a confirmação, e insistir com quem já respondeu é ruído. O critério é o
  // mesmo do resto do app — confirmada_em não nulo, independente de quem
  // confirmou (nutri pelo WhatsApp ou paciente pelo app).
  const lembretesPendentes = useMemo(() => lembretes.filter(l => !l.confirmada_em), [lembretes]);
  const confirmadasOcultas = lembretes.length - lembretesPendentes.length;

  // Consultas do dia selecionado
  const consultasDoDia = useMemo(() => {
    if (!diaSelecionado) return [];
    return (consultas ?? [])
      .filter(c => c.status !== 'cancelada')
      .filter(c => c.data_hora)
      .filter(c => ehMesmoDia(new Date(c.data_hora), diaSelecionado))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  }, [consultas, diaSelecionado]);

  const abrirNova = () => setModalState({ open: true, consulta: null, pacienteInicialId: null });
  const abrirEdit = (consulta) => setModalState({ open: true, consulta, pacienteInicialId: null });
  const fechar = () => setModalState({ open: false, consulta: null, pacienteInicialId: null });

  // Fluxo do cadastro rápido: fecha o modal de cadastro, mostra o convite e
  // emenda direto no agendamento com a paciente já escolhida.
  // O await em carregarPacientes() é obrigatório: o select do ConsultaModal lê
  // de `pacientes`, e montar o modal antes da lista chegar deixaria o campo em
  // branco (value sem <option> correspondente).
  async function pacienteCriada({ paciente, pendente, avisoPendente }) {
    setNovaPacienteOpen(false);
    setConvite({ paciente, pendente, avisoPendente });
    await carregarPacientes();
    setModalState({ open: true, consulta: null, pacienteInicialId: paciente.id });
  }

  return (
    <>
      <div className="page-title">Agenda</div>
      <div className="page-sub">
        {consultas === undefined ? 'Carregando…' : (
          <>
            {`${futuras.length} consulta${futuras.length === 1 ? '' : 's'} agendada${futuras.length === 1 ? '' : 's'}`}
            {aConfirmar > 0 && (
              <span style={{ color: 'var(--orange)' }}> · {aConfirmar} a confirmar</span>
            )}
          </>
        )}
      </div>

      {convite && (
        <FaixaConvite
          convite={convite}
          nutriId={user.id}
          onDispensar={() => setConvite(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button className="btn-outline" onClick={() => setNovaPacienteOpen(true)}>
          <i className="ti ti-user-plus" style={{ fontSize: 15 }} aria-hidden="true"></i> Nova paciente
        </button>
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
            <button className="btn" onClick={() => setNovaPacienteOpen(true)}
              style={{ marginTop: 8, fontSize: 12 }}>
              <i className="ti ti-user-plus" style={{ fontSize: 14 }} aria-hidden="true"></i> Nova paciente
            </button>
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

      {erroLembretesFetch && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {erroLembretesFetch}
        </div>
      )}

      {lembretes.length > 0 && (
        <PainelLembretes
          lembretes={lembretesPendentes}
          confirmadas={confirmadasOcultas}
          locais={locais}
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
            <ConsultaRow key={c.id} c={c} isLast={i === consultasDoDia.length - 1} onClick={() => abrirEdit(c)}
              onToggleConfirmada={toggleConfirmada} />
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
                  <ConsultaRow key={c.id} c={c} isLast={i === futuras.length - 1} onClick={() => abrirEdit(c)}
                    onToggleConfirmada={toggleConfirmada} />
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
          locais={locais}
          nutriId={user.id}
          pacienteInicialId={modalState.pacienteInicialId}
          onClose={fechar}
          onSaved={async () => { fechar(); await carregar(); }}
          onToggleConfirmada={toggleConfirmada}
        />
      )}

      {novaPacienteOpen && (
        <NovaPacienteRapida
          nutriId={user.id}
          onClose={() => setNovaPacienteOpen(false)}
          onCriada={pacienteCriada}
        />
      )}
    </>
  );
}

/* ============================================================
   FAIXA DE CONVITE (paciente recém-criada pelo cadastro rápido)
   ============================================================ */
function FaixaConvite({ convite, nutriId, onDispensar }) {
  const [copiado, setCopiado] = useState(false);
  const { paciente, pendente, avisoPendente } = convite;
  const primeiroNome = paciente?.nome?.split(' ')[0] ?? '';
  const link = pendente ? linkConvite(nutriId, pendente) : null;
  const msg  = pendente ? mensagemConviteEncoded(nutriId, pendente) : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      prompt('Copie o link abaixo:', link);   // fallback sem permissão (mobile)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 14px', marginBottom: 12, borderRadius: 10,
      background: 'var(--green-bg, #ecfdf5)',
      border: '0.5px solid var(--green, #10b981)',
      borderLeft: '3px solid var(--green, #10b981)',
    }}>
      <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--green)' }} aria-hidden="true"></i>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
          {primeiroNome} cadastrada
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {pendente
            ? 'Envie o link de primeiro acesso — ela só precisa criar a senha.'
            : 'Cadastro criado.'}
        </div>
        {avisoPendente && (
          <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 3, lineHeight: 1.45 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 12 }} aria-hidden="true"></i>{' '}
            {avisoPendente}
          </div>
        )}
      </div>

      {pendente && (
        <>
          <button className="btn-outline" onClick={copiar}
            style={{ fontSize: 11, padding: '4px 10px' }}>
            <i className={`ti ti-${copiado ? 'check' : 'copy'}`} aria-hidden="true"></i>
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <a className="btn-outline"
            href={telefoneValido(pendente.telefone)
              ? `https://wa.me/${normalizarTelefone(pendente.telefone)}?text=${msg}`
              : `https://wa.me/?text=${msg}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>
            <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
            {!telefoneValido(pendente.telefone) && (
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>sem número</span>
            )}
          </a>
        </>
      )}

      <button onClick={onDispensar} title="Dispensar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: 'var(--text3)', padding: 0,
        }}>
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  );
}

/* ============================================================
   PAINEL DE LEMBRETES DA SEMANA
   ============================================================ */
function PainelLembretes({ lembretes, confirmadas = 0, locais, enviadosLocais, onEnviar, onDesfazer }) {
  const [copiadoId, setCopiadoId] = useState(null);

  async function copiarMensagem(id, texto) {
    try { await navigator.clipboard.writeText(texto); }
    catch { alert(texto); } // fallback caso sem permissão (mobile)
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  }

  const [verEnviados, setVerEnviados] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const foiEnviado = l =>
    !!enviadosLocais.get(l.id) || !!l.lembrete_enviado_em || !!l.lembrete_enviado;

  const pendentesList = lembretes.filter(l => !foiEnviado(l));
  const enviadosList  = lembretes.filter(foiEnviado);
  const pendentes = pendentesList.length;

  const visiveis = verTodos ? pendentesList : pendentesList.slice(0, LIMITE_PENDENTES);
  const ocultos = pendentes - visiveis.length;

  // Separadores no fuso da clínica, não no do navegador: assim "Hoje" nunca
  // discorda da data impressa dentro do próprio cartão.
  const chaveDia = d => d.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA });
  const agora = new Date();
  const chaveHoje = chaveDia(agora);
  const chaveAmanha = chaveDia(new Date(agora.getTime() + 24 * 3600 * 1000));
  function rotuloDoDia(dt) {
    const k = chaveDia(dt);
    if (k === chaveHoje) return 'Hoje';
    if (k === chaveAmanha) return 'Amanhã';
    const s = dt.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Uma lista só, com marcadores, para o cartão do lembrete não precisar ser
  // duplicado entre a seção de pendentes e a de enviados.
  const itens = [];
  let ultimoRotulo = null;
  for (const l of visiveis) {
    const r = rotuloDoDia(new Date(l.data_hora));
    if (r !== ultimoRotulo) { itens.push({ tipo: 'sep', chave: 'sep-' + r, label: r }); ultimoRotulo = r; }
    itens.push({ tipo: 'card', chave: l.id, l });
  }
  if (ocultos > 0) itens.push({ tipo: 'mais', chave: 'mais' });
  if (enviadosList.length > 0) {
    itens.push({ tipo: 'toggle', chave: 'toggle' });
    if (verEnviados) for (const l of enviadosList) itens.push({ tipo: 'card', chave: l.id, l });
  }

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
            Lembretes da semana
          </div>
          <div style={{ fontSize: 11, color: 'var(--orange)', opacity: 0.85 }}>
            {pendentes === 0 ? 'Nada pendente ✓' : `${pendentes} pendente${pendentes > 1 ? 's' : ''} · próximos 7 dias`}
            {confirmadas > 0 && ` · ${confirmadas} confirmada${confirmadas > 1 ? 's' : ''} oculta${confirmadas > 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--orange)', opacity: 0.85, padding: '4px 2px' }}>
            Nenhum lembrete pendente nos próximos 7 dias.
          </div>
        )}
        {itens.map(it => {
          if (it.tipo === 'sep') return (
            <div key={it.chave} style={{
              fontSize: 11, fontWeight: 600, color: 'var(--orange)',
              opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.4,
              padding: '4px 2px 0',
            }}>{it.label}</div>
          );
          if (it.tipo === 'mais') return (
            <button key={it.chave} className="btn-outline" onClick={() => setVerTodos(true)}
              style={{ fontSize: 12, minHeight: 38, justifyContent: 'center' }}>
              Mostrar mais {ocultos}
            </button>
          );
          if (it.tipo === 'toggle') return (
            <button key={it.chave} className="btn-outline" onClick={() => setVerEnviados(v => !v)}
              style={{ fontSize: 12, minHeight: 38, justifyContent: 'center', color: 'var(--text3)' }}>
              <i className={`ti ti-chevron-${verEnviados ? 'up' : 'down'}`} aria-hidden="true" />
              {verEnviados ? 'Ocultar enviados' : `Ver ${enviadosList.length} já enviado${enviadosList.length > 1 ? 's' : ''}`}
            </button>
          );
          const l = it.l;
          const dt = new Date(l.data_hora);
          const horaConsulta = horaConsultaBR(l.data_hora);
          const dataFormatada = dt.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA, day: '2-digit', month: '2-digit' });
          const diaSemana = dt.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA, weekday: 'long' });
          const pacNome = l.paciente?.nome ?? '';
          const temTelefone = !!(l.paciente?.telefone?.trim());
          const telFormatado = temTelefone ? normalizarTelefone(l.paciente.telefone) : '';

          // Os quatro buracos possíveis colapsam num só teste: local_id nulo,
          // local apagado, endereço vazio e `locais` ainda não carregada dão
          // todos endereco = ''. O nome do local serve de endereço quando o
          // cadastro dele está incompleto.
          const local = l.local_id ? (locais ?? []).find(x => x.id === l.local_id) : null;
          const endereco = local?.endereco?.trim() || local?.nome?.trim() || '';
          const enderecoOk = l.modalidade !== 'presencial' || !!endereco;

          const msgTexto = templateLembrete({
            modalidade: l.modalidade,
            nome: pacNome.split(' ')[0],
            data: dataFormatada,
            diaSemana,
            hora: horaConsulta,
            endereco,
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
                {!enderecoOk ? (
                  // Sem endereço o texto do presencial sai incompleto, então
                  // não se oferece nem enviar nem copiar — só o aviso.
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--orange)', fontStyle: 'italic',
                  }}>
                    <i className="ti ti-alert-triangle" aria-hidden="true" /> Sem endereço — escolha o local na consulta
                  </div>
                ) : !enviado ? (
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

                {enderecoOk && (
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
                )}

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
                  }} title={`${horaConsultaBR(c.data_hora)} · ${c.paciente?.nome}`} />
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
function ConsultaRow({ c, isLast, isPast, isCanceled, onClick, onToggleConfirmada }) {
  const cor = tipoColor(c.tipo);
  const emBreve = !isPast && !isCanceled && consultaEmBreve(c.data_hora);
  const link = linkCall(c);
  const confirmavel = podeConfirmar(c) && typeof onToggleConfirmada === 'function';
  const confirmada = !!c.confirmada_em;
  const mod = modalidadeInfo(c.modalidade);

  function abrirCall(e) {
    e.stopPropagation();
    if (link) window.open(link, '_blank', 'noopener');
  }

  // stopPropagation obrigatório: o wrapper da linha tem onClick que abre o
  // modal — sem isso, cada marcação abriria o modal por cima.
  function alternarConfirmada(e) {
    e.stopPropagation();
    onToggleConfirmada(c.id, !confirmada);
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
        // Faixa laranja à esquerda = falta confirmar. Transparente nos outros
        // casos para o conteúdo não deslocar 3px entre linhas.
        borderLeft: `3px solid ${confirmavel && !confirmada ? 'var(--orange)' : 'transparent'}`,
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
        <div style={{
          fontSize: 12, color: 'var(--text3)', marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span>
            {c.data_hora ? dataConsultaBR(c.data_hora) : 'A definir'} · {c.duracao_min}min
            {isPast && c.status === 'agendada' && ' · sem status'}
            {c.status === 'realizada' && ' · ✓ realizada'}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap',
            background: 'var(--bg2)', color: 'var(--text2)',
            fontSize: 11, fontWeight: 500,
          }}>
            <i className={`ti ${mod.icone}`} aria-hidden="true" style={{ fontSize: 12 }} /> {mod.label}
          </span>
        </div>
        {confirmavel && (
          <button
            onClick={alternarConfirmada}
            title={confirmada
              ? 'Confirmada — toque para desmarcar'
              : 'Marcar como confirmada (a paciente avisou pelo WhatsApp)'}
            style={{
              marginTop: 6, minHeight: 30, padding: '0 11px',
              borderRadius: 20, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: confirmada ? '#dcfce7' : 'var(--orange-bg)',
              color:      confirmada ? '#15803d' : 'var(--orange)',
              border: `1px solid ${confirmada ? '#bbf7d0' : 'var(--orange)'}`,
            }}>
            {confirmada
              ? <><i className="ti ti-check" aria-hidden="true" /> Confirmada</>
              : 'Marcar confirmada'}
          </button>
        )}
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
// Destaque nos campos Data e Horário enquanto a remarcação está em curso.
const destaqueRemarcacao = {
  borderColor: 'var(--orange)',
  boxShadow: '0 0 0 2px var(--orange-bg)',
};

function ConsultaModal({ consulta, pacientes, locais, nutriId, pacienteInicialId, onClose, onSaved, onToggleConfirmada }) {
  const isEdit = !!consulta;
  const navigate = useNavigate();

  // Paciente de partida ao CRIAR: a recém-cadastrada pelo fluxo rápido da
  // Agenda, quando houver; senão a primeira da lista, como sempre foi.
  const pacienteInicial = pacientes.find(p => p.id === pacienteInicialId) ?? pacientes[0];
  const modalidadeInicial = modalidadeDaPaciente(pacienteInicial?.modalidade);

  const initial = consulta
    ? {
        pacienteId: consulta.paciente?.id ?? '',
        data: consulta.data_hora?.slice(0, 10) ?? '',
        hora: consulta.data_hora ? new Date(consulta.data_hora).toTimeString().slice(0, 5) : HORARIO_CONSULTA_PADRAO,
        duracao: consulta.duracao_min ?? 45,
        tipo: consulta.tipo ?? 'primeira',
        modalidade: consulta.modalidade ?? 'online',
        localId: consulta.local_id ?? '',
        status: consulta.status ?? 'agendada',
        obs: consulta.obs ?? '',
        meetLink: consulta.meet_link ?? '',
        linksExtras: Array.isArray(consulta.links_extras) ? consulta.links_extras : [],
      }
    : { pacienteId: pacienteInicial?.id ?? '', data: '', hora: HORARIO_CONSULTA_PADRAO, duracao: 45, tipo: 'primeira', modalidade: modalidadeInicial, localId: modalidadeInicial === 'presencial' ? localPadrao(locais) : '', status: 'agendada', obs: '', meetLink: '', linksExtras: [] };

  const [pacienteId, setPacienteId] = useState(initial.pacienteId);
  const [data, setData] = useState(initial.data);
  const [hora, setHora] = useState(initial.hora);
  const [duracao, setDuracao] = useState(initial.duracao);
  const [tipo, setTipo] = useState(initial.tipo);
  const [modalidade, setModalidade] = useState(initial.modalidade);
  const [localId, setLocalId] = useState(initial.localId);
  const [status, setStatus] = useState(initial.status);
  const [obs, setObs] = useState(initial.obs);
  const [meetLink, setMeetLink] = useState(initial.meetLink);
  const [linksExtras, setLinksExtras] = useState(initial.linksExtras);
  const [lembreteAtivo, setLembreteAtivo] = useState(consulta?.lembrete_ativo ?? true);
  const [confirmada, setConfirmada] = useState(!!consulta?.confirmada_em);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [remarcando, setRemarcando] = useState(false);
  const campoDataRef = useRef(null);

  // Remarcar não tem lógica própria: trocar data/horário e salvar já dispara o
  // trigger que zera a confirmação. O botão só dá nome e caminho para isso —
  // leva a nutri até os campos e explica o que vai acontecer ao salvar.
  function iniciarRemarcacao() {
    setRemarcando(true);
    campoDataRef.current?.focus({ preventScroll: true });
    campoDataRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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

  // Troca de paciente no dropdown: além do id, re-sugere a modalidade a partir
  // do perfil dela. Só ao CRIAR — em edição o select fica desabilitado e o que
  // vale é o que já está salvo na consulta. A primeira sugestão vem do initial.
  function trocarPaciente(novoId) {
    setPacienteId(novoId);
    if (isEdit) return;
    const p = pacientes.find(x => x.id === novoId);
    trocarModalidade(modalidadeDaPaciente(p?.modalidade));
  }

  // Online não tem local: zera o state para não gravar lixo (e não esbarrar em
  // consultas_local_modalidade_check). Voltando para presencial, recupera o que
  // já estava escolhido; se nada estava, tenta o local único.
  function trocarModalidade(nova) {
    setModalidade(nova);
    setLocalId(nova === 'presencial' ? (localId || localPadrao(locais)) : '');
  }

  // Ativos, mais o local já salvo nesta consulta mesmo se aposentado — sem ele
  // o select abriria vazio e o save silenciosamente trocaria o local.
  const locaisDisponiveis = (locais ?? []).filter(l => l.ativo || l.id === localId);
  const localEscolhido = (locais ?? []).find(l => l.id === localId) ?? null;

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
    // Presencial com local escolhido leva o endereço para o campo "Onde" do
    // Google Agenda; o resto cai no rótulo da modalidade.
    local: (modalidade === 'presencial' && localEscolhido?.endereco) || modalidadeInfo(modalidade).label,
  }) : null;

  async function salvar() {
    setErro(null);
    if (!pacienteId || !data || !hora) {
      setErro('Preencha paciente, data e horário.');
      return;
    }
    if (!horaConsultaValida(hora)) {
      setErro('O horário deve ser um dos valores entre 08:00 e 18:00 (de 30 em 30 min).');
      return;
    }
    if (modalidade === 'presencial' && !localId) {
      setErro(locaisDisponiveis.length === 0
        ? 'Nenhum local de atendimento cadastrado — não dá para salvar como presencial.'
        : 'Escolha o local da consulta presencial.');
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
        modalidade,
        // Nunca manda local em consulta online — o check do banco recusaria.
        local_id: modalidade === 'presencial' ? (localId || null) : null,
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
        <select value={pacienteId} onChange={e => trocarPaciente(e.target.value)} disabled={isEdit}>
          {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="form-lbl">Tipo</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {remarcando && (
          <div style={{
            background: 'var(--orange-bg)', color: 'var(--orange)',
            padding: '8px 10px', borderRadius: 6, fontSize: 12,
            marginTop: 14, lineHeight: 1.5,
          }}>
            <i className="ti ti-calendar-event" aria-hidden="true"></i>{' '}
            <strong>Escolha a nova data e o horário abaixo, depois clique em “Salvar remarcação”.</strong>
            {' '}A confirmação de presença será zerada e um novo lembrete será enviado.
          </div>
        )}

        <label className="form-lbl">Data</label>
        <DateInput ref={campoDataRef} value={data} onChange={e => setData(e.target.value)}
          style={remarcando ? destaqueRemarcacao : undefined} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="form-lbl" style={{ marginTop: 10 }}>Horário</label>
            <select value={hora} onChange={e => setHora(e.target.value)}
              style={remarcando ? destaqueRemarcacao : undefined}>
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

        <label className="form-lbl">Modalidade</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {MODALIDADES_CONSULTA.map(m => {
            const ativa = modalidade === m.value;
            return (
              <button key={m.value} type="button" onClick={() => trocarModalidade(m.value)}
                aria-pressed={ativa}
                style={{
                  flex: 1, minHeight: 38, borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13,
                  fontWeight: ativa ? 600 : 400,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: ativa ? 'var(--green)' : 'var(--white)',
                  color:      ativa ? 'var(--white)' : 'var(--text2)',
                  border: `1px solid ${ativa ? 'var(--green)' : 'var(--border)'}`,
                }}>
                <i className={`ti ${m.icone}`} aria-hidden="true" /> {m.label}
              </button>
            );
          })}
        </div>

        {modalidade === 'presencial' && (
          <>
            <label className="form-lbl">Local</label>
            {locaisDisponiveis.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Nenhum local cadastrado ainda.
              </div>
            ) : (
              <>
                <select value={localId} onChange={e => setLocalId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {locaisDisponiveis.map(l => (
                    <option key={l.id} value={l.id}>{l.ativo ? l.nome : `${l.nome} (inativo)`}</option>
                  ))}
                </select>
                {localEscolhido && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    {localEscolhido.endereco}
                  </div>
                )}
              </>
            )}
          </>
        )}

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

        {/* Confirmação: grava na hora, por UPDATE próprio — NÃO entra no payload
            do salvar(), que sobrescreveria a coluna com um state velho. */}
        {isEdit && podeConfirmar({ ...consulta, status }) && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmada}
                onChange={e => {
                  setConfirmada(e.target.checked);
                  onToggleConfirmada?.(consulta.id, e.target.checked);
                }} />
              Presença confirmada pela paciente
            </label>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
              Salva na hora, sem precisar clicar em salvar. Remarcar limpa a confirmação.
            </div>
          </>
        )}

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
          {/* "Fechar", e não "Cancelar": logo abaixo existe um botão vermelho
              que cancela a consulta com a paciente — dois "Cancelar" a poucos
              pixels um do outro, com sentidos opostos. */}
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            <i className="ti ti-x" aria-hidden="true"></i> Fechar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
            onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : (remarcando ? 'Salvar remarcação' : (isEdit ? 'Salvar alterações' : 'Agendar'))}
          </button>
        </div>

        {/* Navegação, não ação — cor neutra pra não competir com os botões
            semânticos abaixo. Lê de consulta.paciente.id, e não do select:
            se a nutri trocou a paciente sem salvar, o perfil certo ainda é
            o da paciente gravada na consulta. */}
        {isEdit && consulta.paciente?.id && (
          <button
            type="button"
            onClick={() => { onClose(); navigate(`/nutri/pacientes/${consulta.paciente.id}`); }}
            style={{
              marginTop: 14, width: '100%', padding: '10px 14px',
              background: 'transparent', color: 'var(--text2)',
              border: '0.5px solid var(--border)', borderRadius: 6,
              fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className="ti ti-user" aria-hidden="true"></i> Ver perfil da paciente
          </button>
        )}

        {/* Remarcar já era possível — bastava trocar data/horário e salvar.
            O botão só torna isso visível e nomeado. */}
        {isEdit && consulta.status === 'agendada' && (
          <button
            type="button"
            onClick={iniciarRemarcacao}
            style={{
              marginTop: 14, width: '100%', padding: '10px 14px',
              background: 'transparent', color: 'var(--orange)',
              border: '0.5px solid var(--orange)', borderRadius: 6,
              fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className="ti ti-calendar-event" aria-hidden="true"></i> Remarcar consulta
          </button>
        )}

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
