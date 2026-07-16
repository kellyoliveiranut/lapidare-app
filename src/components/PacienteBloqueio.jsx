import { useSession, signOut } from '../lib/session.jsx';

/**
 * Gate de acesso pausado.
 *
 * Quando a nutri pausa o acesso (pacientes.acesso_pausado = true), a paciente
 * ainda loga normalmente, mas vê esta mensagem no lugar do app.
 *
 * Envolve o TermoConsentimento na cadeia do App.jsx — assim a paciente pausada
 * nem chega a ver o termo. Fica fora do PacienteLayout de propósito: o layout
 * dispara várias queries de badge que não fazem sentido para quem está pausada.
 *
 * ATENÇÃO — este bloqueio é VISUAL. Ele esconde as telas, mas os dados da
 * paciente seguem buscáveis pela API até que a pausa seja aplicada no banco
 * (minha_paciente_id() + as policies com fallback auth.uid()). O que já está
 * protegido no banco é o contrário: a paciente não consegue se despausar
 * sozinha (trigger trg_protege_acesso_pausado).
 */
export default function PacienteBloqueio({ children }) {
  const { role, profile } = useSession();

  // Guarda defensiva durante transições de auth — mesma da TermoConsentimento
  if (role !== 'paciente' || !profile) return children;
  if (!profile.acesso_pausado) return children;

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

        <i className="ti ti-player-pause" aria-hidden="true" style={{
          fontSize: 32, color: 'var(--gold-deep, #a08456)', display: 'block', marginBottom: 14,
        }} />

        <div style={{
          fontSize: 16, lineHeight: 1.6, color: 'var(--ink, #2b2b2b)',
        }}>
          Seu acesso está pausado no momento.
          <br />
          Fale com sua nutricionista.
        </div>

        <button onClick={signOut} style={{
          marginTop: 24,
          background: 'none', border: '0.5px solid var(--hair, #e6dfd0)',
          borderRadius: 8, padding: '8px 16px',
          fontSize: 12, color: 'var(--text3, #999)', cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}>
          Sair
        </button>
      </div>
    </div>
  );
}
