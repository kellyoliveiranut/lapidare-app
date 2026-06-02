import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.jsx';

// Versão do termo. Se atualizar o texto abaixo, incrementa a versão
// e todas as pacientes precisam aceitar de novo.
export const TERMO_VERSAO = '1.1';

const TERMO_HTML = `
<h3>1. Sobre este aplicativo</h3>
<p>
  Este aplicativo é uma plataforma de acompanhamento nutricional entre você
  e sua nutricionista. Os dados aqui registrados (planos, fotos de evolução,
  medidas, mensagens, suplementos) são <strong>privados</strong> e visíveis
  apenas pra você e pra sua nutricionista.
</p>

<h3>2. Dados que coletamos</h3>
<ul>
  <li><strong>Cadastro:</strong> nome, e-mail, telefone, data de nascimento e, quando fornecido, endereço completo (utilizado para emissão de nota fiscal).</li>
  <li><strong>Saúde:</strong> peso, medidas, % de gordura, fotos de evolução.</li>
  <li><strong>Comportamento:</strong> aderência ao plano, suplementos, check-ins, fotos de refeições.</li>
  <li><strong>Comunicação:</strong> histórico de mensagens com a nutricionista.</li>
</ul>

<h3>3. Como usamos</h3>
<p>
  Esses dados são usados <strong>exclusivamente</strong> pra que sua
  nutricionista possa acompanhar sua evolução, ajustar o plano e
  conversar com você. <strong>Não compartilhamos com terceiros</strong>,
  não vendemos pra empresas de marketing e não usamos pra publicidade.
</p>

<h3>4. Seus direitos (LGPD)</h3>
<p>De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode a qualquer momento:</p>
<ul>
  <li>Solicitar uma cópia de todos os seus dados;</li>
  <li>Corrigir informações incorretas;</li>
  <li>Pedir exclusão da sua conta e de todos os dados;</li>
  <li>Retirar este consentimento.</li>
</ul>
<p>Pra exercer qualquer direito, fale diretamente com sua nutricionista pelo chat.</p>

<h3>5. Segurança</h3>
<p>
  Seus dados ficam armazenados em servidores criptografados (Supabase),
  com controle de acesso por sessão autenticada. Apenas você (com seu login)
  e sua nutricionista (com o login dela) acessam suas informações.
</p>

<h3>6. Responsabilidade profissional</h3>
<p>
  Lembre-se: este app é uma <strong>ferramenta de acompanhamento</strong>,
  não substitui consulta presencial quando indicada nem orientação médica.
  Em caso de mal-estar, procure atendimento médico.
</p>

<p style="margin-top: 20px; font-size: 12px; color: var(--muted);">
  <strong>Versão ${TERMO_VERSAO}</strong> · Ao clicar em "Aceito e continuar",
  você confirma que leu, entendeu e concorda com os termos acima.
</p>
`;

export default function TermoConsentimento({ children }) {
  const { user, profile, role, refreshProfile } = useSession();
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState(null);

  // Só aplica pra paciente
  if (role !== 'paciente' || !profile) return children;

  // Já aceitou (esta versão ou versão posterior)
  if (profile.termo_aceito_em && profile.termo_versao === TERMO_VERSAO) {
    return children;
  }

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    const { error } = await supabase.from('pacientes').update({
      termo_aceito_em: new Date().toISOString(),
      termo_versao: TERMO_VERSAO,
    }).eq('id', user.id);
    setAceitando(false);
    if (error) {
      setErro('Não foi possível salvar: ' + error.message);
      return;
    }
    if (typeof refreshProfile === 'function') {
      await refreshProfile();
    } else {
      window.location.reload();
    }
  }

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
            Antes de começar
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ink, #2b2b2b)' }}>
            Termo de uso e privacidade
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted, #999)', marginTop: 4 }}>
            Leitura rápida — proteção dos seus dados (LGPD)
          </div>
        </div>

        <div style={{
          padding: '16px 24px',
          overflow: 'auto', flex: 1,
          fontSize: 13, lineHeight: 1.6, color: 'var(--ink, #2b2b2b)',
        }}
          dangerouslySetInnerHTML={{ __html: TERMO_HTML }}
        />

        {erro && (
          <div style={{
            margin: '0 24px 8px', padding: '8px 12px',
            background: 'var(--red-bg, #ffe9e6)', color: 'var(--red, #c93b3b)',
            borderRadius: 8, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{
          padding: '14px 24px 18px',
          borderTop: '0.5px solid var(--hair, #e6dfd0)',
        }}>
          <button onClick={aceitar} disabled={aceitando}
            style={{
              width: '100%', padding: '14px 18px',
              background: '#2b2b2b', color: '#ffffff',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: aceitando ? 0.7 : 1,
            }}>
            {aceitando ? 'Salvando...' : 'Aceito e continuar'}
          </button>
          <div style={{
            fontSize: 11, color: 'var(--muted, #999)',
            textAlign: 'center', marginTop: 8, lineHeight: 1.4,
          }}>
            Se preferir não aceitar, feche o app e fale com sua nutricionista.
          </div>
        </div>
      </div>
    </div>
  );
}
