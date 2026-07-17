import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, brl, gerarParcelas, FORMAS_PGTO_LIST, normalizarTelefone, telefoneValido } from '../../lib/utils.js';
import { criarVendaComParcelas } from '../../lib/vendas.js';
import DateInput from '../../components/DateInput.jsx';

const OBJETIVOS = ['Emagrecimento', 'Hipertrofia', 'Reeducação alimentar', 'Saúde geral', 'Performance esportiva', 'Oncologia', 'Preparo pré-cirúrgico', 'Outro'];
const PLANOS    = [
  { v: 'avulsa',   l: 'Avulsa' },
  { v: 'essentia', l: 'Essentia' },
];
const MODALIDADES = ['Presencial', 'Online', 'Híbrido'];

export default function Cadastrar() {
  const { user } = useSession();
  const navigate = useNavigate();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [objetivo, setObjetivo] = useState('Emagrecimento');
  const [tipoPlano, setTipoPlano] = useState('avulsa');
  const [modalidade, setModalidade] = useState('Online');
  const [endereco, setEndereco] = useState('');
  const [obs, setObs] = useState('');

  const [preConsultaId, setPreConsultaId] = useState('');
  const [templatesPreConsulta, setTemplatesPreConsulta] = useState([]);

  // ─── Pagamento (opcional) — mesma lógica do modal "Nova venda" ───
  const hoje = new Date().toISOString().slice(0, 10);
  const [pagOpen, setPagOpen] = useState(false);
  const [servicos, setServicos] = useState([]);
  const [pgServicoId, setPgServicoId] = useState('');   // '' = manual/custom
  const [pgServico, setPgServico] = useState('');
  const [pgValor, setPgValor] = useState('');
  const [pgData, setPgData] = useState(hoje);
  const [pgForma, setPgForma] = useState('pix');
  const [pgNParcelas, setPgNParcelas] = useState(3);
  const [pgNMeses, setPgNMeses] = useState(3);
  const [pgDiaVenc, setPgDiaVenc] = useState(15);
  const [pgObs, setPgObs] = useState('');

  const pgValorNum = Number(String(pgValor).replace(',', '.')) || 0;

  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);   // pendente criado (objeto)
  const [pendentes, setPendentes] = useState([]);

  function escolherServico(id) {
    setPgServicoId(id);
    if (!id) { setPgServico(''); setPgValor(''); return; }
    const s = servicos.find(x => x.id === id);
    if (s) { setPgServico(s.nome); setPgValor(String(s.ticket).replace('.', ',')); }
  }

  function escolherForma(f) {
    setPgForma(f);
    if (f === 'pix' || f === 'dinheiro') setPgNParcelas(1);
    else if (f === 'parcelado' && pgNParcelas < 2) setPgNParcelas(2);
  }

  const parcelasPreview = useMemo(() => {
    if (!pgValorNum || !pgData) return [];
    return gerarParcelas({
      forma_pgto: pgForma,
      valor_total: pgValorNum,
      data_venda: pgData,
      n_parcelas: pgForma === 'asaas' ? pgNMeses
                : ['pix', 'dinheiro', 'parcelado'].includes(pgForma) ? pgNParcelas
                : 1,
      dia_venc: pgDiaVenc,
    });
  }, [pgForma, pgValorNum, pgData, pgNParcelas, pgNMeses, pgDiaVenc]);

  async function carregarPendentes() {
    if (!user) return;
    const { data } = await supabase
      .from('pacientes_pendentes')
      .select('*')
      .eq('nutri_id', user.id)
      .neq('status', 'ativado')
      .order('created_at', { ascending: false });
    setPendentes(data ?? []);
  }

  async function carregarTemplatesPreConsulta() {
    if (!user) return;
    const { data } = await supabase
      .from('checkin_templates')
      .select('id, nome, perguntas')
      .eq('nutri_id', user.id)
      .eq('tipo', 'pre_consulta')
      .order('created_at');
    setTemplatesPreConsulta(data ?? []);
  }

  async function carregarServicos() {
    if (!user) return;
    const { data } = await supabase
      .from('servicos')
      .select('id, nome, ticket, ativo')
      .eq('nutri_id', user.id).eq('ativo', true)
      .order('ticket', { ascending: false });
    setServicos(data ?? []);
  }

  useEffect(() => { carregarPendentes(); carregarTemplatesPreConsulta(); carregarServicos(); }, [user]);

  function resetForm() {
    setNome(''); setEmail(''); setTelefone(''); setNascimento('');
    setObjetivo('Emagrecimento'); setTipoPlano('avulsa');
    setModalidade('Online'); setEndereco(''); setObs('');
    setPreConsultaId('');
    // pagamento
    setPagOpen(false);
    setPgServicoId(''); setPgServico(''); setPgValor(''); setPgData(hoje);
    setPgForma('pix'); setPgNParcelas(3); setPgNMeses(3); setPgDiaVenc(15); setPgObs('');
  }

  async function salvar(e) {
    e?.preventDefault?.();
    setErro(null); setSucesso(null);
    if (!nome.trim()) return setErro('Informe o nome.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Email inválido.');
    if (!telefone.trim()) return setErro('Informe o telefone.');

    // Pagamento: só lança se serviço E valor > 0. Se preencheu só um, avisa.
    const querPagamento    = pgServico.trim() !== '' || pgValorNum > 0;
    const pagamentoCompleto = pgServico.trim() !== '' && pgValorNum > 0;
    if (querPagamento && !pagamentoCompleto) {
      return setErro('Para lançar o pagamento, informe o serviço e um valor válido — ou deixe ambos em branco.');
    }

    setBusy(true);
    const emailVal = email.trim().toLowerCase() || null;
    const pacientePayload = {
      nutri_id: user.id,
      nome: nome.trim(),
      email: emailVal,
      telefone: telefone.trim(),
      nascimento: nascimento || null,
      objetivo,
      tipo_plano: tipoPlano,
      modalidade,
      endereco: endereco.trim() || null,
      obs: obs.trim() || null,
    };
    const { data: pacienteData, error: pacienteError } = await supabase
      .from('pacientes')
      .insert(pacientePayload)
      .select('id, nome, email')
      .single();
    if (pacienteError) { setBusy(false); return setErro('Erro ao cadastrar: ' + pacienteError.message); }

    // Lança a venda vinculada à paciente recém-criada (se pagamento preenchido).
    // Se falhar, MANTÉM a paciente e apenas avisa — nunca desfaz o cadastro.
    let avisoVenda = null;
    if (pagamentoCompleto) {
      const { error: vendaErro } = await criarVendaComParcelas(supabase, {
        nutriId: user.id,
        pacienteId: pacienteData.id,
        servicoId: pgServicoId,
        servico: pgServico,
        valorTotal: pgValorNum,
        forma: pgForma,
        dataVenda: pgData,
        nParcelas: pgNParcelas,
        nMeses: pgNMeses,
        diaVenc: pgDiaVenc,
        obs: pgObs,
      });
      if (vendaErro) {
        avisoVenda = 'Paciente cadastrada, mas o pagamento não foi lançado — registre pelo Financeiro. (' + vendaErro + ')';
      }
    }

    if (preConsultaId) {
      const tpl = templatesPreConsulta.find(t => t.id === preConsultaId);
      if (tpl) {
        await supabase.from('checkin_envios').insert({
          nutri_id: user.id,
          paciente_id: pacienteData.id,
          nome: tpl.nome,
          tipo: 'pre_consulta',
          perguntas: tpl.perguntas,
        });
      }
    }

    // Cria o pendente SEMPRE — mesmo sem e-mail. O paciente_id liga o pendente
    // à ficha recém-criada; é a chave que o handle_new_user usa pra vincular
    // no signup (o token sozinho não achava a ficha sem e-mail).
    const pendentePayload = {
      nutri_id: user.id,
      paciente_id: pacienteData.id,
      nome: nome.trim(),
      email: emailVal,
      telefone: telefone.trim(),
      nascimento: nascimento || null,
      objetivo,
      tipo_plano: tipoPlano,
      modalidade,
      endereco: endereco.trim() || null,
      status: 'pendente',
    };
    const { data: pData } = await supabase
      .from('pacientes_pendentes')
      .insert(pendentePayload)
      .select('*')
      .single();
    const pendente = pData ?? null;

    setBusy(false);
    setSucesso({ id: pacienteData.id, nome: pacienteData.nome, email: pacienteData.email, pendente, avisoVenda });
    resetForm();
    carregarPendentes();
  }

  function linkDe(p) {
    return `${window.location.origin}/signup-paciente/${user.id}/${p.token}`;
  }

  function mensagemWhats(p) {
    const link = linkDe(p);
    const primeiroNome = p.nome.split(' ')[0];
    return encodeURIComponent(
      `Oi ${primeiroNome}! 😊\n\nPreparei seu acesso ao app de acompanhamento nutricional. Clica no link abaixo, cria sua senha e já entra:\n\n${link}\n\nQualquer dúvida, me chama por aqui!\n\n---\n\nPra instalar o app no seu celular:\n\nNo iPhone (precisa ser pelo Safari):\n1. Abra este link no Safari.\n2. Toque no botão de compartilhar (o quadradinho com a seta para cima, na barra de baixo).\n3. Role para baixo e toque em "Adicionar à Tela de Início".\n4. Toque em "Adicionar". Depois, abra o app pelo ícone que apareceu na tela.\n\nNo Android:\n1. Abra este link no Chrome.\n2. Toque no menu (os três pontinhos no canto superior direito).\n3. Toque em "Instalar app" (ou "Adicionar à tela inicial").\n4. Confirme. Depois, abra o app pelo ícone que apareceu na tela.\n\nInstalar assim deixa o app na sua tela como qualquer outro aplicativo — e é o que permite receber os avisos e lembretes direto no celular.`
    );
  }

  async function copiarLink(p) {
    try {
      await navigator.clipboard.writeText(linkDe(p));
      alert('Link copiado!');
    } catch {
      prompt('Copie o link abaixo:', linkDe(p));
    }
  }

  async function excluirPendente(pendente) {
    if (!window.confirm(`Excluir cadastro pendente de "${pendente.nome}"?`)) return;
    await supabase.from('pacientes_pendentes').delete().eq('id', pendente.id);
    carregarPendentes();
  }

  const campoStyle = {
    width: '100%', padding: '10px 12px', fontSize: 13,
    border: '0.5px solid var(--border)', borderRadius: 8,
    outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
  };
  const lblStyle = {
    display: 'block', fontSize: 11, color: 'var(--text3)',
    marginBottom: 5, fontWeight: 500,
  };

  return (
    <>
      <div className="page-title">Cadastrar paciente</div>
      <div className="page-sub">Preencha os dados da paciente — ela recebe um link pra criar só a senha</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>

        {/* ─── Formulário ─── */}
        <form onSubmit={salvar} className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Novo cadastro</div>

          <Field label="Nome completo *" value={nome} onChange={setNome} required autoFocus />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr', gap: 10 }}>
            <Field label="Email (opcional)" type="email" value={email} onChange={setEmail} />
            <Field label="Telefone *" type="tel" value={telefone} onChange={setTelefone} required placeholder="(11) 99999-9999" />
            <Field label="Data de nascimento" type="date" value={nascimento} onChange={setNascimento} />
          </div>

          <SelectField label="Objetivo" value={objetivo} onChange={setObjetivo} options={OBJETIVOS} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SelectField label="Tipo de plano" value={tipoPlano} onChange={setTipoPlano} options={PLANOS} />
            <SelectField label="Modalidade" value={modalidade} onChange={setModalidade} options={MODALIDADES} />
          </div>

          <Field label="Endereço completo (opcional · para nota fiscal)" value={endereco} onChange={setEndereco} placeholder="Rua, número, bairro, cidade, UF, CEP" />

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{
              display: 'block', fontSize: 11, color: 'var(--text3)',
              marginBottom: 5, fontWeight: 500,
            }}>Observação (opcional)</span>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Ex: indicada pela Camila"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'var(--font-sans)',
                resize: 'vertical', boxSizing: 'border-box',
              }} />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{
              display: 'block', fontSize: 11, color: 'var(--text3)',
              marginBottom: 5, fontWeight: 500,
            }}>Questionário de pré-consulta</span>
            <select
              value={preConsultaId}
              onChange={e => setPreConsultaId(e.target.value)}
              disabled={templatesPreConsulta.length === 0}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box', minHeight: 44,
                opacity: templatesPreConsulta.length === 0 ? 0.55 : 1,
              }}>
              {templatesPreConsulta.length === 0 ? (
                <option value="">Nenhum modelo cadastrado</option>
              ) : (
                <>
                  <option value="">Nenhum</option>
                  {templatesPreConsulta.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </>
              )}
            </select>
            {templatesPreConsulta.length === 0 && (
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Crie um modelo em <strong>Questionários</strong> para habilitar esta opção.
              </span>
            )}
          </label>

          {/* ─── Pagamento (opcional, recolhido por padrão) ─── */}
          <div style={{
            border: '0.5px solid var(--border)', borderRadius: 8,
            marginBottom: 12, overflow: 'hidden',
          }}>
            <button type="button" onClick={() => setPagOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 12px', background: 'var(--bg2)', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13,
                fontWeight: 500, color: 'var(--text2)', textAlign: 'left',
              }}>
              <i className="ti ti-cash" style={{ fontSize: 16, color: 'var(--green)' }} aria-hidden="true"></i>
              <span style={{ flex: 1 }}>Lançar pagamento (opcional)</span>
              {pgServico.trim() !== '' && pgValorNum > 0 && !pagOpen && (
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                  {brl(pgValorNum)}
                </span>
              )}
              <i className={`ti ti-chevron-${pagOpen ? 'up' : 'down'}`}
                style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
            </button>

            {pagOpen && (
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
                  Preencha para já registrar a venda no Financeiro. Deixe em branco para cadastrar só a paciente.
                </div>

                <label style={lblStyle}>Serviço</label>
                {servicos.length > 0 ? (
                  <select value={pgServicoId} onChange={e => escolherServico(e.target.value)} style={campoStyle}>
                    <option value="">— Outro (digitar manualmente) —</option>
                    {servicos.map(s => (
                      <option key={s.id} value={s.id}>{s.nome} · {brl(s.ticket)}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                    Cadastre serviços em <strong>Meus serviços</strong> para selecionar com 1 clique.
                  </div>
                )}
                {(!pgServicoId || servicos.length === 0) && (
                  <input value={pgServico} onChange={e => setPgServico(e.target.value)}
                    placeholder="Ex: Acompanhamento trimestral"
                    style={{ ...campoStyle, marginTop: 6 }} />
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  <div>
                    <label style={lblStyle}>Valor total (R$)</label>
                    <input inputMode="decimal" value={pgValor} onChange={e => setPgValor(e.target.value)}
                      placeholder="0,00" style={campoStyle} />
                  </div>
                  <div>
                    <label style={lblStyle}>Data da venda</label>
                    <DateInput value={pgData} onChange={e => setPgData(e.target.value)} />
                  </div>
                </div>

                <label style={{ ...lblStyle, marginTop: 12 }}>Forma de pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {FORMAS_PGTO_LIST.map(f => {
                    const ativo = pgForma === f.id;
                    return (
                      <button key={f.id} type="button" onClick={() => escolherForma(f.id)}
                        style={{
                          border: ativo ? 'none' : '0.5px solid var(--border)',
                          background: ativo ? 'var(--dark)' : 'var(--white)',
                          color: ativo ? 'var(--white)' : 'var(--text2)',
                          borderRadius: 7, padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-sans)',
                        }}>
                        <i className={`ti ti-${f.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                {['pix', 'dinheiro', 'parcelado'].includes(pgForma) && (
                  <>
                    <label style={lblStyle}>Número de parcelas</label>
                    <select value={pgNParcelas} onChange={e => setPgNParcelas(Number(e.target.value))} style={campoStyle}>
                      {(pgForma === 'pix' || pgForma === 'dinheiro') && (
                        <option value={1}>1x — à vista (entra como recebido)</option>
                      )}
                      {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                        <option key={n} value={n}>{n}x (venc. mensais)</option>
                      ))}
                    </select>
                  </>
                )}

                {pgForma === 'asaas' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lblStyle}>Número de meses</label>
                      <select value={pgNMeses} onChange={e => setPgNMeses(Number(e.target.value))} style={campoStyle}>
                        {[1, 2, 3, 4, 5, 6, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lblStyle}>Dia do vencimento</label>
                      <select value={pgDiaVenc} onChange={e => setPgDiaVenc(Number(e.target.value))} style={campoStyle}>
                        {[5, 10, 15, 20, 25, 28].map(d => <option key={d} value={d}>dia {d}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {parcelasPreview.length > 0 && (
                  <div style={{
                    background: 'var(--bg2)', borderRadius: 6, padding: '8px 10px',
                    marginTop: 10, fontSize: 13, color: 'var(--text2)',
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Preview:</div>
                    {parcelasPreview.length === 1
                      ? `1 parcela única de ${brl(parcelasPreview[0].valor)} no dia ${dataBR(parcelasPreview[0].vencimento)}`
                      : `${parcelasPreview.length}x de ${brl(parcelasPreview[0].valor)}${parcelasPreview[0].valor !== parcelasPreview[parcelasPreview.length-1].valor ? ` (última ${brl(parcelasPreview[parcelasPreview.length-1].valor)})` : ''} — primeira ${dataBR(parcelasPreview[0].vencimento)} / última ${dataBR(parcelasPreview[parcelasPreview.length-1].vencimento)}`
                    }
                  </div>
                )}

                <label style={{ ...lblStyle, marginTop: 12 }}>Observação do pagamento (opcional)</label>
                <textarea rows="2" value={pgObs} onChange={e => setPgObs(e.target.value)}
                  placeholder="Ex: desconto dado, adiantou 1 mês..."
                  style={{ ...campoStyle, resize: 'none' }} />
              </div>
            )}
          </div>

          {erro && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 10,
              background: 'var(--red-bg)', color: 'var(--red)',
            }}>{erro}</div>
          )}

          <button type="submit" className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="ti ti-user-plus" aria-hidden="true"></i>
            {busy ? 'Cadastrando...' : 'Cadastrar paciente'}
          </button>
        </form>

        {/* ─── Painel direito: sucesso recente OU instruções ─── */}
        <div>
          {sucesso ? (
            <CartaoSucesso
              pacienteId={sucesso.id}
              nome={sucesso.nome}
              pendente={sucesso.pendente}
              avisoVenda={sucesso.avisoVenda}
              link={sucesso.pendente ? linkDe(sucesso.pendente) : null}
              mensagemWhats={sucesso.pendente ? mensagemWhats(sucesso.pendente) : null}
              onCopiar={sucesso.pendente ? () => copiarLink(sucesso.pendente) : null}
              onDispensar={() => setSucesso(null)}
              onIrPerfil={() => navigate(`/nutri/pacientes/${sucesso.id}`)} />
          ) : (
            <div className="al-b" style={{ marginBottom: 12 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--blue)', marginTop: 1 }} aria-hidden="true"></i>
              <div>
                <div className="al-t" style={{ color: 'var(--blue)' }}>Como funciona</div>
                <div className="al-d">
                  Você preenche os dados administrativos (objetivo, plano, modalidade).
                  O sistema gera um link único, você envia pra paciente, e ela só precisa criar a senha.
                  Os dados já chegam pré-preenchidos pra ela — sem confusão.
                </div>
              </div>
            </div>
          )}

          {/* ─── Lista de pendentes ─── */}
          <div className="section-label" style={{ marginTop: 4 }}>
            Cadastros pendentes ({pendentes.length})
          </div>
          {pendentes.length === 0 ? (
            <div style={{
              padding: '14px 16px', fontSize: 12, color: 'var(--text3)',
              background: 'var(--bg2)', borderRadius: 8,
            }}>
              Nenhuma paciente aguardando — todas que você cadastrou já criaram conta.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendentes.map(p => (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {p.email} · cadastrada em {dataBR(p.created_at)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {p.objetivo} · {p.tipo_plano} · {p.modalidade}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: p.status === 'enviado' ? 'var(--green-bg)' : 'var(--orange-bg)',
                      color:      p.status === 'enviado' ? 'var(--green)'    : 'var(--orange)',
                      fontWeight: 500,
                    }}>
                      {p.status === 'enviado' ? '✓ Link enviado' : 'Aguardando envio'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn-outline" onClick={() => copiarLink(p)}
                      style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-copy" aria-hidden="true"></i> Copiar link
                    </button>
                    <a className="btn-outline"
                      href={telefoneValido(p.telefone)
                        ? `https://wa.me/${normalizarTelefone(p.telefone)}?text=${mensagemWhats(p)}`
                        : `https://wa.me/?text=${mensagemWhats(p)}`}
                      target="_blank" rel="noreferrer"
                      onClick={async () => {
                        await supabase.from('pacientes_pendentes')
                          .update({ status: 'enviado' }).eq('id', p.id);
                        carregarPendentes();
                      }}
                      style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>
                      <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
                      {!telefoneValido(p.telefone) && (
                        <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>sem número</span>
                      )}
                    </a>
                    <button onClick={() => excluirPendente(p)}
                      style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        color: 'var(--red)', marginLeft: 'auto',
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


function CartaoSucesso({ pacienteId, nome, pendente, avisoVenda, link, mensagemWhats, onCopiar, onDispensar, onIrPerfil }) {
  const primeiroNome = nome?.split(' ')[0] ?? '';
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'var(--green-bg, #ecfdf5)',
      border: '0.5px solid var(--green, #10b981)',
      borderLeft: '3px solid var(--green, #10b981)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green, #10b981)', marginBottom: 4 }}>
            ✓ {primeiroNome} cadastrada
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {pendente
              ? 'Agora envie o link abaixo. Ela só vai precisar criar a senha.'
              : 'Cadastrada sem email. Você pode acessar o perfil para preencher mais dados.'}
          </div>
        </div>
        <button onClick={onDispensar}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, color: 'var(--text3)', padding: 0,
          }}>
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      {avisoVenda && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 6,
          background: 'var(--orange-bg, #fff7ed)', color: 'var(--orange, #c2410c)',
          fontSize: 12, lineHeight: 1.5, display: 'flex', gap: 6,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} aria-hidden="true"></i>
          <span>{avisoVenda}</span>
        </div>
      )}

      {pendente && link ? (
        <>
          <div style={{
            marginTop: 10, padding: '8px 10px',
            background: 'var(--white)', borderRadius: 6,
            fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-soft)',
            wordBreak: 'break-all',
          }}>{link}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="btn" onClick={onCopiar} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
              <i className="ti ti-copy" aria-hidden="true"></i> Copiar link
            </button>
            <a className="btn-outline"
              href={telefoneValido(pendente.telefone)
                ? `https://wa.me/${normalizarTelefone(pendente.telefone)}?text=${mensagemWhats}`
                : `https://wa.me/?text=${mensagemWhats}`}
              target="_blank" rel="noreferrer"
              style={{ flex: 1, justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}>
              <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
              {!telefoneValido(pendente.telefone) && (
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>sem número</span>
              )}
            </a>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={onIrPerfil} style={{ fontSize: 12, justifyContent: 'center' }}>
            <i className="ti ti-arrow-right" aria-hidden="true"></i> Ir para o perfil
          </button>
        </div>
      )}
    </div>
  );
}


function Field({ label, value, onChange, type = 'text', required, autoFocus, placeholder }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, color: 'var(--text3)',
        marginBottom: 5, fontWeight: 500,
      }}>{label}</span>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        required={required} autoFocus={autoFocus} placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          border: '0.5px solid var(--border)', borderRadius: 8,
          outline: 'none', fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  const opts = options.map(o => typeof o === 'string' ? { v: o, l: o } : o);
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, color: 'var(--text3)',
        marginBottom: 5, fontWeight: 500,
      }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          border: '0.5px solid var(--border)', borderRadius: 8,
          outline: 'none', fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}>
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
