import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import novidades from '../data/novidades.json';
import { ativarNotificacoes } from '../lib/push.js';
import {
  selecionarNovidades, mostrarConviteNotificacoes, partesDoTitulo, marcarDispensada,
  ROTULO_PADRAO, ICONE_PADRAO,
} from '../lib/novidadesNutri.js';
import '../styles/novidades.css';

/**
 * Novidades do painel da nutri — pilha de cartões (bloco-103).
 *
 * A fonte continua sendo o `src/data/novidades.json`, editado à mão a cada
 * mudança que valha contar; as regras (quais aparecem, "já visto", convite)
 * estão em lib/novidadesNutri.js. Só o painel da nutri monta este componente
 * (NutriLayout): a paciente nunca vê.
 *
 * Em primeiro lugar, quando cabe, o convite para ativar as notificações neste
 * aparelho (a mesma ativarNotificacoes() do card de Personalização). Depois,
 * até 3 novidades não dispensadas, da mais nova para a mais antiga.
 *
 * O "já visto" é por dispositivo, de propósito (localStorage), como antes.
 */

const CHAVE = 'novidades_vistas';                 // objeto: balde → id (antigo) e '#id' → id (novo)
const CHAVE_ANTIGA = 'novidades_vista';           // formato anterior ao objeto: não é mais lido
const CHAVE_SONECA = 'novidades_convite_soneca_ate';
const SONECA_MS = 14 * 86_400_000;
const ROTA_PERSONALIZACAO = '/nutri/personalizacao';

function lerJSON(chave, padrao) {
  try {
    const cru = JSON.parse(localStorage.getItem(chave) ?? 'null');
    return cru ?? padrao;
  } catch { return padrao; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado: vale só nesta sessão */ }
}

// Mesmo critério do convite da paciente (PacienteLayout): no iPhone o push só
// funciona com o app instalado na tela de início; fora dele, sem suporte.
function suporteNotificacoes() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const temApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return temApi && (standalone || !ehIOS);
}

function Cartao({ icone, rotulo, titulo, apoio, erro, onAbrir, onFechar, rotuloFechar = 'Dispensar' }) {
  const clicavel = typeof onAbrir === 'function';
  return (
    <div
      className={`novidade-cartao${clicavel ? ' clicavel' : ''}`}
      role={clicavel ? 'link' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={clicavel ? onAbrir : undefined}
      onKeyDown={clicavel ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } } : undefined}
    >
      <div className="novidade-icone"><i className={`ti ti-${icone}`} aria-hidden="true"></i></div>
      <div className="novidade-corpo">
        <div className="novidade-rotulo">{rotulo}</div>
        <div className="novidade-titulo">
          {partesDoTitulo(titulo).map((p, i) => (p.forte ? <strong key={i}>{p.texto}</strong> : <span key={i}>{p.texto}</span>))}
        </div>
        {apoio && <div className="novidade-apoio">{apoio}</div>}
        {erro && <div className="novidade-erro" role="status">{erro}</div>}
      </div>
      <button type="button" className="novidade-fechar" aria-label={rotuloFechar}
        onClick={e => { e.stopPropagation(); onFechar(); }}
        onKeyDown={e => e.stopPropagation()}>
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  );
}

export default function BannerNovidades() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [vistas, setVistas] = useState(() => {
    const v = lerJSON(CHAVE, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  });
  const [suportado] = useState(suporteNotificacoes);
  const [temInscricao, setTemInscricao] = useState(null);   // null = ainda não sabemos
  const [sonecaAte, setSonecaAte] = useState(() => Number(lerJSON(CHAVE_SONECA, 0)) || 0);
  const [ativando, setAtivando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  // Hora lida uma vez, ao montar: o render tem de ser puro. A soneca nova
  // (adiarConvite) fica no futuro e esconde o convite na hora.
  const [agora] = useState(() => Date.now());

  // Inscrição deste aparelho (a mesma leitura do card de Personalização).
  useEffect(() => {
    if (!suportado) return;
    let vivo = true;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => { if (vivo) setTemInscricao(!!sub); }, () => {});
    return () => { vivo = false; };
  }, [suportado]);

  const itens = selecionarNovidades({ itens: novidades, rotaAtual: pathname, vistas, max: 3 });
  const permissao = suportado ? Notification.permission : 'unsupported';
  const convite = mostrarConviteNotificacoes({ suportado, permissao, temInscricao, sonecaAte, agora });

  if (!convite && itens.length === 0) return null;

  function dispensar(n) {
    const proximo = marcarDispensada(vistas, n);
    gravar(CHAVE, proximo);
    try { localStorage.removeItem(CHAVE_ANTIGA); } catch { /* modo privado */ }
    setVistas(proximo);
  }

  function adiarConvite() {
    const ate = Date.now() + SONECA_MS;
    gravar(CHAVE_SONECA, ate);
    setSonecaAte(ate);
  }

  async function ativar() {
    if (falhou) { navigate(ROTA_PERSONALIZACAO); return; }
    if (ativando) return;
    setAtivando(true);
    try {
      await ativarNotificacoes();
      setTemInscricao(true);            // o cartão some sozinho
    } catch {
      setFalhou(true);
    } finally {
      setAtivando(false);
    }
  }

  return (
    <div className="novidades-pilha">
      {convite && (
        <Cartao
          icone="bell-ringing"
          rotulo="NÃO PERCA NADA"
          titulo="**Ative as notificações** no seu celular"
          apoio={ativando ? 'Ativando…' : 'Avisamos quando a paciente responder o check-in ou houver alerta no acompanhamento — clica aqui pra ativar'}
          erro={falhou ? 'Não foi possível ativar aqui. Abra Personalização para ver como.' : null}
          onAbrir={ativar}
          onFechar={adiarConvite}
        />
      )}
      {itens.map(n => (
        <Cartao
          key={n.id}
          icone={n.icone || ICONE_PADRAO}
          rotulo={n.rotulo || ROTULO_PADRAO}
          titulo={n.titulo || n.texto}
          apoio={n.apoio}
          onAbrir={typeof n.destino === 'string' && n.destino.startsWith('/') ? () => navigate(n.destino) : undefined}
          onFechar={() => dispensar(n)}
        />
      ))}
    </div>
  );
}
