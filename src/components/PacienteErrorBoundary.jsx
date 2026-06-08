import { Component } from 'react';

export default class PacienteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error('[PacienteErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg, #f5f1e8)',
        padding: '24px 20px', textAlign: 'center',
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--green-bg, #e8f5e9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, marginBottom: 20,
        }}>
          🌿
        </div>
        <div style={{
          fontFamily: 'var(--font-serif, serif)',
          fontSize: 22, color: 'var(--ink, #2b2b2b)',
          marginBottom: 8, lineHeight: 1.2,
        }}>
          Algo deu errado
        </div>
        <div style={{
          fontSize: 13, color: 'var(--muted, #999)',
          lineHeight: 1.6, maxWidth: 280, marginBottom: 28,
        }}>
          Um erro inesperado aconteceu. Toque no botão abaixo para recarregar.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '13px 28px', borderRadius: 12,
            background: 'var(--green, #3a7d5a)',
            color: '#fff', border: 'none',
            fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          Recarregar
        </button>
      </div>
    );
  }
}
