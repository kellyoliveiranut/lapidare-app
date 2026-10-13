import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useJornada } from '../../lib/useJornada.js';
import { ehAvulsa } from '../../lib/planoPaciente.js';
import { faseValida, textoEstado } from '../../lib/panoramaFases.js';
import PanoramaEstrada from '../../components/PanoramaEstrada.jsx';
import { TrilhaJornada } from './_Jornada.jsx';

/**
 * Tela /paciente/jornada — a trilha do pacote.
 *
 * A Avulsa não chega aqui: '/paciente/jornada' está fora de AVULSA_ALLOWED,
 * então o PacienteLayout põe cadeado no menu e redireciona a URL direta para
 * o Início. Quem vê a trilha é quem não é Avulsa (Essentia, e também plano
 * nulo ou inesperado) — o mesmo critério NEGATIVO do bloqueio. A trilha vazia
 * já tem mensagem própria.
 *
 * O redirect do layout roda num efeito, DEPOIS do primeiro render: por um
 * instante esta tela chega a montar para a Avulsa. Por isso a carga fica
 * desligada para ela e nada é desenhado — sem isso sairiam três queries à toa
 * a cada tentativa.
 *
 * Só Oncologia: acima da trilha, a estrada com as 6 etapas (antiga tela
 * Panorama do tratamento). A etapa é a de panorama_fases, que só a nutri
 * grava. A leitura corre à parte e não segura a trilha: enquanto não chega,
 * a estrada aparece sem destaque; erro ou sem linha = sem destaque e a frase
 * de que a nutri vai indicar a etapa. Outros objetivos: só a trilha, sem
 * leitura de panorama_fases.
 */
export default function Jornada() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const avulsa = ehAvulsa(profile);
  const onco = profile?.objetivo === 'Oncologia';
  // Hooks antes de qualquer return.
  const { jornada, carregando, erro } = useJornada(pacienteId, !!profile && !avulsa);
  const [etapa, setEtapa] = useState({ pronta: false, fase: null });

  useEffect(() => {
    if (!pacienteId || !onco || avulsa) return;
    let vivo = true;
    supabase.from('panorama_fases').select('fase').eq('paciente_id', pacienteId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        setEtapa({ pronta: true, fase: !error && faseValida(data?.fase) ? data.fase : null });
      }, () => { if (vivo) setEtapa({ pronta: true, fase: null }); });
    return () => { vivo = false; };
  }, [pacienteId, onco, avulsa]);

  if (!profile) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando…</div>;
  }
  if (avulsa) return null;
  if (!onco) return <TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />;

  return (
    <>
      <div style={{ paddingBottom: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px', lineHeight: 1.35 }}>
          As etapas do seu acompanhamento nutricional.
        </div>
        {etapa.pronta && etapa.fase == null && (
          <p style={{ fontSize: 14, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.4 }}>
            {textoEstado(null)}
          </p>
        )}
        <PanoramaEstrada key={etapa.fase ?? 'sem'} fase={etapa.fase} />
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '16px 0 0', lineHeight: 1.4, textAlign: 'center' }}>
          Conteúdo informativo. Seu plano é individual e definido pela sua nutricionista.
        </p>
      </div>
      <TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />
    </>
  );
}
