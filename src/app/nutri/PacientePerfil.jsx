import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import {
  dataBR, iniciais,
  validarPlano, validarLista, contarItensLista,
} from '../../lib/utils.js';
import { TEMPLATE_PADRAO } from '../../lib/checkinDefault.js';
import { callAnthropic } from '../../lib/anthropic.js';
import { kcalDoAlimento, kcalEquivalente } from '../../lib/taco.js';
import DateInput from '../../components/DateInput.jsx';
import CheckinForm from '../../components/CheckinForm.jsx';
const Evolucao             = lazy(() => import('./_Evolucao.jsx'));
const FollowUp             = lazy(() => import('./_FollowUp.jsx'));
const Suplementacao        = lazy(() => import('./_Suplementacao.jsx'));
const Habitos              = lazy(() => import('./_Habitos.jsx'));
const Anamnese             = lazy(() => import('./_Anamnese.jsx'));
const TratamentoOncologico = lazy(() => import('./_TratamentoOncologico.jsx'));
const RelatorioEvolucao    = lazy(() => import('./_RelatorioEvolucao.jsx'));
const Emagrecimento        = lazy(() => import('./_Emagrecimento.jsx'));
const Calculos             = lazy(() => import('./_Calculos.jsx'));
const AnalisarAvaliacao    = lazy(() => import('./_AnalisarAvaliacao.jsx'));
const Treinos              = lazy(() => import('./_Treinos.jsx'));
import DicaJSON from '../../components/DicaJSON.jsx';
import PlanoView from '../../components/PlanoView.jsx';

export default function PacientePerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [paciente, setPaciente] = useState(null);
  const [tab, setTab] = useState('plano');
  const [calculosImportados, setCalculosImportados] = useState(null);
  const [editandoNasc, setEditandoNasc] = useState(false);
  const [novoNasc, setNovoNasc] = useState('');
  const [salvandoNasc, setSalvandoNasc] = useState(false);
  const [editandoCampo, setEditandoCampo] = useState(null);
  const [novoCampo, setNovoCampo] = useState('');
  const [salvandoCampo, setSalvandoCampo] = useState(false);
  const [arquivarOpen, setArquivarOpen] = useState(false);
  const [editarDadosOpen, setEditarDadosOpen] = useState(false);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [consultaAtiva, setConsultaAtiva] = useState(undefined);
  const [busyConsulta, setBusyConsulta] = useState(false);

  function labelTipoConsulta(tipo) {
    if (!tipo) return 'Consulta';
    if (tipo === 'primeira') return '1ª consulta';
    if (tipo === 'avaliacao') return 'Avaliação';
    if (tipo === 'retorno') return 'Retorno';
    const m = tipo.match(/^consulta_(\d+)$/);
    return m ? `Consulta ${m[1]}` : tipo;
  }

  async function iniciarConsulta() {
    if (!consultaAtiva || busyConsulta) return;
    setBusyConsulta(true);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('consultas')
      .update({ iniciada_em: agora })
      .eq('id', consultaAtiva.id);
    setBusyConsulta(false);
    if (error) { alert('Erro ao iniciar: ' + error.message); return; }
    setConsultaAtiva(c => c ? { ...c, iniciada_em: agora } : c);
  }

  async function encerrarConsulta() {
    if (!consultaAtiva || busyConsulta) return;
    setBusyConsulta(true);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('consultas')
      .update({ status: 'realizada', encerrada_em: agora })
      .eq('id', consultaAtiva.id);
    setBusyConsulta(false);
    if (error) { alert('Erro ao encerrar: ' + error.message); return; }
    setConsultaAtiva(c => c ? { ...c, status: 'realizada', encerrada_em: agora } : c);
  }

  async function carregar() {
    const { data } = await supabase
      .from('pacientes').select('*').eq('id', id).maybeSingle();
    setPaciente(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from('pacientes').select('*').eq('id', id).maybeSingle();
      if (!active) return;
      setPaciente(data);
    }
    load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    async function loadConsulta() {
      // Mostra a primeira consulta de hoje em diante (agendada ou recém-finalizada)
      const hoje0 = new Date();
      hoje0.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('consultas')
        .select('id, data_hora, tipo, status, duracao_min, iniciada_em, encerrada_em')
        .eq('paciente_id', id)
        .eq('nutri_id', user.id)
        .neq('status', 'cancelada')
        .gte('data_hora', hoje0.toISOString())
        .order('data_hora', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (active) setConsultaAtiva(data ?? null);
    }
    loadConsulta();
    return () => { active = false; };
  }, [id, user?.id]);

  async function enviarRedefinicaoSenha() {
    if (!paciente?.email) return;
    const ok = window.confirm(
      `Enviar email de redefinição de senha para ${paciente.email}?\n\n` +
      `A paciente vai receber um link válido por 1 hora pra criar uma nova senha. ` +
      `Você não precisa fazer mais nada.`
    );
    if (!ok) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(paciente.email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) {
        if (/rate limit/i.test(error.message)) {
          alert('Limite de emails atingido (3/hora no plano grátis do Supabase). Tente de novo daqui a pouco ou configure SMTP próprio em Project Settings → Authentication → SMTP.');
        } else {
          alert('Erro ao enviar: ' + error.message);
        }
        return;
      }
      alert(`✅ Email enviado pra ${paciente.email}!\n\nPede pra paciente verificar a caixa de entrada (e o spam). O link funciona por 1 hora.`);
    } catch (err) {
      alert('Erro inesperado: ' + (err?.message || 'tente de novo'));
    }
  }

  async function salvarCampo() {
    setSalvandoCampo(true);
    try {
      const { error } = await supabase.from('pacientes')
        .update({ [editandoCampo]: novoCampo || null }).eq('id', id);
      if (error) throw error;
      setEditandoCampo(null);
      carregar();
    } catch (err) {
      alert('Erro: ' + (err?.message || 'tente novamente'));
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function salvarNascimento() {
    setSalvandoNasc(true);
    try {
      const { error } = await supabase.from('pacientes')
        .update({ nascimento: novoNasc || null }).eq('id', id);
      if (error) throw error;
      setEditandoNasc(false);
      carregar();
    } catch (err) {
      alert('Erro: ' + (err?.message || 'tente novamente'));
    } finally {
      setSalvandoNasc(false);
    }
  }

  function calcularIdade(iso) {
    if (!iso) return null;
    const n = new Date(iso + 'T12:00:00');
    const h = new Date();
    let idade = h.getFullYear() - n.getFullYear();
    const m = h.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < n.getDate())) idade--;
    return idade;
  }

  if (paciente === null) {
    return (
      <div className="card empty-card">
        <div className="empty-sub">Carregando…</div>
      </div>
    );
  }

  if (!paciente) {
    return (
      <>
        <div className="page-title">Paciente não encontrada</div>
        <div className="card empty-card">
          <div className="empty-sub">Talvez tenha sido removida ou o link esteja desatualizado.</div>
          <button className="btn" onClick={() => navigate('/nutri/pacientes')}>Voltar à lista</button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => navigate('/nutri/pacientes')}
        style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <i className="ti ti-arrow-left" aria-hidden="true"></i> Pacientes
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--amber)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 600, color: 'var(--dark)',
        }}>{iniciais(paciente.nome)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
            <div className="page-title" style={{ margin: 0 }}>{paciente.nome}</div>
            <button
              onClick={() => setEditarDadosOpen(true)}
              style={{
                background: 'none', border: '0.5px solid var(--border)',
                borderRadius: 6, padding: '3px 9px', fontSize: 11,
                color: 'var(--text3)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <i className="ti ti-pencil" style={{ fontSize: 12 }} aria-hidden="true" />
              Editar dados
            </button>
          </div>
          <div className="page-sub" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{paciente.email} · cadastrada em {dataBR(paciente.created_at)}</span>
            <button onClick={enviarRedefinicaoSenha}
              title="Envia um email pra paciente com link de redefinição de senha"
              style={{
                background: 'transparent', border: '0.5px solid var(--border)',
                borderRadius: 6, padding: '3px 9px', fontSize: 11,
                color: 'var(--gold-deep)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <i className="ti ti-key" aria-hidden="true" style={{ fontSize: 13 }}></i>
              Enviar redefinição de senha
            </button>
          </div>
          {editandoNasc ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <DateInput value={novoNasc} onChange={e => setNovoNasc(e.target.value)}
                style={{
                  padding: '4px 8px', fontSize: 12, margin: 0,
                  border: '0.5px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--font-sans)',
                }} />
              <button onClick={salvarNascimento} disabled={salvandoNasc}
                style={{
                  background: 'var(--dark)', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                }}>{salvandoNasc ? '…' : 'Salvar'}</button>
              <button onClick={() => setEditandoNasc(false)} style={{
                background: 'none', border: '0.5px solid var(--border)',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}>Cancelar</button>
            </div>
          ) : paciente.nascimento ? (
            <button onClick={() => { setNovoNasc(paciente.nascimento); setEditandoNasc(true); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--text3)', padding: 0,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-sans)',
              }}>
              🎂 {dataBR(paciente.nascimento)}
              {(() => {
                const i = calcularIdade(paciente.nascimento);
                return i !== null ? ` · ${i} anos` : '';
              })()}
              <i className="ti ti-edit" style={{ fontSize: 12, marginLeft: 4, opacity: .6 }} aria-hidden="true"></i>
            </button>
          ) : (
            <button onClick={() => { setNovoNasc(''); setEditandoNasc(true); }}
              style={{
                background: 'none', border: '0.5px dashed var(--border)',
                borderRadius: 6, padding: '3px 10px', fontSize: 11,
                color: 'var(--text3)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              + Adicionar data de nascimento
            </button>
          )}
        </div>
      </div>

      <div className="g3">
        {[
          {
            campo: 'objetivo',
            label: 'Objetivo',
            valor: paciente.objetivo,
            tipo: 'select',
            opcoes: ['Emagrecimento', 'Hipertrofia', 'Reeducação alimentar', 'Saúde geral', 'Performance esportiva', 'Oncologia', 'Outro'],
          },
          {
            campo: 'tipo_plano',
            label: 'Tipo de plano',
            valor: paciente.tipo_plano,
            tipo: 'text',
            opcoes: ['Avulsa', 'Essentia'],
          },
          {
            campo: 'modalidade',
            label: 'Modalidade',
            valor: paciente.modalidade,
            tipo: 'select',
            opcoes: ['Online', 'Presencial', 'Híbrido'],
          },
        ].map(({ campo, label, valor, tipo, opcoes }) => (
          <div key={campo} className="stat">
            <div className="stat-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span>{label}</span>
              {editandoCampo !== campo && (
                <button
                  onClick={() => { setEditandoCampo(campo); setNovoCampo(valor ?? ''); }}
                  title={`Editar ${label.toLowerCase()}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, fontSize: 12, lineHeight: 1 }}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
              )}
            </div>
            {editandoCampo === campo ? (
              <div style={{ marginTop: 6 }}>
                {tipo === 'select' ? (
                  <select value={novoCampo} onChange={e => setNovoCampo(e.target.value)}
                    style={{ fontSize: 13, padding: '4px 6px', width: '100%', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                    {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      list={`list-${campo}`}
                      value={novoCampo}
                      onChange={e => setNovoCampo(e.target.value)}
                      style={{ fontSize: 13, padding: '4px 6px', width: '100%', marginBottom: 6, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                    />
                    <datalist id={`list-${campo}`}>
                      {opcoes.map(o => <option key={o} value={o} />)}
                    </datalist>
                  </>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={salvarCampo} disabled={salvandoCampo}
                    style={{ background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', flex: 1, fontFamily: 'var(--font-sans)' }}>
                    {salvandoCampo ? '…' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditandoCampo(null)}
                    style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="stat-val" style={{ fontSize: 18 }}>{valor ?? '—'}</div>
            )}
          </div>
        ))}
      </div>

      {/* Banner de status arquivado */}
      {paciente.status_paciente === 'finalizado' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: '#f5f5f5', border: '0.5px solid #ccc',
        }}>
          <i className="ti ti-archive" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true" />
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            <strong>Acompanhamento finalizado</strong> — esta paciente está arquivada.
          </div>
        </div>
      )}
      {paciente.status_paciente === 'obito' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: '#f5eeff', border: '0.5px solid #9b59b6',
        }}>
          <i className="ti ti-heart-off" style={{ fontSize: 16, color: '#9b59b6' }} aria-hidden="true" />
          <div style={{ fontSize: 13, color: '#6c3483' }}>
            <strong>In memoriam</strong> — registro feito com respeito.
          </div>
        </div>
      )}

      {/* Card de consulta ativa */}
      {consultaAtiva && (() => {
        const finalizada = consultaAtiva.status === 'realizada';
        const emAndamento = !finalizada && !!consultaAtiva.iniciada_em;
        const agendada = !finalizada && !emAndamento;

        const bg     = finalizada ? '#f0fdf4' : emAndamento ? '#fff7ed' : 'var(--amber-bg, #fdf8ee)';
        const borda  = finalizada ? 'var(--green, #3a7a46)' : emAndamento ? 'var(--orange, #e67e22)' : 'var(--gold-deep, #a08456)';
        const tagCor = finalizada ? 'var(--green, #3a7a46)' : emAndamento ? 'var(--orange, #e67e22)' : 'var(--gold-deep, #a08456)';
        const tag    = finalizada ? '✓ Finalizada'
          : emAndamento ? '● Em andamento'
          : 'Próxima consulta';

        const dtFmt = new Date(consultaAtiva.data_hora);
        const dataStr = dtFmt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const horaStr = dtFmt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const iniciadaStr = consultaAtiva.iniciada_em
          ? new Date(consultaAtiva.iniciada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : null;

        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: bg,
            border: `1px solid ${borda}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase',
                fontWeight: 600, color: tagCor, marginBottom: 3,
              }}>{tag}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>
                {labelTipoConsulta(consultaAtiva.tipo)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {dataStr} às {horaStr}
                {consultaAtiva.duracao_min ? ` · ${consultaAtiva.duracao_min}min` : ''}
                {emAndamento && iniciadaStr ? ` · iniciada às ${iniciadaStr}` : ''}
              </div>
            </div>

            {finalizada ? (
              <span style={{
                background: 'var(--green, #3a7a46)', color: '#fff',
                borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <i className="ti ti-check" aria-hidden="true" /> Finalizada
              </span>
            ) : emAndamento ? (
              <button
                onClick={encerrarConsulta}
                disabled={busyConsulta}
                style={{
                  background: 'var(--orange, #e67e22)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                <i className="ti ti-player-stop" aria-hidden="true" />
                {busyConsulta ? '…' : 'Encerrar'}
              </button>
            ) : (
              <button
                onClick={iniciarConsulta}
                disabled={busyConsulta}
                style={{
                  background: 'var(--green, #3a7a46)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                <i className="ti ti-player-play" aria-hidden="true" />
                {busyConsulta ? '…' : 'Iniciar'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="tabs-scroll" style={{
        gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16,
      }}>
        {[
          { id: 'evolucao',      label: 'Evolução',      icon: 'chart-line' },
          { id: 'relatorio',     label: 'Relatório',     icon: 'report-analytics' },
          { id: 'oncologia',     label: 'Oncologia',     icon: 'dna' },
          { id: 'emagrecimento', label: 'Emagrecimento', icon: 'trending-down' },
          { id: 'calculos',      label: 'Cálculos',      icon: 'calculator' },
          { id: 'anamnese',      label: 'Anamnese',      icon: 'clipboard-text' },
          { id: 'followup',      label: 'Follow-up',     icon: 'notebook' },
          { id: 'plano',         label: 'Plano',         icon: 'salad' },
          { id: 'compras',       label: 'Compras',       icon: 'shopping-cart' },
          { id: 'suplementacao', label: 'Suplementação', icon: 'pill' },
          { id: 'habitos',       label: 'Hábitos',       icon: 'checklist' },
          { id: 'prescricoes',   label: 'Prescrições',   icon: 'file-text' },
          { id: 'ebooks',        label: 'E-books',       icon: 'book-2' },
          { id: 'avaliacao',     label: 'Avaliação',     icon: 'ruler-measure' },
          { id: 'checkin',       label: 'Check-in',      icon: 'clipboard-check' },
          { id: 'treinos',       label: 'Treinos',       icon: 'run' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: '0 0 auto',
              padding: '7px 12px', fontSize: 13, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              boxShadow: tab === t.id ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.05))' : 'none',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <i className={`ti ti-${t.icon}`} style={{ fontSize: 14 }} aria-hidden="true"></i>
            {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="card empty-card"><div className="empty-sub">Carregando…</div></div>}>
        {tab === 'evolucao'      && <Evolucao pacienteId={paciente.id} paciente={paciente} nutriId={user.id} />}
        {tab === 'relatorio'     && <RelatorioEvolucao pacienteId={paciente.id} paciente={paciente} nutriId={user.id} />}
        {tab === 'oncologia'     && <TratamentoOncologico pacienteId={paciente.id} nutriId={user.id} />}
        {tab === 'emagrecimento' && <Emagrecimento pacienteId={paciente.id} nutriId={user.id} />}
        {tab === 'anamnese'      && <Anamnese pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'followup'      && <FollowUp pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'suplementacao' && <Suplementacao pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'habitos'       && <Habitos pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'plano'         && <PublicarPlano pacienteId={paciente.id} nutriId={user.id} calculosImportados={calculosImportados} onLimparImportados={() => setCalculosImportados(null)} />}
        {tab === 'compras'       && <PublicarLista pacienteId={paciente.id} nutriId={user.id} />}
        {tab === 'prescricoes'   && <EnviarPrescricao pacienteId={paciente.id} nutriId={user.id} />}
        {tab === 'ebooks'        && <EbooksDaPaciente pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'avaliacao'     && <RegistrarAvaliacao pacienteId={paciente.id} nutriId={user.id} paciente={paciente} />}
        {tab === 'checkin'       && <CheckinPersonalizado pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
        {tab === 'calculos'      && <Calculos pacienteId={paciente.id} nutriId={user.id} paciente={paciente} onUsarNaDieta={(vals) => { setCalculosImportados(vals); setTab('plano'); }} />}
        {tab === 'treinos'       && <Treinos pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      </Suspense>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        {paciente.status_paciente === 'ativo' && (
          <button onClick={() => setArquivarOpen(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <i className="ti ti-archive" style={{ fontSize: 13 }} aria-hidden="true" />
            Arquivar paciente
          </button>
        )}
        <button onClick={() => setExcluirOpen(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          opacity: 0.7,
        }}>
          <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" />
          Excluir paciente
        </button>
      </div>

      {arquivarOpen && (
        <ModalArquivar
          paciente={paciente}
          onClose={() => setArquivarOpen(false)}
          onArquivado={() => navigate('/nutri/pacientes')}
        />
      )}

      {editarDadosOpen && (
        <ModalEditarDados
          paciente={paciente}
          onClose={() => setEditarDadosOpen(false)}
          onSaved={carregar}
        />
      )}

      {excluirOpen && (
        <ModalExcluir
          paciente={paciente}
          onClose={() => setExcluirOpen(false)}
          onExcluido={() => navigate('/nutri/pacientes')}
        />
      )}
    </>
  );
}

/* ============================================================
   MODAL EXCLUIR PACIENTE
   ============================================================ */
function ModalExcluir({ paciente, onClose, onExcluido }) {
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    setBusy(true);
    const { error } = await supabase.from('pacientes').delete().eq('id', paciente.id);
    setBusy(false);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    onExcluido();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 24,
        width: 420, maxWidth: '92vw',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <i className="ti ti-trash" style={{ fontSize: 22, color: 'var(--red)' }} aria-hidden="true" />
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 8 }}>
          Excluir paciente
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5 }}>
          Tem certeza que deseja excluir <strong>{paciente.nome}</strong>?
        </div>
        <div style={{
          fontSize: 12, color: 'var(--red)', marginBottom: 20,
          padding: '8px 12px', borderRadius: 6, background: 'var(--red-bg)',
        }}>
          Esta ação é permanente e não pode ser desfeita.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={busy}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              background: 'var(--red)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: busy ? 0.6 : 1,
            }}>
            <i className="ti ti-trash" aria-hidden="true" />
            {busy ? 'Excluindo…' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MODAL ARQUIVAR PACIENTE
   ============================================================ */
function ModalArquivar({ paciente, onClose, onArquivado }) {
  const [status, setStatus] = useState(null);
  const [confirmObito, setConfirmObito] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    if (!status) return;
    if (status === 'obito' && !confirmObito) {
      setConfirmObito(true);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('pacientes')
      .update({ status_paciente: status }).eq('id', paciente.id);
    setBusy(false);
    if (error) { alert('Erro: ' + error.message); return; }
    onArquivado();
  }

  const OPCOES = [
    {
      value: 'finalizado',
      icon: 'ti-check',
      label: 'Acompanhamento finalizado',
      desc: 'A paciente concluiu ou encerrou o acompanhamento',
      cor: 'var(--text2)',
      bg: '#f5f5f5',
      borda: '#ccc',
    },
    {
      value: 'obito',
      icon: 'ti-heart-off',
      label: 'Paciente veio a óbito',
      desc: 'Registrar com respeito e cuidado',
      cor: '#6c3483',
      bg: '#f5eeff',
      borda: '#9b59b6',
    },
  ];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 24,
        width: 420, maxWidth: '92vw',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>
          Arquivar paciente
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
          {paciente.nome} — escolha o motivo do arquivamento
        </div>

        {confirmObito ? (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: '#f5eeff', border: '0.5px solid #9b59b6',
            fontSize: 14, color: '#6c3483', lineHeight: 1.5,
          }}>
            <strong>Tem certeza?</strong><br />
            Esta ação registra o falecimento de {paciente.nome.split(' ')[0]}.
            O perfil ficará preservado em "In memoriam".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {OPCOES.map(op => (
              <button key={op.value} onClick={() => setStatus(op.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-sans)',
                  background: status === op.value ? op.bg : 'var(--white)',
                  border: `1.5px solid ${status === op.value ? op.borda : 'var(--border)'}`,
                  transition: 'all .15s',
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: status === op.value ? op.bg : 'var(--bg2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`ti ${op.icon}`} style={{ fontSize: 18, color: status === op.value ? op.cor : 'var(--text3)' }} aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: status === op.value ? op.cor : 'var(--dark)' }}>
                    {op.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{op.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }}
            onClick={confirmObito ? () => setConfirmObito(false) : onClose}>
            {confirmObito ? '← Voltar' : 'Cancelar'}
          </button>
          <button
            onClick={confirmar}
            disabled={!status || busy}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
              cursor: status ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-sans)', opacity: status ? 1 : 0.4,
              background: status === 'obito' ? '#9b59b6' : 'var(--dark)',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className="ti ti-archive" aria-hidden="true" />
            {busy ? 'Arquivando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MODAL EDITAR DADOS DA PACIENTE
   ============================================================ */
function ModalEditarDados({ paciente, onClose, onSaved }) {
  const [form, setForm] = useState({
    nome:       paciente.nome       ?? '',
    email:      paciente.email      ?? '',
    telefone:   paciente.telefone   ?? '',
    nascimento: paciente.nascimento ?? '',
    objetivo:   paciente.objetivo   ?? '',
    tipo_plano: paciente.tipo_plano ?? '',
    modalidade: paciente.modalidade ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function salvar() {
    if (!form.nome.trim()) return setErro('Nome é obrigatório.');
    setBusy(true); setErro(null);
    try {
      const { error } = await supabase.from('pacientes').update({
        nome:       form.nome.trim()       || null,
        email:      form.email.trim()      || null,
        telefone:   form.telefone.trim()   || null,
        nascimento: form.nascimento        || null,
        objetivo:   form.objetivo          || null,
        tipo_plano: form.tipo_plano        || null,
        modalidade: form.modalidade        || null,
      }).eq('id', paciente.id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (err) {
      setErro(err?.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--white)', borderRadius: 12, padding: 24,
          width: 520, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
          border: '0.5px solid var(--border)',
        }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>
          Editar dados da paciente
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
          {paciente.nome}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <div>
            <label className="field-label">Nome completo</label>
            <input type="text" value={form.nome} onChange={set('nome')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">E-mail</label>
              <input type="email" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="field-label">Telefone</label>
              <input
                type="tel"
                inputMode="tel"
                value={form.telefone}
                onChange={set('telefone')}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Data de nascimento</label>
            <input type="date" value={form.nascimento} onChange={set('nascimento')} />
          </div>

          <div>
            <label className="field-label">Objetivo</label>
            <select value={form.objetivo} onChange={set('objetivo')}>
              <option value="">— sem objetivo definido —</option>
              {['Emagrecimento', 'Hipertrofia', 'Reeducação alimentar', 'Saúde geral', 'Performance esportiva', 'Oncologia', 'Outro'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Tipo de plano</label>
              <input
                list="modal-tipos-plano"
                value={form.tipo_plano}
                onChange={set('tipo_plano')}
                placeholder="ex: Avulsa, Essentia…"
              />
              <datalist id="modal-tipos-plano">
                {['Avulsa', 'Essentia'].map(o => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="field-label">Modalidade</label>
              <select value={form.modalidade} onChange={set('modalidade')}>
                <option value="">— selecione —</option>
                {['Online', 'Presencial', 'Híbrido'].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {erro && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 14,
            background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-outline"
            onClick={onClose}
            style={{ flex: 1, justifyContent: 'center' }}>
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={busy}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              background: 'var(--dark)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: busy ? 0.6 : 1,
            }}>
            <i className="ti ti-device-floppy" aria-hidden="true" />
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CHECK-IN — envio rápido + histórico desta paciente
   (gerenciamento de templates fica em /nutri/checkins)
   ============================================================ */
function CheckinPersonalizado({ pacienteId, nutriId, pacienteNome }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState(null);

  async function carregar() {
    const [tplRes, envRes] = await Promise.all([
      supabase.from('checkin_templates').select('*')
        .eq('nutri_id', nutriId)
        .or(`paciente_id.is.null,paciente_id.eq.${pacienteId}`)
        .order('created_at'),
      supabase.from('checkin_envios')
        .select('id, enviado_em, respondido_em, lembrete_enviado_em, perguntas, respostas')
        .eq('paciente_id', pacienteId)
        .order('enviado_em', { ascending: false })
        .limit(10),
    ]);
    setTemplates(tplRes.data ?? []);
    setEnvios(envRes.data ?? []);
    setSelecionados(new Set());
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  function toggleTemplate(id) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    setSelecionados(prev =>
      prev.size === templates.length
        ? new Set()
        : new Set(templates.map(t => t.id))
    );
  }

  async function enviar() {
    setAviso(null);
    if (selecionados.size === 0)
      return setAviso({ tipo: 'erro', msg: 'Marque ao menos um template.' });
    setBusy(true);
    const tpls = templates.filter(t => selecionados.has(t.id));
    const rows = tpls.map(t => ({
      nutri_id: nutriId,
      paciente_id: pacienteId,
      perguntas: t.perguntas,
    }));
    const { error } = await supabase.from('checkin_envios').insert(rows);
    setBusy(false);
    if (error) return setAviso({ tipo: 'erro', msg: error.message });
    const n = tpls.length;
    const nome = pacienteNome.split(' ')[0];
    setAviso({
      tipo: 'ok',
      msg: n === 1
        ? `Check-in "${tpls[0].nome}" enviado para ${nome}.`
        : `${n} check-ins enviados para ${nome}.`,
    });
    carregar();
  }

  async function reenviarLembrete(envio) {
    const { error } = await supabase
      .from('checkin_envios')
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq('id', envio.id);
    if (error) return setAviso({ tipo: 'erro', msg: error.message });
    setAviso({ tipo: 'ok', msg: 'Lembrete enviado.' });
    carregar();
  }

  const todosChecados = templates.length > 0 && selecionados.size === templates.length;
  const qtd = selecionados.size;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Enviar check-ins</div>
            <div className="card-sub">
              Marque um ou mais modelos e envie para {pacienteNome.split(' ')[0]} de uma vez.
              Templates ficam em <strong>Check-ins → Templates</strong>.
            </div>
          </div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => navigate('/nutri/checkins')}>
            <i className="ti ti-settings" aria-hidden="true"></i> Gerenciar
          </button>
        </div>
        <div className="card-body">
          {templates.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>
              Nenhum template disponível. Crie em <strong>Check-ins → Templates</strong>.
            </div>
          ) : (
            <>
              {/* Cabeçalho com "selecionar todos" */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: 'var(--text3)', cursor: 'pointer',
                  userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={todosChecados}
                    onChange={toggleTodos}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  Selecionar todos
                </label>
                {qtd > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {qtd} selecionado{qtd !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Lista de templates com checkboxes */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                marginBottom: 12,
              }}>
                {templates.map(t => {
                  const sel = selecionados.has(t.id);
                  return (
                    <label key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: sel ? 'var(--amber-bg, #fdf8ee)' : 'var(--bg2)',
                      border: `0.5px solid ${sel ? 'var(--amber, #c9a96e)' : 'var(--border)'}`,
                      transition: 'background .12s, border-color .12s',
                      userSelect: 'none',
                    }}>
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleTemplate(t.id)}
                        style={{ margin: 0, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
                          {t.nome}
                          {t.is_padrao && (
                            <span style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 400,
                              color: 'var(--text3)', background: 'var(--bg2)',
                              border: '0.5px solid var(--border)',
                              borderRadius: 4, padding: '1px 5px',
                            }}>padrão</span>
                          )}
                          {t.paciente_id === pacienteId && (
                            <span style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 400,
                              color: 'var(--gold-deep, #a08456)', background: 'var(--amber-bg, #fdf8ee)',
                              border: '0.5px solid var(--amber, #c9a96e)',
                              borderRadius: 4, padding: '1px 5px',
                            }}>personalizado</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {t.perguntas?.length ?? 0} pergunta{(t.perguntas?.length ?? 0) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {aviso && (
                <div style={{
                  marginBottom: 10,
                  background: aviso.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
                  color: aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
                  padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className={`ti ti-${aviso.tipo === 'ok' ? 'check' : 'alert-circle'}`} aria-hidden="true" />
                  {aviso.msg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={enviar} disabled={busy || qtd === 0}>
                  <i className="ti ti-send" aria-hidden="true"></i>
                  {busy
                    ? 'Enviando…'
                    : qtd === 0
                      ? 'Enviar selecionados'
                      : qtd === 1
                        ? 'Enviar 1 check-in'
                        : `Enviar ${qtd} check-ins`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-label">Últimos check-ins ({envios.length})</div>
      {envios.length === 0 ? (
        <div className="card" style={{ padding: 0, border: '0.5px dashed var(--border)', opacity: 0.65 }}>
          {[
            { q: 'Como você se sentiu essa semana?', r: '4 / 5 — Bem, tive alguns dias cansada mas consegui manter o foco.' },
            { q: 'Seguiu o plano alimentar?',         r: 'Sim, em torno de 80% das refeições.' },
            { q: 'Observações livres',                r: 'Senti menos inchaço desde que tirei o glúten.' },
          ].map((ex, i, arr) => (
            <div key={i} style={{
              padding: '11px 14px',
              borderBottom: i < arr.length - 1 ? '0.5px solid #f5f0e8' : 'none',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 3 }}>{ex.q}</div>
              <div style={{ fontSize: 13, color: 'var(--dark)' }}>{ex.r}</div>
            </div>
          ))}
          <div style={{ padding: '8px 14px 12px', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            Exemplo de resposta de check-in — envie um para começar
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {envios.map((e, i) => {
            const respondeu = !!e.respondido_em;
            const lembrado = !!e.lembrete_enviado_em;
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: i === envios.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: respondeu ? 'var(--green-bg)' : (lembrado ? 'var(--orange-bg)' : 'var(--red-bg)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <i className={`ti ti-${respondeu ? 'check' : (lembrado ? 'bell' : 'clock')}`} style={{
                    fontSize: 18,
                    color: respondeu ? 'var(--green)' : (lembrado ? 'var(--orange)' : 'var(--red)'),
                  }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {respondeu ? `Respondeu em ${dataBR(e.respondido_em)}` : (lembrado ? 'Lembrete enviado' : 'Aguardando resposta')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Enviado em {dataBR(e.enviado_em)} · {e.perguntas?.length ?? 0} perguntas
                  </div>
                </div>
                {!respondeu && !lembrado && (
                  <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--orange)', borderColor: 'var(--orange)' }}
                    onClick={() => reenviarLembrete(e)}>
                    <i className="ti ti-bell" aria-hidden="true"></i> Lembrete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================================================
   AVALIAÇÃO ANTROPOMÉTRICA
   ============================================================ */
function RegistrarAvaliacao({ pacienteId, nutriId, paciente }) {
  const [historico, setHistorico] = useState([]);
  const [form, setForm] = useState(novaAvaliacao());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [analisarOpen, setAnalisarOpen] = useState(false);
  const [importandoShaped, setImportandoShaped] = useState(false);
  const shapedRef = useRef(null);

  // PDFs de avaliação (só nutri)
  const [pdfs, setPdfs] = useState([]);
  const [uploadingPdfs, setUploadingPdfs] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState(null);
  const pdfRef = useRef(null);

  function novaAvaliacao() {
    return {
      data: new Date().toISOString().slice(0, 10),
      kg: '', altura_cm: '',
      cintura_cm: '', quadril_cm: '', abdome_cm: '',
      braco_dir_cm: '', braco_esq_cm: '', braco_cm: '',
      coxa_dir_cm: '', coxa_esq_cm: '', coxa_cm: '',
      panturrilha_cm: '',
      pgc: '', mm_kg: '', mm_pct: '', gordura_kg: '',
      hidratacao_pct: '', geb_kcal: '', get_kcal: '',
      obs: '',
    };
  }

  async function importarShaped(file) {
    setImportandoShaped(true);
    setFeedback(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const prompt = `Analise este relatório de avaliação física do Shaped e extraia APENAS os valores abaixo em JSON puro sem texto adicional:
{
  data: string (formato YYYY-MM-DD),
  peso: number,
  altura: number (em cm, converter se necessário),
  gordura_perc: number (percentual de gordura),
  gordura_kg: number (massa gorda em kg),
  massa_magra_kg: number,
  massa_magra_perc: number,
  hidratacao: number (água corporal em % — calcular: agua_litros / peso * 100),
  geb: number (gasto energético de repouso em kcal),
  get: number (se não houver, calcular geb * 1.3),
  cintura: number (cm),
  quadril: number (cm),
  abdome: number ou null,
  panturrilha: number (cm),
  braco_d: number (cm, usar valor de braço),
  braco_e: number ou null,
  coxa_d: number (cm, usar valor de coxa),
  coxa_e: number ou null,
  obs: string (incluir IMC, shaped score se houver, e classificações de risco encontradas)
}
Retorne SOMENTE o JSON.`;

      const text = await callAnthropic([
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ], { maxTokens: 1024 });

      const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
      const d = JSON.parse(cleaned);

      setForm(f => ({
        ...f,
        data:          d.data         ?? f.data,
        kg:            d.peso         != null ? String(d.peso)          : f.kg,
        altura_cm:     d.altura       != null ? String(d.altura)        : f.altura_cm,
        pgc:           d.gordura_perc != null ? String(d.gordura_perc)  : f.pgc,
        gordura_kg:    d.gordura_kg   != null ? String(d.gordura_kg)    : f.gordura_kg,
        mm_kg:         d.massa_magra_kg   != null ? String(d.massa_magra_kg)  : f.mm_kg,
        mm_pct:        d.massa_magra_perc != null ? String(d.massa_magra_perc): f.mm_pct,
        hidratacao_pct:d.hidratacao   != null ? String(d.hidratacao)    : f.hidratacao_pct,
        geb_kcal:      d.geb          != null ? String(d.geb)           : f.geb_kcal,
        get_kcal:      d.get          != null ? String(d.get)           : f.get_kcal,
        cintura_cm:    d.cintura      != null ? String(d.cintura)       : f.cintura_cm,
        quadril_cm:    d.quadril      != null ? String(d.quadril)       : f.quadril_cm,
        abdome_cm:     d.abdome       != null ? String(d.abdome)        : f.abdome_cm,
        panturrilha_cm:d.panturrilha  != null ? String(d.panturrilha)   : f.panturrilha_cm,
        braco_dir_cm:  d.braco_d      != null ? String(d.braco_d)       : f.braco_dir_cm,
        braco_esq_cm:  d.braco_e      != null ? String(d.braco_e)       : f.braco_esq_cm,
        coxa_dir_cm:   d.coxa_d       != null ? String(d.coxa_d)        : f.coxa_dir_cm,
        coxa_esq_cm:   d.coxa_e       != null ? String(d.coxa_e)        : f.coxa_esq_cm,
        obs:           d.obs          ?? f.obs,
      }));

      setFeedback({ tipo: 'ok', msg: 'Avaliação importada com sucesso! Confira os dados antes de salvar.' });
    } catch (err) {
      console.error('[importarShaped]', err);
      setFeedback({ tipo: 'erro', msg: 'Erro ao ler avaliação Shaped: ' + (err?.message ?? 'tente novamente') });
    } finally {
      setImportandoShaped(false);
      if (shapedRef.current) shapedRef.current.value = '';
    }
  }

  async function carregar() {
    const { data: av } = await supabase.from('peso_registros')
      .select('id, data, kg, altura_cm, cintura_cm, quadril_cm, abdome_cm, braco_cm, braco_dir_cm, braco_esq_cm, coxa_cm, coxa_dir_cm, coxa_esq_cm, panturrilha_cm, pgc, mm_kg, mm_pct, gordura_kg, hidratacao_pct, geb_kcal, get_kcal, obs')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });
    setHistorico(av ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function carregarPdfs() {
    const { data } = await supabase
      .from('avaliacoes_pdfs')
      .select('id, titulo, storage_path, created_at')
      .eq('paciente_id', pacienteId)
      .eq('nutri_id', nutriId)
      .order('created_at', { ascending: false });
    setPdfs(data ?? []);
  }
  useEffect(() => { carregarPdfs(); }, [pacienteId]);

  async function enviarPdfs(files) {
    setUploadingPdfs(true);
    setPdfFeedback(null);
    const arr = Array.from(files);
    let ok = 0;
    const erros = [];
    for (const file of arr) {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const titulo = file.name.replace(/\.[^.]+$/, '');
      const slug = titulo.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
      const path = `${pacienteId}/${Date.now()}-${slug}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avaliacoes_nutri')
        .upload(path, file, { contentType: 'application/pdf' });
      if (upErr) { erros.push(titulo); continue; }
      const { error: insErr } = await supabase.from('avaliacoes_pdfs').insert({
        paciente_id: pacienteId, nutri_id: nutriId, storage_path: path, titulo,
      });
      if (insErr) { erros.push(titulo); continue; }
      ok++;
    }
    setUploadingPdfs(false);
    if (pdfRef.current) pdfRef.current.value = '';
    if (ok > 0 && erros.length === 0)
      setPdfFeedback({ tipo: 'ok', msg: `${ok} PDF${ok > 1 ? 's enviados' : ' enviado'}.` });
    else if (ok > 0)
      setPdfFeedback({ tipo: 'ok', msg: `${ok} enviado(s). Erro em: ${erros.join(', ')}` });
    else
      setPdfFeedback({ tipo: 'erro', msg: `Erro ao enviar: ${erros.join(', ')}` });
    carregarPdfs();
  }

  async function abrirPdf(path) {
    const { data, error } = await supabase.storage
      .from('avaliacoes_nutri').createSignedUrl(path, 120);
    if (error) return alert('Erro ao abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function excluirPdf(pdf) {
    if (!window.confirm(`Excluir "${pdf.titulo}"?`)) return;
    await supabase.storage.from('avaliacoes_nutri').remove([pdf.storage_path]);
    await supabase.from('avaliacoes_pdfs').delete().eq('id', pdf.id);
    carregarPdfs();
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function num(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }

  function numInt(v) {
    const n = num(v);
    return n != null ? Math.round(n) : null;
  }

  async function salvar() {
    setFeedback(null);
    if (!form.data || !form.kg) {
      return setFeedback({ tipo: 'erro', msg: 'Data e peso são obrigatórios.' });
    }
    setBusy(true);
    try {
      const payload = {
        paciente_id: pacienteId,
        nutri_id: nutriId,
        data: form.data,
        kg: num(form.kg),
        altura_cm: numInt(form.altura_cm),
        cintura_cm: num(form.cintura_cm),
        quadril_cm: num(form.quadril_cm),
        abdome_cm: num(form.abdome_cm),
        braco_cm: num(form.braco_cm),
        braco_dir_cm: num(form.braco_dir_cm),
        braco_esq_cm: num(form.braco_esq_cm),
        coxa_cm: num(form.coxa_cm),
        coxa_dir_cm: num(form.coxa_dir_cm),
        coxa_esq_cm: num(form.coxa_esq_cm),
        panturrilha_cm: num(form.panturrilha_cm),
        pgc: num(form.pgc),
        mm_kg: num(form.mm_kg),
        mm_pct: num(form.mm_pct),
        gordura_kg: num(form.gordura_kg),
        hidratacao_pct: num(form.hidratacao_pct),
        geb_kcal: numInt(form.geb_kcal),
        get_kcal: numInt(form.get_kcal),
        obs: form.obs.trim() || null,
      };
      const { error } = await supabase.from('peso_registros').insert(payload);
      if (error) throw error;
      setFeedback({ tipo: 'ok', msg: 'Avaliação registrada.' });
      setForm(novaAvaliacao());
      carregar();
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err?.message || 'Erro ao salvar avaliação' });
    } finally {
      setBusy(false);
    }
  }

  async function remover(id) {
    if (!window.confirm('Remover esta avaliação?')) return;
    await supabase.from('peso_registros').delete().eq('id', id);
    carregar();
  }

  // IMC calculado em tempo real
  const imcPreview = (() => {
    const k = num(form.kg);
    const a = num(form.altura_cm);
    if (!k || !a) return null;
    return (k / Math.pow(a / 100, 2)).toFixed(1);
  })();

  return (
    <>
      {analisarOpen && (
        <Suspense fallback={null}>
          <AnalisarAvaliacao
            historico={historico}
            paciente={paciente}
            onClose={() => setAnalisarOpen(false)}
          />
        </Suspense>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nova avaliação antropométrica</div>
            <div className="card-sub">Registre peso e medidas — a paciente verá o gráfico de evolução</div>
          </div>
          {historico.length > 0 && (
            <button
              onClick={() => setAnalisarOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--dark)', color: '#fff',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                flexShrink: 0,
              }}>
              <i className="ti ti-sparkles" style={{ fontSize: 14 }} />
              Analisar com IA
            </button>
          )}
        </div>
        <div className="card-body">
          {/* Importar do Shaped */}
          <div style={{ marginBottom: 16 }}>
            <input
              ref={shapedRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) importarShaped(f); }}
            />
            <button
              type="button"
              onClick={() => shapedRef.current?.click()}
              disabled={importandoShaped}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 8,
                border: '1px dashed var(--border)',
                background: 'var(--bg2)', color: 'var(--text2)',
                fontSize: 13, cursor: importandoShaped ? 'default' : 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              {importandoShaped
                ? <><i className="ti ti-loader-2" style={{ fontSize: 15 }} aria-hidden="true" /> Lendo avaliação Shaped...</>
                : <>📄 Importar do Shaped</>
              }
            </button>
          </div>

          {/* Linha 1: Data, Peso, Altura */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Data</label>
              <DateInput value={form.data} onChange={set('data')} />
            </div>
            <div>
              <label className="field-label">Peso (kg) *</label>
              <input inputMode="decimal" placeholder="ex: 76,5" value={form.kg} onChange={set('kg')} />
            </div>
            <div>
              <label className="field-label">Altura (cm)</label>
              <input inputMode="decimal" placeholder="ex: 162" value={form.altura_cm} onChange={set('altura_cm')} />
            </div>
          </div>

          {imcPreview && (
            <div style={{
              marginTop: 8, fontSize: 13, color: 'var(--text2)',
              background: 'var(--bg2)', padding: '6px 10px', borderRadius: 6, display: 'inline-block',
            }}>
              IMC calculado: <strong>{imcPreview}</strong> kg/m²
            </div>
          )}

          {/* Circunferências */}
          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Circunferências (cm)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 8 }}>
            <div><label className="field-label">Cintura</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.cintura_cm} onChange={set('cintura_cm')} /></div>
            <div><label className="field-label">Quadril</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.quadril_cm} onChange={set('quadril_cm')} /></div>
            <div><label className="field-label">Abdome</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.abdome_cm} onChange={set('abdome_cm')} /></div>
            <div><label className="field-label">Panturrilha</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.panturrilha_cm} onChange={set('panturrilha_cm')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div><label className="field-label">Braço D</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.braco_dir_cm} onChange={set('braco_dir_cm')} /></div>
            <div><label className="field-label">Braço E</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.braco_esq_cm} onChange={set('braco_esq_cm')} /></div>
            <div><label className="field-label">Coxa D</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.coxa_dir_cm} onChange={set('coxa_dir_cm')} /></div>
            <div><label className="field-label">Coxa E</label><input type="text" inputMode="decimal" placeholder="0,0" value={form.coxa_esq_cm} onChange={set('coxa_esq_cm')} /></div>
          </div>

          {/* Composição corporal */}
          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Composição corporal</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div><label className="field-label">% gordura</label><input inputMode="decimal" placeholder="28,5" value={form.pgc} onChange={set('pgc')} /></div>
            <div><label className="field-label">Gordura (kg)</label><input inputMode="decimal" placeholder="20,0" value={form.gordura_kg} onChange={set('gordura_kg')} /></div>
            <div><label className="field-label">Massa magra (kg)</label><input inputMode="decimal" placeholder="48,2" value={form.mm_kg} onChange={set('mm_kg')} /></div>
            <div><label className="field-label">Massa magra (%)</label><input inputMode="decimal" placeholder="65,0" value={form.mm_pct} onChange={set('mm_pct')} /></div>
          </div>

          {/* Hidratação e gasto energético */}
          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Hidratação e gasto energético</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><label className="field-label">Hidratação (%)</label><input inputMode="decimal" placeholder="55,0" value={form.hidratacao_pct} onChange={set('hidratacao_pct')} /></div>
            <div><label className="field-label">GEB (kcal)</label><input inputMode="decimal" placeholder="1400" value={form.geb_kcal} onChange={set('geb_kcal')} /></div>
            <div><label className="field-label">GET (kcal)</label><input inputMode="decimal" placeholder="1800" value={form.get_kcal} onChange={set('get_kcal')} /></div>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Observação (opcional)</label>
          <textarea rows="2" value={form.obs} onChange={set('obs')}
            placeholder="Ex: avaliação após 30 dias de plano, paciente relata melhora de energia." />

          {feedback && <FeedbackInline f={feedback} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" onClick={salvar} disabled={busy || !form.kg}>
              <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Registrar avaliação'}
            </button>
          </div>
        </div>
      </div>

      {historico.length >= 2 && <GraficosEvolucao historico={historico} />}

      <div className="section-label" style={{ marginBottom: 6 }}>Histórico ({historico.length})</div>

      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma avaliação registrada ainda.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historico.map(a => (
            <div key={a.id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 500, fontSize: 13, minWidth: 80 }}>{dataBR(a.data)}</span>
                <span style={{ fontSize: 13 }}>{a.kg ? <strong>{a.kg} kg</strong> : '—'}</span>
                {a.cintura_cm && <span style={{ fontSize: 12, color: 'var(--text3)' }}>C: {a.cintura_cm}cm</span>}
                {a.quadril_cm && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Q: {a.quadril_cm}cm</span>}
                {a.pgc && <span style={{ fontSize: 12, color: 'var(--text3)' }}>GC: {a.pgc}%</span>}
                {a.mm_kg && <span style={{ fontSize: 12, color: 'var(--text3)' }}>MM: {a.mm_kg}kg</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={() => remover(a.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <i className="ti ti-trash" style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PDFs de avaliação física (só nutri) ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <i className="ti ti-lock" style={{ fontSize: 14, marginRight: 6, color: 'var(--text3)' }} aria-hidden="true" />
              PDFs de avaliação física
            </div>
            <div className="card-sub">Visível apenas para você — a paciente não tem acesso</div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => pdfRef.current?.click()}
            disabled={uploadingPdfs}
          >
            <i className="ti ti-upload" aria-hidden="true"></i>
            {uploadingPdfs ? 'Enviando…' : 'Enviar PDFs'}
          </button>
        </div>
        <div className="card-body">
          {/* Input oculto — múltiplos PDFs */}
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) enviarPdfs(e.target.files); }}
          />

          {pdfFeedback && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: pdfFeedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: `0.5px solid var(--${pdfFeedback.tipo === 'ok' ? 'green' : 'red'})`,
              color: `var(--${pdfFeedback.tipo === 'ok' ? 'green' : 'red'})`,
              fontSize: 13, fontWeight: 500,
            }}>
              <i className={`ti ti-${pdfFeedback.tipo === 'ok' ? 'check' : 'alert-circle'}`} aria-hidden="true" />
              {pdfFeedback.msg}
            </div>
          )}

          {/* Zona de upload clicável */}
          <button
            type="button"
            onClick={() => pdfRef.current?.click()}
            disabled={uploadingPdfs}
            style={{
              width: '100%', padding: '20px 16px',
              border: '1.5px dashed var(--border)', borderRadius: 10,
              background: 'var(--bg2)', cursor: uploadingPdfs ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              marginBottom: 14, fontFamily: 'var(--font-sans)',
            }}
          >
            <i className="ti ti-file-upload"
              style={{ fontSize: 28, color: 'var(--gold-deep, #a08456)' }}
              aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
              {uploadingPdfs ? 'Enviando arquivos…' : 'Clique para selecionar PDFs'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Múltiplos arquivos permitidos
            </span>
          </button>

          {/* Lista de PDFs enviados */}
          {pdfs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
              Nenhum PDF enviado ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pdfs.map(pdf => (
                <div key={pdf.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--white)', border: '0.5px solid var(--border)',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: 'var(--amber-bg, #fdf8ee)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className="ti ti-file-type-pdf"
                      style={{ fontSize: 18, color: 'var(--gold-deep, #a08456)' }}
                      aria-hidden="true" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pdf.titulo}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                      {dataBR(pdf.created_at)}
                    </div>
                  </div>
                  <button
                    className="btn-outline"
                    style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
                    onClick={() => abrirPdf(pdf.storage_path)}
                  >
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button
                    onClick={() => excluirPdf(pdf)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '4px 8px',
                      color: 'var(--red)', cursor: 'pointer', flexShrink: 0,
                    }}
                    title="Excluir PDF"
                  >
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   PUBLICAR PLANO
   ============================================================ */
const REFEICAO_SUGESTOES = ['Café da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Pré-treino', 'Pós-treino', 'Lanche da manhã'];

function novaRefeicao() {
  return { _id: Math.random().toString(36).slice(2), nome: '', horario: '', alimentos: [] };
}
function novoAlimento() {
  return { _id: Math.random().toString(36).slice(2), nome: '', quantidade: '', subs: '' };
}

function PublicarPlano({ pacienteId, nutriId, calculosImportados, onLimparImportados }) {
  const [macros, setMacros]       = useState({ kcal: '', proteinas_g: '', carbo_g: '', gorduras_g: '', agua_l: '' });
  const [refeicoes, setRefeicoes] = useState([]);
  const [obs, setObs]             = useState('');
  const [validade, setValidade]   = useState('');
  const [historico, setHistorico] = useState([]);
  const [busy, setBusy]           = useState(false);
  const [feedback, setFeedback]   = useState(null);
  const [gerando, setGerando]     = useState(false);
  const [erroIA, setErroIA]       = useState(null);
  const [promptVisivel, setPromptVisivel] = useState(false);
  const [promptTexto, setPromptTexto]     = useState('');
  const [gerandoPrompt, setGerandoPrompt] = useState(false);
  const [promptCopiado, setPromptCopiado] = useState(false);
  const [jsonInput, setJsonInput]         = useState('');
  const [erroJson, setErroJson]           = useState(null);
  const [jsonOpen, setJsonOpen]           = useState(false);
  const [metaKcal, setMetaKcal]           = useState('');
  const [substituicoes, setSubstituicoes] = useState([]);
  const [gerandoSubs, setGerandoSubs]     = useState(false);
  const [erroSubs, setErroSubs]           = useState(null);
  const [previewOpen, setPreviewOpen]     = useState(false);
  const [dadosPreview, setDadosPreview]   = useState(null);
  const [verPlano, setVerPlano]           = useState(null); // plano publicado sendo visualizado
  const [uploadandoDieta, setUploadandoDieta] = useState(false);
  const [feedbackDieta, setFeedbackDieta]     = useState(null);
  const dietaPdfRef = useRef(null);
  const [uploadandoSubs, setUploadandoSubs]   = useState(false);
  const [feedbackSubs, setFeedbackSubs]       = useState(null);
  const subsPdfRef = useRef(null);

  useEffect(() => { carregar(); }, [pacienteId]);

  // Preenche macros quando vêm dos Cálculos
  useEffect(() => {
    if (!calculosImportados) return;
    setMacros(prev => ({
      ...prev,
      kcal:        calculosImportados.kcal        != null ? String(calculosImportados.kcal)        : prev.kcal,
      proteinas_g: calculosImportados.proteinas_g != null ? String(calculosImportados.proteinas_g) : prev.proteinas_g,
      carbo_g:     calculosImportados.carbo_g     != null ? String(calculosImportados.carbo_g)     : prev.carbo_g,
      gorduras_g:  calculosImportados.gorduras_g  != null ? String(calculosImportados.gorduras_g)  : prev.gorduras_g,
    }));
    setFeedback({ tipo: 'importado', msg: 'Valores importados dos cálculos nutricionais ✓' });
    onLimparImportados?.();
  }, [calculosImportados]);

  async function carregar() {
    const { data } = await supabase
      .from('planos').select('id, dados, validade, publicado_em')
      .eq('paciente_id', pacienteId)
      .order('publicado_em', { ascending: false });
    setHistorico(data ?? []);
  }

  /* ── mutações de refeições ── */
  const addRefeicao = () => setRefeicoes(p => [...p, novaRefeicao()]);

  const removeRefeicao = id =>
    setRefeicoes(p => p.filter(r => r._id !== id));

  const setRef = (id, key, val) =>
    setRefeicoes(p => p.map(r => r._id === id ? { ...r, [key]: val } : r));

  const addAlimento = (rid) =>
    setRefeicoes(p => p.map(r =>
      r._id === rid ? { ...r, alimentos: [...r.alimentos, novoAlimento()] } : r
    ));

  const removeAlimento = (rid, aid) =>
    setRefeicoes(p => p.map(r =>
      r._id === rid ? { ...r, alimentos: r.alimentos.filter(a => a._id !== aid) } : r
    ));

  const setAlim = (rid, aid, key, val) =>
    setRefeicoes(p => p.map(r =>
      r._id === rid
        ? { ...r, alimentos: r.alimentos.map(a => a._id === aid ? { ...a, [key]: val } : a) }
        : r
    ));

  const addSubstituicao = () => setSubstituicoes(p => [...p, { _id: Math.random().toString(36).slice(2), original: '', subs: '' }]);
  const removeSubstituicao = id => setSubstituicoes(p => p.filter(s => s._id !== id));
  const setSubst = (id, k, v) => setSubstituicoes(p => p.map(s =>
    s._id === id
      ? { ...s, [k]: v, ...(k === 'subs' ? { _subsObj: undefined } : {}) }
      : s
  ));

  async function gerarSubstituicoesIA() {
    // Inclui quantidade quando disponível para que a IA estime a equivalência calórica
    const alimentosList = refeicoes.flatMap(r =>
      r.alimentos
        .filter(a => a.nome.trim())
        .map(a => a.quantidade.trim() ? `${a.nome.trim()} (${a.quantidade.trim()})` : a.nome.trim())
    );
    const alimentosUnicos = [...new Set(alimentosList)];

    if (alimentosUnicos.length === 0) {
      setErroSubs('Adicione alimentos ao plano antes de gerar substituições.');
      return;
    }

    setGerandoSubs(true);
    setErroSubs(null);

    const prompt = `Você é uma nutricionista clínica especialista em oncologia.
Plano alimentar com os seguintes alimentos: ${alimentosUnicos.join(', ')}.

Para cada alimento, sugira substituições por equivalência de grupo alimentar.
Para cada substituto, forneça a gramagem (qty_equiv) que equivale caloricamente à porção original, com base nos valores da TACO 4.1.

Regras:
- Priorize alimentos regionais brasileiros e acessíveis.
- Responda em português do Brasil.
- Responda APENAS em JSON válido, sem texto antes ou depois e sem markdown.
- Formato exato (array JSON):
[{"original": "Arroz branco", "substitutos": [{"nome": "batata doce", "qty_equiv": "95g"}, {"nome": "mandioca cozida", "qty_equiv": "105g"}]}]

Liste TODOS os alimentos fornecidos, um objeto por alimento.`;

    try {
      const resposta = await callAnthropic(
        [{ role: 'user', content: prompt }],
        { model: 'claude-sonnet-4-6', maxTokens: 2000 }
      );

      let parsed;
      try {
        parsed = JSON.parse(resposta.replace(/```json\n?|\n?```/g, '').trim());
      } catch {
        throw new Error('formato-invalido');
      }

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('formato-invalido');

      setSubstituicoes(parsed.map(item => {
        const subsArr = Array.isArray(item.substitutos)
          ? item.substitutos
          : String(item.substitutos ?? item.subs ?? '').split(',').map(s => ({ nome: s.trim() }));
        const temQtyEquiv = subsArr.some(s => typeof s === 'object' && s.qty_equiv);
        return {
          _id: Math.random().toString(36).slice(2),
          original: String(item.original ?? '').trim(),
          subs: subsArr.map(s => (typeof s === 'object' ? s.nome : String(s)).trim()).filter(Boolean).join(', '),
          ...(temQtyEquiv ? {
            _subsObj: subsArr.map(s =>
              typeof s === 'object'
                ? { nome: (s.nome ?? '').trim(), qty_equiv: s.qty_equiv ?? null }
                : { nome: String(s).trim() }
            ),
          } : {}),
        };
      }));
    } catch (err) {
      console.error('[gerarSubstituicoesIA]', err);
      if (err.message === 'formato-invalido') {
        setErroSubs('A IA retornou um formato inesperado. Tente novamente.');
      } else {
        setErroSubs(`Falha (${err.message ?? 'erro desconhecido'})`);
      }
    } finally {
      setGerandoSubs(false);
    }
  }

  /* ── build dados ── */
  function buildDados() {
    const m = {};
    if (macros.kcal)        m.kcal   = Number(macros.kcal);
    // Nomes no padrão do Plano.jsx (paciente): prot_g / cho_g / lip_g
    if (macros.proteinas_g) m.prot_g = Number(macros.proteinas_g);
    if (macros.carbo_g)     m.cho_g  = Number(macros.carbo_g);
    if (macros.gorduras_g)  m.lip_g  = Number(macros.gorduras_g);
    if (macros.agua_l)      m.agua_l = Number(macros.agua_l);

    const refs = refeicoes.map(r => {
      const obj = { nome: r.nome };
      if (r.horario.trim()) obj.horario = r.horario.trim();
      const alims = r.alimentos
        .filter(a => a.nome.trim())
        .map(a => {
          const o = { nome: a.nome.trim() };
          if (a.quantidade.trim()) o.qty = a.quantidade.trim();
          // subs como array de strings simples (como Plano.jsx espera)
          const subsArr = a.subs.split(',').map(s => s.trim()).filter(Boolean);
          if (subsArr.length) o.subs = subsArr;
          return o;
        });
      if (alims.length) obj.alimentos = alims;
      return obj;
    });

    const dados = { macros: m, refeicoes: refs };
    if (obs.trim()) dados.obs = obs.trim();
    const subsValidas = substituicoes.filter(s => s.original.trim());
    if (subsValidas.length) dados.substituicoes = subsValidas.map(s => ({
      original: s.original.trim(),
      subs: s._subsObj ?? s.subs.trim(),
    }));
    return dados;
  }

  async function gerarPrompt() {
    setGerandoPrompt(true);
    setPromptVisivel(true);
    try {
      const [pacRes, pesoRes, anamRes] = await Promise.all([
        supabase.from('pacientes').select('nome, nascimento, objetivo').eq('id', pacienteId).maybeSingle(),
        supabase.from('peso_registros').select('kg, altura_cm').eq('paciente_id', pacienteId).order('data', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('anamneses').select('estrutura, respostas').eq('paciente_id', pacienteId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const pac  = pacRes.data;
      const peso = pesoRes.data;
      const anam = anamRes.data;

      let idade = null;
      if (pac?.nascimento) {
        const hoje = new Date();
        const nasc = new Date(pac.nascimento + 'T00:00:00');
        idade = hoje.getFullYear() - nasc.getFullYear();
        if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) idade--;
      }

      let restricoes = '';
      if (anam?.estrutura && anam?.respostas) {
        const perguntas = Array.isArray(anam.estrutura)
          ? anam.estrutura
          : (anam.estrutura?.secoes ?? []).flatMap(s => s.perguntas ?? []);
        restricoes = perguntas
          .filter(p => {
            const texto = (p.texto || p.label || '').toLowerCase();
            return texto.includes('alerg') || texto.includes('intol') || texto.includes('restri') || texto.includes('avers') || texto.includes('prefer');
          })
          .map(p => {
            const r = anam.respostas[p.id];
            return r ? `${p.texto || p.label}: ${r}` : null;
          })
          .filter(Boolean)
          .slice(0, 5)
          .join('; ') || 'Não informadas';
      }

      const kcal  = metaKcal.trim()     || '—';
      const prot  = macros.proteinas_g || '—';
      const carbo = macros.carbo_g     || '—';
      const gord  = macros.gorduras_g  || '—';

      const texto = `Gere um plano alimentar para paciente com as seguintes características:
- Nome: ${pac?.nome ?? '—'}
- Idade: ${idade != null ? idade + ' anos' : '—'}
- Peso: ${peso?.kg ?? '—'} kg / Altura: ${peso?.altura_cm ?? '—'} cm
- Objetivo: ${pac?.objetivo ?? '—'}
- Calorias calculadas: ${kcal} kcal/dia
- Proteínas: ${prot}g | Carboidratos: ${carbo}g | Gorduras: ${gord}g
- Restrições alimentares: ${restricoes}
- Número de refeições: 6
- Formato de resposta: APENAS JSON puro, sem texto adicional, sem markdown.

Estrutura JSON obrigatória:
{
  "macros": {
    "kcal": número,
    "proteinas_g": número,
    "carbo_g": número,
    "gorduras_g": número,
    "agua_l": número com uma casa decimal
  },
  "refeicoes": [
    {
      "nome": "nome da refeição",
      "horario": "HH:MM",
      "alimentos": [
        { "nome": "alimento", "quantidade": "ex: 100g", "subs": "substituto1, substituto2" }
      ]
    }
  ],
  "obs": "orientações clínicas em 2-3 parágrafos"
}`;

      setPromptTexto(texto);
    } catch {
      setPromptTexto('Erro ao buscar dados da paciente. Tente novamente.');
    }
    setGerandoPrompt(false);
  }

  function copiarPrompt() {
    navigator.clipboard.writeText(promptTexto).then(() => {
      setPromptCopiado(true);
      setTimeout(() => setPromptCopiado(false), 2000);
    });
  }

  function aplicarJson() {
    setErroJson(null);
    // remove blocos ```json``` em qualquer capitalização
    const raw = jsonInput.replace(/```[\w]*\n?/gi, '').replace(/\n?```/g, '').trim();
    if (!raw) return setErroJson('Cole o JSON antes de clicar em Importar.');

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { return setErroJson(`JSON inválido: ${e.message}`); }

    console.log('[Lapidare] JSON parseado:', parsed);
    console.log('[Lapidare] Chaves encontradas:', Array.isArray(parsed) ? '(array raiz)' : Object.keys(parsed));

    // Se a raiz for um array, trata como lista de refeições direto
    let plano = parsed;
    if (Array.isArray(parsed)) {
      plano = { refeicoes: parsed };
      console.log('[Lapidare] JSON era array na raiz — tratando como lista de refeições');
    }

    // Se não for objeto após normalização, erro
    if (!plano || typeof plano !== 'object') return setErroJson('O JSON precisa ser um objeto { } ou array [ ].');

    // Procurar refeições em qualquer chave, incluindo um nível aninhado
    function buscarRefeicoes(obj) {
      // tentativas diretas (com/sem acento, inglês)
      const CHAVES = ['refeicoes','refeições','refeicao','refeição','meals','meal','refeicoes_do_dia','diet','dieta','plano'];
      for (const k of CHAVES) {
        if (Array.isArray(obj[k])) return obj[k];
      }
      // busca em qualquer valor que seja array não-vazio de objetos
      for (const v of Object.values(obj)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
      }
      // busca um nível mais fundo (ex: { plano_alimentar: { refeicoes: [...] } })
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const found = buscarRefeicoes(v);
          if (found.length > 0) return found;
        }
      }
      return [];
    }

    const refeicoesBruto = buscarRefeicoes(plano);
    console.log('[Lapidare] Refeições encontradas:', refeicoesBruto.length, refeicoesBruto);

    // Verificar ANTES de atualizar qualquer estado — mantém modal aberto com erro
    if (refeicoesBruto.length === 0) {
      const chaves = Object.keys(plano).join(', ');
      console.warn('[Lapidare] Refeições não encontradas. Chaves disponíveis:', chaves);
      return setErroJson(
        `Refeições não encontradas. Chaves presentes no JSON: "${chaves || '(nenhuma)'}". ` +
        `Verifique se existe um campo "refeicoes", "refeições" ou "meals" no JSON.`
      );
    }

    // macros: aceita "macros", "macro", ou busca em qualquer chave que tenha "kcal"
    let macrosBruto = plano.macros ?? plano.macro ?? plano.macronutrientes ?? plano.metas ?? {};
    if (!macrosBruto || typeof macrosBruto !== 'object') macrosBruto = {};
    console.log('[Lapidare] Macros encontradas:', macrosBruto);

    const m = macrosBruto;
    setMacros({
      kcal:        String(m.kcal        ?? m.calorias       ?? m.calories    ?? ''),
      proteinas_g: String(m.proteinas_g ?? m.prot_g         ?? m.proteina    ?? m.proteinas ?? m.protein  ?? ''),
      carbo_g:     String(m.carbo_g     ?? m.cho_g          ?? m.carboidrato ?? m.carboidratos ?? m.carbs ?? m.cho ?? ''),
      gorduras_g:  String(m.gorduras_g  ?? m.lip_g          ?? m.gordura     ?? m.gorduras  ?? m.fats  ?? m.lip  ?? ''),
      agua_l:      String(m.agua_l      ?? m.agua           ?? m.water       ?? ''),
    });

    const refs = refeicoesBruto.map(r => {
      // alimentos: aceita "alimentos", "foods", "itens", "items"
      const alimentosBruto =
        r.alimentos ?? r.foods ?? r.itens ?? r.items ?? r.food ?? r.alimento ?? [];

      return {
        _id: Math.random().toString(36).slice(2),
        nome:    r.nome    ?? r.name    ?? r.refeicao ?? r['refeição'] ?? r.title ?? '',
        horario: r.horario ?? r.hora    ?? r.time     ?? r['horário'] ?? r.horario_sugerido ?? '',
        alimentos: (Array.isArray(alimentosBruto) ? alimentosBruto : []).map(a => ({
          _id: Math.random().toString(36).slice(2),
          nome:      a.nome      ?? a.name      ?? a.alimento ?? a.item    ?? a.descricao ?? '',
          quantidade: a.quantidade ?? a.qty      ?? a.quantity ?? a.qtd    ?? a.amount    ?? a.porcao ?? '',
          subs: Array.isArray(a.subs)
            ? a.subs.map(s => (typeof s === 'object' ? (s.nome ?? s.name ?? '') : String(s))).join(', ')
            : String(a.subs ?? a.substitutos ?? a.substitutions ?? a.substituicoes ?? ''),
        })).filter(a => a.nome.trim()),
      };
    });

    setRefeicoes(refs);
    if (plano.obs ?? plano.observacoes ?? plano.observações ?? plano.orientacoes) {
      setObs(plano.obs ?? plano.observacoes ?? plano.observações ?? plano.orientacoes ?? '');
    }
    const subsRaw = plano.substituicoes ?? plano.substituições ?? plano.substitutions ?? [];
    if (subsRaw.length) {
      setSubstituicoes(subsRaw.map(s => ({
        _id: Math.random().toString(36).slice(2),
        original: s.original ?? s.de ?? s.from ?? '',
        subs: Array.isArray(s.subs) ? s.subs.join(', ') : (s.subs ?? s.por ?? s.to ?? ''),
      })));
    }

    setJsonInput('');
    setErroJson(null);
    setJsonOpen(false);
    setFeedback({ tipo: 'importado', msg: `JSON importado! ${refs.length} refeições carregadas. Revise e clique em Publicar.` });
  }

  async function publicar() {
    if (busy) return;
    setFeedback(null);
    if (!refeicoes.length)
      return setFeedback({ tipo: 'erro', msg: 'Adicione pelo menos uma refeição.' });
    if (refeicoes.some(r => !r.nome.trim()))
      return setFeedback({ tipo: 'erro', msg: 'Todas as refeições precisam de um nome.' });

    const dados = buildDados();
    const v = validarPlano(dados);
    if (!v.ok) return setFeedback({ tipo: 'erro', msg: v.erro });

    setBusy(true);
    try {
      const { error } = await supabase.from('planos').insert({
        paciente_id: pacienteId, nutri_id: nutriId,
        dados, validade: validade || null,
      });
      if (error) throw error;
      setFeedback({ tipo: 'ok', msg: 'Plano publicado! A paciente já pode visualizar.' });
      setMacros({ kcal: '', proteinas_g: '', carbo_g: '', gorduras_g: '', agua_l: '' });
      setRefeicoes([]);
      setObs('');
      setValidade('');
      setSubstituicoes([]);
      carregar();
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err?.message || 'Erro ao publicar plano' });
    } finally {
      setBusy(false);
    }
  }

  async function excluirPlano(p) {
    if (!window.confirm(`Excluir plano publicado em ${dataBR(p.publicado_em)}?`)) return;
    const { error } = await supabase.from('planos').delete().eq('id', p.id);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Plano excluído.' });
    carregar();
  }

  async function gerarComIA() {
    setGerando(true);
    setErroIA(null);

    try {
      // Busca paralela de todos os dados clínicos
      const [pacRes, pesoRes, tratRes, anamRes, sintRes] = await Promise.all([
        supabase.from('pacientes').select('nome, nascimento, objetivo, tipo_plano').eq('id', pacienteId).maybeSingle(),
        supabase.from('peso_registros').select('*').eq('paciente_id', pacienteId).order('data', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('tratamentos_oncologicos').select('tipo_cancer, intencao, tipo_trat_sistemico, protocolo, medicamentos').eq('paciente_id', pacienteId).maybeSingle(),
        supabase.from('anamneses').select('estrutura, respostas').eq('paciente_id', pacienteId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('emagrecimento_sintomas').select('sintoma, categoria').eq('paciente_id', pacienteId).eq('presente', true),
      ]);

      const pac  = pacRes.data;
      const peso = pesoRes.data;
      const trat = tratRes.data;
      const anam = anamRes.data;
      const sint = sintRes.data ?? [];

      // Calcula idade
      let idade = null;
      if (pac?.nascimento) {
        const hoje = new Date();
        const nasc = new Date(pac.nascimento + 'T00:00:00');
        idade = hoje.getFullYear() - nasc.getFullYear();
        if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) idade--;
      }

      // Extrai respostas de anamnese como texto
      let anamTexto = '';
      if (anam?.estrutura && anam?.respostas) {
        const perguntas = Array.isArray(anam.estrutura)
          ? anam.estrutura
          : (anam.estrutura?.secoes ?? []).flatMap(s => s.perguntas ?? []);
        const pares = perguntas
          .map(p => {
            const r = anam.respostas[p.id];
            return r != null && r !== '' ? `${p.texto || p.label || p.id}: ${r}` : null;
          })
          .filter(Boolean);
        anamTexto = pares.slice(0, 30).join('\n');
      }

      // Sintomas de emagrecimento presentes
      const sintomasPresentes = sint.map(s => s.sintoma.replace(/_/g, ' ')).join(', ');

      const prompt = `Você é uma nutricionista clínica especializada em oncologia e emagrecimento.
Crie um plano alimentar personalizado baseado nos dados clínicos abaixo.

RETORNE APENAS JSON puro sem texto adicional, sem markdown, sem explicações.
Formato exato:
{
  "macros": {
    "kcal": número,
    "proteinas_g": número,
    "carbo_g": número,
    "gorduras_g": número,
    "agua_l": número com uma casa decimal
  },
  "refeicoes": [
    {
      "nome": "nome da refeição",
      "horario": "HH:MM",
      "alimentos": [
        { "nome": "alimento", "quantidade": "ex: 100g", "subs": "substituto1, substituto2" }
      ]
    }
  ],
  "obs": "orientações clínicas personalizadas em 2-3 parágrafos"
}

DADOS DA PACIENTE
Nome: ${pac?.nome ?? '—'}
Idade: ${idade != null ? idade + ' anos' : '—'}
Objetivo: ${pac?.objetivo ?? '—'}
Plano: ${pac?.tipo_plano ?? '—'}
${peso ? `Peso atual: ${peso.kg} kg | Altura: ${peso.altura_cm ?? '—'} cm | %Gordura: ${peso.pgc ?? '—'}% | Massa magra: ${peso.mm_kg ?? '—'} kg` : 'Sem dados antropométricos'}

DIAGNÓSTICO ONCOLÓGICO
${trat ? `Tipo de câncer: ${trat.tipo_cancer ?? '—'}
Intenção: ${trat.intencao ?? '—'}
Tratamento: ${trat.tipo_trat_sistemico ?? '—'}
Protocolo: ${trat.protocolo ?? '—'}
Medicamentos: ${(trat.medicamentos ?? []).join(', ') || '—'}` : 'Não informado'}

SINTOMAS PRESENTES (emagrecimento/menopausa)
${sintomasPresentes || 'Nenhum registrado'}

ANAMNESE CLÍNICA (principais respostas)
${anamTexto || 'Não preenchida'}

DIRETRIZES:
- Priorize proteína adequada para preservação de massa muscular (mínimo 1,2g/kg)
- Considere efeitos colaterais do tratamento oncológico
- Prefira alimentos anti-inflamatórios e de fácil digestão
- Se houver fadiga ou náusea: refeições menores e mais frequentes
- Indique 5-6 refeições com horários práticos
- Para cada alimento, ofereça 1-2 substitutos práticos`;

      const resposta = await callAnthropic(
        [{ role: 'user', content: prompt }],
        { model: 'claude-sonnet-4-6', maxTokens: 3000 }
      );

      // Extrai JSON da resposta (remove possível markdown)
      const jsonStr = resposta.replace(/```json\n?|\n?```/g, '').trim();
      let planoIA;
      try {
        planoIA = JSON.parse(jsonStr);
      } catch {
        throw new Error('A IA retornou um formato inesperado. Tente novamente.');
      }

      // Preenche macros
      const m = planoIA.macros ?? {};
      setMacros({
        kcal:        m.kcal        != null ? String(m.kcal)        : '',
        proteinas_g: m.proteinas_g != null ? String(m.proteinas_g) : '',
        carbo_g:     m.carbo_g     != null ? String(m.carbo_g)     : '',
        gorduras_g:  m.gorduras_g  != null ? String(m.gorduras_g)  : '',
        agua_l:      m.agua_l      != null ? String(m.agua_l)      : '',
      });

      // Preenche refeições convertendo para o formato interno do formulário
      const refs = (planoIA.refeicoes ?? []).map(r => ({
        _id: Math.random().toString(36).slice(2),
        nome:     r.nome     ?? '',
        horario:  r.horario  ?? '',
        alimentos: (r.alimentos ?? []).map(a => ({
          _id:        Math.random().toString(36).slice(2),
          nome:       a.nome       ?? '',
          quantidade: a.quantidade ?? '',
          subs:       Array.isArray(a.subs)
            ? a.subs.map(s => (typeof s === 'object' ? s.nome : s)).join(', ')
            : (a.subs ?? ''),
        })),
      }));
      setRefeicoes(refs);

      // Preenche observações
      if (planoIA.obs) setObs(planoIA.obs);

    } catch (e) {
      setErroIA(e.message || 'Erro ao gerar plano com IA.');
    }

    setGerando(false);
  }

  function abrirPreview() {
    if (!refeicoes.length)
      return setFeedback({ tipo: 'erro', msg: 'Adicione pelo menos uma refeição antes de pré-visualizar.' });
    if (refeicoes.some(r => !r.nome.trim()))
      return setFeedback({ tipo: 'erro', msg: 'Todas as refeições precisam de um nome.' });
    const dados = buildDados();
    const v = validarPlano(dados);
    if (!v.ok) return setFeedback({ tipo: 'erro', msg: v.erro });
    setDadosPreview(dados);
    setPreviewOpen(true);
  }

  async function enviarDietaPdf(arquivo) {
    setFeedbackDieta(null);
    setUploadandoDieta(true);
    const path = `${pacienteId}/dieta-${Date.now()}.pdf`;
    try {
      const { error: upErr } = await supabase.storage
        .from('prescricoes')
        .upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) throw new Error('Upload falhou: ' + upErr.message);
      const { error: insErr } = await supabase.from('dietas_pdf').insert({
        paciente_id: pacienteId,
        nutri_id: nutriId,
        storage_path: path,
        titulo: arquivo.name.replace(/\.[^.]+$/, ''),
        tipo: 'dieta',
      });
      if (insErr) {
        await supabase.storage.from('prescricoes').remove([path]);
        throw new Error('Erro ao registrar: ' + insErr.message);
      }
      setFeedbackDieta({ tipo: 'ok', msg: 'Dieta PDF enviada! A paciente já pode visualizar.' });
    } catch (e) {
      setFeedbackDieta({ tipo: 'erro', msg: e.message ?? 'Erro ao enviar PDF.' });
    } finally {
      setUploadandoDieta(false);
      if (dietaPdfRef.current) dietaPdfRef.current.value = '';
    }
  }

  async function enviarSubstituicoesPdf(arquivo) {
    setFeedbackSubs(null);
    setUploadandoSubs(true);
    const path = `${pacienteId}/substituicoes-${Date.now()}.pdf`;
    try {
      const { error: upErr } = await supabase.storage
        .from('prescricoes')
        .upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) throw new Error('Upload falhou: ' + upErr.message);
      const { error: insErr } = await supabase.from('dietas_pdf').insert({
        paciente_id: pacienteId,
        nutri_id: nutriId,
        storage_path: path,
        titulo: arquivo.name.replace(/\.[^.]+$/, ''),
        tipo: 'substituicoes',
      });
      if (insErr) {
        await supabase.storage.from('prescricoes').remove([path]);
        throw new Error('Erro ao registrar: ' + insErr.message);
      }
      setFeedbackSubs({ tipo: 'ok', msg: 'Lista de substituições enviada! A paciente já pode visualizar.' });
    } catch (e) {
      setFeedbackSubs({ tipo: 'erro', msg: e.message ?? 'Erro ao enviar PDF.' });
    } finally {
      setUploadandoSubs(false);
      if (subsPdfRef.current) subsPdfRef.current.value = '';
    }
  }

  return (
    <>
      {/* Modal: Pré-visualização do plano */}
      {previewOpen && dadosPreview && (
        <div onClick={() => setPreviewOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          zIndex: 400, padding: '24px 16px', overflowY: 'auto',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--white)', borderRadius: 14,
            width: '100%', maxWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            overflow: 'hidden',
          }}>
            {/* cabeçalho */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '0.5px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>👁️ Como a paciente vai ver</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>Pré-visualização fiel do app da paciente</div>
              </div>
              <button onClick={() => setPreviewOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            {/* corpo */}
            <div style={{ padding: '16px 20px', maxHeight: '70dvh', overflowY: 'auto' }}>
              {/* Macros */}
              {dadosPreview.macros && Object.keys(dadosPreview.macros).length > 0 && (
                <div style={{
                  background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16,
                }}>
                  <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 8 }}>
                    Macros do dia
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {dadosPreview.macros.kcal   && <Pill label="Calorias"  v={dadosPreview.macros.kcal}   u="kcal" />}
                    {dadosPreview.macros.prot_g && <Pill label="Proteína"  v={dadosPreview.macros.prot_g} u="g" />}
                    {dadosPreview.macros.cho_g  && <Pill label="Carboidrato" v={dadosPreview.macros.cho_g} u="g" />}
                    {dadosPreview.macros.lip_g  && <Pill label="Gordura"   v={dadosPreview.macros.lip_g}  u="g" />}
                    {dadosPreview.macros.agua_l && <Pill label="Água"      v={dadosPreview.macros.agua_l} u="L" />}
                  </div>
                </div>
              )}

              {/* Refeições */}
              {(dadosPreview.refeicoes ?? []).map((ref, ri) => (
                <div key={ri} style={{
                  border: '0.5px solid var(--border)', borderRadius: 10,
                  marginBottom: 10, overflow: 'hidden',
                }}>
                  <div style={{
                    background: 'var(--bg2)', padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{ref.nome}</span>
                    {ref.horario && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{ref.horario}</span>}
                  </div>
                  {(ref.alimentos ?? []).map((al, ai) => {
                    const kcalAlvo = al.kcal ?? kcalDoAlimento(al.nome, al.qty) ?? null;
                    return (
                      <div key={ai}>
                        <div style={{
                          padding: '7px 12px',
                          borderTop: '0.5px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <div style={{ fontSize: 13 }}>{al.nome}</div>
                          {al.qty && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{al.qty}</div>}
                        </div>
                        {al.subs?.length > 0 && (
                          <div style={{ padding: '3px 12px 8px 20px', display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg2)' }}>
                            {al.subs.map((subNome, si) => {
                              const eq = kcalAlvo ? kcalEquivalente(kcalAlvo, subNome) : null;
                              const textoEquiv = eq ? `≈ ${eq.gramas} g${eq.medida ? ` · ${eq.medida}` : ''}` : null;
                              return (
                                <div key={si} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                  <span>→ {subNome}</span>
                                  {textoEquiv && (
                                    <span style={{ fontSize: 10, color: '#9A7B3F', background: '#EDE5D8', borderRadius: 4, padding: '1px 6px', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {textoEquiv}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(ref.alimentos ?? []).length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>Sem alimentos cadastrados</div>
                  )}
                </div>
              ))}

              {dadosPreview.obs && (
                <div style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>Orientações:</strong> {dadosPreview.obs}
                </div>
              )}

              {dadosPreview.substituicoes?.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 8 }}>
                    Substituições
                  </div>
                  {dadosPreview.substituicoes.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--dark)', marginBottom: 5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 600, minWidth: 0 }}>{s.original}</span>
                      {s.subs && (
                        <>
                          <span style={{ color: 'var(--text3)', flexShrink: 0 }}>→</span>
                          <span style={{ color: 'var(--text2)', minWidth: 0 }}>{s.subs}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {validade && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
                  Válido até {dataBR(validade)}
                </div>
              )}
            </div>

            {/* rodapé */}
            <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPreviewOpen(false)}>
                Fechar
              </button>
              <button className="btn" style={{ flex: 2, justifyContent: 'center' }} onClick={() => { setPreviewOpen(false); publicar(); }} disabled={busy}>
                <i className="ti ti-send" aria-hidden="true" /> Publicar agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Colar JSON */}
      {jsonOpen && (
        <div
          onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 400, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--white)', borderRadius: 14,
              width: '100%', maxWidth: 560,
              maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            }}
          >
            {/* cabeçalho */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 20px 12px', borderBottom: '0.5px solid var(--border)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dark)' }}>
                  <i className="ti ti-code" style={{ marginRight: 6 }} aria-hidden="true" />
                  Colar JSON
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Cole o JSON gerado pelo Claude ou ChatGPT
                </div>
              </div>
              <button
                onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: 4 }}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            {/* corpo */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <textarea
                autoFocus
                value={jsonInput}
                onChange={e => { setJsonInput(e.target.value); setErroJson(null); }}
                rows={14}
                placeholder={'{\n  "macros": { "kcal": 1800, "proteinas_g": 90, "carbo_g": 200, "gorduras_g": 60, "agua_l": 2.5 },\n  "refeicoes": [\n    {\n      "nome": "Café da manhã",\n      "horario": "07:00",\n      "alimentos": [\n        { "nome": "Pão integral", "quantidade": "2 fatias", "subs": ["pão de forma"] }\n      ]\n    }\n  ]\n}'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  resize: 'vertical', minHeight: 260,
                  fontSize: 12, fontFamily: 'monospace', lineHeight: 1.55,
                  padding: 10, borderRadius: 8,
                  border: erroJson ? '1.5px solid var(--red)' : '1px solid var(--border)',
                  background: 'var(--bg2)',
                  color: 'var(--dark)',
                }}
              />
              {erroJson && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 6,
                  background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className="ti ti-alert-triangle" style={{ flexShrink: 0 }} aria-hidden="true" />
                  {erroJson}
                </div>
              )}
            </div>

            {/* rodapé */}
            <div style={{
              padding: '12px 20px',
              borderTop: '0.5px solid var(--border)',
              display: 'flex', gap: 8, flexShrink: 0,
            }}>
              <button
                className="btn-outline"
                style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}
              >
                Cancelar
              </button>
              <button
                className="btn"
                style={{ flex: 2, justifyContent: 'center', fontSize: 13 }}
                onClick={aplicarJson}
                disabled={!jsonInput.trim()}
              >
                <i className="ti ti-file-import" aria-hidden="true" />
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Novo plano alimentar</div>
            <div className="card-sub">Preencha manualmente, gere com IA ou via prompt para Claude/ChatGPT</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setJsonOpen(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: jsonOpen ? 'var(--bg3)' : 'var(--bg2)',
                color: 'var(--dark)', fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <i className="ti ti-code" aria-hidden="true" />
              {'{ }'} Colar JSON
            </button>
            <button
              onClick={gerarPrompt}
              disabled={gerandoPrompt}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: 'var(--dark)', fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <i className="ti ti-clipboard-text" aria-hidden="true" />
              {promptVisivel ? 'Atualizar prompt' : '📋 Gerar via prompt'}
            </button>
            <button
              onClick={gerarComIA}
              disabled={gerando}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, cursor: gerando ? 'default' : 'pointer',
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #a08456)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                opacity: gerando ? 0.75 : 1,
                boxShadow: '0 2px 8px rgba(124,58,237,.25)',
              }}
            >
              <i
                className={`ti ti-${gerando ? 'loader-2' : 'sparkles'}`}
                style={gerando ? { animation: 'lapidare-spin .75s linear infinite' } : {}}
                aria-hidden="true"
              />
              {gerando ? 'Gerando...' : 'Gerar'}
            </button>
          </div>
        </div>

        {/* Banner: valores importados dos Cálculos */}
        {feedback?.tipo === 'importado' && (
          <div style={{
            margin: '0 16px 4px', padding: '8px 12px', borderRadius: 6,
            background: '#f0fdf4', border: '1px solid #86efac',
            color: '#15803d', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <i className="ti ti-circle-check-filled" />
            <span style={{ flex: 1 }}>{feedback.msg}</span>
            <button
              onClick={abrirPreview}
              disabled={refeicoes.length === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid #86efac', background: '#dcfce7',
                color: '#15803d', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <i className="ti ti-eye" aria-hidden="true" />
              Pré-visualizar
            </button>
            <button
              onClick={publicar}
              disabled={busy || refeicoes.length === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, cursor: busy ? 'default' : 'pointer',
                border: 'none', background: '#15803d',
                color: '#fff', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <i className="ti ti-send" aria-hidden="true" />
              {busy ? 'Publicando...' : 'Publicar plano'}
            </button>
            <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: 14 }}>×</button>
          </div>
        )}

        {erroIA && (
          <div style={{
            margin: '0 16px', padding: '8px 12px', borderRadius: 6,
            background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-alert-triangle" />
            {erroIA}
          </div>
        )}

        {gerando && (
          <div style={{
            margin: '0 16px', padding: '10px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg, #f5f0ff, #fdf8ee)',
            border: '1px solid #e9d5ff', fontSize: 12, color: '#7c3aed',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-loader-2" style={{ animation: 'lapidare-spin .75s linear infinite' }} />
            A IA está analisando os dados clínicos e gerando o plano personalizado...
          </div>
        )}

        {/* Painel: Gerar via prompt */}
        {promptVisivel && (
          <div style={{
            margin: '0 16px 4px', padding: '14px', borderRadius: 8,
            background: '#fdf8ee', border: '1px solid var(--amber, #c9a96e)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>
                📋 Prompt para Claude / ChatGPT
              </div>
              <button onClick={() => setPromptVisivel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
            </div>

            {/* Meta de calorias — preenchida aqui, injetada na linha "Calorias calculadas" do prompt */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Meta de calorias (kcal/dia):
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex: 1500"
                value={metaKcal}
                onChange={e => setMetaKcal(e.target.value)}
                style={{ width: 130, flexShrink: 0 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                Preencha e clique em "Atualizar prompt" para refletir no texto.
              </span>
            </div>

            {gerandoPrompt ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-loader-2" style={{ animation: 'lapidare-spin .75s linear infinite' }} /> Buscando dados da paciente...
              </div>
            ) : (
              <>
                <textarea
                  readOnly
                  value={promptTexto}
                  rows={10}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px', fontSize: 12, lineHeight: 1.5,
                    borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--white)', fontFamily: 'var(--font-sans)',
                    resize: 'vertical', color: 'var(--dark)',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={copiarPrompt}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      border: 'none', background: promptCopiado ? '#16a34a' : 'var(--dark)',
                      color: '#fff', fontSize: 12, fontWeight: 600,
                      fontFamily: 'var(--font-sans)', transition: 'background .2s',
                    }}
                  >
                    <i className={`ti ti-${promptCopiado ? 'check' : 'copy'}`} />
                    {promptCopiado ? 'Copiado!' : 'Copiar prompt'}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, flex: 1 }}>
                    Cole no Claude ou ChatGPT, copie o JSON gerado e cole no campo "Colar JSON" abaixo para publicar.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Metas nutricionais ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
              Metas Nutricionais
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {[
                { k: 'kcal',        l: 'Calorias',     u: 'kcal', t: 'text',   ph: 'ex: 1500' },
                { k: 'proteinas_g', l: 'Proteínas',    u: 'g',    t: 'number', ph: '—' },
                { k: 'carbo_g',     l: 'Carboidratos', u: 'g',    t: 'number', ph: '—' },
                { k: 'gorduras_g',  l: 'Gorduras',     u: 'g',    t: 'number', ph: '—' },
                { k: 'agua_l',      l: 'Água',         u: 'L',    t: 'number', ph: '—', step: '0.1' },
              ].map(({ k, l, u, t, ph, step }) => (
                <div key={k}>
                  <label className="field-label">{l}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={t} inputMode="decimal" step={t === 'number' ? (step || '1') : undefined}
                      value={macros[k]}
                      onChange={e => setMacros(m => ({ ...m, [k]: e.target.value }))}
                      placeholder={ph}
                      style={{ paddingRight: 28 }}
                    />
                    <span style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 10, color: 'var(--text3)', pointerEvents: 'none',
                    }}>{u}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Refeições ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Refeições
              </div>
              <button
                className="btn-outline"
                style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                onClick={addRefeicao}
              >
                <i className="ti ti-plus" style={{ fontSize: 13 }} />
                Adicionar refeição
              </button>
            </div>

            {refeicoes.length === 0 && (
              <div style={{
                border: '1.5px dashed var(--border)', borderRadius: 8,
                padding: '20px 16px', textAlign: 'center',
                color: 'var(--text3)', fontSize: 13,
              }}>
                Nenhuma refeição adicionada ainda.
                <button
                  className="btn"
                  style={{ display: 'block', margin: '12px auto 0', fontSize: 12 }}
                  onClick={addRefeicao}
                >
                  <i className="ti ti-plus" /> Adicionar primeira refeição
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {refeicoes.map((r, ri) => (
                <div key={r._id} style={{
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: 'var(--white)', overflow: 'hidden',
                }}>
                  {/* Cabeçalho da refeição */}
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    padding: '10px 12px', background: 'var(--bg2)',
                    borderBottom: '0.5px solid var(--border)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--text3)',
                      background: 'var(--bg3)', borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                    }}>{ri + 1}</span>

                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                      <div style={{ flex: 2 }}>
                        <label className="field-label" style={{ marginBottom: 2 }}>Nome da refeição</label>
                        <input
                          list={`ref-sugestoes-${r._id}`}
                          value={r.nome}
                          onChange={e => setRef(r._id, 'nome', e.target.value)}
                          placeholder="ex: Café da manhã"
                        />
                        <datalist id={`ref-sugestoes-${r._id}`}>
                          {REFEICAO_SUGESTOES.map(s => <option key={s} value={s} />)}
                        </datalist>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="field-label" style={{ marginBottom: 2 }}>Horário</label>
                        <input
                          value={r.horario}
                          onChange={e => setRef(r._id, 'horario', e.target.value)}
                          placeholder="07:30"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => removeRefeicao(r._id)}
                      title="Remover refeição"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--red)', padding: 4, flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: 15 }} />
                    </button>
                  </div>

                  {/* Alimentos */}
                  <div style={{ padding: '10px 12px' }}>
                    {r.alimentos.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5 }}>Alimento</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5 }}>Qtd.</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5 }}>Substitutos (vírgula)</span>
                          <span />
                        </div>
                        {r.alimentos.map(a => (
                          <div key={a._id} style={{
                            display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto',
                            gap: 6, marginBottom: 5, alignItems: 'center',
                          }}>
                            <input
                              value={a.nome}
                              onChange={e => setAlim(r._id, a._id, 'nome', e.target.value)}
                              placeholder="ex: Ovo mexido"
                            />
                            <input
                              value={a.quantidade}
                              onChange={e => setAlim(r._id, a._id, 'quantidade', e.target.value)}
                              placeholder="2 un."
                            />
                            <input
                              value={a.subs}
                              onChange={e => setAlim(r._id, a._id, 'subs', e.target.value)}
                              placeholder="Omelete, tofu mexido"
                            />
                            <button
                              onClick={() => removeAlimento(r._id, a._id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}
                            >
                              <i className="ti ti-x" style={{ fontSize: 13 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      className="btn-outline"
                      style={{ fontSize: 11, padding: '3px 8px', gap: 4 }}
                      onClick={() => addAlimento(r._id)}
                    >
                      <i className="ti ti-plus" style={{ fontSize: 12 }} />
                      Adicionar alimento
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Observações ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Observações (opcional)
            </div>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={3}
              placeholder="Orientações gerais, dicas, restrições específicas…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>

          {/* ── Lista de Substituições ── */}
          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Lista de Substituições
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-outline"
                  style={{ fontSize: 11, padding: '3px 8px', gap: 4, opacity: gerandoSubs ? 0.6 : 1 }}
                  onClick={gerarSubstituicoesIA}
                  disabled={gerandoSubs}
                >
                  <i className={`ti ${gerandoSubs ? 'ti-loader-2' : 'ti-sparkles'}`} style={{ fontSize: 12, animation: gerandoSubs ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true" />
                  {gerandoSubs ? 'Gerando...' : 'Gerar com IA'}
                </button>
                <button className="btn-outline" style={{ fontSize: 11, padding: '3px 8px', gap: 4 }} onClick={addSubstituicao}>
                  <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
                  Adicionar
                </button>
              </div>
            </div>
            {erroSubs && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red, #e05252)', background: 'color-mix(in srgb, var(--red, #e05252) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red, #e05252) 25%, transparent)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 13, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{erroSubs}</span>
                <button onClick={() => setErroSubs(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>
                  <i className="ti ti-x" style={{ fontSize: 12 }} aria-hidden="true" />
                </button>
              </div>
            )}
            {substituicoes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Adicione substituições por grupo alimentar ou clique em "Gerar com IA" para sugestões automáticas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, opacity: gerandoSubs ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                {substituicoes.map(s => (
                  <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 6, alignItems: 'center' }}>
                    <input
                      value={s.original}
                      onChange={e => setSubst(s._id, 'original', e.target.value)}
                      placeholder="ex: Arroz branco"
                    />
                    <input
                      value={s.subs}
                      onChange={e => setSubst(s._id, 'subs', e.target.value)}
                      placeholder="ex: Arroz integral, batata doce, mandioca"
                    />
                    <button onClick={() => removeSubstituicao(s._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}>
                      <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Validade + publicar ── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="field-label">Validade (opcional)</label>
              <DateInput value={validade} onChange={e => setValidade(e.target.value)} style={{ maxWidth: 180 }} />
            </div>
            <button
              className="btn-outline"
              style={{ gap: 6 }}
              onClick={abrirPreview}
              disabled={refeicoes.length === 0}
            >
              <i className="ti ti-eye" aria-hidden="true" />
              Pré-visualizar
            </button>
            <button
              className="btn"
              style={{ gap: 6 }}
              onClick={publicar}
              disabled={busy || refeicoes.length === 0}
            >
              <i className="ti ti-send" aria-hidden="true" />
              {busy ? 'Publicando...' : 'Publicar plano'}
            </button>
          </div>

          {feedback && feedback.tipo !== 'importado' && <FeedbackInline f={feedback} />}
        </div>
      </div>

      {/* ── Dieta atual em PDF ── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Dieta atual (PDF)</div>
            <div className="card-sub">O PDF mais recente aparece para a paciente na área do Plano</div>
          </div>
          <input
            ref={dietaPdfRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) enviarDietaPdf(f); }}
          />
          <button
            className="btn"
            onClick={() => dietaPdfRef.current?.click()}
            disabled={uploadandoDieta}
          >
            <i
              className={`ti ti-${uploadandoDieta ? 'loader-2' : 'file-upload'}`}
              style={uploadandoDieta ? { animation: 'lapidare-spin .75s linear infinite' } : {}}
              aria-hidden="true"
            />
            {uploadandoDieta ? 'Enviando...' : 'Enviar dieta (PDF)'}
          </button>
        </div>
        {feedbackDieta && (
          <div style={{ padding: '0 16px 12px' }}>
            <FeedbackInline f={feedbackDieta} />
          </div>
        )}
      </div>

      {/* ── Lista de substituições em PDF ── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Lista de substituições (PDF)</div>
            <div className="card-sub">O PDF mais recente aparece para a paciente na área do Plano</div>
          </div>
          <input
            ref={subsPdfRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) enviarSubstituicoesPdf(f); }}
          />
          <button
            className="btn"
            onClick={() => subsPdfRef.current?.click()}
            disabled={uploadandoSubs}
          >
            <i
              className={`ti ti-${uploadandoSubs ? 'loader-2' : 'file-upload'}`}
              style={uploadandoSubs ? { animation: 'lapidare-spin .75s linear infinite' } : {}}
              aria-hidden="true"
            />
            {uploadandoSubs ? 'Enviando...' : 'Enviar lista de substituições (PDF)'}
          </button>
        </div>
        {feedbackSubs && (
          <div style={{ padding: '0 16px 12px' }}>
            <FeedbackInline f={feedbackSubs} />
          </div>
        )}
      </div>

      <HistoricoLista
        titulo="Planos publicados"
        items={historico}
        onDelete={excluirPlano}
        onView={(p) => setVerPlano(p)}
        renderItem={(p) => (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {p.dados?.macros?.kcal ? `${p.dados.macros.kcal} kcal · ` : ''}
              {p.dados?.refeicoes?.length ?? 0} refeição(ões)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Publicado em {dataBR(p.publicado_em)}
              {p.validade && ` · válido até ${dataBR(p.validade)}`}
            </div>
          </div>
        )}
      />

      {verPlano && (
        <ModalVerPlano
          plano={verPlano}
          onClose={() => setVerPlano(null)}
        />
      )}
    </>
  );
}

/* ============================================================
   PUBLICAR LISTA DE COMPRAS — helpers de categorização
   ============================================================ */
const CATEGORIAS_ALIMENTOS = [
  { categoria: 'Proteínas', emoji: '🥩', palavras: [
    'frango','galinha','peito','sobrecoxa','coxa',
    'peixe','tilapia','salmao','atum','sardinha','bacalhau','merluza','robalo',
    'pacu','tambaqui','saint peter',
    'carne','bife','patinho','alcatra','contrafile','fraldinha','musculo','acem',
    'maminha','picanha','lagarto','coxao','costela',
    'porco','suino','lombo','pernil','linguica','salsicha','mortadela',
    'presunto','salame','peito de peru',
    'ovo','ovos','clara','gema',
    'camarao','lula','polvo','marisco',
    'whey','caseina','albumina','proteina',
    'tofu','tempeh',
  ]},
  { categoria: 'Laticínios', emoji: '🥛', palavras: [
    'leite','iogurte','kefir','coalhada',
    'queijo','mussarela','cottage','ricota','requeijao','creme de leite',
    'manteiga','ghee',
  ]},
  { categoria: 'Frutas', emoji: '🍎', palavras: [
    'banana','maca','pera','manga','mamao','papaia','melancia','melao','abacaxi',
    'uva','morango','laranja','limao','kiwi','abacate','coco','acerola','goiaba',
    'acai','mirtilo','blueberry','framboesa','amora','cereja','pessego','ameixa',
    'figo','tamara','maracuja','caju','pitanga','jabuticaba','tangerina','mexerica',
    'fruta',
  ]},
  { categoria: 'Vegetais e Legumes', emoji: '🥦', palavras: [
    'brocolis','couve','repolho','cenoura','beterraba','abobrinha','berinjela',
    'pepino','tomate','pimentao','alface','rucula','agriao','espinafre','acelga',
    'vagem','chuchu','jilo','quiabo','aspargo','palmito',
    'cogumelo','shiitake','champignon','shimeji',
    'batata doce','inhame','mandioca','aipim',
    'alho','cebola','alho poro','gengibre','milho',
    'legume','verdura','hortalica',
  ]},
  { categoria: 'Cereais e Grãos', emoji: '🌾', palavras: [
    'arroz','aveia','granola','quinoa','amaranto',
    'pao','torrada','tapioca','biscoito','bolacha',
    'macarrao','massa','espaguete','fettuccine','lasanha','penne',
    'farinha','fuba','polenta','cuscuz','trigo','centeio','cevada',
    'feijao','lentilha','grao de bico','ervilha','soja','cereal',
  ]},
  { categoria: 'Temperos e Condimentos', emoji: '🫙', palavras: [
    'azeite','oleo','vinagre',
    'sal','pimenta','colorau','paprika','curcuma','curry','canela',
    'oregano','tomilho','louro','alecrim','cebolinha','coentro','manjericao',
    'molho','shoyu','missô','tahine','mostarda','ketchup',
    'mel','cacau','acucar','adocante','stevia','cafe',
  ]},
];

const ORDEM_CATEGORIAS = [
  'Proteínas','Vegetais e Legumes','Frutas',
  'Cereais e Grãos','Laticínios','Temperos e Condimentos','Outros',
];

const REGEX_PREPARO = /\b(bem\s+passados?|bem\s+passadas?|cozidos?|cozidas?|amassados?|amassadas?|grelhados?|grelhadas?|assados?|assadas?|refogados?|refogadas?|picados?|picadas?|fatiados?|fatiadas?|batidos?|batidas?|triturados?|trituradas?|mexidos?|mexidas?|escaldados?|escaldadas?|temperados?|temperadas?|misturados?|misturadas?|passados?|passadas?|crus?|cruas?)\b/gi;

function limparNomeAlimento(nome) {
  return nome.replace(REGEX_PREPARO, '').replace(/\s+/g, ' ').trim();
}

function categorizarAlimento(nome) {
  const n = ' ' + nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
  for (const { categoria, emoji, palavras } of CATEGORIAS_ALIMENTOS) {
    if (palavras.some(p => n.includes(' ' + p + ' '))) return { categoria, emoji };
  }
  return { categoria: 'Outros', emoji: '🧴' };
}

/* ============================================================
   PUBLICAR LISTA DE COMPRAS
   ============================================================ */
function PublicarLista({ pacienteId, nutriId }) {
  const [preview, setPreview]         = useState(null);
  const [marcados, setMarcados]       = useState({});
  const [gerando, setGerando]         = useState(false);
  const [erroIA, setErroIA]           = useState(null);
  const [busy, setBusy]               = useState(false);
  const [feedback, setFeedback]       = useState(null);
  const [historico, setHistorico]     = useState([]);
  const [copiado, setCopiado]         = useState(false);
  const [jsonOpen, setJsonOpen]       = useState(false);
  const [jsonInput, setJsonInput]     = useState('');
  const [erroJson, setErroJson]       = useState(null);

  useEffect(() => { carregar(); }, [pacienteId]);

  async function carregar() {
    const { data } = await supabase
      .from('listas_compras').select('id, dados, publicado_em')
      .eq('paciente_id', pacienteId)
      .order('publicado_em', { ascending: false }).limit(5);
    setHistorico(data ?? []);
  }

  async function gerarComIA() {
    setGerando(true);
    setErroIA(null);
    setPreview(null);
    setMarcados({});

    try {
      const { data: plano } = await supabase
        .from('planos').select('dados')
        .eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false }).limit(1).maybeSingle();

      if (!plano?.dados?.refeicoes?.length)
        throw new Error('Nenhum plano alimentar publicado. Publique um plano primeiro na aba Plano.');

      const alimentos = [];
      for (const ref of plano.dados.refeicoes) {
        for (const alim of ref.alimentos ?? []) {
          if (alim.nome) alimentos.push(`${alim.nome}${alim.quantidade ? ` (${alim.quantidade})` : ''}`);
        }
      }
      if (!alimentos.length)
        throw new Error('O plano alimentar não possui alimentos cadastrados.');

      const prompt = `Você é uma nutricionista. Com base nos alimentos do plano abaixo, crie uma lista de compras organizada por categoria para 7 dias.

ALIMENTOS DO PLANO:
${alimentos.join('\n')}

RETORNE APENAS JSON puro sem markdown, sem texto adicional:
{
  "lista": [
    {
      "categoria": "nome da categoria",
      "emoji": "emoji único",
      "itens": [
        { "nome": "alimento", "quantidade": "qtd para 7 dias" }
      ]
    }
  ]
}

Use APENAS as categorias que tiverem itens:
🥩 Proteínas | 🥦 Vegetais e Legumes | 🍎 Frutas | 🌾 Cereais e Grãos | 🥛 Laticínios | 🫙 Temperos e Condimentos | 🧴 Outros

Regras: agrupe similares, estime quantidade para 7 dias, use nomes genéricos (ex: "Frango"), formato de quantidade: "500g", "1 dúzia", "2 potes".`;

      const resposta = await callAnthropic(
        [{ role: 'user', content: prompt }],
        { model: 'claude-sonnet-4-6', maxTokens: 2000 }
      );

      let listaIA;
      try { listaIA = JSON.parse(resposta.replace(/```json\n?|\n?```/g, '').trim()); }
      catch { throw new Error('A IA retornou um formato inesperado. Tente novamente.'); }

      if (!listaIA?.lista?.length)
        throw new Error('A IA não gerou categorias. Tente novamente.');

      setPreview({
        lista: listaIA.lista.map(cat => ({
          ...cat,
          itens: (cat.itens ?? []).map(item => ({
            ...item,
            _id: Math.random().toString(36).slice(2),
          })),
        })),
      });
    } catch (e) {
      setErroIA(e.message || 'Erro ao gerar lista.');
    }
    setGerando(false);
  }

  async function publicar() {
    if (!preview) return;
    setFeedback(null);

    const dados = {
      lista: preview.lista.map(cat => ({
        categoria: cat.categoria,
        emoji: cat.emoji,
        itens: cat.itens.map(item =>
          item.quantidade ? `${item.nome} — ${item.quantidade}` : item.nome
        ),
      })),
    };

    const v = validarLista(dados);
    if (!v.ok) return setFeedback({ tipo: 'erro', msg: v.erro });

    setBusy(true);
    try {
      const { error } = await supabase.from('listas_compras').insert({
        paciente_id: pacienteId, nutri_id: nutriId, dados,
      });
      if (error) throw error;
      setFeedback({ tipo: 'ok', msg: 'Lista publicada! A paciente já pode ver.' });
      setPreview(null);
      setMarcados({});
      carregar();
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err?.message || 'Erro ao publicar lista' });
    } finally {
      setBusy(false);
    }
  }

  async function copiarLista() {
    if (!preview) return;
    const linhas = [`LISTA DE COMPRAS — ${new Date().toLocaleDateString('pt-BR')}`, ''];
    for (const cat of preview.lista) {
      linhas.push(`${cat.emoji || ''} ${cat.categoria}`.trim());
      for (const item of cat.itens) {
        linhas.push(`  • ${item.nome}${item.quantidade ? ` — ${item.quantidade}` : ''}`);
      }
      linhas.push('');
    }
    await navigator.clipboard.writeText(linhas.join('\n'));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  function limparMarcados() {
    const remover = new Set(Object.entries(marcados).filter(([, v]) => v).map(([k]) => k));
    if (!remover.size) return;
    setPreview(prev => ({
      lista: prev.lista
        .map(cat => ({ ...cat, itens: cat.itens.filter(i => !remover.has(i._id)) }))
        .filter(cat => cat.itens.length > 0),
    }));
    setMarcados({});
  }

  function exportarPDF() {
    if (!preview) return;
    const totalItens = preview.lista.reduce((a, c) => a + c.itens.length, 0);
    const nMarcados = Object.values(marcados).filter(Boolean).length;

    const catHtml = preview.lista.map(cat => `
      <div class="cat">
        <div class="cat-header">${cat.emoji || ''} ${cat.categoria} <span class="cat-count">${cat.itens.length} itens</span></div>
        ${cat.itens.map(item => `
          <div class="item">
            <div class="check-box"></div>
            <span class="item-nome">${item.nome}</span>
            ${item.quantidade ? `<span class="item-qtd">${item.quantidade}</span>` : ''}
          </div>`).join('')}
      </div>`).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Lista de Compras</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #F5F0EB; font-family: 'Inter', sans-serif; font-size: 13px; color: #1c1712; padding: 44px 52px; max-width: 780px; margin: 0 auto; }
    .header { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 20px; border-bottom: 2px solid #B8956A; margin-bottom: 32px; }
    .monogram { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, #B8956A, #8c6a3f); color: #fff; font-family: Georgia, serif; font-size: 21px; font-weight: bold; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand { font-size: 9.5px; letter-spacing: 3px; text-transform: uppercase; color: #B8956A; font-weight: 600; margin-bottom: 5px; }
    h1 { font-family: Georgia, serif; font-size: 24px; font-weight: normal; font-style: italic; }
    h1 strong { font-style: normal; }
    .meta { font-size: 10px; color: #9a8570; margin-top: 4px; }
    .progress { font-size: 11px; color: #6b5c3e; text-align: right; padding-top: 4px; }
    .cat { margin-bottom: 24px; page-break-inside: avoid; }
    .cat-header { font-family: Georgia, serif; font-size: 13px; font-weight: 600; color: #B8956A; letter-spacing: 1.5px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 0.5px solid #d4c4b0; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
    .cat-count { font-size: 10px; color: #9a8570; font-family: 'Inter', sans-serif; font-weight: 400; letter-spacing: 0; text-transform: none; }
    .item { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 0.5px solid #ede5d8; }
    .item:last-child { border-bottom: none; }
    .check-box { width: 16px; height: 16px; border: 1.5px solid #B8956A; border-radius: 4px; flex-shrink: 0; }
    .item-nome { flex: 1; font-size: 13px; }
    .item-qtd { font-size: 11px; color: #9a8570; text-align: right; }
    footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #ddd5c8; display: flex; justify-content: space-between; font-size: 10px; color: #9a8570; }
    footer strong { color: #6b5c3e; }
    @media print { body { padding: 20px 28px; } @page { margin: 1cm; size: A4; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="monogram">E</div>
    <div style="flex:1">
      <div class="brand">Essentia · Nutrição em Oncologia</div>
      <h1><strong>Lista de Compras</strong></h1>
      <div class="meta">Gerada em ${new Date().toLocaleDateString('pt-BR')} · ${totalItens} itens</div>
    </div>
    <div class="progress">Nut. Kelly Oliveira<br>CRN 3801</div>
  </div>
  ${catHtml}
  <footer>
    <div><strong>Nut. Kelly Oliveira</strong> · Mestre em Oncologia · CRN 3801</div>
    <div>🔒 Seus dados estão protegidos pela LGPD.</div>
  </footer>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=820,height=640');
    if (!win) { alert('Permita pop-ups para gerar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  async function gerarDoPlano() {
    setGerando(true);
    setErroIA(null);
    setPreview(null);
    setMarcados({});
    try {
      const { data: plano } = await supabase
        .from('planos').select('dados')
        .eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false }).limit(1).maybeSingle();

      if (!plano?.dados?.refeicoes?.length)
        throw new Error('Nenhum plano alimentar publicado. Publique um plano primeiro na aba Plano.');

      // Extrai todos os alimentos, remove palavras de preparo, deduplica pelo nome limpo
      const vistos = new Map();
      for (const ref of plano.dados.refeicoes) {
        for (const alim of ref.alimentos ?? []) {
          if (!alim.nome?.trim()) continue;
          const nomeLimpo = limparNomeAlimento(alim.nome.trim());
          if (!nomeLimpo) continue;
          const chave = nomeLimpo.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
          if (!vistos.has(chave)) vistos.set(chave, nomeLimpo);
        }
      }

      if (vistos.size === 0)
        throw new Error('O plano alimentar não possui alimentos cadastrados.');

      // Categoriza e agrupa
      const grupos = {};
      for (const [, nome] of vistos) {
        const { categoria, emoji } = categorizarAlimento(nome);
        if (!grupos[categoria]) grupos[categoria] = { emoji, itens: [] };
        grupos[categoria].itens.push({ _id: Math.random().toString(36).slice(2), nome, quantidade: '' });
      }

      const lista = [
        ...ORDEM_CATEGORIAS.filter(c => grupos[c]).map(c => ({ categoria: c, emoji: grupos[c].emoji, itens: grupos[c].itens })),
        ...Object.keys(grupos).filter(c => !ORDEM_CATEGORIAS.includes(c)).map(c => ({ categoria: c, emoji: grupos[c].emoji, itens: grupos[c].itens })),
      ];

      setPreview({ lista });
    } catch (e) {
      setErroIA(e.message || 'Erro ao gerar lista.');
    }
    setGerando(false);
  }

  function importarJSON() {
    setErroJson(null);
    const raw = jsonInput.replace(/```[\w]*\n?/gi, '').replace(/\n?```/g, '').trim();
    if (!raw) return setErroJson('Cole o JSON antes de importar.');

    // Normaliza array bruto para o formato interno { categoria, emoji, itens:[{_id,nome,quantidade}] }
    function processarArray(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const primeiro = arr[0];
      const ehCategoria = primeiro && typeof primeiro === 'object' && (
        Array.isArray(primeiro.itens) || Array.isArray(primeiro.items)
      );
      if (ehCategoria) {
        return arr.map(cat => ({
          categoria: cat.categoria ?? cat.nome ?? cat.category ?? cat.name ?? '',
          emoji:     cat.emoji ?? cat.icone ?? cat.icon ?? '',
          itens: (cat.itens ?? cat.items ?? []).map(item => ({
            _id: Math.random().toString(36).slice(2),
            nome: limparNomeAlimento(typeof item === 'string' ? item : (item.nome ?? item.name ?? item.item ?? '')),
            quantidade: typeof item === 'object' ? (item.quantidade ?? item.qty ?? item.quantity ?? '') : '',
          })).filter(i => i.nome),
        })).filter(c => c.categoria && c.itens.length > 0);
      } else {
        const grupos = {}; const ordem = [];
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue;
          const cat  = item.categoria ?? item.category ?? item.grupo ?? item.group ?? 'Geral';
          const nome = limparNomeAlimento(item.nome ?? item.name ?? item.item ?? item.descricao ?? '');
          const qtd  = item.quantidade ?? item.qty ?? item.quantity ?? '';
          if (!nome) continue;
          if (!grupos[cat]) { grupos[cat] = { emoji: item.emoji ?? '', itens: [] }; ordem.push(cat); }
          grupos[cat].itens.push({ _id: Math.random().toString(36).slice(2), nome, quantidade: qtd });
        }
        return ordem.map(c => ({ categoria: c, emoji: grupos[c].emoji, itens: grupos[c].itens })).filter(c => c.itens.length > 0);
      }
    }

    // Extrai alimentos de formato de plano alimentar, categoriza automaticamente
    function processarPlanoAlimentar(planoObj) {
      const obj = Array.isArray(planoObj) ? { refeicoes: planoObj } : planoObj;
      if (!obj || typeof obj !== 'object') return null;
      const CHAVES_REF = ['refeicoes','refeições','refeicao','refeição','meals','meal','dieta','cardapio','cardápio'];
      let refeicoes = null;
      for (const k of CHAVES_REF) { if (Array.isArray(obj[k])) { refeicoes = obj[k]; break; } }
      if (!refeicoes) { for (const v of Object.values(obj)) { if (Array.isArray(v) && v.length > 0) { refeicoes = v; break; } } }
      if (!refeicoes || refeicoes.length === 0) return null;
      const vistos = new Map();
      for (const ref of refeicoes) {
        const alims = ref.alimentos ?? ref.foods ?? ref.itens ?? ref.items ?? ref.food ?? [];
        for (const alim of (Array.isArray(alims) ? alims : [])) {
          const nomeRaw = typeof alim === 'string' ? alim : (alim?.nome ?? alim?.name ?? alim?.item ?? alim?.descricao ?? '');
          const nomeLimpo = limparNomeAlimento(nomeRaw.trim());
          if (!nomeLimpo) continue;
          const chave = nomeLimpo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
          if (!vistos.has(chave)) vistos.set(chave, nomeLimpo);
        }
      }
      if (vistos.size === 0) return null;
      const grupos = {};
      for (const [, nome] of vistos) {
        const { categoria, emoji } = categorizarAlimento(nome);
        if (!grupos[categoria]) grupos[categoria] = { emoji, itens: [] };
        grupos[categoria].itens.push({ _id: Math.random().toString(36).slice(2), nome, quantidade: '' });
      }
      return [
        ...ORDEM_CATEGORIAS.filter(c => grupos[c]).map(c => ({ categoria: c, emoji: grupos[c].emoji, itens: grupos[c].itens })),
        ...Object.keys(grupos).filter(c => !ORDEM_CATEGORIAS.includes(c)).map(c => ({ categoria: c, emoji: grupos[c].emoji, itens: grupos[c].itens })),
      ];
    }

    // Detecção de formato — retorna array bruto para processarArray, ou lista já normalizada
    const parsearJSON = (texto) => {
      try {
        const data = JSON.parse(texto);
        const chaves = Object.keys(Array.isArray(data) ? {} : data);
        console.log('[Lapidare] Compras chaves:', chaves);
        console.log('[Lapidare] Compras data:', data);

        // Todas as variantes de "lista de compras"
        const lc = data.lista_de_compras ?? data.lista_compras ?? data.listadecompras
                ?? data.shopping_list ?? data.compras ?? null;
        if (lc) {
          if (Array.isArray(lc)) return { tipo: 'array', valor: lc };
          if (typeof lc === 'object') {
            const cats = Object.keys(lc).filter(c => Array.isArray(lc[c]));
            if (cats.length > 0)
              return { tipo: 'array', valor: cats.map(cat => ({ categoria: cat, itens: lc[cat] })) };
          }
        }

        if (data.categorias)  return { tipo: 'array', valor: data.categorias };
        if (data.lista)       return { tipo: 'array', valor: data.lista };
        if (data.items)       return { tipo: 'array', valor: data.items };

        // Plano alimentar — extrai e categoriza automaticamente
        const planoObj = data.plano_alimentar ?? data.plano ?? data.dieta
          ?? data.cardapio ?? data['cardápio'] ?? null;
        if (planoObj) return { tipo: 'plano', valor: planoObj };
        if (data.refeicoes || data['refeições']) return { tipo: 'plano', valor: data };

        // Array direto
        if (Array.isArray(data)) return { tipo: 'array', valor: data };

        // Objeto com chaves sendo categorias: { "Proteínas": ["Frango", ...] }
        // Ignora chaves cujo valor não é array (metadados como PACIENTE, DATA_GERACAO, etc.)
        const chavesComArray = chaves.filter(c => Array.isArray(data[c]));
        if (chavesComArray.length > 0) {
          return { tipo: 'array', valor: chavesComArray.map(cat => ({ categoria: cat, itens: data[cat] })) };
        }

        return null;
      } catch(e) {
        console.error('[Lapidare] Erro parse JSON:', e);
        return null;
      }
    };

    const resultado = parsearJSON(raw);
    if (!resultado) {
      let chaves = '(nenhuma)';
      try { const d = JSON.parse(raw); chaves = Array.isArray(d) ? '(array raiz)' : Object.keys(d).join(', '); } catch {}
      return setErroJson(
        `Formato não reconhecido. Chaves: ${chaves}. ` +
        `Aceitos: lista_de_compras · lista_compras · listadecompras · shopping_list · compras · categorias · lista · items · plano_alimentar · plano · dieta · cardapio · array direto · objeto de categorias.`
      );
    }

    const lista = resultado.tipo === 'plano'
      ? processarPlanoAlimentar(resultado.valor)
      : processarArray(resultado.valor);

    if (!lista || lista.length === 0) {
      return setErroJson('JSON reconhecido mas sem itens válidos. Verifique se os campos "nome" e "categoria" estão presentes.');
    }

    setPreview({ lista });
    setMarcados({});
    setJsonInput('');
    setErroJson(null);
    setJsonOpen(false);
  }

  async function excluirLista(l) {
    if (!window.confirm(`Excluir lista publicada em ${dataBR(l.publicado_em)}?`)) return;
    const { error } = await supabase.from('listas_compras').delete().eq('id', l.id);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Lista excluída.' });
    carregar();
  }

  const totalPreview   = preview?.lista.reduce((a, c) => a + c.itens.length, 0) ?? 0;
  const nMarcadosPreview = Object.values(marcados).filter(Boolean).length;

  return (
    <>
      {/* Modal: Importar JSON */}
      {jsonOpen && (
        <div onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--white)', borderRadius: 14,
            width: '100%', maxWidth: 540, maxHeight: '90dvh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{'{ }'} Importar JSON</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Aceita: lista_de_compras · lista_compras · listadecompras · shopping_list · compras · categorias · lista · items · array direto
                </div>
              </div>
              <button onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <textarea
                autoFocus
                value={jsonInput}
                onChange={e => { setJsonInput(e.target.value); setErroJson(null); }}
                rows={12}
                placeholder={'{"lista_compras": [{"categoria": "Proteínas", "itens": ["Frango", "Ovos"]}]}'}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 220,
                  fontSize: 12, fontFamily: 'monospace', lineHeight: 1.55,
                  padding: 10, borderRadius: 8,
                  border: erroJson ? '1.5px solid var(--red)' : '1px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--dark)',
                }}
              />
              {erroJson && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <i className="ti ti-alert-triangle" style={{ flexShrink: 0, marginTop: 1 }} /> {erroJson}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setJsonOpen(false); setErroJson(null); setJsonInput(''); }}>
                Cancelar
              </button>
              <button className="btn" style={{ flex: 2, justifyContent: 'center' }}
                onClick={importarJSON} disabled={!jsonInput.trim()}>
                <i className="ti ti-file-import" aria-hidden="true" /> Importar lista
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header compras-card-header">
          <div>
            <div className="card-title">Lista de compras</div>
            <div className="card-sub">Gerada a partir do plano alimentar publicado</div>
          </div>
          <div className="compras-btns" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setJsonOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--dark)',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}>
              {'{ }'} JSON
            </button>
            <button
              onClick={gerarDoPlano}
              disabled={gerando}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: 'none', cursor: gerando ? 'default' : 'pointer',
                background: 'var(--dark, #2b2b2b)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                opacity: gerando ? 0.75 : 1,
              }}>
              📋 Gerar lista do plano
            </button>
            <button
              onClick={gerarComIA}
              disabled={gerando}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: 'none', cursor: gerando ? 'default' : 'pointer',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                opacity: gerando ? 0.75 : 1,
              }}>
              <i className={`ti ti-${gerando ? 'loader-2' : 'sparkles'}`}
                 style={gerando ? { animation: 'lapidare-spin .75s linear infinite' } : {}}
                 aria-hidden="true" />
              {gerando ? 'Gerando...' : 'Gerar'}
            </button>
          </div>
        </div>

        {erroIA && (
          <div style={{ margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, display: 'flex', gap: 8 }}>
            <i className="ti ti-alert-triangle" /> {erroIA}
          </div>
        )}

        {gerando && (
          <div style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#15803d', display: 'flex', gap: 8 }}>
            <i className="ti ti-loader-2" style={{ animation: 'lapidare-spin .75s linear infinite' }} />
            Organizando alimentos do plano por categoria...
          </div>
        )}

        {!preview && !gerando && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)' }}>
            <i className="ti ti-shopping-cart" style={{ fontSize: 28, marginBottom: 12, display: 'block', opacity: .35 }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Gere a lista de compras</div>
            <div style={{ fontSize: 12, marginBottom: 6, textAlign: 'left', maxWidth: 340, margin: '0 auto 8px' }}>
              <strong>📋 Gerar lista do plano</strong> — extrai automaticamente os alimentos do plano publicado e organiza por categoria, sem usar IA.
            </div>
            <div style={{ fontSize: 12, textAlign: 'left', maxWidth: 340, margin: '0 auto' }}>
              <strong>Gerar (IA)</strong> — a IA analisa o plano, agrupa por categoria e sugere quantidades para 7 dias.
            </div>
          </div>
        )}

        {preview && (
          <div className="card-body">
            {/* Barra de ações */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '0.5px solid var(--border)' }}>
              <button className="btn-outline" style={{ fontSize: 12, gap: 4 }} onClick={copiarLista}>
                <i className={`ti ti-${copiado ? 'check' : 'clipboard'}`} />
                {copiado ? 'Copiado!' : 'Copiar lista'}
              </button>
              <button className="btn-outline" style={{ fontSize: 12, gap: 4 }} onClick={exportarPDF}>
                <i className="ti ti-file-type-pdf" />
                Exportar PDF
              </button>
              {nMarcadosPreview > 0 && (
                <button className="btn-outline" style={{ fontSize: 12, gap: 4, color: 'var(--green)', borderColor: 'var(--green)' }} onClick={limparMarcados}>
                  <i className="ti ti-trash" />
                  Limpar {nMarcadosPreview} marcado{nMarcadosPreview > 1 ? 's' : ''}
                </button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>
                {totalPreview} itens · {preview.lista.length} categorias
              </span>
            </div>

            {/* Lista com checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              {preview.lista.map(cat => (
                <div key={cat.categoria}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--amber)',
                    letterSpacing: 1.2, textTransform: 'uppercase',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>{cat.emoji}</span>
                    <span>{cat.categoria}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--text3)', letterSpacing: 0, textTransform: 'none' }}>
                      {cat.itens.length} itens
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {cat.itens.map(item => {
                      const marcado = !!marcados[item._id];
                      return (
                        <label key={item._id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                          background: marcado ? 'var(--bg2)' : 'transparent',
                          opacity: marcado ? 0.55 : 1,
                          transition: 'opacity .15s',
                        }}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => setMarcados(m => ({ ...m, [item._id]: !m[item._id] }))}
                            style={{ accentColor: 'var(--amber)', width: 14, height: 14, flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, fontSize: 13, textDecoration: marcado ? 'line-through' : 'none' }}>
                            {item.nome}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Publicar */}
            <div style={{ paddingTop: 14, borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn" style={{ gap: 6 }} onClick={publicar} disabled={busy}>
                <i className="ti ti-send" aria-hidden="true" />
                {busy ? 'Publicando...' : `Publicar para a paciente (${totalPreview} itens)`}
              </button>
              <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => { setPreview(null); setMarcados({}); }}>
                Descartar
              </button>
            </div>

            {feedback && <FeedbackInline f={feedback} />}
          </div>
        )}

        {!preview && feedback && (
          <div style={{ padding: '0 16px 16px' }}><FeedbackInline f={feedback} /></div>
        )}
      </div>

      <HistoricoLista
        titulo="Listas publicadas"
        items={historico}
        onDelete={excluirLista}
        renderItem={(l) => (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {contarItensLista(l.dados)} itens em {l.dados?.lista?.length ?? 0} categorias
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Publicada em {dataBR(l.publicado_em)}
            </div>
          </div>
        )}
      />

    </>
  );
}

/* ============================================================
   ENVIAR PRESCRIÇÃO (upload PDF)
   ============================================================ */
function EnviarPrescricao({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [tipo, setTipo] = useState('exame');
  const [titulo, setTitulo] = useState('');
  const [nota, setNota] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const { data } = await supabase
      .from('prescricoes')
      .select('id, tipo, titulo, storage_path, nota, created_at')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function enviar() {
    setFeedback(null);
    if (!titulo.trim()) return setFeedback({ tipo: 'erro', msg: 'Informe um título.' });
    if (!arquivo && !nota.trim()) return setFeedback({ tipo: 'erro', msg: 'Anexe um PDF ou escreva o texto da prescrição.' });

    setBusy(true);
    let path = null;
    try {
      if (arquivo) {
        const ext = arquivo.name.split('.').pop() || 'pdf';
        path = `${pacienteId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('prescricoes')
          .upload(path, arquivo, { contentType: arquivo.type });
        if (uploadErr) throw new Error('Upload falhou: ' + uploadErr.message);
      }

      const { error: insertErr } = await supabase.from('prescricoes').insert({
        paciente_id: pacienteId,
        nutri_id: nutriId,
        tipo, titulo: titulo.trim(),
        storage_path: path,
        nota: nota.trim() || null,
      });
      if (insertErr) {
        if (path) await supabase.storage.from('prescricoes').remove([path]);
        throw new Error('Erro ao registrar: ' + insertErr.message);
      }

      setFeedback({ tipo: 'ok', msg: 'Prescrição enviada!' });
      setTitulo(''); setNota(''); setArquivo(null);
      const fileInput = document.getElementById('prescricao-file');
      if (fileInput) fileInput.value = '';
      carregar();
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: e.message ?? 'Erro inesperado — tente novamente.' });
    } finally {
      setBusy(false);
    }
  }

  async function abrirDocumento(path) {
    const { data, error } = await supabase.storage
      .from('prescricoes').createSignedUrl(path, 60);
    if (error) return alert('Não foi possível abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remover(item) {
    if (!window.confirm(`Remover "${item.titulo}"?`)) return;
    if (item.storage_path) await supabase.storage.from('prescricoes').remove([item.storage_path]);
    await supabase.from('prescricoes').delete().eq('id', item.id);
    carregar();
  }

  const TIPO_PILL = {
    exame:   { bg: 'var(--blue-bg)',   color: 'var(--blue)',   label: 'Exame' },
    laudo:   { bg: 'var(--green-bg)',  color: 'var(--green)',  label: 'Laudo' },
    receita: { bg: 'var(--orange-bg)', color: 'var(--orange)', label: 'Receita' },
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Enviar prescrição</div>
            <div className="card-sub">PDF de exame, laudo ou receita — a paciente verá em "Prescrições"</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="exame">Exame (pedido)</option>
                <option value="laudo">Laudo</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div>
              <label className="field-label">Título</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Pedido de exame T4 livre" />
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 10 }}>Arquivo PDF</label>
          <input
            id="prescricao-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            style={{ padding: 6 }}
          />

          <label className="field-label" style={{ marginTop: 10 }}>Texto da prescrição (opcional se houver PDF)</label>
          <textarea rows="4" value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Ex: Creatina 5g/dia — tomar pela manhã com água..." />

          {(() => {
            const semTitulo = !titulo.trim();
            const semConteudo = !arquivo && !nota.trim();
            if (!busy && (semTitulo || semConteudo)) {
              const msg = semTitulo && semConteudo
                ? 'Digite um título e anexe um PDF ou escreva a prescrição'
                : semTitulo
                  ? 'Digite um título para continuar'
                  : 'Anexe um PDF ou escreva o texto da prescrição';
              return (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, textAlign: 'right' }}>
                  <i className="ti ti-info-circle" aria-hidden="true"></i>{' '}{msg}
                </div>
              );
            }
            return null;
          })()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              className="btn"
              onClick={enviar}
              disabled={busy || !titulo.trim() || (!arquivo && !nota.trim())}
              style={{
                opacity: (busy || !titulo.trim() || (!arquivo && !nota.trim())) ? 0.45 : 1,
                cursor: (busy || !titulo.trim() || (!arquivo && !nota.trim())) ? 'not-allowed' : 'pointer',
              }}>
              <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Enviar prescrição'}
            </button>
          </div>

          {feedback && <FeedbackInline f={feedback} />}
        </div>
      </div>

      <div className="section-label">Documentos enviados ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma prescrição enviada ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {historico.map((d, i) => {
            const p = TIPO_PILL[d.tipo] ?? { bg: 'var(--bg2)', color: 'var(--text3)', label: d.tipo };
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: i === historico.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: p.bg, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: 17, color: p.color }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{d.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {p.label} · {dataBR(d.created_at)}
                  </div>
                  {d.nota && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>
                      "{d.nota}"
                    </div>
                  )}
                </div>
                {d.storage_path && (
                  <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => abrirDocumento(d.storage_path)}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Ver
                  </button>
                )}
                <button onClick={() => remover(d)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                  title="Remover">
                  <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================================================
   COMPONENTES AUXILIARES
   ============================================================ */
function Pill({ label, v, u }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'var(--white)', borderRadius: 8, padding: '6px 10px',
      border: '0.5px solid var(--border)', minWidth: 64,
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{v}{u}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{label}</span>
    </div>
  );
}

function FeedbackInline({ f }) {
  const ok = f.tipo === 'ok';
  return (
    <div style={{
      marginTop: 10,
      background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
      color: ok ? 'var(--green)' : 'var(--red)',
      padding: '8px 12px', borderRadius: 6, fontSize: 13,
    }}>
      <i className={`ti ti-${ok ? 'check' : 'alert-circle'}`} style={{ marginRight: 5 }} aria-hidden="true"></i>
      {f.msg}
    </div>
  );
}

/* ============================================================
   MODAL VER PLANO PUBLICADO
   Usa PlanoView — exibe exatamente o que a paciente vê no portal.
   ============================================================ */
function ModalVerPlano({ plano, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 400, padding: '24px 16px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 14,
        width: '100%', maxWidth: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,.18)',
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: '0.5px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Como a paciente vê</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
              Publicado em {dataBR(plano.publicado_em)}
              {plano.validade && ` · válido até ${dataBR(plano.validade)}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--text3)', padding: 4,
            minWidth: 44, minHeight: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* Corpo — mesmo layout do portal da paciente, modo leitura */}
        <div style={{ padding: '16px 20px 8px', maxHeight: '70dvh', overflowY: 'auto' }}>
          <PlanoView dados={plano.dados} validade={plano.validade} readOnly />
        </div>

        {/* Rodapé */}
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--border)' }}>
          <button className="btn-outline" style={{ width: '100%', justifyContent: 'center', minHeight: 44 }} onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoricoLista({ titulo, items, renderItem, onDelete, onView }) {
  return (
    <>
      <div className="section-label">{titulo} ({items.length})</div>
      {items.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nada publicado ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {items.map((it, i) => (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px', flexWrap: 'wrap',
              borderBottom: i === items.length - 1 ? 'none' : '0.5px solid #f5f0e8',
            }}>
              {renderItem(it)}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {onView && (
                  <button onClick={() => onView(it)}
                    title="Ver plano"
                    style={{
                      background: 'none', border: '0.5px solid var(--border)',
                      borderRadius: 6, padding: '6px 12px', minHeight: 36,
                      color: 'var(--dark)', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    }}>
                    <i className="ti ti-eye" style={{ fontSize: 14 }} aria-hidden="true"></i>
                    Ver
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(it)}
                    title="Excluir"
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '6px 10px', minHeight: 36,
                      color: 'var(--red)', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                    }}>
                    <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function VerJsonModal({ item, dados, onClose }) {
  const pretty = JSON.stringify(dados, null, 2);
  async function copiar() {
    try { await navigator.clipboard.writeText(pretty); alert('Copiado!'); }
    catch (e) { alert('Não foi possível copiar.'); }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 600, maxWidth: '90vw', maxHeight: '85vh',
        border: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>JSON publicado</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={copiar}>
              <i className="ti ti-copy" aria-hidden="true"></i> Copiar
            </button>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        <pre style={{
          background: 'var(--bg2)', padding: 12, borderRadius: 8,
          fontSize: 12, lineHeight: 1.5, overflow: 'auto', flex: 1,
          fontFamily: 'monospace', color: 'var(--dark)',
        }}>{pretty}</pre>
      </div>
    </div>
  );
}


/* ============================================================
   E-BOOKS DA PACIENTE
   ============================================================ */
const EBOOK_TAGS = [
  { id: 'receitas',      label: 'Receitas'       },
  { id: 'guia',          label: 'Guia'           },
  { id: 'protocolo',     label: 'Protocolo'      },
  { id: 'suplementacao', label: 'Suplementação'  },
  { id: 'outro',         label: 'Outro'          },
];

const ACERVOS = [
  { id: 'todas',     emoji: '📚', label: 'Todas'    },
  { id: 'receitas',  emoji: '📖', label: 'Receitas' },
  { id: 'materiais', emoji: '📄', label: 'Materiais'},
];

function secaoEbook(tag) {
  if (tag === 'receitas') return 'receitas';
  return 'materiais';
}

function EbooksDaPaciente({ pacienteId, nutriId, pacienteNome }) {
  const [todos, setTodos] = useState([]);
  const [atribuidosIds, setAtribuidosIds] = useState(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [acervo, setAcervo] = useState('todas');

  async function carregar() {
    const [ebRes, atRes] = await Promise.all([
      supabase.from('ebooks').select('*').eq('nutri_id', nutriId).order('created_at', { ascending: false }),
      supabase.from('ebooks_pacientes').select('ebook_id').eq('paciente_id', pacienteId),
    ]);
    setTodos(ebRes.data ?? []);
    setAtribuidosIds(new Set((atRes.data ?? []).map(a => a.ebook_id)));
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function toggle(ebookId) {
    if (atribuidosIds.has(ebookId)) {
      await supabase.from('ebooks_pacientes').delete()
        .eq('ebook_id', ebookId).eq('paciente_id', pacienteId);
    } else {
      await supabase.from('ebooks_pacientes').insert({
        ebook_id: ebookId, paciente_id: pacienteId,
      });
    }
    carregar();
  }

  function abrir(eb) {
    const { data } = supabase.storage.from('ebooks').getPublicUrl(eb.storage_path);
    window.open(data.publicUrl, '_blank', 'noopener');
  }

  const TAGS_SUPLEMENTO = new Set(['manipulados', 'suplementacao', 'formulacoes']);
  const atribuidos = todos.filter(e => atribuidosIds.has(e.id) && !TAGS_SUPLEMENTO.has(e.tag));
  const disponivelBase = todos.filter(e => !atribuidosIds.has(e.id) && !TAGS_SUPLEMENTO.has(e.tag));
  const disponiveis = disponivelBase.filter(e => {
      if (acervo !== 'todas' && secaoEbook(e.tag) !== acervo) return false;
      if (!busca.trim()) return true;
      const q = busca.trim().toLowerCase();
      return (e.titulo ?? '').toLowerCase().includes(q)
        || (e.descricao ?? '').toLowerCase().includes(q);
    });

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">E-books de {pacienteNome.split(' ')[0]}</div>
            <div className="card-sub">Marque os materiais da biblioteca que ela pode acessar, ou suba um novo direto</div>
          </div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-upload" aria-hidden="true"></i> Subir novo
          </button>
        </div>
        <div className="card-body">
          <div style={{
            fontSize: 10, letterSpacing: 1, color: 'var(--text3)',
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
          }}>
            Materiais atribuídos ({atribuidos.length})
          </div>
          {atribuidos.length === 0 ? (
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)', marginBottom: 14,
            }}>
              Nenhum e-book atribuído ainda. Marque um da biblioteca abaixo ou suba um novo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {atribuidos.map(eb => (
                <div key={eb.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: 10, borderRadius: 8,
                  background: 'var(--green-bg, var(--bg2))',
                  border: '0.5px solid var(--green, var(--border))',
                }}>
                  <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--green)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{eb.titulo}</div>
                    {eb.descricao && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{eb.descricao}</div>
                    )}
                  </div>
                  <button onClick={() => abrir(eb)} className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button onClick={() => toggle(eb.id)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '4px 8px',
                      color: 'var(--red)', cursor: 'pointer',
                    }}
                    title="Remover acesso">
                    <i className="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Disponíveis na biblioteca — filtro por acervo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1, color: 'var(--text3)',
              textTransform: 'uppercase', fontWeight: 500,
            }}>
              Disponíveis na biblioteca ({disponivelBase.length})
            </div>
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..."
              style={{ width: 160, padding: '4px 8px', fontSize: 11, margin: 0 }}
            />
          </div>

          {/* Tabs de acervo */}
          <div style={{
            display: 'flex', gap: 2, background: 'var(--bg2)',
            borderRadius: 8, padding: 3, marginBottom: 10,
            overflowX: 'auto', scrollbarWidth: 'none',
          }}>
            {ACERVOS.map(a => {
              const count = a.id === 'todas'
                ? disponivelBase.length
                : disponivelBase.filter(e => secaoEbook(e.tag) === a.id).length;
              return (
                <button key={a.id} onClick={() => { setAcervo(a.id); setBusca(''); }}
                  style={{
                    flex: '0 0 auto', padding: '4px 10px', fontSize: 11, fontWeight: 500,
                    borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: acervo === a.id ? 'var(--white)' : 'transparent',
                    color: acervo === a.id ? 'var(--dark)' : 'var(--text3)',
                    boxShadow: acervo === a.id ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                    fontFamily: 'var(--font-sans)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                  {a.emoji} {a.label}
                  {count > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text3)' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {todos.length === 0 ? (
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)',
            }}>
              Sua biblioteca está vazia. Suba o primeiro e-book pelo menu "Biblioteca" ou pelo botão acima.
            </div>
          ) : disponiveis.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>
              Nenhum e-book disponível com esses filtros.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {disponiveis.map(eb => {
                const tag = EBOOK_TAGS.find(t => t.id === (eb.tag ?? 'outro'));
                return (
                  <div key={eb.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 10, borderRadius: 8,
                    background: 'var(--white)',
                    border: '0.5px solid var(--border)',
                  }}>
                    <i className="ti ti-file-text" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{eb.titulo}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {tag?.label ?? 'Outro'}{eb.descricao && ` · ${eb.descricao.slice(0, 60)}${eb.descricao.length > 60 ? '...' : ''}`}
                      </div>
                    </div>
                    <button onClick={() => abrir(eb)} className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-eye" aria-hidden="true"></i> Ver
                    </button>
                    <button onClick={() => toggle(eb.id)} className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-plus" aria-hidden="true"></i> Atribuir
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {uploadOpen && (
        <ModalUploadEbookPaciente
          nutriId={nutriId} pacienteId={pacienteId}
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); carregar(); }}
        />
      )}
    </>
  );
}


function ModalUploadEbookPaciente({ nutriId, pacienteId, onClose, onSaved }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState('guia');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione um arquivo PDF.');
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) { setBusy(false); return setErro('Upload falhou: ' + upErr.message); }

    const { data: insData, error: insErr } = await supabase.from('ebooks').insert({
      nutri_id: nutriId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tag, storage_path: path,
    }).select().single();
    if (insErr) {
      await supabase.storage.from('ebooks').remove([path]);
      setBusy(false);
      return setErro('Erro: ' + insErr.message);
    }
    // Já atribui à paciente atual
    await supabase.from('ebooks_pacientes').insert({
      ebook_id: insData.id, paciente_id: pacienteId,
    });
    setBusy(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 480, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Subir e-book pra essa paciente</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Vai pra biblioteca e já atribui automaticamente
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <label className="form-lbl">Arquivo (PDF)</label>
        <input type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
          style={{ padding: 6 }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {arquivo
            ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB`
            : 'Nenhum arquivo selecionado · Tamanho máximo: 20 MB'}
        </div>

        <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Cardápio especial low-carb" />

        <label className="form-lbl" style={{ marginTop: 12 }}>Categoria</label>
        <select value={tag} onChange={e => setTag(e.target.value)}>
          {EBOOK_TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <label className="form-lbl" style={{ marginTop: 12 }}>Descrição (opcional)</label>
        <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
            <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Subir e atribuir'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   GRÁFICOS DE EVOLUÇÃO — estilo Shaped
   ============================================================ */
const SHAPED_VERDE = '#2D6A4F';

function fmtVal(v) {
  if (v == null) return '—';
  return Number(v).toFixed(1).replace(/\.0$/, '');
}

function SvgAreaChart({ pontos, color, gradId, unidade, label }) {
  const W = 400, H = 100;
  const pad = { t: 24, r: 8, b: 22, l: 8 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const n = pontos.length;
  if (n === 0) return null;
  const vals = pontos.map(p => p.v);
  const span = Math.max(...vals) - Math.min(...vals) || 1;
  const lo = Math.min(...vals) - span * 0.15;
  const hi = Math.max(...vals) + span * 0.15;
  const tx = i => pad.l + (n < 2 ? pw / 2 : (i / (n - 1)) * pw);
  const ty = v => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
  const pts = pontos.map((p, i) => ({ x: tx(i), y: ty(p.v), v: p.v, lbl: p.x }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const baseY = pad.t + ph;
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  const xStep = Math.max(1, Math.ceil(n / 5));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={i} x1={pad.l} y1={pad.t + ph * f} x2={W - pad.r} y2={pad.t + ph * f} stroke="#f2ede6" strokeWidth={1} />
      ))}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#fff" strokeWidth={2}>
            <title>{`${label}: ${p.v.toFixed(1)} ${unidade}`}</title>
          </circle>
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={10} fill={color} fontWeight={600}>
            {fmtVal(p.v)}
          </text>
          {i % xStep === 0 && (
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="#9b9087">
              {p.lbl}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

const METRICAS_EV = [
  { key: 'kg',             label: 'Peso',        unidade: 'kg', melhoraDiminuindo: true  },
  { key: 'pgc',            label: '% Gordura',   unidade: '%',  melhoraDiminuindo: true  },
  { key: 'mm_kg',          label: 'Massa Magra', unidade: 'kg', melhoraDiminuindo: false },
  { key: 'gordura_kg',     label: 'Massa Gorda', unidade: 'kg', melhoraDiminuindo: true  },
  { key: 'hidratacao_pct', label: 'Hidratação',  unidade: '%',  melhoraDiminuindo: false },
  { key: 'cintura_cm',     label: 'Cintura',     unidade: 'cm', melhoraDiminuindo: true  },
  { key: 'quadril_cm',     label: 'Quadril',     unidade: 'cm', melhoraDiminuindo: true  },
  { key: 'panturrilha_cm', label: 'Panturrilha', unidade: 'cm', melhoraDiminuindo: false },
  { key: 'braco_dir_cm',   label: 'Braço',       unidade: 'cm', melhoraDiminuindo: false, alt: 'braco_cm' },
  { key: 'coxa_dir_cm',    label: 'Coxa',        unidade: 'cm', melhoraDiminuindo: false, alt: 'coxa_cm'  },
];

const MESES_ABR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function xLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00');
  const m = MESES_ABR[d.getMonth()];
  const anoAtual = new Date().getFullYear();
  return d.getFullYear() === anoAtual ? m : `${m}/${String(d.getFullYear()).slice(2)}`;
}

function getVal(a, m) {
  const v = a[m.key];
  if (v != null) return v;
  return m.alt ? (a[m.alt] ?? null) : null;
}

function GraficosEvolucao({ historico }) {
  const dadosAsc = [...historico].reverse();

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-label" style={{ marginBottom: 12 }}>Evolução</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {METRICAS_EV.map(m => {
          const pontos = dadosAsc
            .map(a => ({ x: xLabel(a.data), v: getVal(a, m) }))
            .filter(p => p.v != null);

          if (pontos.length < 2) return null;

          const curr = getVal(historico[0], m);
          const prev = getVal(historico[1], m);
          const diff = curr != null && prev != null ? curr - prev : null;

          let badgeBg = '#f0ece7';
          let badgeColor = 'var(--text3)';
          let badgeStr = '=';
          if (diff != null && Math.abs(diff) >= 0.05) {
            const melhorou = m.melhoraDiminuindo ? diff < 0 : diff > 0;
            badgeBg = melhorou ? '#d4edda' : '#fde8e8';
            badgeColor = melhorou ? SHAPED_VERDE : '#c0392b';
            badgeStr = `${diff > 0 ? '+' : ''}${fmtVal(diff)} ${m.unidade}`;
          }

          return (
            <div key={m.key} style={{
              background: 'var(--white)', borderRadius: 12,
              border: '0.5px solid var(--border)',
              padding: '14px 16px 8px',
            }}>
              {/* Header do card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{
                    fontSize: 10, color: 'var(--text3)', fontWeight: 600,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                  }}>
                    {m.label}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--dark)', lineHeight: 1.1 }}>
                      {curr != null ? fmtVal(curr) : '—'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 3 }}>{m.unidade}</span>
                  </div>
                </div>
                <div style={{
                  background: badgeBg, color: badgeColor,
                  borderRadius: 20, padding: '3px 10px',
                  fontSize: 12, fontWeight: 600, marginTop: 4,
                  whiteSpace: 'nowrap',
                }}>
                  {badgeStr}
                </div>
              </div>

              {/* Area chart */}
              <SvgAreaChart
                pontos={pontos}
                color={SHAPED_VERDE}
                gradId={`ev-${m.key}`}
                unidade={m.unidade}
                label={m.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
