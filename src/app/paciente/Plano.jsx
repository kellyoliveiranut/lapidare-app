import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import PlanoView from '../../components/PlanoView.jsx';

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano]       = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);
  const [dietaPdf, setDietaPdf]   = useState(undefined); // undefined=loading, null=sem dieta
  const [dietaUrl, setDietaUrl]   = useState(null);
  const [dietaErro, setDietaErro] = useState(null);
  const [subsPdf, setSubsPdf]     = useState(undefined); // undefined=loading
  const [subsUrl, setSubsUrl]     = useState(null);
  const [subsErro, setSubsErro]   = useState(null);

  useEffect(() => {
    let active = true;
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

      if (!active) return;
      setPlano(planoRes.data?.dados ?? null);
      setValidade(planoRes.data?.validade ?? null);
      const dieta = dietaRes.data ?? null;
      const subs  = subsRes.data  ?? null;
      setDietaPdf(dieta);
      setSubsPdf(subs);

      // Gera signed URLs imediatamente — link nativo <a> abre sem bloqueio no iOS
      if (dieta?.storage_path) {
        const { data: urlData, error: urlErr } = await supabase.storage
          .from('prescricoes')
          .createSignedUrl(dieta.storage_path, 3600);
        if (!active) return;
        if (urlErr) setDietaErro(urlErr.message);
        else setDietaUrl(urlData.signedUrl);
      }
      if (subs?.storage_path) {
        const { data: urlData, error: urlErr } = await supabase.storage
          .from('prescricoes')
          .createSignedUrl(subs.storage_path, 3600);
        if (!active) return;
        if (urlErr) setSubsErro(urlErr.message);
        else setSubsUrl(urlData.signedUrl);
      }
    }
    load();
    return () => { active = false; };
  }, [user, profile]);

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

  function BotaoAbrir({ url, erro, label }) {
    const pilula = {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '8px 14px', borderRadius: 20, border: 'none',
      background: '#2C3A30', color: '#FDFBF8',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'var(--font-sans)', flexShrink: 0,
      textDecoration: 'none',
    };
    if (erro) return (
      <div style={{ fontSize: 11, color: '#b91c1c', maxWidth: 150, lineHeight: 1.3 }}>
        Erro: {erro}
      </div>
    );
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

  function CardPdf({ pdf, label, url, erro, labelBotao }) {
    if (!pdf) return null;
    return (
      <div style={{
        background: '#F4F1EB', border: '1px solid #DDD5C4',
        borderRadius: 14, padding: '14px 16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16, flexShrink: 0,
          background: '#F4ECDD', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
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
        <BotaoAbrir url={url} erro={erro} label={labelBotao} />
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
        labelBotao="Abrir dieta"
      />
      <CardPdf
        pdf={subsPdf}
        label="Lista de substituições (PDF)"
        url={subsUrl}
        erro={subsErro}
        labelBotao="Abrir lista"
      />
      {plano && <PlanoView dados={plano} validade={validade} />}
    </>
  );
}
