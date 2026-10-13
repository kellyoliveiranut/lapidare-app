import { useSession } from '../../lib/session.jsx';
import { useJornada } from '../../lib/useJornada.js';
import { ehAvulsa } from '../../lib/planoPaciente.js';
import { etapasDaJornada } from '../../lib/etapasJornada.js';
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
 * Só Oncologia: no lugar da trilha, só a estrada das 6 etapas, que avança
 * sozinha com as consultas do pacote (etapasJornada.js: consulta N = etapa N).
 * Nada de panorama_fases. Carregando: o texto da trilha, para a estrada não
 * piscar sem destaque; erro: o texto de erro da trilha e a estrada sem
 * destaque. Outros objetivos: só a trilha, como antes.
 */
export default function Jornada() {
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;
  const avulsa = ehAvulsa(profile);
  const onco = profile?.objetivo === 'Oncologia';
  // Hook antes de qualquer return.
  const { jornada, carregando, erro } = useJornada(pacienteId, !!profile && !avulsa);

  if (!profile) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando…</div>;
  }
  if (avulsa) return null;
  if (!onco) return <TrilhaJornada jornada={jornada} carregando={carregando} erro={erro} />;

  if (carregando) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando sua jornada…</div>;
  }
  const etapas = etapasDaJornada(erro ? null : jornada);
  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px', lineHeight: 1.35 }}>
        As etapas do seu acompanhamento nutricional.
      </div>
      {erro && (
        <div style={{ padding: '0 0 12px', fontSize: 12, color: 'var(--red)' }}>
          Não foi possível carregar sua jornada agora. Tente de novo em instantes.
        </div>
      )}
      <PanoramaEstrada key={etapas.atual ?? 'sem'} atual={etapas.atual} concluidas={etapas.concluidas} todas={etapas.todas} />
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '16px 0 0', lineHeight: 1.4, textAlign: 'center' }}>
        Conteúdo informativo. Seu plano é individual e definido pela sua nutricionista.
      </p>
    </div>
  );
}
