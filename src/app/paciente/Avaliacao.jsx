import { useSearchParams } from 'react-router-dom';
import { normalizarUrlShaped } from '../../lib/shaped.js';

// Tela-ponte do push de avaliação física.
//
// Existe por causa do iOS: clients.openWindow() com URL de outra origem falha
// em silêncio no WebKit, então o push não conseguia levar a paciente direto ao
// Shaped. O push agora aponta para cá (mesma origem, que o navigate() abre) e
// quem faz o salto para fora é o toque dela no link abaixo.
//
// Não está no menu de propósito — só se chega aqui pela notificação.
export default function Avaliacao() {
  const [params] = useSearchParams();
  const link = normalizarUrlShaped(params.get('link'));

  if (!link) {
    return (
      <div className="empty-state">
        <i className="ti ti-link-off empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Link inválido ou expirado</div>
        <div className="empty-sub">
          Link inválido ou expirado — peça para sua nutricionista enviar de novo.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
        Sua nutricionista enviou o link da sua avaliação física.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', margin: '0 0 18px' }}>
        O formulário abre em outra aba, no site do Shaped. Quando terminar, é só
        voltar para o Essentia.
      </p>
      {/* <a> de verdade, não window.location.href: no PWA standalone do iOS o
          gesto nativo abre o Shaped por fora e mantém o Essentia aberto atrás. */}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="btn primary full"
      >
        <i className="ti ti-external-link" aria-hidden="true" style={{ marginRight: 6 }} />
        Abrir avaliação
      </a>
    </div>
  );
}
