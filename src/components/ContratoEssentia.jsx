import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSession, signOut } from '../lib/session.jsx';
import { iniciarTokenPush, avisarNutri } from '../lib/push.js';
import { formatarCpf } from '../lib/utils.js';
import { decidirGateContrato, TELAS_LIBERADAS_SEM_CONTRATO } from '../lib/contratoEssentia.js';

/**
 * Gate do contrato de prestação de serviços do plano Essentia.
 *
 * Entra entre o TermoConsentimento e o PacienteLayout: quem está pausada nem
 * chega aqui, e quem ainda não aceitou o termo de uso resolve aquilo primeiro.
 *
 * DIFERENÇA ESTRUTURAL para os dois wrappers vizinhos: eles decidem de forma
 * síncrona, com o que já veio no profile, e por isso podem dar `return` antes
 * dos hooks sem quebrar. Aqui a decisão depende de duas idas ao servidor, então
 * a ordem é OBRIGATORIAMENTE hooks primeiro, decisão depois — um return
 * antecipado tiraria hooks da fila entre um render e outro, e o React quebraria
 * com "rendered more hooks than during the previous render". Não copiar o
 * formato do TermoConsentimento neste ponto.
 *
 * O texto vem PRONTO do servidor (previa_contrato_essentia). O cliente nunca
 * monta nem envia o corpo do contrato: é a mesma função que a hora do aceite
 * usa para congelar o snapshot, e é isso que garante que o texto lido e o
 * texto gravado são o mesmo.
 *
 * ACEITE OBRIGATÓRIO (09/10): para a Essentia ATIVA com contrato pendente, o
 * app só abre depois do aceite. A decisão mora em decidirGateContrato()
 * (lib/contratoEssentia.js), que nunca deixa passar enquanto carrega ou com
 * erro. Sem documento no cadastro ela aceita do mesmo jeito: a prévia do banco
 * já devolve a linha em branco no lugar do RG/CPF.
 */
export default function ContratoEssentia({ children }) {
  const { profile, role } = useSession();
  const { pathname } = useLocation();

  // { status: 'carregando' | 'erro' | 'ok', pendente, previa, contratoId }
  const [busca, setBusca] = useState({ status: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [concordou, setConcordou] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState(null);

  // Mesma normalização do gate do plano avulso (PacienteLayout.jsx:86).
  const ehEssentia = role === 'paciente'
    && !!profile
    && profile.tipo_plano?.trim().toLowerCase() === 'essentia';
  const ativa = profile?.status_paciente === 'ativo';

  // O documento vem do CADASTRO, preenchido pela nutri no perfil da paciente.
  // Ela não digita mais nada aqui: antes, o que ela escrevesse era gravado na
  // ficha dela pelo passo 6 do aceitar_contrato_essentia — identidade
  // autodeclarada entrando no contrato e no cadastro de uma vez só.
  //
  // A ORDEM espelha o servidor: RG na frente do CPF (ver v_ident em
  // aceitar_contrato_essentia). Se a tela dissesse CPF e o contrato dissesse
  // RG, ela leria uma coisa e assinaria outra.
  const rgCadastro  = profile?.rg?.trim()  || '';
  const cpfCadastro = profile?.cpf?.trim() || '';
  const identificacao = rgCadastro
    ? `RG ${rgCadastro}`
    : (cpfCadastro ? `CPF ${formatarCpf(cpfCadastro)}` : null);

  // 1) Contrato pendente + prévia. Só para quem está no gate (Essentia ativa).
  //
  //    Na volta ao app (visibilitychange) a busca é refeita SEM mostrar o
  //    carregando (a tela não pisca a cada troca de app) e, se falhar, mantém o
  //    último resultado bom — um soluço de rede ao voltar não tranca quem já
  //    estava usando o app. A primeira busca, essa sim, falha fechada.
  const pacienteId = profile?.id;
  useEffect(() => {
    if (!ehEssentia || !ativa || !pacienteId) return;
    let vivo = true;

    async function checar(recheck) {
      const r = await buscarContratoPendente(pacienteId);
      if (!vivo) return;
      if (r.status === 'erro' && recheck) return;
      setBusca(r);
    }

    checar(false);
    // Reconfere ao voltar ao app: quem estava com ele aberto na hora em que o
    // contrato foi publicado passa a ver o gate sem precisar recarregar.
    function onVisible() {
      if (document.visibilityState === 'visible') checar(true);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ehEssentia, ativa, pacienteId, tentativa]);

  function tentarDeNovo() {
    setBusca({ status: 'carregando' });
    setTentativa(n => n + 1);
  }

  // Marcar a caixa é o ato de assinar; o botão é o envio. Os dois existem de
  // propósito: `aceito_em` é permanente e o pendente some da tela depois, então
  // um toque acidental numa caixa não pode fechar contrato sozinho.
  const podeAceitar = concordou;
  const contratoId = busca.contratoId ?? null;

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    // No topo, antes do primeiro await de Supabase — não é estilo, é o que
    // impede a promise de nunca resolver por disputa do lock de auth. Ver o
    // comentário de iniciarTokenPush em lib/push.js.
    const tokenPush = iniciarTokenPush();
    // null nos dois: o documento é o do cadastro. Os parâmetros continuam na
    // assinatura da função no banco, agora sem uso — tirá-los custaria um
    // DROP/CREATE e não resolveria nada.
    const { data, error } = await supabase.rpc('aceitar_contrato_essentia', {
      p_contrato_id: contratoId,
      p_cpf: null,
      p_rg: null,
    });
    setAceitando(false);
    if (error) {
      // As mensagens da função já são escritas para a paciente ler.
      setErro(error.message);
      return;
    }
    // `novo: false` é a RPC dizendo que só devolveu o carimbo que já existia —
    // outra aba aceitou antes, ou a resposta do primeiro clique se perdeu e ela
    // clicou de novo. Nos dois casos o banco está certo e nada mudou, então a
    // nutri não pode receber um segundo "Assinou o contrato".
    //
    // O `?? true` falha ABERTO de propósito: se o retorno vier numa forma que
    // eu não previ, manda o push. Um aviso repetido incomoda; um aceite que
    // nunca avisa some, e o push é o único canal que existe para isto.
    if (data?.[0]?.novo ?? true) avisarNutri(tokenPush, 'contrato_assinado');
    // Libera o app NA MESMA URL: quem chegou por um link (push, atalho) cai
    // onde ia, sem navegação nenhuma.
    setBusca({ status: 'ok', pendente: false, previa: null, contratoId: null });
  }

  // ── DECISÃO, depois de todos os hooks ──
  const estado = decidirGateContrato({
    ehEssentia, ativa, pathname, liberadas: TELAS_LIBERADAS_SEM_CONTRATO, busca,
  });

  if (estado === 'app') return children;
  if (estado === 'carregando') return <Carregando />;
  if (estado === 'erro') {
    return (
      <TelaAviso>
        <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink, #2b2b2b)' }}>
          Sem conexão
        </div>
        <button onClick={tentarDeNovo} style={BOTAO_ESCURO}>
          Tentar de novo
        </button>
      </TelaAviso>
    );
  }
  if (estado === 'sem_consulta') {
    return (
      <TelaAviso>
        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ink, #2b2b2b)', marginBottom: 10 }}>
          Seu contrato
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink, #2b2b2b)' }}>
          Seu contrato ficará disponível assim que sua primeira consulta for marcada. Fale com sua nutricionista.
        </div>
        <button onClick={signOut} style={BOTAO_SAIR}>
          Sair
        </button>
      </TelaAviso>
    );
  }

  // estado === 'contrato'
  const html = busca.previa;
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg, #f5f1e8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        maxWidth: 560, width: '100%', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,.15)',
      }}>
        <div style={{
          padding: '20px 24px 12px',
          borderBottom: '0.5px solid var(--hair, #e6dfd0)',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
            color: 'var(--gold-deep, #a08456)', fontWeight: 500, marginBottom: 4,
          }}>
            Essentia
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ink, #2b2b2b)' }}>
            Contrato de prestação de serviços
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted, #999)', marginTop: 4 }}>
            Leia com calma antes de confirmar
          </div>
        </div>

        {/* Vem escapado do servidor: o corpo é HTML confiável escrito pela
            nutri, e nome/CPF/RG/valor passaram por escapar_html lá. */}
        <div style={{
          padding: '16px 24px',
          overflow: 'auto', flex: 1, minHeight: 0,
          fontSize: 13, lineHeight: 1.6, color: 'var(--ink, #2b2b2b)',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* Com QUAL documento ela está assinando. Fica fora do corpo do
            contrato, que rola, para não depender de ela ter chegado ao fim do
            texto para enxergar isto. */}
        <div style={{
          padding: '12px 24px 0',
          fontSize: 12, color: 'var(--muted, #999)', lineHeight: 1.5,
        }}>
          {/* Sem documento no cadastro, sem o trecho: o contrato mostra a
              linha em branco que a prévia do banco devolve. */}
          Assinando como <strong style={{ color: 'var(--ink, #2b2b2b)' }}>
            {profile?.nome}
          </strong>{identificacao ? `, ${identificacao}` : ''}.
        </div>

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 24px 0', cursor: 'pointer',
          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        }}>
          <input
            type="checkbox"
            checked={concordou}
            onChange={e => setConcordou(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: 'var(--ink, #2b2b2b)', lineHeight: 1.45 }}>
            Li e concordo com os termos
          </span>
        </label>

        {erro && (
          <div style={{
            margin: '12px 24px 0', padding: '8px 12px',
            background: 'var(--red-bg, #ffe9e6)', color: 'var(--red, #c93b3b)',
            borderRadius: 8, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{
          padding: '14px 24px 18px',
          borderTop: '0.5px solid var(--hair, #e6dfd0)',
          marginTop: 12,
        }}>
          <button onClick={aceitar} disabled={aceitando || !podeAceitar}
            style={{
              width: '100%', padding: '14px 18px',
              background: '#2b2b2b', color: '#ffffff',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 500,
              cursor: (aceitando || !podeAceitar) ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: (aceitando || !podeAceitar) ? 0.5 : 1,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}>
            {aceitando ? 'Registrando...' : 'Confirmar assinatura'}
          </button>
          <div style={{
            fontSize: 11, color: 'var(--muted, #999)',
            textAlign: 'center', marginTop: 8, lineHeight: 1.4,
          }}>
            {/* O ramo de baixo é o da caixa desmarcada. */}
            {podeAceitar
              ? 'Em caso de dúvida, fale com sua nutricionista antes de confirmar.'
              : 'Marque "Li e concordo com os termos" para confirmar.'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Busca o pendente e a prévia. Não mexe em estado: devolve o que o gate guarda.
// { status: 'erro' } em qualquer falha de rede/RPC.
async function buscarContratoPendente(pacienteId) {
  // Índice único parcial garante no máximo um pendente por paciente.
  const { data: contrato, error: errContrato } = await supabase
    .from('contratos_essentia')
    .select('id')
    .eq('paciente_id', pacienteId)
    .is('aceito_em', null)
    .maybeSingle();
  if (errContrato) return { status: 'erro' };
  // Sem pendência: já aceitou, ou não tem contrato.
  if (!contrato) return { status: 'ok', pendente: false, previa: null, contratoId: null };

  // null nos dois: o servidor lê CPF/RG do cadastro e é a única fonte.
  const { data: texto, error: errPrevia } = await supabase.rpc('previa_contrato_essentia', {
    p_contrato_id: contrato.id, p_cpf: null, p_rg: null,
  });
  if (errPrevia) return { status: 'erro' };
  // texto null = ainda não há primeira consulta datada (decidirGateContrato
  // transforma isso na tela "sem consulta").
  return { status: 'ok', pendente: true, previa: texto || null, contratoId: contrato.id };
}

// Mesmo indicador do LoadingSpinner do App.jsx (o do Suspense das rotas).
function Carregando() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '2.5px solid var(--hair)',
        borderTopColor: 'var(--gold-deep)',
        animation: 'essentia-spin 0.75s linear infinite',
      }} />
    </div>
  );
}

// Moldura do PacienteBloqueio: fundo cheio, cartão branco central, marca no topo.
function TelaAviso({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        maxWidth: 420, width: '100%',
        padding: '32px 24px',
        textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,.15)',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', fontWeight: 500, marginBottom: 10,
        }}>
          Essentia
        </div>
        {children}
      </div>
    </div>
  );
}

// Botão Sair do PacienteBloqueio.
const BOTAO_SAIR = {
  marginTop: 24,
  background: 'none', border: '0.5px solid var(--hair, #e6dfd0)',
  borderRadius: 8, padding: '8px 16px',
  fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};

// Botão "Tentar de novo" do SignupPaciente.
const BOTAO_ESCURO = {
  width: '100%', padding: '11px 18px', marginTop: 16,
  background: 'var(--ink)', color: 'var(--bg-soft)',
  borderRadius: 12, fontSize: 13, fontWeight: 500,
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};
