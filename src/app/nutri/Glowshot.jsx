import { useState } from 'react';
import { avisar as avisarJanela } from '../../lib/dialogos.js';
import { CARIMBO_ASSINATURA } from '../../data/carimboAssinatura.js';

/* ============================================================
   PRESCRIÇÃO GLOWSHOT (menu da nutri)
   Guia pronta do Glowshot, Moroshot ou Lipeshot (nome e telefone, com carimbo e assinatura) (Glowshot: produto da Dehon para as pacientes do evento
   OncoStart): texto fixo, só o nome da paciente muda. Não exige cadastro da
   paciente no Essentia. A posologia (1 flaconete por dia) foi dada pela
   Kelly; composição e demais textos não existem aqui de propósito.
   O gerador do PDF é o mesmo das prescrições da Suplementação.
   ============================================================ */

export default function Glowshot() {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [gerando, setGerando] = useState(false);
  const [produtos, setProdutos] = useState(['Glowshot']);
  const NOMES = ['Glowshot', 'Moroshot', 'Lipeshot'];
  const selecionados = NOMES.filter(n => produtos.includes(n));
  // Alterna o produto; sempre fica ao menos um marcado.
  const alternar = (n) => setProdutos(prev => prev.includes(n) ? (prev.length > 1 ? prev.filter(x => x !== n) : prev) : [...prev, n]);

  async function gerar() {
    const n = nome.trim();
    if (!n) return;
    setGerando(true);
    try {
      const m = await import('./_Suplementacao.jsx');
      const pr = m.prescricaoShots(selecionados);
      await m.gerarPDFPrescricao({
        pacienteNome: n, contato: telefone.trim() ? { telefone: telefone.trim() } : null,
        carimbo: CARIMBO_ASSINATURA,
        suplementosAtivos: pr.itens, modo: pr.modo,
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
            <div className="card-title">Prescrição {selecionados.join(' + ')}</div>
            <div className="card-sub">Escolha um ou mais produtos, digite o nome e gere o PDF. Não precisa cadastrar a paciente.</div>
          </div>
        </div>
        <div className="card-body">
          <label className="field-label">Produtos (marque quantos quiser)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {NOMES.map(n => (
              <button key={n} type="button" onClick={() => alternar(n)}
                className={produtos.includes(n) ? 'btn' : 'btn-outline'} aria-pressed={produtos.includes(n)}>
                {produtos.includes(n) && <i className="ti ti-check" aria-hidden="true" />} {n}
              </button>
            ))}
          </div>
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
            Texto padrão: {selecionados.join(', ')} — 1 flaconete por dia cada, com carimbo e assinatura da Kelly.
          </div>
          <button className="btn" onClick={gerar} disabled={gerando || !nome.trim()}>
            <i className="ti ti-file-text" aria-hidden="true" /> {gerando ? 'Gerando…' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
