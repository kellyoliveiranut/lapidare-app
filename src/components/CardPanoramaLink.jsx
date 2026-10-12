import { useNavigate } from 'react-router-dom';

/**
 * Cartão de link para /paciente/panorama (Início e Tratamento). Pequeno de
 * propósito: a estrada mora no chunk da tela PanoramaTratamento, nunca aqui.
 * Mesmo molde visual do CardJornadaResumo (_Jornada.jsx).
 */
export default function CardPanoramaLink() {
  const navigate = useNavigate();
  const abrir = () => navigate('/paciente/panorama');
  return (
    <div
      onClick={abrir}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
      style={{
        margin: '0 0 12px', padding: '12px 16px',
        background: 'var(--paper)', border: '0.5px solid var(--hair)',
        borderRadius: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'var(--bg-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className="ti ti-road" style={{ fontSize: 20, color: 'var(--muted)' }} aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>Panorama do tratamento</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>As etapas do seu acompanhamento nutricional.</div>
      </div>
      <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--muted)' }} aria-hidden="true" />
    </div>
  );
}
