import { useEffect, useState } from 'react';
import { _ligar } from '../lib/dialogos.js';

// Mostra um pedido de confirmação por vez; pedidos seguintes esperam na fila.
// Este componente fica FORA de .nutri-panel/.paciente-app (onde estão as
// variáveis de cor e a classe .btn), então se estiliza sozinho, sem depender delas.
const BTN = {
  flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 500,
};

export default function DialogoHost() {
  const [fila, setFila] = useState([]);
  useEffect(() => _ligar(p => setFila(f => [...f, p])), []);

  const atual = fila[0];
  useEffect(() => {
    if (!atual) return undefined;
    const aoTeclar = e => {
      if (e.key === 'Escape') { atual.resolve(false); setFila(f => f.slice(1)); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [atual]);

  if (!atual) return null;

  function responder(valor) {
    atual.resolve(valor);
    setFila(f => f.slice(1));
  }

  return (
    <div
      role="presentation"
      onClick={() => responder(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(28,23,18,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role={atual.aviso ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', color: '#2a2218', borderRadius: 12, padding: 22,
          width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          border: '0.5px solid #d9d3c9', boxShadow: '0 12px 40px rgba(0,0,0,.25)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line', marginBottom: 20 }}>
          {atual.texto}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!atual.aviso && (
            <button
              type="button"
              onClick={() => responder(false)}
              style={{ ...BTN, background: '#ffffff', color: '#2a2218', border: '1px solid #d9d3c9' }}
            >
              {atual.cancelarRotulo}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => responder(true)}
            style={{ ...BTN, background: '#2a1d0e', color: '#ffffff', border: '1px solid #2a1d0e' }}
          >
            {atual.confirmarRotulo}
          </button>
        </div>
      </div>
    </div>
  );
}
