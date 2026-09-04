import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

/* ============================================================
   SOLICITAÇÕES DE EXAME — lado da paciente

   Lista os PDFs que a nutri gerou na aba "Exames" do perfil, do
   bucket privado `prescricoes` com tipo='exame'.

   Esta tela existe para TODA paciente, inclusive plano avulsa —
   por isso '/paciente/exames' está em AVULSA_ALLOWED
   (PacienteLayout.jsx). Não confundir com os RESULTADOS de exame,
   que vivem na aba Tratamento e ficam atrás de dois portões
   (objetivo = Oncologia, e fora do AVULSA_ALLOWED).

   O mecanismo de signed URL, re-assinatura e visor é cópia
   deliberada de Plano.jsx: mesmos 8h/50min, mesmo visibilitychange,
   mesmo tratamento de iOS. Mudou aqui, conferir lá.
   ============================================================ */

// Signed URL com validade folgada (8h) para aguentar sessões longas na tela.
const SIGNED_TTL_SECONDS = 60 * 60 * 8;
// Ao voltar para a tela (visibilitychange), re-assina se a URL passou de ~50min.
const REFRESH_AFTER_MS = 50 * 60 * 1000;

// iOS (iPhone/iPad) tem visualizador de PDF embutido instável em <iframe>.
// Nesses aparelhos "Abrir em nova aba" é a ação principal e o visor começa
// fechado. iPadOS 13+ se identifica como "MacIntel"; distingue pelo touch.
function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPhone = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iPhone || iPadOS;
}

const cardStyle = {
  background: '#F4F1EB', border: '1px solid #DDD5C4',
  borderRadius: 14, padding: '14px 16px', marginBottom: 14,
};

const iconWrapStyle = {
  width: 48, height: 48, borderRadius: 16, flexShrink: 0,
  background: '#F4ECDD', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const apoioStyle = {
  fontSize: 11, color: '#7A6E60', marginTop: 10, lineHeight: 1.4,
};

const verAquiStyle = {
  display: 'inline-block', marginTop: 8, padding: 0,
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
  color: '#2C3A30', textDecoration: 'underline',
};

const embedWrapStyle = {
  marginTop: 12, borderRadius: 12, overflow: 'hidden',
  border: '1px solid #DDD5C4', background: '#fff',
};

const embedIframeWrapStyle = {
  height: '70vh', maxHeight: 820,
};

// Sticky para continuar alcançável enquanto o PDF ocupa quase a tela toda —
// dentro do iframe o dedo rola o PDF, não a página.
const visorBarStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  padding: '8px 10px', background: '#F4ECDD', borderBottom: '1px solid #DDD5C4',
  position: 'sticky', top: 0, zIndex: 1,
};

const voltarStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: '#2C3A30',
};

const pilulaBase = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 20, border: '1px solid #DDD5C4',
  background: '#FDFBF8', color: '#2C3A30',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--font-sans)', flexShrink: 0,
};

// Botão "Abrir em nova aba" — o caminho que sempre funcionou (link nativo <a>,
// não bloqueado no iOS). NUNCA é removido quando há URL; só mostra "Preparando…"
// enquanto a URL assinada é gerada.
function BotaoAbrir({ url, label, destaque }) {
  const pilula = destaque
    ? { ...pilulaBase, padding: '10px 18px', fontSize: 13 }
    : pilulaBase;
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={pilula}>
      <i className="ti ti-external-link" style={{ fontSize: 13 }} aria-hidden="true" />
      {label}
    </a>
  );
  return (
    <button disabled style={{ ...pilula, background: '#9A9A9A', opacity: 0.7, cursor: 'default' }}>
      Preparando…
    </button>
  );
}

function CardSolicitacao({ item, url, erro, ios }) {
  // Desktop/Android: embute direto. iOS: começa fechado, porque lá o visor
  // embutido é instável. Em ambos, "Voltar" fecha e o card volta a oferecer
  // abrir de novo — esse caminho não pode ser de mão única.
  const [aberto, setAberto] = useState(!ios);
  const mostrarEmbed = !!url && aberto;
  const labelBotao = 'Abrir em nova aba';

  // A lista de exames vem da coluna `nota`, gravada no momento do envio. Serve
  // para a paciente saber o que foi pedido SEM precisar abrir o PDF — e é o que
  // ela lê em pé no laboratório, quando abrir um PDF é mais trabalhoso.
  const itens = (item.nota ?? '').split(' · ').filter(Boolean);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={iconWrapStyle}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 22, color: '#9A7B3F' }} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 15, color: '#2C3A30', lineHeight: 1.2, marginBottom: 3 }}>
            Solicitação de exames
          </div>
          <div style={{ fontSize: 11, color: '#7A6E60' }}>
            enviada em {dataBR(item.created_at)}
            {itens.length > 0 && ` · ${itens.length} exame${itens.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {!mostrarEmbed && <BotaoAbrir url={url} label={labelBotao} destaque={ios} />}
      </div>

      {itens.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 9, borderTop: '1px solid #DDD5C4',
          fontSize: 12, color: '#5B5145', lineHeight: 1.6,
        }}>
          {itens.join(' · ')}
        </div>
      )}

      {erro && (
        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 10, lineHeight: 1.4 }}>
          Não foi possível preparar o arquivo agora. Tente reabrir a tela. (Erro: {erro})
        </div>
      )}

      {url && (
        <div style={apoioStyle}>
          Não carregou? Toque em <strong>{labelBotao}</strong>.
        </div>
      )}

      {url && !aberto && (
        <button type="button" onClick={() => setAberto(true)} style={verAquiStyle}>
          {ios ? 'Ou ver aqui no app' : 'Ver aqui no app'}
        </button>
      )}

      {mostrarEmbed && (
        <div style={embedWrapStyle}>
          <div style={visorBarStyle}>
            <button type="button" onClick={() => setAberto(false)} style={voltarStyle}>
              <i className="ti ti-chevron-left" style={{ fontSize: 14 }} aria-hidden="true" />
              Voltar
            </button>
            <BotaoAbrir url={url} label={labelBotao} />
          </div>
          <div style={embedIframeWrapStyle}>
            <iframe
              src={url}
              title="Solicitação de exames"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Exames() {
  const { user, profile } = useSession();
  const [itens, setItens] = useState(undefined);   // undefined = carregando
  const [urls, setUrls] = useState({});            // { [id]: signedUrl }
  const [erros, setErros] = useState({});          // { [id]: mensagem }

  const ios = isIOS();
  const mountedRef = useRef(true);
  // As linhas vivem num ref além do state: o resign() é um useCallback estável
  // e não pode depender de `itens`, senão o listener de visibilitychange seria
  // recriado a cada render. Mesma estrutura de Plano.jsx.
  const itensRef = useRef([]);
  const genAtRef = useRef(0);

  const resign = useCallback(async () => {
    const lista = itensRef.current;
    if (lista.length === 0) return;
    await Promise.all(lista.map(it =>
      supabase.storage.from('prescricoes').createSignedUrl(it.storage_path, SIGNED_TTL_SECONDS)
        .then(({ data, error }) => {
          if (!mountedRef.current) return;
          if (error) {
            setErros(e => ({ ...e, [it.id]: error.message }));
          } else {
            setUrls(u => ({ ...u, [it.id]: data.signedUrl }));
            setErros(e => { const n = { ...e }; delete n[it.id]; return n; });
          }
        })
    ));
    if (mountedRef.current) genAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const pacienteId = profile?.id ?? user?.id;

    async function load() {
      if (!pacienteId) return;
      const { data } = await supabase
        .from('prescricoes')
        .select('id, titulo, nota, storage_path, created_at')
        .eq('paciente_id', pacienteId)
        .eq('tipo', 'exame')
        .order('created_at', { ascending: false });

      if (!mountedRef.current) return;
      const lista = data ?? [];
      setItens(lista);
      itensRef.current = lista;

      // Assina imediatamente — link nativo <a> abre sem bloqueio no iOS.
      await resign();
    }

    load();
    return () => { mountedRef.current = false; };
  }, [user, profile, resign]);

  // Re-assina ao retornar para a aba/tela se a URL já está velha (>50min).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return;
      if (!genAtRef.current) return;
      if (Date.now() - genAtRef.current < REFRESH_AFTER_MS) return;
      resign();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [resign]);

  if (itens === undefined) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#7A6E60', fontSize: 13 }}>
        Carregando…
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        color: '#7A6E60', fontSize: 13, lineHeight: 1.6,
      }}>
        <i className="ti ti-test-pipe" style={{ fontSize: 34, display: 'block', marginBottom: 12, color: '#C4A882' }} aria-hidden="true" />
        Nenhuma solicitação de exame por aqui ainda.
        <br />
        <span style={{ fontSize: 12 }}>
          Quando sua nutricionista enviar uma, ela aparece nesta tela para você baixar e levar ao laboratório.
        </span>
      </div>
    );
  }

  return (
    <>
      {itens.map(item => (
        <CardSolicitacao
          key={item.id}
          item={item}
          url={urls[item.id] ?? null}
          erro={erros[item.id] ?? null}
          ios={ios}
        />
      ))}
    </>
  );
}
