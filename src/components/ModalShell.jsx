/**
 * Casca de modal — overlay escuro, card centralizado, título e subtítulo.
 * Clique no overlay fecha; clique dentro do card não propaga.
 *
 * Extraído do Financeiro.jsx para ser reaproveitado pela aba Financeiro do
 * perfil da paciente. Comportamento idêntico ao original.
 */
export default function ModalShell({ title, subtitle, children, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
