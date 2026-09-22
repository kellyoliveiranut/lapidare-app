import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.jsx';
import { iniciarTokenPush, avisarNutri } from '../lib/push.js';
import { formatarCpf } from '../lib/utils.js';

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
 */
export default function ContratoEssentia({ children }) {
  const { profile, role } = useSession();

  const [contratoId, setContratoId] = useState(null);
  const [html, setHtml] = useState(null);
  const [concordou, setConcordou] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState(null);

  // Mesma normalização do gate do plano avulso (PacienteLayout.jsx:86).
  const ehEssentia = role === 'paciente'
    && !!profile
    && profile.tipo_plano?.trim().toLowerCase() === 'essentia';

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

  // 1) Contrato pendente + prévia. Qualquer buraco no caminho (sem contrato,
  //    sem consulta datada, SEM DOCUMENTO no cadastro, erro de rede) termina em
  //    children: um contrato não resolvido nunca pode trancar o app inteiro.
  //
  //    Sem documento a paciente não vê o contrato e segue usando o app — ela
  //    não tem como resolver isso sozinha, e uma tela de bloqueio com botão
  //    morto seria beco sem saída. Quem é avisada é a nutri, pelo StatusContrato
  //    do perfil, que passa a dizer "sem CPF/RG no cadastro".
  useEffect(() => {
    if (!ehEssentia || !identificacao) return;
    let ativo = true;
    (async () => {
      // Índice único parcial garante no máximo um pendente por paciente.
      const { data: contrato } = await supabase
        .from('contratos_essentia')
        .select('id')
        .eq('paciente_id', profile.id)
        .is('aceito_em', null)
        .maybeSingle();
      // Sem pendência (ou erro na busca), contrato vem null — sair AQUI é o que
      // impede o contrato.id logo abaixo de estourar para toda paciente
      // Essentia que já aceitou ou ainda não tem contrato.
      if (!ativo || !contrato) return;

      // null nos dois: o servidor lê CPF/RG do cadastro e é a única fonte.
      const { data: texto } = await supabase.rpc('previa_contrato_essentia', {
        p_contrato_id: contrato.id, p_cpf: null, p_rg: null,
      });
      // texto null = ainda não há primeira consulta datada. Sem data para
      // carimbar, não há contrato para mostrar.
      if (!ativo || !texto) return;

      setContratoId(contrato.id);
      setHtml(texto);
    })();
    return () => { ativo = false; };
  }, [ehEssentia, identificacao, profile?.id]);

  // Marcar a caixa é o ato de assinar; o botão é o envio. Os dois existem de
  // propósito: `aceito_em` é permanente e o pendente some da tela depois, então
  // um toque acidental numa caixa não pode fechar contrato sozinho.
  const podeAceitar = concordou && !!identificacao;

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
    setHtml(null);   // libera o app
  }

  // ── DECISÃO, depois de todos os hooks ──
  if (!html) return children;

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
          Assinando como <strong style={{ color: 'var(--ink, #2b2b2b)' }}>
            {profile?.nome}
          </strong>, {identificacao}.
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
            {/* O ramo de baixo só existe para a caixa desmarcada: sem documento
                no cadastro esta tela nem chega a ser montada. */}
            {podeAceitar
              ? 'Em caso de dúvida, fale com sua nutricionista antes de confirmar.'
              : 'Marque "Li e concordo com os termos" para confirmar.'}
          </div>
        </div>
      </div>
    </div>
  );
}
