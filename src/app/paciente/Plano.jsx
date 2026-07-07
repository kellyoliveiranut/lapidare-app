import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import PlanoView from '../../components/PlanoView.jsx';

// Signed URL com validade folgada (8h) para aguentar sessões longas na tela.
const SIGNED_TTL_SECONDS = 60 * 60 * 8;
// Ao voltar para a tela (visibilitychange), re-assina se a URL passou de ~50min.
const REFRESH_AFTER_MS = 50 * 60 * 1000;

// iOS (iPhone/iPad) tem visualizador de PDF embutido instável em <iframe>.
// Nesses aparelhos mantemos "Abrir em nova aba" como ação principal e o
// embutido como opção secundária — a experiência que já funciona hoje.
function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPhone = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ se identifica como "MacIntel"; distingue pelo touch.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iPhone || iPadOS;
}

const pilulaBase = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '8px 14px', borderRadius: 20, border: 'none',
  background: '#2C3A30', color: '#FDFBF8',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--font-sans)', flexShrink: 0,
  textDecoration: 'none',
};

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
  height: '70vh', maxHeight: 820,
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

function CardPdf({ pdf, label, url, erro, labelBotao, ios }) {
  const [verEmbed, setVerEmbed] = useState(false);
  if (!pdf) return null;

  // Desktop/Android: embute direto. iOS: só embute se a paciente pedir.
  const mostrarEmbed = !!url && (!ios || verEmbed);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={iconWrapStyle}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 22, color: '#9A7B3F' }} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 15, color: '#2C3A30', lineHeight: 1.2, marginBottom: 3 }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: '#7A6E60' }}>
            enviada em {dataBR(pdf.created_at)}
          </div>
        </div>
        {/* Botão de reserva sempre presente e em destaque no iOS. */}
        <BotaoAbrir url={url} label={labelBotao} destaque={ios} />
      </div>

      {erro && (
        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 10, lineHeight: 1.4 }}>
          Não foi possível preparar o arquivo agora. Tente reabrir a tela. (Erro: {erro})
        </div>
      )}

      {/* Texto de apoio — a saída óbvia caso o embutido não carregue. */}
      {url && (
        <div style={apoioStyle}>
          Não carregou? Toque em <strong>{labelBotao}</strong>.
        </div>
      )}

      {/* iOS: opção secundária de ver embutido dentro do app. */}
      {ios && url && !verEmbed && (
        <button type="button" onClick={() => setVerEmbed(true)} style={verAquiStyle}>
          Ou ver aqui no app
        </button>
      )}

      {mostrarEmbed && (
        <div style={embedWrapStyle}>
          <iframe
            src={url}
            title={label}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}
    </div>
  );
}

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano]       = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);
  const [dietaPdf, setDietaPdf] = useState(undefined); // undefined=loading, null=sem dieta
  const [dietaUrl, setDietaUrl] = useState(null);
  const [dietaErro, setDietaErro] = useState(null);
  const [subsPdf, setSubsPdf]   = useState(undefined); // undefined=loading
  const [subsUrl, setSubsUrl]   = useState(null);
  const [subsErro, setSubsErro] = useState(null);

  const ios = isIOS();
  const mountedRef = useRef(true);
  const pdfsRef = useRef({ dieta: null, subs: null });
  const genAtRef = useRef(0);

  // (Re)gera as signed URLs a partir dos PDFs já carregados. Chamado no load
  // inicial e ao voltar para a tela depois de ~50min, evitando que a URL de 1h
  // expire e quebre o visor embutido ou o botão de abrir.
  const resign = useCallback(async () => {
    const { dieta, subs } = pdfsRef.current;
    const jobs = [];
    if (dieta?.storage_path) {
      jobs.push(
        supabase.storage.from('prescricoes').createSignedUrl(dieta.storage_path, SIGNED_TTL_SECONDS)
          .then(({ data, error }) => {
            if (!mountedRef.current) return;
            if (error) setDietaErro(error.message);
            else { setDietaUrl(data.signedUrl); setDietaErro(null); }
          })
      );
    }
    if (subs?.storage_path) {
      jobs.push(
        supabase.storage.from('prescricoes').createSignedUrl(subs.storage_path, SIGNED_TTL_SECONDS)
          .then(({ data, error }) => {
            if (!mountedRef.current) return;
            if (error) setSubsErro(error.message);
            else { setSubsUrl(data.signedUrl); setSubsErro(null); }
          })
      );
    }
    await Promise.all(jobs);
    if (mountedRef.current) genAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    async function load() {
      if (!user) return;
      const pacienteId = profile?.id ?? user.id;
      if (!pacienteId) return;

      const [planoRes, dietaRes, subsRes] = await Promise.all([
        supabase
          .from('planos')
          .select('dados, validade, publicado_em')
          .eq('paciente_id', pacienteId)
          .order('publicado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('dietas_pdf')
          .select('storage_path, titulo, created_at')
          .eq('paciente_id', pacienteId)
          .eq('tipo', 'dieta')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('dietas_pdf')
          .select('storage_path, titulo, created_at')
          .eq('paciente_id', pacienteId)
          .eq('tipo', 'substituicoes')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mountedRef.current) return;
      setPlano(planoRes.data?.dados ?? null);
      setValidade(planoRes.data?.validade ?? null);
      const dieta = dietaRes.data ?? null;
      const subs  = subsRes.data  ?? null;
      setDietaPdf(dieta);
      setSubsPdf(subs);
      pdfsRef.current = { dieta, subs };

      // Gera signed URLs imediatamente — link nativo <a> abre sem bloqueio no iOS.
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

  // aguarda todas as queries terminarem
  if (plano === undefined || dietaPdf === undefined || subsPdf === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  // sem nada para mostrar
  if (!plano && !dietaPdf && !subsPdf) {
    return (
      <div className="empty-state">
        <i className="ti ti-salad empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Plano não publicado ainda</div>
        <div className="empty-sub">
          Sua nutricionista está preparando seu plano personalizado. Você será notificada quando estiver pronto.
        </div>
      </div>
    );
  }

  return (
    <>
      <CardPdf
        pdf={dietaPdf}
        label="Dieta atual (PDF)"
        url={dietaUrl}
        erro={dietaErro}
        labelBotao="Abrir em nova aba"
        ios={ios}
      />
      <CardPdf
        pdf={subsPdf}
        label="Lista de substituições (PDF)"
        url={subsUrl}
        erro={subsErro}
        labelBotao="Abrir em nova aba"
        ios={ios}
      />
      {plano && <PlanoView dados={plano} validade={validade} />}
    </>
  );
}
