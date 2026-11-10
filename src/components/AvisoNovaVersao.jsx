import { useEffect, useState } from 'react';

/**
 * Avisa na tela quando uma versão nova do app foi publicada, e deixa a pessoa
 * escolher quando recarregar. NÃO recarrega sozinho: a tela pode ter texto
 * digitado (plano, observação) que um reload perderia.
 *
 * Compara o <meta name="app-build"> do index.html do servidor com o da página
 * aberta (__BUILD_TIME__). Confere ao voltar para a aba e a cada 5 minutos.
 * Sem o meta (desenvolvimento) ou sem internet, não faz nada.
 */
const INTERVALO_MS = 5 * 60 * 1000;

async function versaoDoServidor() {
  try {
    const r = await fetch('/', { cache: 'no-store' });
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    return doc.querySelector('meta[name="app-build"]')?.content ?? null;
  } catch { return null; }
}

export default function AvisoNovaVersao() {
  const [nova, setNova] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    let vivo = true;
    async function conferir() {
      const v = await versaoDoServidor();
      if (vivo && v && v !== __BUILD_TIME__) setNova(true);
    }
    const t = setInterval(conferir, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
  }, []);

  if (!nova || dispensado) return null;
  return (
    <div role="status" style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      zIndex: 300, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        maxWidth: 460, padding: '10px 14px', borderRadius: 10,
        background: '#281b06', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,.25)', fontSize: 13,
      }}>
        <span style={{ flex: 1, minWidth: 180 }}>
          Nova versão do app disponível. Salve o que estiver escrevendo e atualize.
        </span>
        <button type="button" onClick={() => window.location.reload()}
          style={{
            border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            background: '#c9a96e', color: '#281b06', fontWeight: 600, fontSize: 13,
            fontFamily: 'inherit',
          }}>
          Atualizar
        </button>
        <button type="button" onClick={() => setDispensado(true)} aria-label="Dispensar aviso"
          style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}>
          ×
        </button>
      </div>
    </div>
  );
}
