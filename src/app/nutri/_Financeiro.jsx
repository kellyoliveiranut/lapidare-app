import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { brl, statusParcela, liquidoParcela } from '../../lib/utils.js';
import ListaVendas from '../../components/ListaVendas.jsx';
import { NovaVendaModal, EditarParcelaModal, EditarVendaModal } from '../../components/VendaModais.jsx';
import { gravar } from '../../lib/gravar.js';
import { confirmar } from '../../lib/dialogos.js';
import DadosNotaFiscal from './_DadosNotaFiscal.jsx';

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
export default function Financeiro({ pacienteId, nutriId, pacienteNome, pacienteTipoPlano, paciente, onDadosSalvos }) {
  const [vendas, setVendas] = useState(undefined);
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [parcelaEdit, setParcelaEdit] = useState(null);
  const [vendaEdit, setVendaEdit] = useState(null);
  const [servicos, setServicos] = useState([]);
  // Valor do contrato Essentia (pendente ou aceito), para lembrar de lançar a venda.
  const [valorContrato, setValorContrato] = useState(null);

  // tipo_plano viaja junto porque o NovaVendaModal precisa dele para o teto
  // de parcelas no cartão (10 na Essentia, 12 nas demais).
  const pacienteFixo = { id: pacienteId, nome: pacienteNome, tipo_plano: pacienteTipoPlano };

  async function carregar() {
    if (!nutriId || !pacienteId) return;
    const [vRes, sRes] = await Promise.all([
      supabase.from('vendas')
        .select('id, paciente_id, servico_id, servico, valor_total, forma_pgto, data_venda, obs, nf_emitida, parcelas(*)')
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
    const { data: ct } = await supabase.from('contratos_essentia')
      .select('valor').eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setValorContrato(ct?.valor != null ? Number(ct.valor) : null);
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
    // Ver comentário do totalVendido logo abaixo: aqui é fluxo de caixa,
    // lá é preço combinado.
    let pagoBruto = 0;

    (vendas ?? []).forEach(v => {
      (v.parcelas ?? []).forEach(p => {
        const s = statusParcela(p);
        if (s === 'pago')     { pago     += liquidoParcela(p); pagoN++; pagoBruto += Number(p.valor); }
        if (s === 'pendente') { aReceber += liquidoParcela(p); aReceberN++; }
        if (s === 'atrasado') { atrasado += liquidoParcela(p); atrasadoN++; }
      });
    });
    return { pago, pagoBruto, pagoN, aReceber, aReceberN, atrasado, atrasadoN };
  }, [vendas]);

  // BRUTO de propósito: é o preço combinado com a paciente, o que vai no
  // contrato e na nota. Descontar a maquininha daqui responderia outra
  // pergunta, não "quanto ela comprou".
  const totalVendido = useMemo(
    () => (vendas ?? []).reduce((a, v) => a + Number(v.valor_total), 0),
    [vendas],
  );

  async function excluirVenda(venda) {
    const ok = await confirmar(
      `Excluir a venda "${venda.servico}" de ${pacienteNome}?\n\n` +
      `Todas as parcelas relacionadas também serão removidas. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    // esperado 1 conta só a linha de vendas: as parcelas saem por CASCADE e
    // não entram no retorno.
    const r = await gravar(supabase.from('vendas').delete().eq('id', venda.id),
      { rotulo: 'excluir a venda' });
    if (!r.ok) {
      alert(r.msg);
      return;
    }
    await carregar();
  }

  if (vendas === undefined) {
    return <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>;
  }

  return (
    <>
      {paciente && <DadosNotaFiscal paciente={paciente} vendaRecente={vendas[0] ?? null} onSalvo={onDadosSalvos} />}

      {vendas.length === 0 && valorContrato > 0 && (
        <div className="al-b" style={{ marginBottom: 12 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 16, marginTop: 1 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div className="al-t">Contrato de {brl(valorContrato)} sem venda registrada</div>
            <div className="al-d">Registre a venda para o valor entrar no Financeiro e na Previsibilidade.</div>
          </div>
          <button className="btn" onClick={() => setNovaVendaOpen(true)}>Registrar venda</button>
        </div>
      )}

      {vendas.length > 0 && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Pago</div>
              <div className="stat-val">{brl(stats.pago)}</div>
              <div className="stat-sub">
                {stats.pagoN} parcela{stats.pagoN === 1 ? '' : 's'}
                {stats.pagoBruto > stats.pago && ` · ${brl(stats.pagoBruto)} bruto`}
              </div>
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
          valorInicial={vendas.length === 0 ? valorContrato : null}
          servicoInicial={vendas.length === 0 && valorContrato > 0 ? 'Essentia' : ''}
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
