import { brl } from '../../lib/utils.js';
import { useNotasPendentes } from '../../lib/useNotasPendentes.js';

/* Bloco "Nota fiscal" do perfil da paciente: o que está pendente DELA, com as
   mesmas ações do resumo da Agenda (enviar à contabilidade, marcar emitida).
   Some quando não há nota pendente. Mesma fonte: useNotasPendentes. */
export default function NotaFiscalPaciente({ nutriId, pacienteId }) {
  const { vendas, soPacientes, itens, zap, msg, enviarContabilidade, emitida } = useNotasPendentes(nutriId, pacienteId);
  if (!itens.length) return null;
  const semZap = !zap.trim();

  const linha = (chave, rotulo, tipo, id, item) => (
    <div key={chave} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}>{rotulo}</div>
      <button className="btn-outline" style={{ fontSize: 12, color: '#25D366' }} disabled={semZap}
        title={semZap ? 'Cadastre o WhatsApp da contabilidade em Personalização' : 'Abre o WhatsApp da contabilidade com os dados desta nota'}
        onClick={() => enviarContabilidade([item])}>
        <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar à contabilidade
      </button>
      <button className="btn" style={{ fontSize: 12 }} onClick={() => emitida(tipo, id)}>
        <i className="ti ti-check" aria-hidden="true" /> Nota emitida
      </button>
    </div>
  );

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: '#faf5ea',
      border: '0.5px solid var(--gold-deep, #a08456)', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--gold-deep, #8a6d3b)' }}>
        <i className="ti ti-file-invoice" aria-hidden="true" /> Nota fiscal pendente
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--red)' }}>{msg.texto}</div>}
      {vendas.map(v => linha('v' + v.id, `${v.servico} · ${brl(v.valor_total)}`, 'venda', v.id,
        { pacienteId: v.paciente_id, nome: v.paciente?.nome, venda: v }))}
      {soPacientes.map(p => linha('p' + p.id, 'Paciente nova — emitir após a 1ª consulta', 'paciente', p.id,
        { pacienteId: p.id, nome: p.nome, venda: null }))}
    </div>
  );
}
