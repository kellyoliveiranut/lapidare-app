import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brl } from '../../lib/utils.js';

/* ============================================================
   NOTAS FISCAIS DA SEMANA (resumo na Agenda)
   Linha-resumo recolhida: "N notas a emitir" + "Enviar todas à contabilidade".
   Aberta, lista cada nota com ações compactas. As mesmas ações existem no
   perfil da paciente (bloco "Nota fiscal") e como aviso na linha da 1ª
   consulta — os dados vêm de useNotasPendentes, a mesma fonte dos três.
   Sem a migration 2026-11-05b as consultas falham e o cartão não aparece.
   ============================================================ */

export default function NotasDaSemana({ notas }) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const { vendas, soPacientes, itens, zap, msg, enviarContabilidade, emitida, DIAS } = notas;
  const total = itens.length;
  if (total === 0 && !msg) return null;
  const semZap = !zap.trim();
  const dicaZap = 'Cadastre o WhatsApp da contabilidade em Personalização';

  const linha = (chave, nome, detalhe, tipo, id, item) => (
    <div key={chave} style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 0', borderTop: '0.5px solid var(--border)',
    }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{nome}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{detalhe}</div>
      </div>
      {item.pacienteId && (
        <button className="btn-outline" style={{ fontSize: 12 }} title="Dados da nota no perfil da paciente"
          onClick={() => navigate(`/nutri/pacientes/${item.pacienteId}`, { state: { from: '/nutri/agenda', label: 'Agenda' } })}>
          <i className="ti ti-file-invoice" aria-hidden="true" /> Dados
        </button>
      )}
      <button className="btn-outline" style={{ fontSize: 12, color: '#25D366' }} disabled={semZap}
        title={semZap ? dicaZap : 'Abre o WhatsApp da contabilidade com os dados desta nota'}
        onClick={() => enviarContabilidade([item])}>
        <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar
      </button>
      <button className="btn" style={{ fontSize: 12 }} onClick={() => emitida(tipo, id)}>
        <i className="ti ti-check" aria-hidden="true" /> Emitida
      </button>
    </div>
  );

  return (
    <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--gold-deep, #a08456)', background: '#faf5ea', padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} style={{
          display: 'flex', flex: 1, minWidth: 200, alignItems: 'center', gap: 8, background: 'none',
          border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
        }}>
          <i className="ti ti-file-invoice" style={{ fontSize: 16, color: 'var(--gold-deep, #a08456)' }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold-deep, #8a6d3b)' }}>
            {total} nota{total === 1 ? '' : 's'} fiscal{total === 1 ? '' : 'is'} a emitir
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>últimos {DIAS} dias</span>
          <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} style={{ marginLeft: 'auto' }} aria-hidden="true" />
        </button>
        {total > 1 && (
          <button className="btn" style={{ fontSize: 12 }} disabled={semZap} title={semZap ? dicaZap : undefined}
            onClick={() => enviarContabilidade(itens)}>
            <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar todas ({total})
          </button>
        )}
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{msg.texto}</div>}
      {aberto && (
        <div style={{ marginTop: 8 }}>
          {vendas.map(v => linha('v' + v.id, v.paciente?.nome ?? 'Venda avulsa',
            `${v.servico} · ${brl(v.valor_total)}`, 'venda', v.id,
            { pacienteId: v.paciente_id, nome: v.paciente?.nome, venda: v }))}
          {soPacientes.map(p => linha('p' + p.id, p.nome, 'Paciente nova', 'paciente', p.id,
            { pacienteId: p.id, nome: p.nome, venda: null }))}
        </div>
      )}
    </div>
  );
}
