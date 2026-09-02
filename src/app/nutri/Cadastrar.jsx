import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, brl, valorBR, gerarParcelas, distribuirTaxa, taxaSugerida, maxParcelas, clampParcelas, MAX_PARCELAS_ESSENTIA, FORMAS_PGTO_LIST, FORMAS_COM_TAXA, normalizarTelefone, telefoneValido, dataLocalISO } from '../../lib/utils.js';
import { criarVendaComParcelas } from '../../lib/vendas.js';
import { linkConvite, mensagemConviteEncoded } from '../../lib/convite.js';
import { OBJETIVOS } from '../../lib/objetivos.js';
import { SEXOS, PLANOS, MODALIDADES } from '../../lib/opcoesPaciente.js';
import { perguntasParaPaciente } from '../../lib/checkinVariacao.js';
import DateInput from '../../components/DateInput.jsx';

// O "— não informado —" é opção de tela, não valor de banco: por isso mora
// aqui e não em SEXOS. Hoisted para não remontar o array a cada render.
const SEXOS_COM_VAZIO = [{ v: '', l: '— não informado —' }, ...SEXOS];

export default function Cadastrar() {
  const { user, profile } = useSession();
  const navigate = useNavigate();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nascimento, setNascimento] = useState('');
  // Nasce VAZIO, ao contrário de objetivo/plano/modalidade, que têm padrão. Um
  // default aqui gravaria um palpite na ficha como se fosse informado — é
  // exatamente o erro que a coluna existe para evitar.
  const [sexo, setSexo] = useState('');
  const [objetivo, setObjetivo] = useState('Emagrecimento');
  const [tipoPlano, setTipoPlano] = useState('avulsa');
  const [modalidade, setModalidade] = useState('Online');
  const [valorContrato, setValorContrato] = useState('');
  const [endereco, setEndereco] = useState('');
  const [obs, setObs] = useState('');

  const [preConsultaId, setPreConsultaId] = useState('');
  const [templatesPreConsulta, setTemplatesPreConsulta] = useState([]);

  // ─── Pagamento (opcional) — mesma lógica do modal "Nova venda" ───
  const hoje = dataLocalISO();
  const [pagOpen, setPagOpen] = useState(false);
  const [servicos, setServicos] = useState([]);
  const [pgServicoId, setPgServicoId] = useState('');   // '' = manual/custom
  const [pgServico, setPgServico] = useState('');
  const [pgValor, setPgValor] = useState('');
  const [pgData, setPgData] = useState(hoje);
  const [pgForma, setPgForma] = useState('pix');
  const [pgNParcelas, setPgNParcelas] = useState(3);
  const [pgObs, setPgObs] = useState('');
  const [pgTaxa, setPgTaxa] = useState('');
  // false = o campo segue a sugestão dos percentuais; true = a nutri digitou,
  // e o que ela digitou manda.
  const [pgTaxaEditada, setPgTaxaEditada] = useState(false);
  // null = segue o perfil (nutris.maquininha_antecipa); true/false = a nutri
  // discordou nesta venda. Três valores, e não um boolean com useEffect, pelo
  // mesmo motivo do NovaVendaModal: `profile` chega assíncrono.
  const [pgAntecipadoManual, setPgAntecipadoManual] = useState(null);

  const pgValorNum = valorBR(pgValor);
  const pgComTaxa = FORMAS_COM_TAXA.includes(pgForma);

  // Aqui o plano é o do próprio formulário — a paciente está nascendo agora.
  const pgMaxN = maxParcelas(pgForma, tipoPlano);

  // Número de parcelas EFETIVO, extraído porque dois cálculos dependem dele:
  // gerarParcelas e a sugestão de taxa. Duplicá-lo faria a taxa sugerida ser
  // de um parcelamento e as parcelas de outro.
  const pgNEfetivo = ['pix', 'dinheiro', 'parcelado'].includes(pgForma) ? pgNParcelas : 1;

  // Mesma mecânica do NovaVendaModal: automático até ela digitar. Os
  // percentuais vêm de profile, que já traz a linha inteira de `nutris`
  // porque session.jsx faz select(*).
  const pgSugestao = useMemo(
    () => taxaSugerida(profile, pgForma, pgValorNum, pgNEfetivo),
    [profile, pgForma, pgValorNum, pgNEfetivo],
  );
  const pgTaxaMostrada = pgTaxaEditada
    ? pgTaxa
    : (pgSugestao.valor ? String(pgSugestao.valor).replace('.', ',') : '');
  const pgTaxaNum = pgTaxaEditada
    ? valorBR(pgTaxa)
    : pgSugestao.valor;

  // `?? true` cobre perfil ainda não carregado e coluna ainda não criada — os
  // dois caem no mesmo valor do default da migration. `pgComTaxa` no E porque
  // só cartão passa por maquininha.
  const pgAntecipado = pgComTaxa && (pgAntecipadoManual ?? (profile?.maquininha_antecipa ?? true));

  // Tira o separador de milhar antes de trocar a vírgula: aceita "2700,00" e
  // "2.700,00".
  //
  // Continua com regra PRÓPRIA, e não com valorBR() como o pgValorNum acima:
  // aqui todo ponto vira milhar, então "2700.50" daria 270050. É deliberado
  // enquanto o campo for este — o valor do contrato entra num documento com
  // força probatória e é conferido antes de assinar, ao contrário do valor da
  // venda, digitado correndo. Se um dia isso for unificado, é valorBR() que
  // vale, e não o contrário.
  const valorContratoNum = Number(String(valorContrato).replace(/\./g, '').replace(',', '.')) || 0;

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

  // Trocar o plano depois de já ter escolhido a venda pode baixar o teto:
  // Avulsa em 12x virando Essentia tem que voltar para 10.
  function escolherPlano(v) {
    setTipoPlano(v);
    setPgNParcelas(n => clampParcelas(n, pgForma, v));
  }

  function escolherForma(f) {
    setPgForma(f);
    if (f === 'pix' || f === 'dinheiro') setPgNParcelas(1);
    // clampParcelas cuida do piso (2) e do teto: 12x escolhido no Pix não pode
    // sobreviver à troca para Parcelado numa Essentia, onde o select só vai a 10.
    else if (f === 'parcelado') setPgNParcelas(n => clampParcelas(n, f, tipoPlano));
    // Sem isto, uma taxa digitada para cartão sobreviveria à troca para Pix e
    // seria gravada numa venda que não tem taxa nenhuma.
    if (!FORMAS_COM_TAXA.includes(f)) setPgTaxa('');
    // Trocar de forma devolve o campo ao automático: a taxa de um crédito à
    // vista não tem por que sobreviver a uma venda que virou parcelada.
    setPgTaxaEditada(false);
    // Idem para o antecipado: desmarcar no crédito à vista não pode continuar
    // valendo depois de a venda virar parcelada — volta a seguir o perfil.
    setPgAntecipadoManual(null);
  }

  const parcelasPreview = useMemo(() => {
    if (!pgValorNum || !pgData) return [];
    return gerarParcelas({
      forma_pgto: pgForma,
      valor_total: pgValorNum,
      data_venda: pgData,
      n_parcelas: pgNEfetivo,
      antecipado: pgAntecipado,
    });
  }, [pgForma, pgValorNum, pgData, pgNEfetivo, pgAntecipado]);

  // Mesma função que criarVendaComParcelas usa para gravar — o que a nutri
  // confere aqui é, centavo a centavo, o que vai para o banco.
  const taxasPreview = useMemo(
    () => distribuirTaxa(pgTaxaNum, parcelasPreview),
    [pgTaxaNum, parcelasPreview],
  );

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
    setSexo('');
    setObjetivo('Emagrecimento'); setTipoPlano('avulsa');
    setModalidade('Online'); setValorContrato(''); setEndereco(''); setObs('');
    setPreConsultaId('');
    // pagamento
    setPagOpen(false);
    setPgServicoId(''); setPgServico(''); setPgValor(''); setPgData(hoje);
    setPgForma('pix'); setPgNParcelas(3); setPgObs('');
  }

  async function salvar(e) {
    e?.preventDefault?.();
    setErro(null); setSucesso(null);
    if (!nome.trim()) return setErro('Informe o nome.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Email inválido.');
    if (!telefone.trim()) return setErro('Informe o telefone.');
    // !(x > 0) e não x <= 0: assim pega NaN junto. O banco tambem barra
    // (check valor > 0), mas la o erro chegaria depois da paciente criada.
    if (tipoPlano === 'essentia' && !(valorContratoNum > 0)) {
      return setErro('Informe o valor do contrato (ex: 2700,00) para o plano Essentia.');
    }

    // Pagamento: só lança se serviço E valor > 0. Se preencheu só um, avisa.
    const querPagamento    = pgServico.trim() !== '' || pgValorNum > 0;
    const pagamentoCompleto = pgServico.trim() !== '' && pgValorNum > 0;
    if (querPagamento && !pagamentoCompleto) {
      return setErro('Para lançar o pagamento, informe o serviço e um valor válido — ou deixe ambos em branco.');
    }
    // O banco recusa taxa > valor da parcela (parcelas_taxa_menor_que_valor).
    // Barrar aqui dá uma frase em português em vez de erro de constraint.
    if (pagamentoCompleto && pgComTaxa && pgTaxaNum >= pgValorNum) {
      return setErro('A taxa da maquininha não pode ser maior ou igual ao valor da venda.');
    }

    setBusy(true);
    const emailVal = email.trim().toLowerCase() || null;
    const pacientePayload = {
      nutri_id: user.id,
      nome: nome.trim(),
      email: emailVal,
      telefone: telefone.trim(),
      nascimento: nascimento || null,
      // `|| null` e não `|| ''`: a constraint pacientes_sexo_check só aceita
      // 'feminino', 'masculino' ou NULL.
      sexo: sexo || null,
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
        obs: pgObs,
        taxaTotal: pgComTaxa ? pgTaxaNum : 0,
        antecipado: pgAntecipado,
      });
      if (vendaErro) {
        avisoVenda = 'Paciente cadastrada, mas o pagamento não foi lançado — registre pelo Financeiro. (' + vendaErro + ')';
      }
    }

    // Contrato Essentia: nasce pendente aqui, e a paciente aceita depois na tela
    // dela. Mesmo precedente da venda — se falhar, MANTÉM a paciente e só avisa.
    // texto_html fica FORA do payload: o check snapshot_coerente exige que ele
    // seja nulo enquanto aceito_em for nulo. O snapshot só nasce no aceite.
    let avisoContrato = null;
    if (tipoPlano === 'essentia') {
      // Índice único parcial garante no máximo um ativo por nutri — sem order by.
      const { data: tplContrato, error: tplErro } = await supabase
        .from('contratos_templates')
        .select('id')
        .eq('nutri_id', user.id)
        .eq('ativo', true)
        .maybeSingle();

      if (tplErro || !tplContrato) {
        avisoContrato = 'Paciente cadastrada, mas o contrato não foi gerado — nenhum template ativo encontrado.'
          + (tplErro ? ' (' + tplErro.message + ')' : '');
      } else {
        const { error: contratoErro } = await supabase
          .from('contratos_essentia')
          .insert({
            paciente_id: pacienteData.id,
            nutri_id: user.id,
            template_id: tplContrato.id,
            valor: valorContratoNum,
            aceito_em: null,
          });
        if (contratoErro) {
          avisoContrato = 'Paciente cadastrada, mas o contrato não foi gerado — gere pelo perfil dela. (' + contratoErro.message + ')';
        }
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
          // O estado do formulário É a ficha que acabou de nascer — buscar a
          // paciente de volta só para ler sexo/objetivo custaria uma ida ao
          // banco por nada (o insert acima devolve só id, nome, email).
          perguntas: perguntasParaPaciente(tpl.perguntas, { sexo, objetivo }),
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
    setSucesso({ id: pacienteData.id, nome: pacienteData.nome, email: pacienteData.email, pendente, avisoVenda, avisoContrato });
    resetForm();
    carregarPendentes();
  }

  // Atalhos com o nutri_id já amarrado — o link e a mensagem em si moram em
  // lib/convite.js, compartilhados com a faixa de convite da Agenda.
  const linkDe = (p) => linkConvite(user.id, p);
  const mensagemWhats = (p) => mensagemConviteEncoded(user.id, p);

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
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={lblStyle}>Data de nascimento</span>
              <DateInput
                value={nascimento}
                onChange={e => setNascimento(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13,
                  border: '0.5px solid var(--border)', borderRadius: 8,
                  outline: 'none', fontFamily: 'var(--font-sans)',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </div>

          {/* Sexo decide a variação do check-in (lib/checkinVariacao.js):
              feminino mantém a seção "Corpo & ciclo" e o texto atual;
              masculino e não-informado caem na versão neutra. */}
          <SelectField label="Sexo" value={sexo} onChange={setSexo} options={SEXOS_COM_VAZIO}
            hint={sexo ? null : 'Sem isso, o check-in vai na versão neutra — sem as perguntas de inchaço e ciclo menstrual.'} />
          <SelectField label="Objetivo" value={objetivo} onChange={setObjetivo} options={OBJETIVOS} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SelectField label="Tipo de plano" value={tipoPlano} onChange={escolherPlano} options={PLANOS} />
            <SelectField label="Modalidade" value={modalidade} onChange={setModalidade} options={MODALIDADES} />
          </div>

          {/* Só faz sentido no Essentia: é o valor que entra na Cláusula Terceira
              do contrato. Na Avulsa o campo desmonta, e com ele o required. */}
          {tipoPlano === 'essentia' && (
            <Field label="Valor do contrato (R$) *" value={valorContrato} onChange={setValorContrato}
              required placeholder="2700,00" />
          )}

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
                      {Array.from({ length: pgMaxN - 1 }, (_, i) => i + 2).map(n => (
                        <option key={n} value={n}>{n}x (venc. mensais)</option>
                      ))}
                    </select>
                    {pgMaxN === MAX_PARCELAS_ESSENTIA && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                        Essentia: o contrato prevê até {MAX_PARCELAS_ESSENTIA}x no cartão
                      </div>
                    )}
                  </>
                )}

                {pgComTaxa && (
                  <>
                    <label style={{ ...lblStyle, marginTop: 12 }}>Taxa da maquininha (R$, total da venda)</label>
                    <input inputMode="decimal" value={pgTaxaMostrada}
                      onChange={e => { setPgTaxa(e.target.value); setPgTaxaEditada(true); }}
                      placeholder="Ex: 500,00 — o que a maquininha desconta no total" style={campoStyle} />
                    {pgSugestao.valor > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                        sugerido: {brl(pgSugestao.valor)} ({pgSugestao.pct.toFixed(2).replace('.', ',')}%)
                        {pgTaxaEditada && (
                          <button type="button" onClick={() => { setPgTaxaEditada(false); setPgTaxa(''); }}
                            style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0,
                                     color: 'var(--gold-deep, #a08456)', fontSize: 12, cursor: 'pointer',
                                     textDecoration: 'underline', fontFamily: 'var(--font-sans)' }}>
                            recalcular
                          </button>
                        )}
                      </div>
                    )}

                    {/* O padrão vem do perfil (Financeiro › Taxas da
                        maquininha) e esta venda pode discordar. */}
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                      fontSize: 13, color: 'var(--text2)', marginTop: 10,
                    }}>
                      <input type="checkbox" checked={pgAntecipado}
                        onChange={e => setPgAntecipadoManual(e.target.checked)}
                        style={{ marginTop: 2 }} />
                      <span>
                        Recebimento antecipado pela maquininha
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)' }}>
                          A maquininha deposita o total agora, mesmo parcelado para a paciente
                        </span>
                      </span>
                    </label>
                  </>
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

                    {/* A consequência do checkbox, dita antes de salvar: as
                        datas acima seguem sendo o que a paciente paga ao
                        cartão, mas o dinheiro entra de uma vez. */}
                    {pgAntecipado && (
                      <div style={{ marginTop: 5, color: 'var(--green)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="ti ti-check" style={{ fontSize: 14 }} aria-hidden="true"></i>
                        {parcelasPreview.length === 1
                          ? `A parcela já entra como recebida ${pgData === hoje ? 'hoje' : `em ${dataBR(pgData)}`}`
                          : `As ${parcelasPreview.length} já entram como recebidas ${pgData === hoje ? 'hoje' : `em ${dataBR(pgData)}`}`}
                      </div>
                    )}

                    {/* Três colunas só quando há taxa. Sem taxa, o resumo de
                        uma linha acima já diz tudo e a tabela seria ruído. */}
                    {pgTaxaNum > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
                            <th style={{ textAlign: 'left', fontWeight: 500, padding: '3px 0' }}>#</th>
                            <th style={{ fontWeight: 500, padding: '3px 0' }}>Bruto</th>
                            <th style={{ fontWeight: 500, padding: '3px 0' }}>Taxa</th>
                            <th style={{ fontWeight: 500, padding: '3px 0' }}>Líquido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parcelasPreview.map((p, i) => (
                            <tr key={p.numero} style={{ textAlign: 'right' }}>
                              <td style={{ textAlign: 'left', padding: '2px 0' }}>{p.numero}</td>
                              <td style={{ padding: '2px 0' }}>{brl(p.valor)}</td>
                              <td style={{ padding: '2px 0', color: 'var(--red)' }}>−{brl(taxasPreview[i] ?? 0)}</td>
                              <td style={{ padding: '2px 0', fontWeight: 600 }}>{brl(p.valor - (taxasPreview[i] ?? 0))}</td>
                            </tr>
                          ))}
                          <tr style={{ textAlign: 'right', borderTop: '0.5px solid var(--border)' }}>
                            <td style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Total</td>
                            <td style={{ padding: '4px 0' }}>{brl(pgValorNum)}</td>
                            <td style={{ padding: '4px 0', color: 'var(--red)' }}>−{brl(pgTaxaNum)}</td>
                            <td style={{ padding: '4px 0', fontWeight: 700 }}>{brl(pgValorNum - pgTaxaNum)}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
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
              avisoContrato={sucesso.avisoContrato}
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


function CartaoSucesso({ pacienteId, nome, pendente, avisoVenda, avisoContrato, link, mensagemWhats, onCopiar, onDispensar, onIrPerfil }) {
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

      {/* Os dois podem cair juntos — venda e contrato falham de forma
          independente, e esconder um dos avisos seria perder informação. */}
      {[avisoVenda, avisoContrato].filter(Boolean).map((aviso, i) => (
        <div key={i} style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 6,
          background: 'var(--orange-bg, #fff7ed)', color: 'var(--orange, #c2410c)',
          fontSize: 12, lineHeight: 1.5, display: 'flex', gap: 6,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} aria-hidden="true"></i>
          <span>{aviso}</span>
        </div>
      ))}

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

// `hint`: texto de apoio abaixo do select, opcional. As chamadas que não
// passam nada seguem idênticas — sem hint, nada é renderizado.
function SelectField({ label, value, onChange, options, hint }) {
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
      {hint && (
        <span style={{
          display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 4,
        }}>{hint}</span>
      )}
    </label>
  );
}
