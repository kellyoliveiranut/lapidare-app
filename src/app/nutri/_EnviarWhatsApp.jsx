import { useState } from 'react';
import ModalShell from '../../components/ModalShell.jsx';
import { copiarTexto } from '../../lib/copiarTexto.js';

/**
 * Envio por WhatsApp com 3 caminhos, para funcionar em qualquer aparelho:
 *   1. "Abrir no WhatsApp" — link wa.me (toque real em um link: o jeito mais
 *      confiável de abrir o app, inclusive no iPad);
 *   2. "WhatsApp Web" — para quem usa o WhatsApp Business no computador/tablet;
 *   3. "Copiar mensagem" — cola na conversa, qualquer que seja o app (o
 *      WhatsApp Business não tem versão de iPad e nem sempre assume o link wa.me).
 * O texto aparece na tela para a nutri conferir antes de enviar.
 *
 * `telefone`: só dígitos, com o código do país (ex.: 5591999999999).
 */
const botao = {
  textDecoration: 'none', justifyContent: 'center', minHeight: 44,
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
};

export default function EnviarWhatsApp({ titulo, subtitulo, mensagem, telefone, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const tel = String(telefone ?? '').replace(/\D/g, '');
  const texto = encodeURIComponent(mensagem);
  const urlApp = tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  const urlWeb = tel
    ? `https://web.whatsapp.com/send?phone=${tel}&text=${texto}`
    : `https://web.whatsapp.com/send?text=${texto}`;

  async function copiar() {
    const ok = await copiarTexto(mensagem);
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <ModalShell title={titulo} subtitle={subtitulo} onClose={onClose}>
      <div style={{
        fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
        background: 'var(--bg2, #faf8f5)', border: '0.5px solid var(--border)', borderRadius: 8,
        padding: '10px 12px', marginBottom: 12, color: 'var(--text2)',
      }}>{mensagem}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a className="btn" href={urlApp} target="_blank" rel="noreferrer" style={botao}>
          <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Abrir no WhatsApp
        </a>
        <button type="button" className="btn-outline" onClick={copiar} style={{ ...botao, color: copiado ? 'var(--green)' : undefined }}>
          <i className={`ti ti-${copiado ? 'check' : 'copy'}`} aria-hidden="true" /> {copiado ? 'Copiado!' : 'Copiar mensagem'}
        </button>
        <a className="btn-outline" href={urlWeb} target="_blank" rel="noreferrer" style={botao}>
          <i className="ti ti-world" aria-hidden="true" /> Abrir no WhatsApp Web
        </a>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>
        Se o WhatsApp não abrir (no iPad ou no WhatsApp Business, por exemplo), toque em
        <strong> Copiar mensagem</strong>, abra a conversa com <strong>{tel ? `+${tel}` : 'o contato'}</strong> e cole.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}
