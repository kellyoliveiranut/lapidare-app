import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Recebe do service worker a ordem de navegar depois de um clique em
// notificação. Existe porque no iOS as duas APIs que o SW teria para isso
// falham em silêncio: clients.openWindow() para outra origem e, pelo que os
// testes mostraram, WindowClient.navigate() mesmo na mesma origem. postMessage
// não passa por nenhuma delas.
//
// Precisa ficar dentro do BrowserRouter (usa useNavigate) e fora do Routes,
// para não desmontar a cada troca de rota — vale para a nutri e para a paciente.
export default function PushNavigator() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    function onMessage(event) {
      const { type, url } = event.data ?? {};
      console.log('[PushNavigator] mensagem do SW:', event.data);
      registrarDebug(event.data);

      if (type !== 'navigate') return;
      // Só caminho interno. Mensagem nunca navega para URL absoluta — seria um
      // jeito de forçar saída do app.
      if (typeof url !== 'string' || !url.startsWith('/')) {
        console.log('[PushNavigator] url recusada:', url);
        return;
      }

      console.log('[PushNavigator] navegando para:', url);
      navigate(url);
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}

// ---------------------------------------------------------------------------
// TEMPORÁRIO — diagnóstico do push no iPhone. Sai quando o bug estiver
// resolvido. Existe porque ler console.log no iOS exige um Mac com o Web
// Inspector no cabo; sem isso o teste é cego. Grava em localStorage para
// sobreviver ao remount e ao reload, e avisa a tela por evento.
// Para remover: apagar daqui até o fim do arquivo, mais o <PushDebug /> e o
// import em src/app/paciente/Inicio.jsx.
// ---------------------------------------------------------------------------

const DEBUG_KEY = '__push_debug';

function registrarDebug(data) {
  try {
    const hora = new Date().toLocaleTimeString('pt-BR');
    localStorage.setItem(DEBUG_KEY, `${hora} — ${JSON.stringify(data)}`);
    window.dispatchEvent(new CustomEvent('push-debug'));
  } catch { /* localStorage cheio ou bloqueado — o log do console continua */ }
}

export function PushDebug() {
  const [texto, setTexto] = useState('nenhuma mensagem ainda');

  useEffect(() => {
    function ler() {
      try {
        setTexto(localStorage.getItem(DEBUG_KEY) || 'nenhuma mensagem ainda');
      } catch { /* ignora */ }
    }
    ler();
    window.addEventListener('push-debug', ler);
    // Ao voltar do background: é quando o toque na notificação traz o app.
    document.addEventListener('visibilitychange', ler);
    return () => {
      window.removeEventListener('push-debug', ler);
      document.removeEventListener('visibilitychange', ler);
    };
  }, []);

  return (
    <div style={{
      marginTop: 24, fontSize: 10, lineHeight: 1.4,
      color: 'var(--muted-2, #b9b2a8)', wordBreak: 'break-all',
    }}>
      push: {texto}
    </div>
  );
}
