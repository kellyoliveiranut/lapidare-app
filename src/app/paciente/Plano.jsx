import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import PlanoView from '../../components/PlanoView.jsx';

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano]       = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);
  const [dietaPdf, setDietaPdf] = useState(undefined); // undefined=loading, null=sem dieta
  const [dietaUrl, setDietaUrl]   = useState(null);    // signed URL gerada no load
  const [dietaErro, setDietaErro] = useState(null);    // mensagem de erro da geração

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      const pacienteId = profile?.id ?? user.id;
      if (!pacienteId) return;

      const [planoRes, dietaRes] = await Promise.all([
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
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) return;
      setPlano(planoRes.data?.dados ?? null);
      setValidade(planoRes.data?.validade ?? null);
      const dieta = dietaRes.data ?? null;
      setDietaPdf(dieta);

      // Gera signed URL imediatamente — link nativo <a> abre sem bloqueio no iOS
      if (dieta?.storage_path) {
        const { data: urlData, error: urlErr } = await supabase.storage
          .from('prescricoes')
          .createSignedUrl(dieta.storage_path, 3600);
        if (!active) return;
        if (urlErr) setDietaErro(urlErr.message);
        else setDietaUrl(urlData.signedUrl);
      }
    }
    load();
    return () => { active = false; };
  }, [user, profile]);

  // aguarda ambas as queries terminarem
  if (plano === undefined || dietaPdf === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  // sem nada para mostrar
  if (!plano && !dietaPdf) {
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

  const cardDieta = dietaPdf && (
    <div style={{
      background: '#F4F1EB',
      border: '1px solid #DDD5C4',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: '#EDE5D8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className="ti ti-file-type-pdf"
           style={{ fontSize: 20, color: '#9A7B3F' }}
           aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: '#2C3A30',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {dietaPdf.titulo || 'Dieta atual'}
        </div>
        <div style={{ fontSize: 11, color: '#7A6E60', marginTop: 1 }}>
          Enviada em {dataBR(dietaPdf.created_at)}
        </div>
      </div>
      {dietaErro ? (
        <div style={{ fontSize: 11, color: '#b91c1c', maxWidth: 150, lineHeight: 1.3 }}>
          Erro: {dietaErro}
        </div>
      ) : dietaUrl ? (
        <a
          href={dietaUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: '#2C3A30', color: '#fff',
            fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-sans)', flexShrink: 0,
            textDecoration: 'none',
          }}
        >
          <i className="ti ti-external-link" style={{ fontSize: 14 }} aria-hidden="true" />
          Abrir dieta
        </a>
      ) : (
        <button
          disabled
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: '#9A9A9A', color: '#fff',
            fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-sans)', flexShrink: 0, opacity: 0.7,
          }}
        >
          Preparando…
        </button>
      )}
    </div>
  );

  return (
    <>
      {cardDieta}
      {plano && <PlanoView dados={plano} validade={validade} />}
    </>
  );
}
