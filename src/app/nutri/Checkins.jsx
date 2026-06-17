import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';
import DateInput from '../../components/DateInput.jsx';
import {
  TEMPLATE_PADRAO,
  formatarResposta,
  validarTemplate,
  proximaDataAgendamento,
  labelFrequencia,
} from '../../lib/checkinDefault.js';
import CheckinForm from '../../components/CheckinForm.jsx';
import DicaJSON from '../../components/DicaJSON.jsx';

function normalizarTelefone(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith('55') && n.length >= 12) return n;
  return '55' + n;
}

function montarMsgCheckinWA(nomeP, linkCheckin, assinatura) {
  return `Olá, ${nomeP}! 🌿\n\nVocê tem um check-in nutricional pendente. Leva uns 3 minutinhos para responder!\n\n👉 ${linkCheckin}\n\nQualquer dúvida, estou por aqui! — ${assinatura}`;
}

export default function Checkins() {
  const { user, profile } = useSession();
  const assinatura = (profile?.nome?.split(' ')[0] ?? '') + ' | Essentia';
  const [tab, setTab] = useState('enviar');
  const [pacientes, setPacientes] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [toast, setToast] = useState(null);

  const [verRespostas, setVerRespostas] = useState(null);
  const [editorTemplate, setEditorTemplate] = useState(null); // template em edição (null=fechado, {}=novo)
  const [editorAgendamento, setEditorAgendamento] = useState(null);
  const [enviarParaTodas, setEnviarParaTodas] = useState(false);

  function mostraToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function carregar(signal = { cancelled: false }) {
    if (!user) return;
    const [pacRes, envRes, tplRes, agRes] = await Promise.all([
      supabase.from('pacientes').select('id, nome, telefone').eq('nutri_id', user.id).order('nome'),
      supabase.from('checkin_envios')
        .select('id, paciente_id, perguntas, enviado_em, respondido_em, respostas, lembrete_enviado_em, paciente:pacientes(id, nome)')
        .eq('nutri_id', user.id)
        .order('enviado_em', { ascending: false }),
      supabase.from('checkin_templates').select('*').eq('nutri_id', user.id)
        .or('tipo.eq.recorrente,tipo.is.null')
        .order('created_at'),
      supabase.from('checkin_agendamentos')
        .select('*, template:checkin_templates(nome, perguntas), paciente:pacientes(id, nome)')
        .eq('nutri_id', user.id)
        .order('proximo_envio'),
    ]);
    if (signal.cancelled) return;
    setPacientes(pacRes.data ?? []);
    setEnvios(envRes.data ?? []);
    setTemplates(tplRes.data ?? []);
    setAgendamentos(agRes.data ?? []);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [user]);

  // Nota: a primeira nutri cria o template padrão explicitamente pelo botão
  // "Começar com o Lapidare" na aba Templates (empty state).
  // Auto-inserir aqui causava duplicação por React StrictMode + remounts.

  // Processa agendamentos vencidos sempre que a tela é aberta
  const processadoRef = useRef(false);
  useEffect(() => {
    if (!user || processadoRef.current) return;
    if (agendamentos.length === 0) return;
    processadoRef.current = true;
    processarAgendamentosVencidos(user.id, agendamentos, mostraToast).then(executados => {
      if (executados > 0) carregar();
    });
  }, [agendamentos.length, user]);

  const statusPorPaciente = useMemo(() => {
    const m = {};
    for (const p of pacientes) {
      m[p.id] = envios.find(e => e.paciente_id === p.id);
    }
    return m;
  }, [pacientes, envios]);

  function templatesParaPaciente(pacienteId) {
    // Templates genéricos (paciente_id null) + os específicos dessa paciente
    return templates.filter(t => !t.paciente_id || t.paciente_id === pacienteId);
  }

  function templatePadraoParaPaciente(pacienteId) {
    const personalizado = templates.find(t => t.paciente_id === pacienteId);
    if (personalizado) return personalizado;
    return templates.find(t => t.is_padrao) ?? templates.find(t => !t.paciente_id) ?? templates[0];
  }

  async function enviarCheckin(paciente, template) {
    if (!template) return mostraToast('Selecione um template.');
    const { error } = await supabase.from('checkin_envios').insert({
      nutri_id: user.id,
      paciente_id: paciente.id,
      nome: template.nome ?? 'Check-in',
      tipo: 'recorrente',
      perguntas: template.perguntas,
    });
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast(`Enviado para ${paciente.nome.split(' ')[0]}: ${template.nome}`);
    carregar();
  }

  async function enviarLembrete(envio) {
    const { error } = await supabase
      .from('checkin_envios')
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq('id', envio.id);
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast(`Lembrete marcado para ${envio.paciente?.nome?.split(' ')[0] ?? 'paciente'}`);
    carregar();
  }

  async function enviarLembreteWA(paciente, envio) {
    const { error } = await supabase
      .from('checkin_envios')
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq('id', envio.id);
    if (error) return mostraToast('Erro: ' + error.message);
    const nome = paciente.nome.split(' ')[0];
    const link = `${window.location.origin}/paciente/checkin/${envio.id}`;
    const msg = montarMsgCheckinWA(nome, link, assinatura);
    const tel = normalizarTelefone(paciente.telefone);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    mostraToast(`WhatsApp aberto para ${nome}`);
    carregar();
  }

  async function enviarParaTodasPacientes(template) {
    if (!template) return mostraToast('Selecione um template.');
    if (pacientes.length === 0) return mostraToast('Sem pacientes cadastradas.');
    if (!window.confirm(`Enviar "${template.nome}" para todas as ${pacientes.length} pacientes?`)) return;
    const linhas = pacientes.map(p => ({
      nutri_id: user.id,
      paciente_id: p.id,
      nome: template.nome ?? 'Check-in',
      tipo: 'recorrente',
      perguntas: template.perguntas,
    }));
    const { error } = await supabase.from('checkin_envios').insert(linhas);
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast(`Enviado para ${pacientes.length} pacientes`);
    setEnviarParaTodas(false);
    carregar();
  }

  const respondidos = envios.filter(e => e.respondido_em);

  return (
    <>
      <div className="page-title">Check-ins</div>
      <div className="page-sub">
        {tab === 'enviar'      && 'Envie check-ins, veja quem respondeu e quem precisa de lembrete'}
        {tab === 'respostas'   && `${respondidos.length} respondido${respondidos.length === 1 ? '' : 's'} no total`}
        {tab === 'templates'   && `${templates.length} template${templates.length === 1 ? '' : 's'} · crie, importe e edite`}
        {tab === 'programacao' && `${agendamentos.filter(a => a.ativo).length} envio${agendamentos.filter(a=>a.ativo).length === 1 ? '' : 's'} programado${agendamentos.filter(a=>a.ativo).length === 1 ? '' : 's'} · disparam automaticamente`}
      </div>

      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16, maxWidth: 560, flexWrap: 'wrap',
      }}>
        {[
          { id: 'enviar',      label: 'Enviar e acompanhar' },
          { id: 'respostas',   label: `Respostas (${respondidos.length})` },
          { id: 'templates',   label: `Templates (${templates.length})` },
          { id: 'programacao', label: `Programação (${agendamentos.filter(a=>a.ativo).length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-sans)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ENVIAR ── */}
      {tab === 'enviar' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-outline" onClick={() => setEnviarParaTodas(true)} disabled={pacientes.length === 0 || templates.length === 0}>
              <i className="ti ti-send" aria-hidden="true"></i> Enviar para todas as pacientes
            </button>
          </div>

          {pacientes.length === 0 ? (
            <div className="card empty-card">
              <i className="ti ti-clipboard-check empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Cadastre uma paciente primeiro</div>
              <div className="empty-sub">O check-in é por paciente — sem pacientes, não há nada para enviar.</div>
            </div>
          ) : templates.length === 0 ? (
            <div className="card empty-card">
              <i className="ti ti-clipboard-check empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Crie um template primeiro</div>
              <div className="empty-sub">Vá em Templates para criar ou importar seu primeiro formulário.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Último envio</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pacientes.map(p => {
                    const ult = statusPorPaciente[p.id];
                    const respondeu = !!ult?.respondido_em;
                    const lembrado = !!ult?.lembrete_enviado_em;
                    const templatesDisp = templatesParaPaciente(p.id);
                    const padrao = templatePadraoParaPaciente(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--bg2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 600, color: 'var(--dark)',
                            }}>{iniciais(p.nome)}</div>
                            <div style={{ fontWeight: 500 }}>{p.nome}</div>
                          </div>
                        </td>
                        <td>{ult ? dataBR(ult.enviado_em) : '—'}</td>
                        <td>
                          {!ult ? (
                            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nunca recebeu</span>
                          ) : respondeu ? (
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                              background: 'var(--green-bg)', color: 'var(--green)',
                            }}>✓ Respondeu em {dataBR(ult.respondido_em)}</span>
                          ) : lembrado ? (
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                              background: 'var(--orange-bg)', color: 'var(--orange)',
                            }}>Lembrete enviado · aguardando</span>
                          ) : (
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                              background: 'var(--red-bg)', color: 'var(--red)',
                            }}>Aguardando resposta</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            {ult && respondeu && (
                              <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                                onClick={() => setVerRespostas(ult)}>
                                <i className="ti ti-eye" aria-hidden="true"></i> Ver
                              </button>
                            )}
                            {ult && !respondeu && (
                              p.telefone?.trim() ? (
                                <button
                                  className="btn-outline"
                                  style={{
                                    fontSize: 12, padding: '4px 10px',
                                    color: lembrado ? 'var(--text3)' : '#25D366',
                                    borderColor: lembrado ? 'var(--border)' : '#25D366',
                                  }}
                                  title={lembrado ? 'Lembrete já enviado — clique para reenviar' : 'Abrir WhatsApp com mensagem pronta'}
                                  onClick={() => enviarLembreteWA(p, ult)}>
                                  <i className="ti ti-brand-whatsapp" aria-hidden="true"></i>
                                  {lembrado ? 'Reenviar WA' : 'Enviar WA'}
                                </button>
                              ) : (
                                <button
                                  className="btn-outline"
                                  disabled
                                  title="Cadastre o telefone da paciente para enviar pelo WhatsApp"
                                  style={{ fontSize: 12, padding: '4px 10px', opacity: 0.45 }}>
                                  <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> Sem tel.
                                </button>
                              )
                            )}
                            <SelecionarEnviarTemplate
                              templates={templatesDisp}
                              padrao={padrao}
                              onEscolher={(tpl) => enviarCheckin(p, tpl)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {enviarParaTodas && (
            <SelecionarTemplateModal
              templates={templates.filter(t => !t.paciente_id)}
              onClose={() => setEnviarParaTodas(false)}
              onEscolher={enviarParaTodasPacientes}
              title="Enviar para todas as pacientes"
              actionLabel="Disparar agora"
            />
          )}
        </>
      )}

      {/* ── RESPOSTAS ── */}
      {tab === 'respostas' && (
        <>
          {respondidos.length === 0 ? (
            <div className="card empty-card">
              <i className="ti ti-clipboard-check empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Nenhuma resposta ainda</div>
              <div className="empty-sub">Assim que uma paciente responder, as respostas aparecem aqui.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {respondidos.map((e, i) => (
                <div key={e.id}
                  onClick={() => setVerRespostas(e)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    borderBottom: i === respondidos.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                    cursor: 'pointer',
                  }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--bg2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600, color: 'var(--dark)',
                  }}>{iniciais(e.paciente?.nome)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{e.paciente?.nome ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      Respondido em {dataBR(e.respondido_em)} · enviado em {dataBR(e.enviado_em)}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} aria-hidden="true"></i>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TEMPLATES ── */}
      {tab === 'templates' && (
        <TemplatesTab
          templates={templates}
          pacientes={pacientes}
          nutriId={user.id}
          onRecarregar={carregar}
          mostraToast={mostraToast}
          onEditar={setEditorTemplate}
        />
      )}

      {/* ── PROGRAMAÇÃO ── */}
      {tab === 'programacao' && (
        <ProgramacaoTab
          agendamentos={agendamentos}
          templates={templates}
          pacientes={pacientes}
          nutriId={user.id}
          onRecarregar={carregar}
          mostraToast={mostraToast}
          onEditar={setEditorAgendamento}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--dark)', color: '#faf8f5',
          padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 200,
          boxShadow: '0 4px 12px rgba(28,23,18,.15)',
        }}>{toast}</div>
      )}

      {/* Modais */}
      {verRespostas && (
        <RespostasModal envio={verRespostas} onClose={() => setVerRespostas(null)} />
      )}
      {editorTemplate !== null && (
        <TemplateEditor
          template={editorTemplate}
          nutriId={user.id}
          pacientes={pacientes}
          onClose={() => setEditorTemplate(null)}
          onSaved={async () => { setEditorTemplate(null); carregar(); mostraToast('Template salvo'); }}
        />
      )}
      {editorAgendamento !== null && (
        <AgendamentoEditor
          agendamento={editorAgendamento}
          templates={templates}
          pacientes={pacientes}
          nutriId={user.id}
          onClose={() => setEditorAgendamento(null)}
          onSaved={async () => { setEditorAgendamento(null); carregar(); mostraToast('Agendamento salvo'); }}
        />
      )}
    </>
  );
}

/* ============================================================
   PROCESSADOR DE AGENDAMENTOS (executa no client)
   ============================================================ */
async function processarAgendamentosVencidos(nutriId, agendamentos, mostraToast) {
  const hoje = new Date().toISOString().slice(0, 10);
  let total = 0;

  for (const ag of agendamentos) {
    if (!ag.ativo) continue;
    if (ag.proximo_envio > hoje) continue;
    if (!ag.template?.perguntas) continue;

    // Tenta "reservar" o agendamento — só processa se ninguém atualizou primeiro
    const nova = proximaDataAgendamento(hoje, ag.frequencia);
    const { data: claim } = await supabase
      .from('checkin_agendamentos')
      .update({ proximo_envio: nova, ultimo_envio: new Date().toISOString() })
      .eq('id', ag.id)
      .lte('proximo_envio', hoje)
      .select();

    if (!claim || claim.length === 0) continue; // outra aba já processou

    // Determina pacientes-alvo
    let pacientesIds;
    if (ag.paciente_id) {
      pacientesIds = [ag.paciente_id];
    } else {
      const { data: pacs } = await supabase
        .from('pacientes').select('id').eq('nutri_id', nutriId);
      pacientesIds = (pacs ?? []).map(p => p.id);
    }

    if (pacientesIds.length === 0) continue;

    // Cria envios
    const linhas = pacientesIds.map(pid => ({
      nutri_id: nutriId,
      paciente_id: pid,
      perguntas: ag.template.perguntas,
    }));
    const { error } = await supabase.from('checkin_envios').insert(linhas);
    if (!error) total += pacientesIds.length;
  }

  if (total > 0) mostraToast(`${total} check-in${total === 1 ? '' : 's'} disparado${total === 1 ? '' : 's'} automaticamente`);
  return total;
}

/* ============================================================
   SELETOR DE TEMPLATE INLINE (dropdown ao clicar Enviar)
   ============================================================ */
function SelecionarEnviarTemplate({ templates, padrao, onEscolher }) {
  const [aberto, setAberto] = useState(false);
  if (templates.length === 0) {
    return <button className="btn" disabled style={{ fontSize: 12, padding: '4px 10px', opacity: .5 }}>Sem templates</button>;
  }
  if (templates.length === 1) {
    return (
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
        onClick={() => onEscolher(templates[0])}>
        <i className="ti ti-send" aria-hidden="true"></i> Enviar
      </button>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
        onClick={() => setAberto(a => !a)}>
        <i className="ti ti-send" aria-hidden="true"></i> Enviar
        <i className="ti ti-chevron-down" style={{ fontSize: 13, marginLeft: 2 }} aria-hidden="true"></i>
      </button>
      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{
            position: 'fixed', inset: 0, zIndex: 90,
          }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            background: 'var(--white)', border: '0.5px solid var(--border)',
            borderRadius: 8, minWidth: 220, zIndex: 100,
            boxShadow: '0 4px 12px rgba(28,23,18,.1)',
            overflow: 'hidden',
          }}>
            {templates.map(t => {
              const isPadrao = t.id === padrao?.id;
              return (
                <button key={t.id}
                  onClick={() => { setAberto(false); onEscolher(t); }}
                  style={{
                    width: '100%', padding: '10px 12px', textAlign: 'left',
                    fontSize: 13, border: 'none', cursor: 'pointer',
                    background: 'transparent', display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-sans)', borderBottom: '0.5px solid #f5f0e8',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#faf8f5'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{t.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {t.perguntas?.length ?? 0} perguntas
                      {t.paciente_id && ' · personalizado'}
                    </div>
                  </div>
                  {isPadrao && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 20,
                      background: 'var(--orange-bg)', color: 'var(--orange)', fontWeight: 600,
                    }}>PADRÃO</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SelecionarTemplateModal({ templates, onClose, onEscolher, title, actionLabel }) {
  const padrao = templates.find(t => t.is_padrao) ?? templates[0];
  const [sel, setSel] = useState(padrao?.id ?? '');
  const escolhido = templates.find(t => t.id === sel);
  return (
    <ModalShell title={title} subtitle="Escolha qual template enviar" onClose={onClose}>
      {templates.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text3)' }}>Nenhum template genérico disponível.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {templates.map(t => (
              <label key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                border: '0.5px solid ' + (sel === t.id ? 'var(--amber)' : 'var(--border)'),
                background: sel === t.id ? 'var(--orange-bg)' : 'var(--white)',
                cursor: 'pointer',
              }}>
                <input type="radio" checked={sel === t.id} onChange={() => setSel(t.id)}
                  style={{ accentColor: 'var(--amber)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{t.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {t.perguntas?.length ?? 0} perguntas
                  </div>
                </div>
                {t.is_padrao && <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 20,
                  background: 'var(--orange-bg)', color: 'var(--orange)', fontWeight: 600,
                }}>PADRÃO</span>}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onEscolher(escolhido)} disabled={!escolhido}>
              <i className="ti ti-send" aria-hidden="true"></i> {actionLabel}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/* ============================================================
   TAB TEMPLATES
   ============================================================ */
function TemplatesTab({ templates, pacientes, nutriId, onRecarregar, mostraToast, onEditar }) {
  async function excluir(t) {
    if (!window.confirm(`Excluir o template "${t.nome}"?\n\nIsso também remove agendamentos que usavam este template.`)) return;
    const { error } = await supabase.from('checkin_templates').delete().eq('id', t.id);
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast('Template excluído');
    onRecarregar();
  }

  async function definirPadrao(t) {
    // remove flag dos outros PRIMEIRO (índice único exige no máximo 1 padrão)
    await supabase.from('checkin_templates').update({ is_padrao: false })
      .eq('nutri_id', nutriId).neq('id', t.id);
    await supabase.from('checkin_templates').update({ is_padrao: true }).eq('id', t.id);
    mostraToast(`"${t.nome}" agora é o template padrão`);
    onRecarregar();
  }

  async function criarPadraoLapidare() {
    const { error } = await supabase.from('checkin_templates').insert({
      nutri_id: nutriId,
      nome: TEMPLATE_PADRAO.nome,
      perguntas: TEMPLATE_PADRAO.perguntas,
      is_padrao: true,
    });
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast('Template padrão Essentia criado');
    onRecarregar();
  }

  async function duplicar(t) {
    const { error } = await supabase.from('checkin_templates').insert({
      nutri_id: nutriId,
      paciente_id: null,
      nome: t.nome + ' (cópia)',
      perguntas: t.perguntas,
      is_padrao: false,
    });
    if (error) return mostraToast('Erro: ' + error.message);
    mostraToast('Template duplicado');
    onRecarregar();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 6 }}>
        <button className="btn-outline" onClick={() => onEditar({ modo: 'importar' })}>
          <i className="ti ti-upload" aria-hidden="true"></i> Importar JSON
        </button>
        <button className="btn" onClick={() => onEditar({ modo: 'novo' })}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-clipboard-text empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem templates ainda</div>
          <div className="empty-sub">
            Comece com o <strong>template Essentia</strong> (14 perguntas — bem-estar, alimentação,
            hábitos, ciclo, intestino e espaço livre) ou crie um do zero / importe JSON.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <button className="btn-outline" onClick={() => onEditar({ modo: 'importar' })}>
              <i className="ti ti-upload" aria-hidden="true"></i> Importar JSON
            </button>
            <button className="btn-outline" onClick={() => onEditar({ modo: 'novo' })}>
              <i className="ti ti-plus" aria-hidden="true"></i> Em branco
            </button>
            <button className="btn" onClick={criarPadraoLapidare}>
              <i className="ti ti-sparkles" aria-hidden="true"></i> Usar template Essentia
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {templates.map((t, i) => {
            const paciente = pacientes.find(p => p.id === t.paciente_id);
            return (
              <div key={t.id} style={{
                padding: '12px 16px',
                borderBottom: i === templates.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'var(--bg2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <i className="ti ti-clipboard-text" style={{ fontSize: 17 }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{t.nome}</span>
                    {t.is_padrao && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 20,
                        background: 'var(--orange-bg)', color: 'var(--orange)', fontWeight: 600,
                      }}>PADRÃO</span>
                    )}
                    {paciente && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 20,
                        background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600,
                      }}>p/ {paciente.nome.split(' ')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {t.perguntas?.length ?? 0} perguntas · criado em {dataBR(t.created_at)}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {!t.is_padrao && !t.paciente_id && (
                    <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => definirPadrao(t)} title="Definir como padrão">
                      <i className="ti ti-star" aria-hidden="true"></i>
                    </button>
                  )}
                  <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => duplicar(t)} title="Duplicar">
                    <i className="ti ti-copy" aria-hidden="true"></i>
                  </button>
                  <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => onEditar(t)}>
                    <i className="ti ti-pencil" aria-hidden="true"></i> Editar
                  </button>
                  <button onClick={() => excluir(t)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '4px 8px',
                      color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================================================
   EDITOR DE TEMPLATE (criar / importar / editar)
   ============================================================ */
function TemplateEditor({ template, nutriId, pacientes, onClose, onSaved }) {
  // modos: 'novo' | 'importar' | objeto existente
  const isImportar = template?.modo === 'importar';
  const isNovo = template?.modo === 'novo';
  const isEdit = !isImportar && !isNovo && template?.id;

  const [nome, setNome] = useState(isEdit ? template.nome : (isImportar ? '' : TEMPLATE_PADRAO.nome));
  const [paciente, setPaciente] = useState(isEdit ? (template.paciente_id ?? '') : '');
  const [jsonText, setJsonText] = useState(isImportar
    ? ''
    : JSON.stringify({
        nome: isEdit ? template.nome : TEMPLATE_PADRAO.nome,
        perguntas: isEdit ? template.perguntas : TEMPLATE_PADRAO.perguntas,
      }, null, 2)
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  // Sempre que importar, popular nome a partir do JSON quando válido
  const perguntasParsed = useMemo(() => {
    try {
      const obj = JSON.parse(jsonText);
      const v = validarTemplate(obj);
      if (!v.ok) return null;
      return obj.perguntas;
    } catch { return null; }
  }, [jsonText]);

  async function salvar() {
    setErro(null);
    let obj;
    try { obj = JSON.parse(jsonText); } catch (e) { return setErro('JSON inválido: ' + e.message); }
    const v = validarTemplate({ ...obj, nome: nome.trim() || obj.nome });
    if (!v.ok) return setErro(v.erro);

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      paciente_id: paciente || null,
      nome: nome.trim() || obj.nome,
      perguntas: obj.perguntas,
      tipo: 'recorrente',
      updated_at: new Date().toISOString(),
    };
    const { error } = isEdit
      ? await supabase.from('checkin_templates').update(payload).eq('id', template.id)
      : await supabase.from('checkin_templates').insert(payload);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <ModalShell
      title={isEdit ? `Editar "${template.nome}"` : isImportar ? 'Importar template (JSON)' : 'Novo template'}
      subtitle="Cole ou edite o JSON com nome + perguntas (validado antes de salvar)"
      onClose={onClose} large>
      <label className="form-lbl" style={{ marginTop: 0 }}>Nome do template</label>
      <input value={nome} onChange={e => setNome(e.target.value)}
        placeholder="Ex: Check-in pré-consulta" />

      <label className="form-lbl">Para quem é este template?</label>
      <select value={paciente} onChange={e => setPaciente(e.target.value)}>
        <option value="">Todas as pacientes (template genérico)</option>
        {pacientes.map(p => <option key={p.id} value={p.id}>Específico de {p.nome}</option>)}
      </select>

      <label className="form-lbl">JSON do template</label>
      <textarea rows={14} value={jsonText} onChange={e => setJsonText(e.target.value)}
        placeholder='{"nome": "...", "perguntas": [...]}'
        style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />

      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
        Cada pergunta precisa de: <code>id</code>, <code>secao</code>, <code>tipo</code>, <code>pergunta</code>.
        Tipos válidos: emoji_scale, slider, single, multi, habitos, texto.
      </div>
      <DicaJSON
        exemploPrompt='gera um JSON de check-in semanal pra nutricionista acompanhar a paciente, com perguntas sobre humor (emoji_scale), aderência ao plano (slider 0-10), dificuldades (texto), hábitos da semana (multi). Estrutura: { "nome": "Check-in semanal", "perguntas": [{ "id": "...", "secao": "...", "tipo": "...", "pergunta": "...", "opcoes": [...] }] }' />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
        <button className="btn-outline" onClick={() => setPreviewOpen(true)} disabled={!perguntasParsed}>
          <i className="ti ti-eye" aria-hidden="true"></i> Preview
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>

      {previewOpen && perguntasParsed && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(28,23,18,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110,
        }} onClick={() => setPreviewOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--white)', borderRadius: 12, padding: 22,
            width: 540, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>É assim que a paciente vai ver.</div>
            <div style={{ background: '#f7f3ee', borderRadius: 12, padding: '8px 0' }}>
              <CheckinForm perguntas={perguntasParsed} valores={{}} onChange={() => {}} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-outline" onClick={() => setPreviewOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ============================================================
   TAB PROGRAMAÇÃO
   ============================================================ */
function ProgramacaoTab({ agendamentos, templates, pacientes, nutriId, onRecarregar, mostraToast, onEditar }) {
  async function toggle(ag) {
    await supabase.from('checkin_agendamentos').update({ ativo: !ag.ativo }).eq('id', ag.id);
    mostraToast(ag.ativo ? 'Agendamento pausado' : 'Agendamento ativado');
    onRecarregar();
  }
  async function excluir(ag) {
    if (!window.confirm('Excluir este agendamento?')) return;
    await supabase.from('checkin_agendamentos').delete().eq('id', ag.id);
    mostraToast('Agendamento removido');
    onRecarregar();
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={() => onEditar({})} disabled={templates.length === 0}>
          <i className="ti ti-calendar-plus" aria-hidden="true"></i> Novo agendamento
        </button>
      </div>

      <div className="al-b" style={{ marginBottom: 12, background: 'var(--bg2)' }}>
        <i className="ti ti-info-circle" style={{ fontSize: 16, marginTop: 1 }} aria-hidden="true"></i>
        <div>
          <div className="al-t">Como o agendamento funciona</div>
          <div className="al-d">
            Os envios disparam automaticamente quando você abre o painel no dia (ou após).
            Você não precisa estar logada o dia inteiro — basta abrir uma vez para os pendentes irem.
          </div>
        </div>
      </div>

      {agendamentos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-calendar empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem agendamentos</div>
          <div className="empty-sub">
            Crie um agendamento para enviar check-ins automaticamente em frequência semanal, quinzenal ou mensal.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {agendamentos.map((ag, i) => (
            <div key={ag.id} style={{
              padding: '12px 16px',
              borderBottom: i === agendamentos.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: ag.ativo ? 1 : .55,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: ag.ativo ? 'var(--green-bg)' : 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className={`ti ti-${ag.ativo ? 'calendar-check' : 'calendar-x'}`}
                   style={{ fontSize: 17, color: ag.ativo ? 'var(--green)' : 'var(--text3)' }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {ag.template?.nome ?? '—'} → {ag.paciente?.nome ?? 'Todas as pacientes'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {labelFrequencia(ag.frequencia)} · próximo envio: <strong>{dataBR(ag.proximo_envio)}</strong>
                  {ag.ultimo_envio && ` · último: ${dataBR(ag.ultimo_envio)}`}
                </div>
              </div>
              <div style={{ display: 'inline-flex', gap: 6 }}>
                <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => toggle(ag)}>
                  {ag.ativo ? 'Pausar' : 'Ativar'}
                </button>
                <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => onEditar(ag)}>
                  <i className="ti ti-pencil" aria-hidden="true"></i>
                </button>
                <button onClick={() => excluir(ag)}
                  style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 8px',
                    color: 'var(--red)', cursor: 'pointer',
                  }}>
                  <i className="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AgendamentoEditor({ agendamento, templates, pacientes, nutriId, onClose, onSaved }) {
  const isEdit = !!agendamento?.id;
  const hoje = new Date().toISOString().slice(0, 10);

  const [templateId, setTemplateId] = useState(agendamento?.template_id ?? templates.find(t => t.is_padrao)?.id ?? templates[0]?.id ?? '');
  const [pacienteId, setPacienteId] = useState(agendamento?.paciente_id ?? '');
  const [frequencia, setFrequencia] = useState(agendamento?.frequencia ?? 'semanal');
  const [proximoEnvio, setProximoEnvio] = useState(agendamento?.proximo_envio ?? hoje);
  const [ativo, setAtivo] = useState(agendamento?.ativo ?? true);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  async function salvar() {
    setErro(null);
    if (!templateId) return setErro('Selecione um template.');
    if (!proximoEnvio) return setErro('Defina a data do próximo envio.');
    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      paciente_id: pacienteId || null,
      template_id: templateId,
      frequencia,
      proximo_envio: proximoEnvio,
      ativo,
    };
    const { error } = isEdit
      ? await supabase.from('checkin_agendamentos').update(payload).eq('id', agendamento.id)
      : await supabase.from('checkin_agendamentos').insert(payload);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <ModalShell title={isEdit ? 'Editar agendamento' : 'Novo agendamento'}
      subtitle="Configure envio automático em frequência regular" onClose={onClose}>
      <label className="form-lbl" style={{ marginTop: 0 }}>Template</label>
      <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
        {templates.map(t => (
          <option key={t.id} value={t.id}>
            {t.nome} ({t.perguntas?.length ?? 0} perguntas){t.is_padrao ? ' · padrão' : ''}
          </option>
        ))}
      </select>

      <label className="form-lbl">Para quem enviar</label>
      <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}>
        <option value="">Todas as pacientes</option>
        {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Frequência</label>
          <select value={frequencia} onChange={e => setFrequencia(e.target.value)}>
            <option value="semanal">Semanal (a cada 7 dias)</option>
            <option value="quinzenal">Quinzenal (a cada 14 dias)</option>
            <option value="mensal">Mensal</option>
          </select>
        </div>
        <div>
          <label className="form-lbl">Próximo envio</label>
          <DateInput value={proximoEnvio} onChange={e => setProximoEnvio(e.target.value)} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)}
          style={{ accentColor: 'var(--amber)' }} />
        Agendamento ativo
      </label>

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   MODAIS
   ============================================================ */
function RespostasModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  const pacienteNome = envio.paciente?.nome ?? '—';

  function baixarPDF() {
    const linhas = (envio.perguntas ?? []).map(p => `
      <div style="padding: 12px 0; border-bottom: 1px solid #e3dcce;">
        <div style="font-size: 10px; letter-spacing: 1px; color: #888; text-transform: uppercase; margin-bottom: 4px;">
          ${escapeHtml(p.secao || '')}
        </div>
        <div style="font-size: 14px; color: #2b2b2b; font-weight: 500; margin-bottom: 6px;">
          ${escapeHtml(p.pergunta || '')}
        </div>
        <div style="font-size: 14px; color: #4a3828; background: #faf7f2; padding: 8px 12px; border-radius: 6px;">
          ${escapeHtml(formatarResposta(p, respostas[p.id]))}
        </div>
      </div>`).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Questionário · ${escapeHtml(pacienteNome)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           color: #2b2b2b; max-width: 720px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    .header { border-bottom: 2px solid #c9a96e; padding-bottom: 12px; margin-bottom: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Questionário pré-consulta</h1>
    <div class="meta">
      Paciente: <strong>${escapeHtml(pacienteNome)}</strong><br>
      Respondido em ${escapeHtml(dataBR(envio.respondido_em))}
      · Enviado em ${escapeHtml(dataBR(envio.enviado_em))}
    </div>
  </div>
  ${linhas}
  <div style="margin-top: 30px; font-size: 10px; color: #aaa; text-align: center;">
    Gerado pela Essentia
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups pra gerar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <ModalShell title="Respostas do questionário"
      subtitle={`${pacienteNome} · respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose} large>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12, marginTop: 8 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 14, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
        <button className="btn" onClick={baixarPDF}>
          <i className="ti ti-download" aria-hidden="true"></i> Baixar PDF
        </button>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 600 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
