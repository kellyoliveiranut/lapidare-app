import { useEffect } from 'react';
import ConversaPanel from './_Conversa.jsx';

// A caixa do chat flutuante: dá tamanho e posição à MESMA conversa que a tela
// de Chat usa na coluna da direita. Toda a lógica — histórico, envio, anexo,
// realtime, marcar como lida — continua em _Conversa.jsx; aqui só tem moldura.
//
// Não é modal: não escurece o fundo nem prende o foco, de propósito. A nutri
// responde a paciente enquanto continua lendo o perfil atrás.
export default function ChatFlutuante({ paciente, nutriId, onFechar }) {
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="chat-flutuante" role="dialog"
      aria-label={`Conversa com ${paciente.nome}`}>
      <ConversaPanel paciente={paciente} nutriId={nutriId} onFechar={onFechar} />
    </div>
  );
}
