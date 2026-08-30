import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.jsx';

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
  const { profile, role, refreshProfile } = useSession();

  const [contratoId, setContratoId] = useState(null);
  const [html, setHtml] = useState(null);
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState(null);

  // Mesma normalização do gate do plano avulso (PacienteLayout.jsx:86).
  const ehEssentia = role === 'paciente'
    && !!profile
    && profile.tipo_plano?.trim().toLowerCase() === 'essentia';

  // 1) Contrato pendente + prévia. Qualquer buraco no caminho (sem contrato,
  //    sem consulta datada, erro de rede) termina em children: um contrato não
  //    resolvido nunca pode trancar o app inteiro.
  useEffect(() => {
    if (!ehEssentia) return;
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

      // null aqui de propósito: o servidor já prefere o que está gravado no
      // cadastro, e nada foi digitado ainda.
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
  }, [ehEssentia, profile?.id]);

  // 2) Reescreve a prévia conforme ela digita — é assim que o "____________"
  //    da identificação vira a frase de verdade. Roda para os dois campos
  //    mesmo que um já esteja no cadastro: um RG digitado troca a frase de
  //    CPF para RG (a função prefere RG quando existe).
  useEffect(() => {
    if (!contratoId) return;
    if (!cpf.trim() && !rg.trim()) return;
    let ativo = true;
    const t = setTimeout(async () => {
      const { data: texto } = await supabase.rpc('previa_contrato_essentia', {
        p_contrato_id: contratoId,
        p_cpf: cpf.trim() || null,
        p_rg: rg.trim() || null,
      });
      if (ativo && texto) setHtml(texto);
    }, 500);
    return () => { ativo = false; clearTimeout(t); };
  }, [cpf, rg, contratoId]);

  const faltaCpf = !profile?.cpf;
  const faltaRg  = !profile?.rg;
  // O servidor exige RG ou CPF para aceitar. Se nenhum dos dois existe e nada
  // foi digitado, o botão fica travado em vez de gerar erro no clique.
  const podeAceitar = !!(profile?.cpf || profile?.rg || cpf.trim() || rg.trim());

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    const { error } = await supabase.rpc('aceitar_contrato_essentia', {
      p_contrato_id: contratoId,
      p_cpf: cpf.trim() || null,
      p_rg: rg.trim() || null,
    });
    setAceitando(false);
    if (error) {
      // As mensagens da função já são escritas para a paciente ler
      // ("CPF inválido — informe os 11 dígitos.").
      setErro(error.message);
      return;
    }
    // A função pode ter gravado cpf/rg no cadastro — o profile precisa saber.
    if (typeof refreshProfile === 'function') await refreshProfile();
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

        {(faltaCpf || faltaRg) && (
          <div style={{
            padding: '12px 24px 0',
            display: 'grid', gap: 8,
            gridTemplateColumns: faltaCpf && faltaRg ? '1fr 1fr' : '1fr',
          }}>
            {faltaCpf && (
              <label style={{ display: 'block' }}>
                <span style={{
                  display: 'block', fontSize: 11, color: 'var(--muted, #999)',
                  marginBottom: 4, fontWeight: 500,
                }}>CPF</span>
                <input value={cpf} onChange={e => setCpf(e.target.value)}
                  inputMode="numeric" placeholder="000.000.000-00"
                  style={campoStyle} />
              </label>
            )}
            {faltaRg && (
              <label style={{ display: 'block' }}>
                <span style={{
                  display: 'block', fontSize: 11, color: 'var(--muted, #999)',
                  marginBottom: 4, fontWeight: 500,
                }}>RG</span>
                <input value={rg} onChange={e => setRg(e.target.value)}
                  placeholder="0000000" style={campoStyle} />
              </label>
            )}
          </div>
        )}

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
            {aceitando ? 'Registrando...' : 'Li e aceito o contrato'}
          </button>
          <div style={{
            fontSize: 11, color: 'var(--muted, #999)',
            textAlign: 'center', marginTop: 8, lineHeight: 1.4,
          }}>
            {podeAceitar
              ? 'Em caso de dúvida, fale com sua nutricionista antes de aceitar.'
              : 'Informe o RG ou o CPF para poder aceitar.'}
          </div>
        </div>
      </div>
    </div>
  );
}

const campoStyle = {
  width: '100%', padding: '10px 12px', fontSize: 13,
  border: '0.5px solid var(--hair, #e6dfd0)', borderRadius: 8,
  outline: 'none', fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
};
