import { useSession } from '../../lib/session.jsx';
import { useJornada } from '../../lib/useJornada.js';
import { ehAvulsa } from '../../lib/planoPaciente.js';
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
 */
export default function Jornada() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const avulsa = ehAvulsa(profile);
  // Hook antes de qualquer return.
  const { jornada, carregando, erro } = useJornada(pacienteId, !!profile && !avulsa);

  if (!profile) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando…</div>;
  }
  if (avulsa) return null;
  return <TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />;
}
