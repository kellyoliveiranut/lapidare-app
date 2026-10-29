import { useEffect, useState } from 'react';
import { _ligar } from '../lib/dialogos.js';
import ModalShell from './ModalShell.jsx';

// Mostra um pedido de confirmação por vez; pedidos seguintes esperam na fila.
export default function DialogoHost() {
  const [fila, setFila] = useState([]);
  useEffect(() => _ligar(p => setFila(f => [...f, p])), []);

  const atual = fila[0];
  if (!atual) return null;

  function responder(valor) {
    atual.resolve(valor);
    setFila(f => f.slice(1));
  }

  return (
    <ModalShell title="Confirmar" onClose={() => responder(false)}>
      <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line', marginBottom: 18 }}>
        {atual.texto}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={() => responder(false)}>
          {atual.cancelarRotulo}
        </button>
        <button type="button" className="btn" style={{ flex: 1, justifyContent: "center" }} autoFocus onClick={() => responder(true)}>
          {atual.confirmarRotulo}
        </button>
      </div>
    </ModalShell>
  );
}
