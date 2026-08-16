import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// --- URL pendente deixada pelo service worker -------------------------------
// O SW grava ali porque no iPhone ele não consegue falar com a janela: o
// matchAll() não a enxerga quando o app está em segundo plano, então o
// postMessage nunca chega. Aqui ninguém espera recado — a janela vai buscar.
//
// Constantes duplicadas de public/sw.js, que não é importável pelo bundle.
// Mudou lá, muda aqui.
const PENDING_CACHE = 'essentia-push-pending';
const PENDING_KEY = '/__push_pending';

// Pendência velha não navega: se a paciente tocar na notificação, o app não
// abrir, e ela abrir o app à tarde por conta própria, não faz sentido jogá-la
// dentro da avaliação do nada. Dois minutos porque o iOS pode demorar a acordar.
const JANELA_MS = 2 * 60 * 1000;

async function consumirPendente() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(PENDING_CACHE);
    const res = await cache.match(PENDING_KEY);
    if (!res) return null;

    // Consome SEMPRE, antes mesmo de validar: uma pendência nunca é aplicada
    // duas vezes, nem que esteja expirada ou malformada.
    await cache.delete(PENDING_KEY);
    const { url, ts } = await res.json();

    if (typeof url !== 'string' || !url.startsWith('/')) return null;
    if (Date.now() - ts > JANELA_MS) return null;
    return url;
  } catch {
    return null;
  }
}

async function limparPendente() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(PENDING_CACHE);
    await cache.delete(PENDING_KEY);
  } catch { /* ignora */ }
}

// TEMPORÁRIO — só para o PushDebug. Lê SEM consumir: se apagasse, o painel de
// diagnóstico roubaria a pendência antes do consumirPendente navegar.
async function espiarPendente() {
  if (!('caches' in window)) return 'sem Cache API';
  try {
    const cache = await caches.open(PENDING_CACHE);
    const res = await cache.match(PENDING_KEY);
    if (!res) return '—';
    return await res.text();
  } catch (err) {
    return 'erro: ' + (err && err.message);
  }
}

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
      // Já navegamos por aqui; a pendência gravada pelo SW viraria lixo e
      // dispararia uma segunda navegação no próximo visibilitychange.
      limparPendente();
      navigate(url);
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // Consome a URL que o SW deixou. No mount, porque "app abriu do zero" nunca
  // dispara visibilitychange — a página já nasce visível. No visibilitychange,
  // porque é o momento em que o toque na notificação traz o app do background.
  // No pageshow, porque o bfcache do WebKit pode restaurar a página sem passar
  // por nenhum dos dois.
  useEffect(() => {
    let vivo = true;

    async function checar() {
      const url = await consumirPendente();
      if (!vivo || !url) return;
      console.log('[PushNavigator] pendente consumida, navegando para:', url);
      registrarDebug({ pendenteConsumida: url });
      navigate(url);
    }

    checar();
    function onVisible() {
      if (document.visibilityState === 'visible') checar();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', checar);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', checar);
    };
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
  const [pendente, setPendente] = useState('—');

  useEffect(() => {
    function ler() {
      try {
        setTexto(localStorage.getItem(DEBUG_KEY) || 'nenhuma mensagem ainda');
      } catch { /* ignora */ }
      espiarPendente().then(setPendente);
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
      <br />
      pendente: {pendente}
    </div>
  );
}
