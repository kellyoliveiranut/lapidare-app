/**
 * Rodapé de assinatura fixo — não pode ser editado pela personalização.
 * Aparece em todas as telas (nutri, paciente, login).
 *
 * Variante `compact` é pra ficar logo acima da tab bar do app da paciente.
 */

const APP_VERSION = '1.0'

const buildLabel = (() => {
  try {
    return new Date(__BUILD_TIME__).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
})()

export default function BrandFooter({ compact = false }) {
  return (
    <div style={{
      textAlign: 'center',
      fontSize: compact ? 9 : 10,
      color: 'var(--muted, #999)',
      padding: compact ? '6px 8px 4px' : '20px 8px 14px',
      letterSpacing: '.06em',
      opacity: 0.6,
      fontFamily: 'var(--font-sans)',
      userSelect: 'none',
    }}>
      Desenvolvido por <strong style={{ fontWeight: 600 }}>Equipe Kelly Oliveira</strong>
      <span style={{ display: 'block', fontSize: compact ? 8 : 9, marginTop: 2, opacity: 0.7 }}>
        Versão {APP_VERSION}{buildLabel ? ` · build ${buildLabel}` : ''}
      </span>
    </div>
  )
}
