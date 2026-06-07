import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import PlanoView from '../../components/PlanoView.jsx';

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano] = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      const pacienteId = profile?.id ?? user.id;
      if (!pacienteId) return;
      const { data } = await supabase
        .from('planos')
        .select('dados, validade, publicado_em')
        .eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setPlano(data?.dados ?? null);
      setValidade(data?.validade ?? null);
    }
    load();
    return () => { active = false; };
  }, [user, profile]);

  if (plano === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  if (!plano) {
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

  return <PlanoView dados={plano} validade={validade} />;
}
