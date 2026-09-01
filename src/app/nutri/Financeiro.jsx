import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { brl, statusParcela, liquidoParcela, taxaSugerida } from '../../lib/utils.js';
import ListaVendas from '../../components/ListaVendas.jsx';
import { NovaVendaModal, EditarParcelaModal, EditarVendaModal } from '../../components/VendaModais.jsx';
import Gastos from './Gastos.jsx';

export default function Financeiro() {
  const { user, profile, refreshProfile } = useSession();
  const [tab, setTab] = useState('entradas');  // 'entradas' | 'gastos'
  const [vendas, setVendas] = useState(undefined);
  const [parcelas, setParcelas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [parcelaEdit, setParcelaEdit] = useState(null);
  const [vendaEdit, setVendaEdit] = useState(null);

  async function excluirVenda(venda) {
    const ok = window.confirm(
      `Excluir a venda "${venda.servico}" de ${venda.paciente?.nome ?? 'Avulso'}?\n\n` +
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

  async function carregar() {
    if (!user) return;
    const [vRes, pRes, pacRes, sRes] = await Promise.all([
      supabase.from('vendas')
        .select('id, paciente_id, servico_id, servico, valor_total, forma_pgto, data_venda, obs, nf_emitida, paciente:pacientes(id, nome)')
        .eq('nutri_id', user.id)
        .order('data_venda', { ascending: false }),
      supabase.from('parcelas')
        .select('*')
        .eq('nutri_id', user.id)
        .order('vencimento', { ascending: true }),
      supabase.from('pacientes')
        // tipo_plano: o NovaVendaModal usa para saber se o teto de parcelas
        // no cartão é 10 (Essentia) ou 12.
        .select('id, nome, tipo_plano')
        .eq('nutri_id', user.id)
        .eq('status_paciente', 'ativo')
        .order('nome'),
      supabase.from('servicos')
        .select('id, nome, ticket, ativo')
        .eq('nutri_id', user.id).eq('ativo', true)
        .order('ticket', { ascending: false }),
    ]);
    setVendas(vRes.data ?? []);
    setParcelas(pRes.data ?? []);
    setPacientes(pacRes.data ?? []);
    setServicos(sRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  // Agrupa parcelas por venda
  const parcelasPorVenda = useMemo(() => {
    const m = {};
    parcelas.forEach(p => {
      (m[p.venda_id] ??= []).push(p);
    });
    return m;
  }, [parcelas]);

  // Filtra vendas com base no filtro
  const vendasFiltradas = useMemo(() => {
    if (!vendas) return [];
    if (filtro === 'todas') return vendas;
    return vendas.filter(v => {
      const ps = parcelasPorVenda[v.id] ?? [];
      if (filtro === 'areceber') {
        return ps.some(p => statusParcela(p) === 'pendente');
      }
      if (filtro === 'atrasado') {
        return ps.some(p => statusParcela(p) === 'atrasado');
      }
      return true;
    });
  }, [vendas, parcelasPorVenda, filtro]);

  // Stats
  const stats = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const inicioMes = new Date(ano, mes, 1);
    const fimMes = new Date(ano, mes + 1, 0); fimMes.setHours(23, 59, 59, 999);

    let recebido = 0, recebidoN = 0;
    let aReceber = 0, aReceberN = 0;
    let atrasado = 0, atrasadoN = 0;
    // Guardado à parte só para o card mostrar "· R$ X bruto" quando os dois
    // números diferem. O que soma nos cards é sempre o líquido.
    let recebidoBruto = 0;

    parcelas.forEach(p => {
      const s = statusParcela(p);
      const venc = p.vencimento ? new Date(p.vencimento + 'T00:00:00') : null;
      const pgto = p.data_pgto ? new Date(p.data_pgto + 'T00:00:00') : null;
      if (s === 'pago' && pgto && pgto >= inicioMes && pgto <= fimMes) {
        recebido += liquidoParcela(p); recebidoN++;
        recebidoBruto += Number(p.valor);
      }
      if (s === 'pendente' && venc && venc >= inicioMes && venc <= fimMes) {
        aReceber += liquidoParcela(p); aReceberN++;
      }
      if (s === 'atrasado') {
        atrasado += liquidoParcela(p); atrasadoN++;
      }
    });
    return { recebido, recebidoBruto, recebidoN, aReceber, aReceberN, atrasado, atrasadoN };
  }, [parcelas]);

  return (
    <>
      <div className="page-title">Financeiro real</div>
      <div className="page-sub">
        {tab === 'entradas'
          ? 'Vendas e parcelas — o que entrou e o que ainda vai entrar'
          : 'Gastos do consultório — saída do fluxo de caixa'}
      </div>

      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16, maxWidth: 360,
      }}>
        {[
          { id: 'entradas', label: '↗ Entradas (vendas)' },
          { id: 'gastos',   label: '↘ Saídas (gastos)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '8px 12px', fontSize: 14, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-sans)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gastos' && <Gastos />}

      {tab === 'entradas' && (<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Recebido este mês</div>
          <div className="stat-val">{brl(stats.recebido)}</div>
          <div className="stat-sub">
            {stats.recebidoN} pagamento{stats.recebidoN === 1 ? '' : 's'}
            {/* O bruto só aparece quando difere — sem taxa, repetir o mesmo
                número duas vezes na mesma linha confunde mais do que informa. */}
            {stats.recebidoBruto > stats.recebido && ` · ${brl(stats.recebidoBruto)} bruto`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">A receber este mês</div>
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
          <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: 'var(--red)', marginTop: 1 }} aria-hidden="true"></i>
          <div>
            <div className="al-t" style={{ color: 'var(--red)' }}>
              {stats.atrasadoN} parcela{stats.atrasadoN === 1 ? '' : 's'} em atraso · {brl(stats.atrasado)}
            </div>
            <div className="al-d">
              Entre em contato com as pacientes correspondentes para regularizar.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'todas',    label: 'Todas' },
            { id: 'areceber', label: 'A receber' },
            { id: 'atrasado', label: 'Em atraso' },
          ].map(f => (
            <button
              key={f.id}
              className={filtro === f.id ? 'btn' : 'btn-outline'}
              onClick={() => setFiltro(f.id)}
              style={{ fontSize: 13 }}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setNovaVendaOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Nova venda
        </button>
      </div>

      {vendas === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : vendasFiltradas.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-credit-card empty-icon" aria-hidden="true"></i>
          <div className="empty-title">
            {filtro === 'todas' ? 'Nenhuma venda registrada' :
             filtro === 'areceber' ? 'Nenhuma venda a receber' :
             'Nada em atraso'}
          </div>
          <div className="empty-sub">
            Registre suas vendas com forma de pagamento para o financeiro começar a popular os indicadores.
          </div>
          {filtro === 'todas' && (
            <button className="btn" onClick={() => setNovaVendaOpen(true)}>
              <i className="ti ti-plus" aria-hidden="true"></i> Primeira venda
            </button>
          )}
        </div>
      ) : (
        <ListaVendas
          vendas={vendasFiltradas}
          parcelasPorVenda={parcelasPorVenda}
          onEditarParcela={(p, v) => setParcelaEdit({ parcela: p, venda: v })}
          onEditarVenda={setVendaEdit}
          onExcluirVenda={excluirVenda}
        />
      )}

      {/* Configuração das taxas. Fica no fim da aba, recolhida: é
          parâmetro que se ajusta uma vez, não algo do dia a dia. Mora aqui
          e não na Personalização porque é número financeiro, e o
          precedente da casa (Previsibilidade) é editar esses números na
          tela onde eles fazem efeito.

          Só monta com o profile carregado, para o estado inicial nascer
          com os valores certos — evita um useEffect que copiaria profile
          para o estado e cairia na regra de setState-em-effect. */}
      {profile && (
        <TaxasCartao perfil={profile} nutriId={user.id} onSalvo={refreshProfile} />
      )}

      {novaVendaOpen && (
        <NovaVendaModal
          pacientes={pacientes}
          servicos={servicos}
          nutriId={user.id}
          onClose={() => setNovaVendaOpen(false)}
          onSaved={async () => { setNovaVendaOpen(false); await carregar(); }}
        />
      )}

      {parcelaEdit && (
        <EditarParcelaModal
          {...parcelaEdit}
          onClose={() => setParcelaEdit(null)}
          onSaved={async () => { setParcelaEdit(null); await carregar(); }}
        />
      )}

      {vendaEdit && (
        <EditarVendaModal
          venda={vendaEdit}
          pacientes={pacientes}
          onClose={() => setVendaEdit(null)}
          onSaved={async () => { setVendaEdit(null); await carregar(); }}
        />
      )}
      </>)}
    </>
  );
}

/* ============================================================
   TAXAS DA MAQUININHA — configuração

   Os percentuais viram a SUGESTÃO de taxa nos dois caminhos que criam
   venda. A sugestão nunca é imposta: o campo continua editável, porque o
   extrato real chega com centavos diferentes e é ele que manda.

   O parcelado tem dois números porque a taxa cresce com o número de
   parcelas — ver taxaSugerida() em utils.js.
   ============================================================ */
function TaxasCartao({ perfil, nutriId, onSalvo }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(() => ({
    credito1x: String(perfil.taxa_pct_credito1x ?? 0).replace('.', ','),
    asaas: String(perfil.taxa_pct_asaas ?? 0).replace('.', ','),
    base: String(perfil.taxa_pct_parcelado_base ?? 0).replace('.', ','),
    porParcela: String(perfil.taxa_pct_parcelado_por_parcela ?? 0).replace('.', ','),
  }));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const num = v => Number(String(v).replace(',', '.')) || 0;

  // Prévia do modelo base + acréscimo. Sem ela, dois números soltos não
  // dizem nada — é esta linha que mostra que 1,4 por parcela vira 18,9% em
  // 12x, que é a conta que a Kelly confere contra o extrato.
  //
  // Usa taxaSugerida(), a MESMA função dos dois modais, com um perfil de
  // mentira montado do formulário. Repetir a fórmula aqui faria a prévia
  // poder discordar do que a venda realmente aplica — que é exatamente o
  // tipo de divergência que motivou centralizar isso em utils.js.
  const perfilPreview = {
    taxa_pct_parcelado_base: num(form.base),
    taxa_pct_parcelado_por_parcela: num(form.porParcela),
  };
  const previa = [3, 6, 12].map(n => ({
    n,
    pct: taxaSugerida(perfilPreview, 'parcelado', 0, n).pct,
  }));

  async function salvar() {
    setErro(null); setFeedback(null);
    const valores = {
      taxa_pct_credito1x: num(form.credito1x),
      taxa_pct_asaas: num(form.asaas),
      taxa_pct_parcelado_base: num(form.base),
      taxa_pct_parcelado_por_parcela: num(form.porParcela),
    };
    // Mesmos limites dos checks do banco, em português.
    if (Object.values(valores).some(v => v < 0 || v > 100)) {
      return setErro('Cada percentual precisa ficar entre 0 e 100.');
    }
    setBusy(true);
    const { error } = await supabase.from('nutris').update(valores).eq('id', nutriId);
    setBusy(false);
    if (error) return setErro('Erro ao salvar: ' + error.message);
    setFeedback('Taxas salvas.');
    // Recarrega o profile da sessão: sem isto os modais continuariam
    // sugerindo com os percentuais antigos até um F5.
    if (typeof onSalvo === 'function') await onSalvo();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div
        className="card-header"
        onClick={() => setAberto(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <div>
          <div className="card-title">Taxas da maquininha</div>
          <div className="card-sub">
            Configure uma vez e a taxa vem calculada em cada venda — sempre editável
          </div>
        </div>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`}
          style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true" />
      </div>

      {aberto && (
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-lbl" style={{ marginTop: 0 }}>Crédito à vista (%)</label>
              <input inputMode="decimal" value={form.credito1x}
                onChange={e => setForm(f => ({ ...f, credito1x: e.target.value }))}
                placeholder="Ex: 3,5" />
            </div>
            <div>
              <label className="form-lbl" style={{ marginTop: 0 }}>Recorrente Asaas (%)</label>
              <input inputMode="decimal" value={form.asaas}
                onChange={e => setForm(f => ({ ...f, asaas: e.target.value }))}
                placeholder="Ex: 4" />
            </div>
            <div>
              <label className="form-lbl" style={{ marginTop: 0 }}>Parcelado — base (%)</label>
              <input inputMode="decimal" value={form.base}
                onChange={e => setForm(f => ({ ...f, base: e.target.value }))}
                placeholder="Ex: 3,5" />
            </div>
            <div>
              <label className="form-lbl" style={{ marginTop: 0 }}>Parcelado — por parcela a mais (%)</label>
              <input inputMode="decimal" value={form.porParcela}
                onChange={e => setForm(f => ({ ...f, porParcela: e.target.value }))}
                placeholder="Ex: 1,4" />
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10 }}>
            No parcelado isso dá{' '}
            {previa.map(p => `${p.n}x = ${p.pct.toFixed(2).replace('.', ',')}%`).join(' · ')}
          </div>

          {erro && (
            <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10 }}>{erro}</div>
          )}
          {feedback && (
            <div style={{ background: 'var(--green-soft)', color: 'var(--green)', padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10 }}>{feedback}</div>
          )}

          <button className="btn" style={{ marginTop: 12 }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar taxas'}
          </button>
        </div>
      )}
    </div>
  );
}
