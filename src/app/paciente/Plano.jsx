import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import PlanoView from '../../components/PlanoView.jsx';
import '../../styles/print.css';

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
};

// Altura do visor em si — a barra de ações fica fora dela, acima do PDF.
const embedIframeWrapStyle = {
  height: '70vh', maxHeight: 820,
};

// Barra do visor: a saída ("Voltar") e a saída maior ("Abrir em nova aba").
// Sticky para continuar alcançável enquanto o PDF ocupa quase a tela toda —
// dentro do iframe o dedo rola o PDF, não a página.
const visorBarStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  padding: '8px 10px', background: '#F4ECDD', borderBottom: '1px solid #DDD5C4',
  position: 'sticky', top: 0, zIndex: 1,
};

const voltarStyle = {
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

function CardPdf({ pdf, label, url, erro, labelBotao, ios }) {
  // Desktop/Android: embute direto. iOS: começa fechado, porque lá o visor
  // embutido é instável. Em ambos, "Voltar" fecha e o card volta a oferecer
  // abrir de novo — antes esse caminho era de mão única e prendia a paciente.
  const [aberto, setAberto] = useState(!ios);
  if (!pdf) return null;

  const mostrarEmbed = !!url && aberto;

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
        {/* Saída sempre presente: aqui enquanto o visor está fechado, na barra
            do visor quando está aberto. Nunca some, nunca aparece em dobro. */}
        {!mostrarEmbed && <BotaoAbrir url={url} label={labelBotao} destaque={ios} />}
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

      {/* Abre o visor: no iOS é a 1ª vez, nos demais é a volta do "Voltar". */}
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
              title={label}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Idade em anos a partir de "YYYY-MM-DD". Meio-dia evita o recuo de um dia
// em fuso negativo, como em dataBR(). Null se ausente ou ilegível.
function idadeEmAnos(nascimento) {
  if (!nascimento) return null;
  const nasc = /^\d{4}-\d{2}-\d{2}$/.test(nascimento)
    ? new Date(nascimento + 'T12:00:00')
    : new Date(nascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos >= 0 ? anos : null;
}

// As opções de substituição vêm como texto único ("A — 1 un, B — 2 col"),
// mas planos antigos podem trazer array de strings ou de objetos.
function textoSubs(subs) {
  if (Array.isArray(subs)) {
    return subs
      .map(s => (s && typeof s === 'object' ? (s.nome ?? '') : String(s ?? '')))
      .filter(Boolean)
      .join(', ');
  }
  return String(subs ?? '');
}

/**
 * Documento de impressão do plano — invisível na tela, único visível no papel.
 * Montado direto de planos.dados, sem passar pelo PlanoView, que é
 * compartilhado com a tela da nutri. Estilos em src/styles/print.css.
 */
function PlanoImpressao({ dados, publicadoEm, paciente }) {
  const macros        = dados?.macros ?? {};
  const refeicoes     = dados?.refeicoes ?? [];
  const substituicoes = dados?.substituicoes ?? [];

  // A maioria dos planos tem macros vazio — a seção inteira é condicional.
  const linhasResumo = [
    ['Energia',     macros.kcal,   'kcal'],
    ['Proteína',    macros.prot_g, 'g'],
    ['Carboidrato', macros.cho_g,  'g'],
    ['Lipídio',     macros.lip_g,  'g'],
    ['Água',        macros.agua_l, 'L'],
  ].filter(([, v]) => v != null && v !== '');

  const idade = idadeEmAnos(paciente?.nascimento);

  return (
    <div className="print-doc">
      <div className="pr-marca">Essentia</div>
      <div className="pr-credencial">
        Nutrição em Oncologia e Genética · Kelly Oliveira · CRN 3801
      </div>

      <div className="pr-identificacao">
        <div className="pr-id-titulo">Plano alimentar</div>
        <div className="pr-id-linha">
          {paciente?.nome ?? '—'}{idade != null ? ` · ${idade} anos` : ''}
        </div>
        <div className="pr-id-linha">Atualizado em {dataBR(publicadoEm)}</div>
      </div>

      {linhasResumo.length > 0 && (
        <>
          <div className="pr-secao">Resumo nutricional</div>
          <table className="pr-resumo">
            <tbody>
              {linhasResumo.map(([rotulo, valor, unidade]) => (
                <tr key={rotulo}>
                  <td>{rotulo}</td>
                  <td>{valor} {unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="pr-secao">Refeições</div>
      {refeicoes.map((ref, i) => (
        <div className="pr-refeicao" key={i}>
          <div className="pr-refeicao-nome">
            {ref.nome}{ref.horario ? ` · ${ref.horario}` : ''}
          </div>
          <table className="pr-tabela">
            <thead>
              <tr>
                <th>Alimento</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {(ref.alimentos ?? []).map((al, j) => (
                <tr key={j}>
                  <td>{al.nome}</td>
                  {/* o editor guarda "quantidade"; buildDados grava "qty" */}
                  <td>{al.qty ?? al.quantidade ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {substituicoes.length > 0 && (
        <div className="pr-subs">
          <div className="pr-subs-aviso">
            Substituições — escolha UMA opção por alimento, na quantidade indicada
          </div>
          {substituicoes.map((s, i) => {
            const opcoes = textoSubs(s.subs);
            return (
              <div className="pr-subs-linha" key={i}>
                <strong>{s.original}</strong>{opcoes ? ` — ${opcoes}` : ''}
              </div>
            );
          })}
        </div>
      )}

      <div className="pr-rodape">
        Kelly Oliveira · CRN 3801 · Essentia — Nutrição em Oncologia e Genética
        <br />
        Impresso em {dataBR(new Date())}
      </div>
    </div>
  );
}

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano]       = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);
  const [publicadoEm, setPublicadoEm] = useState(null); // data no cabeçalho impresso
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
      setPublicadoEm(planoRes.data?.publicado_em ?? null);
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
      {plano && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" className="btn ghost sm" onClick={() => window.print()}>
            <i className="ti ti-printer" style={{ fontSize: 13 }} aria-hidden="true" /> Imprimir
          </button>
        </div>
      )}
      {plano && <PlanoView dados={plano} validade={validade} />}
      {plano && (
        <PlanoImpressao dados={plano} publicadoEm={publicadoEm} paciente={profile} />
      )}
    </>
  );
}
