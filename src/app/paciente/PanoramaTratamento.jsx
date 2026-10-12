import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { faseValida, textoEstado } from '../../lib/panoramaFases.js';
import PanoramaEstrada from '../../components/PanoramaEstrada.jsx';

/**
 * Tela /paciente/panorama — "Panorama do tratamento": as 6 etapas do
 * acompanhamento nutricional oncológico em forma de estrada. Título e frase
 * vêm do cabeçalho do PacienteLayout (HEADERS).
 *
 * A etapa atual é a de panorama_fases, que só a nutri grava. Erro, tabela
 * ainda inexistente (SQL não aplicado) ou sem linha: estrada sem destaque e a
 * frase de que a nutri vai indicar a etapa — nunca mensagem técnica.
 *
 * Só Oncologia (mesmo critério da aba Tratamento, PacienteLayout.jsx): outra
 * paciente que abrir a URL volta para o Início, sem mensagem.
 */
export default function PanoramaTratamento() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const onco = profile?.objetivo === 'Oncologia';
  const [carga, setCarga] = useState({ pronta: false, fase: null });

  useEffect(() => {
    if (!pacienteId || !onco) return;
    let vivo = true;
    supabase.from('panorama_fases').select('fase').eq('paciente_id', pacienteId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        setCarga({ pronta: true, fase: !error && faseValida(data?.fase) ? data.fase : null });
      }, () => { if (vivo) setCarga({ pronta: true, fase: null }); });
    return () => { vivo = false; };
  }, [pacienteId, onco]);

  if (!profile) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando…</div>;
  }
  if (!onco) return <Navigate to="/paciente/inicio" replace />;
  if (!carga.pronta) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando…</div>;
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      {carga.fase == null && (
        <p style={{ fontSize: 14, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.4 }}>
          {textoEstado(null)}
        </p>
      )}
      <PanoramaEstrada key={carga.fase ?? 'sem'} fase={carga.fase} />
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '16px 0 0', lineHeight: 1.4, textAlign: 'center' }}>
        Conteúdo informativo. Seu plano é individual e definido pela sua nutricionista.
      </p>
    </div>
  );
}
