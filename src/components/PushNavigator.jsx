import { useEffect } from 'react';
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
