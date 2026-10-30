/* Modais e blocos de cabeçalho da ficha da paciente (termo, contrato, senha, arquivar,
   excluir, migrar, editar dados). Saíram de PacientePerfil.jsx sem mudar comportamento. */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { brl, dataBR, soDigitos, formatarCpf } from '../../lib/utils.js';
import { mensagemSenhaDefinida } from '../../lib/mensagemAcesso.js';
import { OBJETIVOS } from '../../lib/objetivos.js';
import { SEXOS, PLANOS } from '../../lib/opcoesPaciente.js';
import { baixarBlob } from '../../lib/pdfBase.js';
import { gerarPdfContrato } from '../../lib/pdfContrato.js';
import { gravar } from '../../lib/gravar.js';
import { confirmar as confirmarJanela, avisar as avisarJanela } from '../../lib/dialogos.js';
import { parseDatePaste } from '../../components/DateInput.jsx';
import { TERMO_VERSAO } from '../../components/TermoConsentimento.jsx';
import { criarContratoPendente, parseValorContrato } from '../../lib/contratoEssentia.js';

/**
 * Estado do aceite do termo (LGPD), na linha de identificação do perfil.
 *
 * As colunas existem desde a migration 2026-05-22e e NUNCA tinham sido
 * exibidas para a nutri — só o gate da paciente (TermoConsentimento.jsx) lia e
 * escrevia. O dado já chega aqui de graça: a query do perfil é select('*').
 *
 * TERMO_VERSAO vem importada do próprio gate, e não copiada, para os dois
 * nunca discordarem sobre qual é a versão corrente. Efeito a esperar: quando a
 * versão subir, o gate volta a pedir aceite e ESTA linha passa a dizer "versão
 * desatualizada" para todas as pacientes de uma vez, até cada uma entrar no
 * app. É o comportamento certo, mas aparece em massa.
 *
 * SÓ o estado "não aceito" chama atenção. Os outros dois são fato
 * administrativo e ficam na cor do resto da linha — um perfil em dia não deve
 * ter nada gritando nele.
 *
 * O que isto PROVA: que alguém logado nesta conta clicou em "Aceito e
 * continuar", com data e versão. Não há IP, dispositivo nem cópia do texto
 * exibido. Se um dia for preciso valor probatório, o que muda é o momento do
 * aceite, não esta linha.
 */
export function StatusTermo({ paciente }) {
  if (!paciente.termo_aceito_em) {
    return <strong style={{ color: 'var(--red)' }}>Termo não aceito</strong>;
  }

  const versao = paciente.termo_versao;
  const atual = versao === TERMO_VERSAO;

  // Data na linha, data e HORA no title: a linha acompanha o "cadastrada em"
  // ao lado, que também é só data, e quem precisa do horário exato passa o
  // mouse em vez de carregar o ruído o tempo todo.
  const quando = new Date(paciente.termo_aceito_em);
  const completo = Number.isNaN(quando.getTime()) ? null : quando.toLocaleString('pt-BR');

  return (
    <span title={[
      completo && `Aceito em ${completo}`,
      !atual && `A versão atual é a ${TERMO_VERSAO} — a paciente verá o termo de novo no próximo acesso.`,
    ].filter(Boolean).join('\n') || undefined}>
      Termo {versao ? `v${versao}` : '(versão não registrada)'} aceito em {dataBR(paciente.termo_aceito_em)}
      {!atual && <span style={{ color: 'var(--orange)' }}> — versão desatualizada</span>}
    </span>
  );
}

/**
 * Estado do CONTRATO DE PRESTAÇÃO DE SERVIÇOS na linha de identificação.
 *
 * Não confundir com o StatusTermo acima: aquele é o termo de uso (LGPD), que
 * vale para TODA paciente e mora em colunas da própria tabela `pacientes`.
 * Este é o contrato do plano Essentia, que vive em `contratos_essentia`, só
 * existe para quem tem tipo_plano 'essentia', e precisou de query própria.
 *
 * `contratos` distingue três coisas que uma lista vazia sozinha não
 * distinguiria:
 *   null  -> não é essentia; contrato não se aplica e nada é desenhado
 *   []    -> É essentia e não tem contrato NENHUM — o estado que precisa gritar
 *   [...] -> ordenado com o pendente primeiro (nullsFirst na query)
 *
 * Por que "nenhum" é vermelho e não laranja: pendente é um passo do fluxo
 * normal, ela ainda vai assinar. "Nenhum" significa que o contrato nunca foi
 * criado — a paciente está sendo atendida num plano cujo contrato não existe,
 * e nenhuma tela avisava isso até agora.
 *
 * O caso de RENOVAÇÃO tem linha própria de propósito. O banco permite vários
 * aceitos (índice parcial só limita o PENDENTE a um). Mostrar apenas o
 * pendente esconderia que já houve um assinado; mostrar apenas o assinado
 * esconderia que falta assinar o novo. Os dois fatos importam.
 *
 * O "Baixar PDF" sai só onde existe contrato ASSINADO: no assinado, ele mesmo;
 * na renovação, o anterior (é o que vale até o novo ser assinado). O
 * texto_html NÃO vem na query do perfil — é o contrato inteiro, e a lista de
 * contratos carrega em toda abertura de perfil. Ele é buscado só no clique.
 *
 * Os hooks ficam ANTES do `return null` e de todo return antecipado, mesmo
 * cuidado do ContratoEssentia.jsx: `contratos` muda de null para lista quando
 * o perfil recarrega, e hook depois de return quebraria o React nessa troca.
 */
export function StatusContrato({ contratos, paciente }) {
  const [baixando, setBaixando] = useState(false);
  const [erroPdf, setErroPdf] = useState(null);

  if (contratos === null) return null;          // não é essentia

  if (contratos.length === 0) {
    return <strong style={{ color: 'var(--red)' }}>Contrato: nenhum</strong>;
  }

  const versaoDe = (c) => (c?.template?.versao ? `v${c.template.versao}` : 'sem versão');
  const [primeiro, ...resto] = contratos;

  async function baixarPdf(c) {
    setBaixando(true);
    setErroPdf(null);
    try {
      const { data, error } = await supabase
        .from('contratos_essentia')
        .select('texto_html, aceito_em')
        .eq('id', c.id)
        .single();
      if (error) throw error;
      // aceito_em vem da MESMA leitura do texto, e não da lista do perfil:
      // o carimbo impresso e o texto impresso saem da mesma linha, lida junta.
      const { blob, nomeArquivo } = await gerarPdfContrato({
        textoHtml: data.texto_html,
        aceitoEm: data.aceito_em,
        pacienteNome: paciente?.nome,
        contratoId: c.id,
        dataEmissao: new Date().toLocaleDateString('pt-BR'),
      });
      baixarBlob(blob, nomeArquivo);
    } catch (e) {
      // A guarda do pdfContrato lança com frase em português (texto fora de
      // h2/h3/p, contrato não aceito); erro de rede/RLS vem do supabase.
      setErroPdf(e?.message || 'Não foi possível gerar o PDF.');
    } finally {
      setBaixando(false);
    }
  }

  const botaoPdf = (c) => (
    <>
      <button
        onClick={() => baixarPdf(c)}
        disabled={baixando}
        title={`Baixar o contrato ${versaoDe(c)} assinado em ${dataBR(c.aceito_em)}`}
        style={{
          marginLeft: 8,
          background: 'none', border: '0.5px solid var(--border)',
          borderRadius: 6, padding: '3px 9px', fontSize: 11,
          color: 'var(--text3)', cursor: baixando ? 'default' : 'pointer',
          fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <i className="ti ti-download" style={{ fontSize: 12 }} aria-hidden="true" />
        {baixando ? 'Gerando…' : 'Baixar PDF'}
      </button>
      {erroPdf && <span style={{ color: 'var(--red)' }}> · {erroPdf}</span>}
    </>
  );

  if (!primeiro.aceito_em) {
    // Pendente. Se houver um aceito atrás dele, é renovação — e o anterior
    // continua valendo até esta ser assinada, então precisa aparecer.
    const anterior = resto.find(c => c.aceito_em);
    return (
      <span style={{ color: 'var(--orange)' }}>
        Contrato {versaoDe(primeiro)} aguardando assinatura
        {/* Sem CPF nem RG a paciente NAO chega a ver o contrato: o gate em
            components/ContratoEssentia.jsx deixa passar em vez de trancar o
            app por um campo que ela nao pode preencher. Entao este aviso e o
            UNICO lugar onde isso aparece. Vermelho, e nao laranja, porque
            pendente e um passo do fluxo normal e isto esta parado. */}
        {!(paciente?.cpf || paciente?.rg) && (
          <span style={{ color: 'var(--red)' }}> · sem CPF/RG no cadastro</span>
        )}
        {anterior && (
          <span style={{ color: 'var(--text3)' }}>
            {' · anterior '}{versaoDe(anterior)} assinado em {dataBR(anterior.aceito_em)}
            {botaoPdf(anterior)}
          </span>
        )}
      </span>
    );
  }

  const quando = new Date(primeiro.aceito_em);
  const completo = Number.isNaN(quando.getTime()) ? null : quando.toLocaleString('pt-BR');
  return (
    <span title={completo ? `Assinado em ${completo}` : undefined}>
      Contrato {versaoDe(primeiro)} assinado em {dataBR(primeiro.aceito_em)}
      {botaoPdf(primeiro)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   SENHA DA PACIENTE — os dois caminhos, num menu só

   Antes havia um botão solto de "Enviar redefinição de senha". Ele não está
   errado: quando o e-mail do cadastro é o mesmo de auth.users, é o MELHOR
   caminho, porque a paciente escolhe a própria senha e a nutri nunca fica
   sabendo dela. O problema é que ele falha CALADO quando os dois e-mails
   divergem — o Supabase responde sucesso mesmo para endereço inexistente, por
   política anti-enumeração, e a tela dizia "✅ Email enviado" sem nada chegar.

   Um menu em vez de dois botões porque o front NÃO enxerga auth.users: sem
   perguntar ao servidor, a escolha entre os dois caminhos seria no escuro. O
   diagnóstico é buscado ao abrir e vira o subtítulo de cada linha.

   Deliberadamente NÃO tento consertar a linha 1 mandando o e-mail para o
   endereço do auth, mesmo agora que a tela o conhece: se a nutri trocou o
   e-mail no cadastro, é porque o antigo não serve mais para a paciente.
   Mandar recuperação para a caixa abandonada é outro "enviado com sucesso"
   inútil, só que mais difícil de explicar.

   Estrutura do dropdown copiada de SelecionarEnviarTemplate (Checkins.jsx):
   backdrop fixo no z-index 90 para o clique fora, painel absoluto no 100.
   ───────────────────────────────────────────────────────── */
export function MenuSenha({ paciente, onEnviarEmail }) {
  const [aberto, setAberto] = useState(false);
  const [diag, setDiag] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);
  const [senhaDados, setSenhaDados] = useState(null);

  async function chamar(acao) {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) throw new Error('Sessão expirada. Recarregue a página.');
    const resp = await fetch('/.netlify/functions/acesso-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ paciente_id: paciente.id, acao }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Falha na chamada.');
    return data;
  }

  async function abrir() {
    setAberto(a => !a);
    // Buscado AO ABRIR, e não no carregamento do perfil: seria uma chamada de
    // function por visita a cada paciente, para um menu que quase nunca abre.
    if (diag || carregando) return;
    setCarregando(true); setErro(null);
    try { setDiag(await chamar('diagnostico')); }
    catch (e) { setErro(e?.message ?? 'Não consegui conferir o e-mail de login.'); }
    finally { setCarregando(false); }
  }

  async function definir() {
    const ok = (await confirmarJanela(`Definir uma senha nova para ${paciente.nome}?\n\n`
      + `A senha atual dela para de funcionar na hora. Nenhum e-mail é enviado — `
      + `a senha aparece na tela e você entrega a ela.`
    ));
    if (!ok) return;
    setBusy(true);
    try {
      const d = await chamar('definir');
      setAberto(false);
      setSenhaDados(d);
    } catch (e) {
      avisarJanela('Erro ao definir a senha: ' + (e?.message ?? 'tente de novo'));
    } finally {
      setBusy(false);
    }
  }

  // Alinha o e-mail de LOGIN ao do cadastro. O endereço não é digitado aqui nem
  // mandado no body: quem o lê é o servidor, na linha do cadastro. Ver o
  // comentário da ação atualizar_email em acesso-senha.js.
  async function alinharEmail() {
    const ok = (await confirmarJanela(`Trocar o e-mail de LOGIN de ${paciente.nome}?\n\n`
      + `De:   ${diag.email_login}\n`
      + `Para: ${diag.email_cadastro}\n\n`
      + `A senha continua a mesma, mas ela vai precisar entrar com o endereço `
      + `novo. Nenhum e-mail é enviado — quem avisa é você.`
    ));
    if (!ok) return;
    setBusy(true);
    try {
      const r = await chamar('atualizar_email');
      setDiag(d => ({
        ...d, email_login: r.email_login, divergente: false,
        sintetico: !!r.email_login && r.email_login.endsWith('@essentia.local'),
      }));
      avisarJanela(r.inalterado
        ? 'O e-mail de login já era esse.'
        : `Pronto. O login de ${paciente.nome} agora é ${r.email_login}.`);
    } catch (e) {
      avisarJanela('Erro ao trocar o e-mail: ' + (e?.message ?? 'tente de novo'));
    } finally {
      setBusy(false);
    }
  }

  const linhaEmail = carregando ? 'conferindo o e-mail de login…'
    : erro                      ? erro
    : diag?.sintetico           ? '⚠ esta conta não tem e-mail de verdade — só telefone'
    : diag?.divergente          ? `⚠ o login dela é ${diag.email_login}, não o e-mail do cadastro`
    : diag?.email_login         ? `vai para ${diag.email_login}`
    : 'envia o link de criar senha nova';

  const estiloLinha = {
    width: '100%', padding: '10px 12px', textAlign: 'left',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontFamily: 'var(--font-sans)', borderBottom: '0.5px solid #f5f0e8',
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={abrir}
        title="Redefinir a senha desta paciente"
        style={{
          background: 'transparent', border: '0.5px solid var(--border)',
          borderRadius: 6, padding: '3px 9px', fontSize: 11,
          color: 'var(--gold-deep)', cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <i className="ti ti-key" aria-hidden="true" style={{ fontSize: 13 }}></i>
        Senha da paciente
        <i className="ti ti-chevron-down" aria-hidden="true" style={{ fontSize: 12 }}></i>
      </button>

      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 4,
            minWidth: 300, zIndex: 100, background: 'var(--white)',
            border: '0.5px solid var(--border)', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(28,23,18,.1)', overflow: 'hidden',
          }}>
            {/* Caminho preferido: ela mesma escolhe a senha, a nutri não vê. */}
            <button
              onClick={() => { setAberto(false); onEnviarEmail(); }}
              disabled={carregando || diag?.sintetico}
              title={diag?.sintetico
                ? 'A conta desta paciente não tem e-mail real — o link não chegaria a lugar nenhum'
                : 'Envia um email pra paciente com link de redefinição de senha'}
              style={{ ...estiloLinha, opacity: (carregando || diag?.sintetico) ? 0.5 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
                Enviar e-mail de redefinição
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{linhaEmail}</div>
            </button>

            {/* Só aparece quando há divergência: sem ela não há o que alinhar.
                Fica antes do "Definir senha", que segue sendo o último e por
                isso mantém o borderBottom: 'none'. */}
            {diag?.divergente && (
              <button
                onClick={alinharEmail}
                disabled={busy}
                style={{ ...estiloLinha, opacity: busy ? 0.5 : 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
                  {busy ? 'Alinhando…' : 'Alinhar e-mail de login ao cadastro'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  login passa a ser {diag.email_cadastro}
                </div>
              </button>
            )}

            {/* Exceção: usar quando o e-mail não chega. */}
            <button
              onClick={definir}
              disabled={busy}
              style={{ ...estiloLinha, borderBottom: 'none', opacity: busy ? 0.5 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>
                {busy ? 'Definindo…' : 'Definir senha manualmente'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                sem e-mail — a senha aparece na tela e você entrega a ela
              </div>
            </button>
          </div>
        </>
      )}

      {senhaDados && (
        <ModalSenhaDefinida
          dados={senhaDados}
          paciente={paciente}
          onClose={() => setSenhaDados(null)}
        />
      )}
    </div>
  );
}

/* A senha aparece UMA vez. Não é gravada em lugar nenhum — nem no servidor, nem
   aqui — então este modal é a única chance de copiá-la. */
function ModalSenhaDefinida({ dados, paciente, onClose }) {
  const [copiada, setCopiada] = useState(false);
  const primeiroNome = paciente.nome?.split(' ')[0] ?? '';
  const temTelefone = !!paciente.telefone?.trim();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(dados.senha);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      avisarJanela('Não consegui copiar. A senha é:\n\n' + dados.senha);
    }
  }

  function enviarWhatsApp() {
    const msg = mensagemSenhaDefinida({
      primeiroNome,
      link: window.location.origin,
      senha: dados.senha,
      emailLogin: dados.email_login,
      sintetico: dados.sintetico,
    });
    // Sem o truque de abrir a janela ANTES do await que o enviarAcessoWhatsApp
    // usa: lá o link só existe depois de um await, e o Safari mata o popup
    // quando a ativação do clique já se consumiu. Aqui a senha já está em mãos.
    window.open(`https://wa.me/${normalizarTelefone(paciente.telefone)}?text=${encodeURIComponent(msg)}`,
      '_blank', 'noopener');
  }

  return (
    // O overlay NÃO fecha no clique, ao contrário do ModalEditarDados. É
    // deliberado: um clique fora perderia a senha para sempre. Mesmo raciocínio
    // do backdrop protegido do TarefaModal. Só o botão de baixo fecha.
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 12, padding: 24,
        width: 460, maxWidth: '92vw', border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>
          Senha nova de {dados.nome}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Nenhum e-mail foi enviado. A entrega é com você.
        </div>

        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 26, letterSpacing: 1, textAlign: 'center',
          padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10,
          userSelect: 'all', marginBottom: 14, color: 'var(--dark)',
        }}>
          {dados.senha}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
          Para entrar, ela usa{' '}
          {dados.sintetico
            ? <b>o número de telefone dela</b>
            : <>o e-mail <b>{dados.email_login}</b> ou o telefone</>}
          {' '}com esta senha.
        </div>

        <div style={{
          fontSize: 12, color: 'var(--orange)', background: 'var(--orange-bg)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 18, lineHeight: 1.5,
        }}>
          Esta senha aparece uma única vez. Copie ou envie agora — depois de
          fechar não há como recuperá-la, só gerar outra.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={copiar} className="btn" style={{ fontSize: 13 }}>
            <i className="ti ti-copy" aria-hidden="true" /> {copiada ? 'Copiada!' : 'Copiar senha'}
          </button>
          <button
            onClick={enviarWhatsApp}
            disabled={!temTelefone}
            title={temTelefone ? 'Abre o WhatsApp com a senha na mensagem' : 'Cadastre o telefone da paciente'}
            className="btn"
            style={{ fontSize: 13, opacity: temTelefone ? 1 : 0.45 }}>
            <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar no WhatsApp
          </button>
          {/* Secundário de propósito: os dois de cima é que entregam a senha.
              Este é o único jeito de fechar — o fundo não fecha. */}
          <button onClick={onClose} className="btn-outline" style={{ fontSize: 13, marginLeft: 'auto' }}>
            Já anotei — fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// vendas.paciente_id é ON DELETE CASCADE em produção (decisão de 04/10/2026):
// excluir a paciente apaga as vendas e, por cascata, as parcelas. O modal
// precisa dizer quanto some do Financeiro antes do clique.
async function resumoVendasPaciente(pacienteId) {
  const { data, error } = await supabase.from('vendas').select('valor_total').eq('paciente_id', pacienteId);
  if (error) return { erro: true };
  return { n: data.length, total: data.reduce((s, v) => s + Number(v.valor_total || 0), 0) };
}

export function ModalExcluir({ paciente, onClose, onExcluido }) {
  const [busy, setBusy] = useState(false);
  // null enquanto confere; depois { n, total } ou { erro: true }.
  const [vendas, setVendas] = useState(null);

  useEffect(() => {
    let vivo = true;
    resumoVendasPaciente(paciente.id).then(r => { if (vivo) setVendas(r); });
    return () => { vivo = false; };
  }, [paciente.id]);

  async function confirmar() {
    setBusy(true);
    // Sem o .select(), o PostgREST responde 204 também quando nada foi apagado
    // (linha filtrada pelo RLS ou requisição sem sessão). Mesmo defeito da
    // lixeira de suplementos.
    const { data, error } = await supabase.from('pacientes').delete().eq('id', paciente.id).select('id');
    setBusy(false);
    if (error) { avisarJanela('Erro ao excluir: ' + error.message); return; }
    if (!data?.length) {
      avisarJanela('Nada foi excluído. Tente de novo, ou recarregue a página e confira se a sessão continua ativa.');
      return;
    }
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
          <div style={{ marginTop: 6 }}>
            Também será apagado todo o histórico dela no app: plano, consultas, mensagens, exames, check-ins, contrato e os demais registros.
          </div>
          <div style={{ marginTop: 6 }}>
            {vendas === null && 'Conferindo as vendas desta paciente…'}
            {vendas?.erro && 'Não foi possível conferir as vendas desta paciente. Se ela tiver vendas, elas serão apagadas junto.'}
            {vendas?.n === 0 && 'Ela não tem vendas registradas no Financeiro.'}
            {vendas?.n > 0 && (
              <>
                {vendas.n === 1 ? 'A venda' : `As ${vendas.n} vendas`} desta paciente
                {' '}(<strong>{brl(vendas.total)}</strong>) e as parcelas também serão apagadas.
                {' '}Esse valor sai do Financeiro e da Previsibilidade. Para manter o histórico, use Arquivar.
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={busy || vendas === null}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              background: 'var(--red)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: busy || vendas === null ? 0.6 : 1,
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
export function ModalArquivar({ paciente, onClose, onArquivado }) {
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
    const r = await gravar(supabase.from('pacientes')
      .update({ status_paciente: status }).eq('id', paciente.id), { rotulo: 'arquivar a paciente' });
    setBusy(false);
    if (!r.ok) { avisarJanela(r.msg); return; }
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
// ISO (YYYY-MM-DD) → BR (DD/MM/AAAA) para exibição
function isoParaBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Texto digitado/colado (DD/MM/AAAA, com ou sem separadores) → { iso, erro }.
// Vazio é válido (nascimento é opcional). Rejeita data impossível e ano fora de 1900..hoje.
function parseBrData(raw) {
  const s = (raw ?? '').trim();
  if (!s) return { iso: '', erro: null };
  let iso = parseDatePaste(s);
  if (!iso) {
    const soDigitos = s.replace(/\D/g, '');
    if (/^\d{8}$/.test(soDigitos)) {
      iso = `${soDigitos.slice(4)}-${soDigitos.slice(2, 4)}-${soDigitos.slice(0, 2)}`;
    }
  }
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { iso: null, erro: 'Data inválida — use DD/MM/AAAA (ex.: 15/03/1955).' };
  }
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return { iso: null, erro: 'Essa data não existe. Confira o dia e o mês.' };
  }
  const anoAtual = new Date().getFullYear();
  if (y < 1900 || dt > new Date()) {
    return { iso: null, erro: `Ano fora da faixa (1900–${anoAtual}).` };
  }
  return { iso, erro: null };
}

/**
 * Migra uma paciente AVULSA para o Essentia: troca o plano e cria o contrato
 * pendente com o valor informado. Mesma regra do ModalEditarDados (que também
 * cria o contrato ao virar essentia), só que em um clique e sem mexer em
 * outros dados. As consultas que ela já tem continuam: a 1ª consulta ocupa a
 * primeira posição e passam a aparecer as Consultas 2 a 6, para agendar.
 */
export function ModalMigrarEssentia({ paciente, onClose, onSaved }) {
  const [valor, setValor] = useState('');
  const [busy, setBusy]   = useState(false);
  const [erro, setErro]   = useState(null);
  const valorNum = parseValorContrato(valor);

  async function migrar() {
    if (!(valorNum > 0)) return setErro('Informe o valor do contrato (ex: 2700,00).');
    setBusy(true); setErro(null);
    // Plano primeiro, contrato depois: se o contrato falhar, a migração fica
    // salva e o aviso diz o que fazer (mesmo precedente do ModalEditarDados).
    const r = await gravar(
      supabase.from('pacientes').update({ tipo_plano: 'essentia' }).eq('id', paciente.id),
      { rotulo: 'migrar a paciente para o Essentia' },
    );
    if (!r.ok) { setBusy(false); return setErro(r.msg); }
    const { erro: erroContrato } = await criarContratoPendente(supabase, {
      nutriId:    paciente.nutri_id,
      pacienteId: paciente.id,
      valor:      valorNum,
    });
    setBusy(false);
    if (erroContrato) {
      setErro(`A paciente já está no Essentia, mas ${erroContrato.charAt(0).toLowerCase()}${erroContrato.slice(1)}`);
      onSaved();
      return;
    }
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, padding: 16,
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 12, padding: 24,
        width: 440, maxWidth: '92vw', border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>
          Migrar para o Essentia
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{paciente.nome}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)', marginBottom: 14 }}>
          O plano passa de avulsa para Essentia e o contrato fica pendente para
          a paciente aceitar. As consultas que ela já tem continuam, e a lista
          passa a mostrar a 1ª consulta e as Consultas 2 a 6.
        </div>
        <CampoValorContrato valor={valor} valorNum={valorNum} onChange={setValor} />
        {erro && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 10 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn" onClick={migrar} disabled={busy}>
            {busy ? 'Migrando…' : 'Migrar para o Essentia'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Cria contrato para quem JÁ é essentia e está sem nenhum.
 *
 * O ModalEditarDados não alcança este caso: lá o `virandoEssentia` exige
 * tipo_plano != 'essentia', porque o gatilho é a MUDANÇA de plano. Quem já
 * estava essentia antes da Porta 1 existir ficou sem caminho — e é a maioria
 * das pacientes sem contrato.
 *
 * Mesma criarContratoPendente dos outros dois caminhos. Nenhuma regra nova.
 */
export function ModalCriarContrato({ paciente, onClose, onSaved }) {
  const [valor, setValor] = useState('');
  const [busy, setBusy]   = useState(false);
  const [erro, setErro]   = useState(null);
  // Quando preenchido, o contrato JÁ FOI criado e o modal vira só o aviso.
  const [aviso, setAviso] = useState(null);

  const valorNum = parseValorContrato(valor);

  async function salvar() {
    if (!(valorNum > 0)) {
      return setErro('Informe o valor do contrato (ex: 2700,00).');
    }
    setBusy(true); setErro(null);

    const { erro: erroContrato } = await criarContratoPendente(supabase, {
      nutriId:    paciente.nutri_id,
      pacienteId: paciente.id,
      valor:      valorNum,
    });
    if (erroContrato) { setBusy(false); setErro(erroContrato); return; }

    // O contrato nasce, mas a paciente só o VÊ se houver consulta datada — é a
    // regra do previa_contrato_essentia, que devolve null sem ela e faz o gate
    // deixar passar em silêncio. Sem este aviso dá para criar dezenas de
    // contratos achando que as pacientes foram notificadas.
    const { count, error: errCount } = await supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true })
      .eq('nutri_id', paciente.nutri_id)
      .eq('paciente_id', paciente.id)
      .neq('status', 'cancelada')
      .not('data_hora', 'is', null);

    setBusy(false);
    onSaved();

    // Falha ao CONFERIR não é falha ao criar: o contrato está lá, e o
    // StatusContrato do cabeçalho já mostra. Fechar sem afirmar nada é melhor
    // do que inventar um aviso que não foi verificado.
    if (errCount) { onClose(); return; }

    if (!count) {
      setAviso('Contrato criado. Mas ela ainda não vai vê-lo no app: o contrato '
        + 'só aparece quando existe uma consulta com data marcada, e hoje não há nenhuma.');
      return;
    }
    onClose();
  }

  return (
    // Overlay NÃO fecha no clique, mesmo precedente do ModalExcluir: um clique
    // fora perderia o valor digitado, e aqui ele vai para um documento.
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 12, padding: 24,
        width: 420, maxWidth: '92vw',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>
          Criar contrato Essentia
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          {paciente.nome}
        </div>

        {aviso ? (
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: 'var(--text2)',
            background: 'var(--orange-bg)', borderRadius: 8, padding: '10px 12px',
          }}>{aviso}</div>
        ) : (
          <>
            <CampoValorContrato valor={valor} valorNum={valorNum} onChange={setValor} />
            {erro && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 10 }}>{erro}</div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          {aviso ? (
            <button className="btn" onClick={onClose}>Entendi</button>
          ) : (
            <>
              <button className="btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn" onClick={salvar} disabled={busy}>
                {busy ? 'Criando…' : 'Criar contrato'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Campo do valor do contrato, com o eco do valor INTERPRETADO.
 *
 * Extraído para ser usado por DOIS modais — o ModalEditarDados, quando a
 * paciente muda de plano, e o ModalCriarContrato, quando ela já é essentia e
 * está sem contrato. Duas cópias divergiriam, e é justamente a divergência
 * entre dois caminhos que produziu as pacientes sem contrato.
 *
 * O ECO existe porque um contrato foi gravado com 27000 no lugar de 2700 e
 * passou despercebido até a conferência no banco: nada na tela mostrava o
 * número que o parseValorContrato tinha entendido. Ele mostra o resultado da
 * conversão, não o texto digitado — é a diferença entre conferir e repetir.
 *
 * `valorNum` vem do pai de propósito: o pai já precisa dele para validar e para
 * gravar, então a conversão acontece UMA vez por modal.
 */
function CampoValorContrato({ valor, valorNum, onChange }) {
  return (
    <>
      <label className="field-label">Valor do contrato (R$) *</label>
      <input
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder="2700,00"
        inputMode="decimal"
      />
      {valor.trim() && (
        <div style={{
          fontSize: 12, marginTop: 4, fontWeight: 500,
          color: valorNum > 0 ? 'var(--text2)' : 'var(--red)',
        }}>
          {valorNum > 0
            ? `Será gravado: ${brl(valorNum)}`
            : 'Valor não reconhecido — digite só números, como 2700,00'}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        Um contrato pendente será criado. A paciente assina no app dela.
      </div>
    </>
  );
}

export function ModalEditarDados({ paciente, onClose, onSaved }) {
  const [form, setForm] = useState({
    nome:       paciente.nome       ?? '',
    email:      paciente.email      ?? '',
    telefone:   paciente.telefone   ?? '',
    // '' aqui representa o NULL do banco — é o estado das fichas anteriores à
    // coluna, e continua salvável de volta como null (ver o payload em salvar).
    sexo:       paciente.sexo       ?? '',
    objetivo:   paciente.objetivo   ?? '',
    tipo_plano: paciente.tipo_plano ?? '',
    modalidade: paciente.modalidade ?? '',
    // CPF entra formatado para leitura e sai como digitos puros no payload
    // (comment on column public.pacientes.cpf). RG nao leva mascara: varia
    // por estado e pode conter letra, entao mascara rejeitaria RG legitimo.
    cpf:        formatarCpf(paciente.cpf ?? ''),
    rg:         paciente.rg ?? '',
  });
  const [nascInput, setNascInput] = useState(isoParaBR(paciente.nascimento));
  const [erroNasc, setErroNasc]   = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [valorContrato, setValorContrato] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Mudou PARA essentia: é o caso que exige contrato novo. Voltar de essentia
  // para avulsa não mexe em contrato nenhum — o pendente que sobrar fica como
  // está, de propósito, e o StatusContrato do cabeçalho o mostra.
  const virandoEssentia = form.tipo_plano === 'essentia' && paciente.tipo_plano !== 'essentia';
  const valorContratoNum = parseValorContrato(valorContrato);

  function onNascChange(e) {
    const v = e.target.value;
    setNascInput(v);
    setErroNasc(v.trim() ? parseBrData(v).erro : null);
  }

  async function salvar() {
    if (!form.nome.trim()) return setErro('Nome é obrigatório.');
    if (!form.sexo) return setErro('Informe o sexo da paciente.');
    const { iso: nascISO, erro: nascErro } = parseBrData(nascInput);
    if (nascErro) { setErroNasc(nascErro); setErro(nascErro); return; }
    // As colunas nao tem CHECK e este caminho grava direto em `pacientes`,
    // sem passar por RPC nenhuma — esta validacao e a unica barreira. Um CPF
    // pela metade salvo aqui vira documento quebrado dentro de um contrato
    // assinado, via formatar_cpf no banco.
    const cpfDigitos = soDigitos(form.cpf);
    if (cpfDigitos && cpfDigitos.length !== 11) {
      return setErro('CPF precisa ter 11 dígitos, ou deixe o campo em branco.');
    }

    // Mesma disciplina do cadastro (Cadastrar.jsx:208): plano Essentia sem
    // valor não passa. Salvar o plano e avisar "contrato não criado" recriaria
    // exatamente o buraco que esta mudança existe para fechar.
    if (virandoEssentia && !(valorContratoNum > 0)) {
      return setErro('Informe o valor do contrato (ex: 2700,00) para mudar o plano para Essentia.');
    }
    setBusy(true); setErro(null);
    try {
      const emailVal = form.email.trim();
      // Unicidade: e-mail não pode repetir de outra paciente da mesma nutri
      if (emailVal && emailVal.toLowerCase() !== (paciente.email ?? '').toLowerCase()) {
        const { data: dup, error: dupErr } = await supabase.from('pacientes')
          .select('id')
          .eq('nutri_id', paciente.nutri_id)
          .neq('id', paciente.id)
          .ilike('email', emailVal)
          .limit(1)
          .maybeSingle();
        if (dupErr) throw dupErr;
        if (dup) { setErro('Este e-mail já está em uso por outra paciente.'); setBusy(false); return; }
      }
      const r = await gravar(supabase.from('pacientes').update({
        nome:       form.nome.trim()   || null,
        email:      emailVal           || null,
        telefone:   form.telefone.trim() || null,
        nascimento: nascISO            || null,
        // `|| null` e não `|| ''`: a constraint pacientes_sexo_check só aceita
        // 'feminino', 'masculino' ou NULL — string vazia seria rejeitada.
        sexo:       form.sexo          || null,
        objetivo:   form.objetivo      || null,
        tipo_plano: form.tipo_plano    || null,
        modalidade: form.modalidade    || null,
        cpf:        cpfDigitos         || null,
        rg:         form.rg.trim()     || null,
      }).eq('id', paciente.id), { rotulo: 'salvar os dados da paciente' });
      if (!r.ok) throw new Error(r.msg);

      // Contrato DEPOIS do update, nunca antes: se a gravação do plano falhasse,
      // sobraria um contrato pendente de um plano que não existe. Se o contrato
      // falhar, a mudança de plano FICA salva e só avisamos — mesmo precedente
      // da venda no cadastro.
      if (virandoEssentia) {
        const { erro: erroContrato } = await criarContratoPendente(supabase, {
          nutriId:    paciente.nutri_id,
          pacienteId: paciente.id,
          valor:      valorContratoNum,
        });
        if (erroContrato) {
          // Modal fica ABERTO: o aviso precisa ser lido. onSaved() recarrega o
          // perfil, então o StatusContrato do cabeçalho já reflete a realidade.
          setErro(`Plano alterado. ${erroContrato}`);
          setBusy(false);
          onSaved();
          return;
        }
      }

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
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="email@exemplo.com"
              />
              {paciente.user_id && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                  Esta paciente já tem login — alterar aqui muda o cadastro, não o e-mail de acesso dela.
                </div>
              )}
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
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              maxLength={10}
              value={nascInput}
              onChange={onNascChange}
              style={erroNasc ? { border: '1.5px solid var(--red, #dc2626)' } : undefined}
            />
            {erroNasc && (
              <div style={{ fontSize: 11, color: 'var(--red, #dc2626)', marginTop: 3 }}>{erroNasc}</div>
            )}
          </div>

          {/* Documento. Fica junto do nascimento porque e bloco de identidade,
              e e daqui que o contrato Essentia tira o "portador do CPF nº".
              Antes disto, o documento so entrava pelo cadastro rapido, pelo CSV
              (que nem traz RG) ou pela propria paciente digitando na hora de
              assinar — nao havia onde corrigir depois. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">CPF</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={set('cpf')}
                onBlur={e => setForm(f => ({ ...f, cpf: formatarCpf(e.target.value) }))}
              />
            </div>
            <div>
              <label className="field-label">RG</label>
              <input type="text" value={form.rg} onChange={set('rg')} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                Como está no documento — pode ter letra.
              </div>
            </div>
          </div>

          {/* Sexo decide a variação do check-in (src/lib/checkinVariacao.js):
              feminino mantém a seção "Corpo & ciclo" e o texto atual; masculino
              e não-informado caem na versão neutra. É por AQUI que as fichas
              antigas — cadastradas antes da coluna existir — ganham o valor. */}
          <div>
            <label className="field-label">Sexo (obrigatório)</label>
            <select value={form.sexo} onChange={set('sexo')} required>
              <option value="">— selecione —</option>
              {SEXOS.map(o => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
            {!form.sexo && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                Obrigatório: define o desenho do corpo na evolução da paciente e a versão do check-in.
              </div>
            )}
          </div>

          <div>
            <label className="field-label">Objetivo</label>
            <select value={form.objetivo} onChange={set('objetivo')}>
              <option value="">— sem objetivo definido —</option>
              {OBJETIVOS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Tipo de plano</label>
              {/* Valor minúsculo (banco) + rótulo capitalizado (tela) — o gate
                  do plano avulso compara com 'avulsa' minúsculo. */}
              <select value={form.tipo_plano} onChange={set('tipo_plano')}>
                <option value="">— sem plano definido —</option>
                {PLANOS.map(o => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
              {/* Só ao MUDAR para essentia. Antes desta mudança, trocar o plano
                  aqui gravava tipo_plano e não criava contrato nenhum — foi
                  assim que pacientes essentia ficaram sem contrato. */}
              {virandoEssentia && (
                <div style={{ marginTop: 8 }}>
                  <CampoValorContrato
                    valor={valorContrato}
                    valorNum={valorContratoNum}
                    onChange={setValorContrato}
                  />
                </div>
              )}
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

export function normalizarTelefone(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith('55') && n.length >= 12) return n;
  return '55' + n;
}
