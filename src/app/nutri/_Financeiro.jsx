import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { brl, statusParcela } from '../../lib/utils.js';
import ListaVendas from '../../components/ListaVendas.jsx';
import { NovaVendaModal, EditarParcelaModal, EditarVendaModal } from '../../components/VendaModais.jsx';

/**
 * Aba Financeiro do perfil da paciente — o mesmo histórico de vendas que a
 * nutri vê no Financeiro real, recortado numa paciente só.
 *
 * Diferenças em relação ao Financeiro real, todas propositais:
 *  • o resumo é da vida inteira da paciente, não do mês corrente;
 *  • sem filtro Todas/A receber/Em atraso — poucas vendas, o filtro só ruído;
 *  • vendas avulsas (paciente_id null) não aparecem aqui, por definição.
 *
 * As parcelas vêm aninhadas no mesmo select: parcelas.venda_id tem FK para
 * vendas.id, então o PostgREST resolve o embedding numa query só.
 */
export default function Financeiro({ pacienteId, nutriId, pacienteNome }) {
  const [vendas, setVendas] = useState(undefined);
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [parcelaEdit, setParcelaEdit] = useState(null);
  const [vendaEdit, setVendaEdit] = useState(null);
  const [servicos, setServicos] = useState([]);

  const pacienteFixo = { id: pacienteId, nome: pacienteNome };

  async function carregar() {
    if (!nutriId || !pacienteId) return;
    const [vRes, sRes] = await Promise.all([
      supabase.from('vendas')
        .select('id, paciente_id, servico_id, servico, valor_total, forma_pgto, data_venda, obs, parcelas(*)')
        .eq('nutri_id', nutriId)
        .eq('paciente_id', pacienteId)
        .order('data_venda', { ascending: false }),
      supabase.from('servicos')
        .select('id, nome, ticket, ativo')
        .eq('nutri_id', nutriId).eq('ativo', true)
        .order('ticket', { ascending: false }),
    ]);
    setVendas(vRes.data ?? []);
    setServicos(sRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  // O ListaVendas espera o mapa { venda.id: parcelas[] }; aqui elas vêm
  // aninhadas no embed, então é só desdobrar.
  const parcelasPorVenda = useMemo(() => {
    const m = {};
    (vendas ?? []).forEach(v => {
      m[v.id] = [...(v.parcelas ?? [])].sort((a, b) => a.numero - b.numero);
    });
    return m;
  }, [vendas]);

  // Resumo da vida inteira da paciente — sem recorte de mês.
  const stats = useMemo(() => {
    let pago = 0, pagoN = 0;
    let aReceber = 0, aReceberN = 0;
    let atrasado = 0, atrasadoN = 0;

    (vendas ?? []).forEach(v => {
      (v.parcelas ?? []).forEach(p => {
        const s = statusParcela(p);
        if (s === 'pago')     { pago     += Number(p.valor); pagoN++; }
        if (s === 'pendente') { aReceber += Number(p.valor); aReceberN++; }
        if (s === 'atrasado') { atrasado += Number(p.valor); atrasadoN++; }
      });
    });
    return { pago, pagoN, aReceber, aReceberN, atrasado, atrasadoN };
  }, [vendas]);

  const totalVendido = useMemo(
    () => (vendas ?? []).reduce((a, v) => a + Number(v.valor_total), 0),
    [vendas],
  );

  async function excluirVenda(venda) {
    const ok = window.confirm(
      `Excluir a venda "${venda.servico}" de ${pacienteNome}?\n\n` +
      `Todas as parcelas relacionadas também serão removidas. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    const { error } = await supabase.from('vendas').delete().eq('id', venda.id);
    if (error) {
      alert('Erro ao excluir venda: ' + error.message);
      return;
    }
    await carregar();
  }

  if (vendas === undefined) {
    return <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>;
  }

  return (
    <>
      {vendas.length > 0 && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Pago</div>
              <div className="stat-val">{brl(stats.pago)}</div>
              <div className="stat-sub">{stats.pagoN} parcela{stats.pagoN === 1 ? '' : 's'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">A receber</div>
              <div className="stat-val">{brl(stats.aReceber)}</div>
              <div className="stat-sub">{stats.aReceberN} parcela{stats.aReceberN === 1 ? '' : 's'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Em atraso</div>
              <div className="stat-val" style={{ color: stats.atrasado > 0 ? 'var(--red)' : 'var(--dark)' }}>
                {brl(stats.atrasado)}
              </div>
              <div className="stat-sub">{stats.atrasadoN} parcela{stats.atrasadoN === 1 ? '' : 's'}</div>
            </div>
          </div>

          {stats.atrasado > 0 && (
            <div className="al-b" style={{
              background: 'var(--red-bg)', borderLeftColor: 'var(--red)',
              marginBottom: 12,
            }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: 'var(--red)', marginTop: 1 }} aria-hidden="true" />
              <div>
                <div className="al-t" style={{ color: 'var(--red)' }}>
                  {stats.atrasadoN} parcela{stats.atrasadoN === 1 ? '' : 's'} em atraso · {brl(stats.atrasado)}
                </div>
                <div className="al-d">
                  Vale combinar a regularização na próxima consulta.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {vendas.length === 0
            ? 'Nenhuma venda registrada'
            : `${vendas.length} venda${vendas.length === 1 ? '' : 's'} · ${brl(totalVendido)} no histórico`}
        </div>
        <button className="btn" onClick={() => setNovaVendaOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true" /> Nova venda
        </button>
      </div>

      {vendas.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-credit-card empty-icon" aria-hidden="true" />
          <div className="empty-title">Nenhuma venda para {pacienteNome}</div>
          <div className="empty-sub">
            Registre a venda e o parcelamento para acompanhar o que já foi pago
            e o que ainda vai entrar. Vendas lançadas pelo cadastro ou pelo
            Financeiro real também aparecem aqui.
          </div>
        </div>
      ) : (
        <ListaVendas
          vendas={vendas}
          parcelasPorVenda={parcelasPorVenda}
          mostrarPaciente={false}
          onEditarParcela={(p, v) => setParcelaEdit({ parcela: p, venda: v })}
          onEditarVenda={setVendaEdit}
          onExcluirVenda={excluirVenda}
        />
      )}

      {novaVendaOpen && (
        <NovaVendaModal
          servicos={servicos}
          nutriId={nutriId}
          pacienteFixo={pacienteFixo}
          onClose={() => setNovaVendaOpen(false)}
          onSaved={async () => { setNovaVendaOpen(false); await carregar(); }}
        />
      )}

      {parcelaEdit && (
        <EditarParcelaModal
          {...parcelaEdit}
          pacienteNome={pacienteNome}
          onClose={() => setParcelaEdit(null)}
          onSaved={async () => { setParcelaEdit(null); await carregar(); }}
        />
      )}

      {vendaEdit && (
        <EditarVendaModal
          venda={vendaEdit}
          pacienteFixo={pacienteFixo}
          onClose={() => setVendaEdit(null)}
          onSaved={async () => { setVendaEdit(null); await carregar(); }}
        />
      )}
    </>
  );
}
