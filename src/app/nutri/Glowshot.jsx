import { useState } from 'react';
import { avisar as avisarJanela } from '../../lib/dialogos.js';
import { CARIMBO_ASSINATURA } from '../../data/carimboAssinatura.js';

/* ============================================================
   PRESCRIÇÃO GLOWSHOT (menu da nutri)
   Guia pronta do Glowshot (nome e telefone, com carimbo e assinatura) (produto da Dehon para as pacientes do evento
   OncoStart): texto fixo, só o nome da paciente muda. Não exige cadastro da
   paciente no Essentia. A posologia (1 flaconete por dia) foi dada pela
   Kelly; composição e demais textos não existem aqui de propósito.
   O gerador do PDF é o mesmo das prescrições da Suplementação.
   ============================================================ */

export default function Glowshot() {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    const n = nome.trim();
    if (!n) return;
    setGerando(true);
    try {
      const m = await import('./_Suplementacao.jsx');
      await m.gerarPDFPrescricao({
        pacienteNome: n, contato: telefone.trim() ? { telefone: telefone.trim() } : null,
        carimbo: CARIMBO_ASSINATURA,
        suplementosAtivos: [m.ITEM_GLOWSHOT], modo: m.MODO_GLOWSHOT,
      });
    } catch (e) {
      avisarJanela('Erro ao gerar o PDF: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Prescrição Glowshot</div>
            <div className="card-sub">Digite o nome e gere o PDF. Não precisa cadastrar a paciente.</div>
          </div>
        </div>
        <div className="card-body">
          <label className="field-label">Nome da paciente</label>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') gerar(); }}
            placeholder="Nome completo"
            style={{ width: '100%', marginBottom: 12 }}
          />
          <label className="field-label">Telefone da paciente</label>
          <input
            inputMode="tel"
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') gerar(); }}
            placeholder="(91) 99999-9999"
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            Texto padrão: Glowshot — 1 flaconete por dia, com carimbo e assinatura da Kelly.
          </div>
          <button className="btn" onClick={gerar} disabled={gerando || !nome.trim()}>
            <i className="ti ti-file-text" aria-hidden="true" /> {gerando ? 'Gerando…' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
