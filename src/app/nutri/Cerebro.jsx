import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { brl, labelFormaPgto, iconFormaPgto, iniciais, liquidoParcela } from '../../lib/utils.js';

const MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function Cerebro() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [vendas, setVendas] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      const [vRes, pRes, pacRes, sRes] = await Promise.all([
        supabase.from('vendas')
          .select('id, paciente_id, servico, servico_id, valor_total, forma_pgto, data_venda')
          .eq('nutri_id', user.id),
        // TODAS as parcelas (pagas, pendentes, atrasadas) — precisa para previsão
        supabase.from('parcelas')
          .select('valor, taxa_cartao, data_pgto, vencimento, status')
          .eq('nutri_id', user.id),
        supabase.from('pacientes')
          .select('id, nome, created_at')
          .eq('nutri_id', user.id),
        supabase.from('servicos')
          .select('id, nome')
          .eq('nutri_id', user.id),
      ]);
      if (!active) return;
      setVendas(vRes.data ?? []);
      setParcelas(pRes.data ?? []);
      setPacientes(pacRes.data ?? []);
      setServicos(sRes.data ?? []);
      setCarregando(false);
    }
    load();
    return () => { active = false; };
  }, [user]);

  // Linha temporal de 13 meses (6 passados + atual + 6 futuros)
  // Cada mês tem: realizado (pago) + previsto (pendente vencendo no mês)
  const linhaTempo = useMemo(() => {
    const mapa = new Map();
    const hoje = new Date();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    for (let offset = -6; offset <= 6; offset++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      mapa.set(key, {
        key, mes: d.getMonth(), ano: d.getFullYear(),
        realizado: 0, previsto: 0,
        ehAtual: key === mesAtualKey,
        ehFuturo: offset > 0,
        ehPassado: offset < 0,
      });
    }

    // Realizado e previsto são FLUXO DE CAIXA: o que entrou e o que vai
    // entrar, já sem a maquininha. Diferente do ticket médio e da receita
    // por serviço logo abaixo, que continuam em bruto de propósito.
    for (const p of parcelas) {
      if (p.status === 'pago' && p.data_pgto) {
        const key = p.data_pgto.slice(0, 7);
        if (mapa.has(key)) mapa.get(key).realizado += liquidoParcela(p);
      } else if (p.status !== 'pago' && p.vencimento) {
        // pendente ou atrasada → previsto no mês do vencimento
        const key = p.vencimento.slice(0, 7);
        if (mapa.has(key)) mapa.get(key).previsto += liquidoParcela(p);
      }
    }
    return Array.from(mapa.values());
  }, [parcelas]);

  // Total recebido (todas as parcelas pagas), líquido de maquininha
  const totalRecebido = parcelas.filter(p => p.status === 'pago')
    .reduce((a, p) => a + liquidoParcela(p), 0);

  // Previsto nos próximos 6 meses (parcelas pendentes/atrasadas vencendo após hoje)
  const previstoProximosMeses = useMemo(() => {
    return linhaTempo
      .filter(m => m.ehFuturo || m.ehAtual)
      .reduce((a, m) => a + m.previsto, 0);
  }, [linhaTempo]);

  const previstoEsseMes = linhaTempo.find(m => m.ehAtual)?.previsto ?? 0;

  // Ticket médio real (média do valor_total das vendas).
  // BRUTO de propósito: é o preço do serviço, não o repasse. Descontar a
  // maquininha daqui faria o ticket variar conforme a forma de pagamento da
  // paciente, e ele existe para responder "quanto vale o meu serviço".
  const ticketMedio = vendas.length > 0
    ? vendas.reduce((a, v) => a + Number(v.valor_total), 0) / vendas.length
    : 0;

  // Receita por serviço (mês corrente).
  // BRUTO pelo mesmo motivo do ticket: aqui se COMPARA preço entre serviços,
  // e a taxa da maquininha é propriedade da venda, não do serviço.
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
  const receitaPorServico = useMemo(() => {
    const mapa = new Map();
    for (const v of vendas) {
      if (new Date(v.data_venda) < inicioMes) continue;
      const key = v.servico_id ?? `manual:${v.servico}`;
      const nome = v.servico_id
        ? (servicos.find(s => s.id === v.servico_id)?.nome ?? v.servico)
        : v.servico;
      if (!mapa.has(key)) mapa.set(key, { nome, valor: 0, vendas: 0 });
      const item = mapa.get(key);
      item.valor += Number(v.valor_total);
      item.vendas += 1;
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [vendas, servicos]);

  // Top pacientes por LTV (receita total — vendas no histórico)
  const topPacientes = useMemo(() => {
    const mapa = new Map();
    for (const v of vendas) {
      if (!v.paciente_id) continue;
      const nome = pacientes.find(p => p.id === v.paciente_id)?.nome ?? '—';
      if (!mapa.has(v.paciente_id)) mapa.set(v.paciente_id, { nome, valor: 0, vendas: 0 });
      const item = mapa.get(v.paciente_id);
      item.valor += Number(v.valor_total);
      item.vendas += 1;
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [vendas, pacientes]);

  // Distribuição por forma de pgto
  const porFormaPgto = useMemo(() => {
    const mapa = new Map();
    for (const v of vendas) {
      const key = v.forma_pgto || 'desconhecido';
      if (!mapa.has(key)) mapa.set(key, { forma: key, valor: 0, count: 0 });
      const item = mapa.get(key);
      item.valor += Number(v.valor_total);
      item.count += 1;
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [vendas]);

  const totalVendido = vendas.reduce((a, v) => a + Number(v.valor_total), 0);

  // LTV médio por paciente
  const ltvMedio = pacientes.length > 0 && totalVendido > 0
    ? totalVendido / pacientes.length
    : 0;

  // Estado vazio
  if (!carregando && vendas.length === 0 && parcelas.length === 0) {
    return (
      <>
        <div className="page-title">Cérebro do negócio</div>
        <div className="page-sub">O que está acontecendo de verdade no seu consultório</div>
        <div className="card empty-card">
          <i className="ti ti-chart-bar empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem dados suficientes ainda</div>
          <div className="empty-sub">
            Os gráficos e métricas estratégicas aparecem aqui assim que você começar a registrar
            vendas no <strong>Financeiro real</strong>.
          </div>
          <button className="btn" onClick={() => navigate('/nutri/financeiro')}>
            <i className="ti ti-credit-card" aria-hidden="true"></i> Ir para Financeiro
          </button>
        </div>
      </>
    );
  }

  const maxLinhaTempo = Math.max(...linhaTempo.map(m => m.realizado + m.previsto), 1);
  const temPrevisto = linhaTempo.some(m => (m.ehFuturo || m.ehAtual) && m.previsto > 0);

  return (
    <>
      <div className="page-title">Cérebro do negócio</div>
      <div className="page-sub">O que está acontecendo de verdade no seu consultório</div>

      {/* 4 stats principais */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Receita total recebida</div>
          <div className="stat-val">{brl(totalRecebido)}</div>
          <div className="stat-sub">histórico completo</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">A receber (próx. 6 meses)</div>
          <div className="stat-val" style={{ color: 'var(--gold-deep, #a08456)' }}>
            {previstoProximosMeses > 0 ? brl(previstoProximosMeses) : '—'}
          </div>
          <div className="stat-sub">
            {previstoEsseMes > 0 ? `${brl(previstoEsseMes)} ainda este mês` : 'parcelas pendentes'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ticket médio real</div>
          <div className="stat-val">{ticketMedio > 0 ? brl(ticketMedio) : '—'}</div>
          <div className="stat-sub">de {vendas.length} venda{vendas.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">LTV médio por paciente</div>
          <div className="stat-val">{ltvMedio > 0 ? brl(ltvMedio) : '—'}</div>
          <div className="stat-sub">{pacientes.length} paciente{pacientes.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {/* Faturamento — 13 meses (passado + futuro) */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Faturamento · realizado e previsto</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: 'var(--amber)', borderRadius: 2 }}></span>
            Realizado
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: '#fbf5ec', border: '1px dashed var(--amber)', borderRadius: 2 }}></span>
            Previsto
          </span>
        </div>
      </div>
      <div className="card" style={{ padding: '20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200 }}>
          {linhaTempo.map((m, i) => {
            const total = m.realizado + m.previsto;
            const altReal = (m.realizado / maxLinhaTempo) * 150;
            const altPrev = (m.previsto / maxLinhaTempo) * 150;
            return (
              <div key={i} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4, minWidth: 0,
              }}>
                <div style={{
                  fontSize: 10, color: 'var(--text2)',
                  height: 12, fontWeight: 500, whiteSpace: 'nowrap',
                }}>
                  {total > 0 ? brl(total).replace('R$ ', '').replace(',00', '') : ''}
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column-reverse',
                  width: '100%', maxWidth: 36, minHeight: 4,
                }}>
                  {m.realizado > 0 && (
                    <div style={{
                      height: Math.max(3, altReal),
                      background: 'linear-gradient(180deg, var(--amber) 0%, var(--gold-deep, #a08456) 100%)',
                      borderRadius: altPrev > 0 ? '0' : '4px 4px 0 0',
                    }} title={`Recebido: ${brl(m.realizado)}`} />
                  )}
                  {m.previsto > 0 && (
                    <div style={{
                      height: Math.max(3, altPrev),
                      background: 'repeating-linear-gradient(45deg, #fbf5ec 0 4px, #ebd9b8 4px 8px)',
                      border: '0.5px dashed var(--amber)',
                      borderRadius: '4px 4px 0 0',
                    }} title={`Previsto: ${brl(m.previsto)}`} />
                  )}
                  {total === 0 && (
                    <div style={{ height: 2, background: 'var(--bg2)', borderRadius: 1 }} />
                  )}
                </div>
                <div style={{
                  fontSize: 11, color: m.ehAtual ? 'var(--dark)' : 'var(--text3)',
                  fontWeight: m.ehAtual ? 700 : 500,
                  textTransform: 'uppercase', letterSpacing: '.3px',
                  paddingTop: m.ehAtual ? 1 : 3,
                  borderTop: m.ehAtual ? '1.5px solid var(--amber)' : 'none',
                  width: '100%', textAlign: 'center',
                }}>
                  {MES_CURTO[m.mes]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela de recebimento previsto mês a mês */}
      {temPrevisto && (
        <>
          <div className="section-header" style={{ marginTop: 14 }}>
            <div className="section-title">Recebimento previsto · mês a mês</div>
            <span className="card-sub">parcelas pendentes / atrasadas</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th style={{ textAlign: 'right' }}>Já recebido</th>
                  <th style={{ textAlign: 'right' }}>Previsto</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhaTempo.filter(m => m.ehAtual || m.ehFuturo).map((m, i) => {
                  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                  return (
                    <tr key={i} style={m.ehAtual ? { background: 'var(--orange-bg)' } : {}}>
                      <td>
                        <strong>{nomes[m.mes]}/{String(m.ano).slice(2)}</strong>
                        {m.ehAtual && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, padding: '1px 5px',
                            background: 'var(--amber)', color: 'var(--white)',
                            borderRadius: 20, fontWeight: 600,
                          }}>ATUAL</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: m.realizado > 0 ? 'var(--green)' : 'var(--text3)' }}>
                        {m.realizado > 0 ? brl(m.realizado) : '—'}
                      </td>
                      <td style={{
                        textAlign: 'right',
                        color: m.previsto > 0 ? 'var(--gold-deep, #a08456)' : 'var(--text3)',
                        fontWeight: m.previsto > 0 ? 500 : 400,
                      }}>
                        {m.previsto > 0 ? brl(m.previsto) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
                        {(m.realizado + m.previsto) > 0 ? brl(m.realizado + m.previsto) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#faf8f5', borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>SOMA</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)', fontSize: 13 }}>
                    {brl(linhaTempo.filter(m => m.ehAtual || m.ehFuturo).reduce((a, m) => a + m.realizado, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--gold-deep, #a08456)', fontSize: 13, fontWeight: 600 }}>
                    {brl(previstoProximosMeses)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600 }}>
                    {brl(linhaTempo.filter(m => m.ehAtual || m.ehFuturo).reduce((a, m) => a + m.realizado + m.previsto, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <div className="grid2" style={{ marginTop: 18, alignItems: 'start' }}>
        {/* Receita por serviço (mês) */}
        <div>
          <div className="section-header">
            <div className="section-title">Receita por serviço</div>
            <span className="card-sub">mês corrente</span>
          </div>
          {receitaPorServico.length === 0 ? (
            <div className="card empty-card">
              <div className="empty-sub">Nenhuma venda este mês ainda.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {receitaPorServico.map((s, i) => {
                const max = receitaPorServico[0].valor;
                const pct = (s.valor / max) * 100;
                return (
                  <div key={i} style={{
                    padding: '12px 16px',
                    borderBottom: i === receitaPorServico.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{s.nome}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-serif)' }}>{brl(s.valor)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: 'var(--amber)',
                        borderRadius: 3,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      {s.vendas} venda{s.vendas === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Distribuição por forma de pagamento */}
        <div>
          <div className="section-header">
            <div className="section-title">Forma de pagamento</div>
            <span className="card-sub">histórico</span>
          </div>
          {porFormaPgto.length === 0 ? (
            <div className="card empty-card">
              <div className="empty-sub">Sem vendas registradas.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {porFormaPgto.map((f, i) => {
                const pct = totalVendido > 0 ? (f.valor / totalVendido) * 100 : 0;
                return (
                  <div key={i} style={{
                    padding: '12px 16px',
                    borderBottom: i === porFormaPgto.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: 'var(--bg2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className={`ti ti-${iconFormaPgto(f.forma)}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{labelFormaPgto(f.forma)}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                          {brl(f.valor)} · {Math.round(pct)}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: 'var(--green)',
                          borderRadius: 2,
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                        {f.count} venda{f.count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top pacientes por LTV */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Top pacientes por LTV</div>
        <span className="card-sub">receita acumulada</span>
      </div>
      {topPacientes.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Sem dados de pacientes ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {topPacientes.map((p, i) => (
            <div key={i} style={{
              padding: '12px 16px',
              borderBottom: i === topPacientes.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text3)',
                width: 18, textAlign: 'center',
              }}>{i + 1}</div>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: 'var(--dark)',
              }}>{iniciais(p.nome)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.vendas} venda{p.vendas === 1 ? '' : 's'} no histórico</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
                {brl(p.valor)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insight final */}
      <div className="card" style={{ padding: '14px 18px', marginTop: 14, background: 'var(--bg2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          <strong>Insight:</strong>{' '}
          {receitaPorServico.length > 0
            ? <>
                <strong style={{ color: 'var(--dark)' }}>{receitaPorServico[0].nome}</strong> foi seu maior gerador
                de receita este mês ({brl(receitaPorServico[0].valor)}).
                {topPacientes.length > 0 && <> Sua paciente de maior LTV é <strong style={{ color: 'var(--dark)' }}>{topPacientes[0].nome}</strong> com {brl(topPacientes[0].valor)} acumulados.</>}
              </>
            : 'Registre vendas para ver insights estratégicos sobre seus produtos e pacientes.'}
        </div>
      </div>
    </>
  );
}
