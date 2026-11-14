import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { bloqueadoNoPlano } from '../../lib/planoPaciente.js';
import { dataConsultaBR, horaConsultaBR, textoDias } from '../../lib/utils.js';

// Tela inicial do Modo simples: a próxima consulta e 4 botões grandes.
// O resto do app fica em "Mais opções" (menu de baixo).
const BOTOES = [
  { path: '/paciente/plano',        icon: 'salad',          label: 'Meu plano alimentar' },
  { path: '/paciente/compras',      icon: 'shopping-cart',  label: 'Lista de compras' },
  { path: '/paciente/suplementos',  icon: 'pill',           label: 'Meus suplementos' },
  { path: '/paciente/chat',         icon: 'message-circle', label: 'Falar com a Dra.' },
];

export default function InicioSimples() {
  const { profile } = useSession();
  const tema = useTheme();
  const navigate = useNavigate();
  const [proxima, setProxima] = useState(null);
  const pacienteId = profile?.id;

  useEffect(() => {
    if (!pacienteId) return;
    let ativo = true;
    (async () => {
      const { data } = await supabase.from('consultas')
        .select('id, data_hora, modalidade, local:locais_atendimento(nome)')
        .eq('paciente_id', pacienteId).eq('status', 'agendada')
        .eq('oculta_paciente', false) // nutri reagendando: sem data
        .gte('data_hora', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .order('data_hora', { ascending: true }).limit(1).maybeSingle();
      if (ativo) setProxima(data ?? null);
    })();
    return () => { ativo = false; };
  }, [pacienteId]);

  const nutri = tema.nutri_nome || 'a Dra.';
  const botoes = BOTOES.filter(b => !bloqueadoNoPlano(profile, b.path));

  return (
    <div className="simples-home">
      {proxima && (
        <div className="simples-consulta">
          <div className="simples-eyebrow">Sua próxima consulta</div>
          <div className="simples-consulta-quando">
            {textoDias(proxima.data_hora)}, às {horaConsultaBR(proxima.data_hora)}
          </div>
          <div className="simples-consulta-sub">
            {dataConsultaBR(proxima.data_hora)}
            {proxima.modalidade === 'online' && ' · Online'}
            {proxima.modalidade === 'presencial' && ` · ${proxima.local?.nome ?? 'Presencial'}`}
          </div>
        </div>
      )}
      {botoes.map(b => (
        <button key={b.path} className="simples-botao" onClick={() => navigate(b.path)}>
          <i className={`ti ti-${b.icon}`} aria-hidden="true" />
          <span>{b.path === '/paciente/chat' ? `Falar com ${nutri}` : b.label}</span>
        </button>
      ))}
    </div>
  );
}
