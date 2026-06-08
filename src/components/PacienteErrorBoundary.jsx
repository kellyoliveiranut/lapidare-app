import { Component } from 'react';

const CHUNK_RELOAD_KEY = 'essentia_chunk_reload_v1';

function isChunkLoadError(error) {
  const msg = error?.message ?? '';
  const name = error?.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('valid JavaScript MIME type') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk')
  );
}

export default class PacienteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[PacienteErrorBoundary]', error, info?.componentStack);
    this.setState({ info });

    if (isChunkLoadError(error)) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
    }
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    const { error, info } = this.state;
    const stack = info?.componentStack ?? '';
    const stackLines = stack.split('\n').slice(0, 8).join('\n');

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

        {/* DEBUG — remover depois */}
        <details open style={{ marginTop: 24, width: '100%', maxWidth: 480, textAlign: 'left' }}>
          <summary style={{
            fontSize: 12, color: 'var(--muted, #999)',
            cursor: 'pointer', userSelect: 'none', marginBottom: 8,
          }}>
            Detalhes técnicos
          </summary>
          <div style={{ background: '#1e1e1e', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{
              fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
              color: '#f87171', marginBottom: 10, wordBreak: 'break-word',
            }}>
              {error?.message ?? 'Erro desconhecido'}
            </div>
            <pre style={{
              fontFamily: 'monospace', fontSize: 10,
              color: '#a3a3a3', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', margin: 0, lineHeight: 1.5,
            }}>
              {stackLines}
            </pre>
          </div>
        </details>
      </div>
    );
  }
}
