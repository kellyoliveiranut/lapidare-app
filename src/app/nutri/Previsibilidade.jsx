import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { brl } from '../../lib/utils.js';

const DEFAULTS = {
  meta_mensal:     15000,
  gastos_fixos:    2200,
  horas_semanais:  30,
};

const DURACAO_CONSULTA_MIN = 60; // referência para calcular capacidade

export default function Previsibilidade() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);    // meta/gastos/horas
  const [servicos, setServicos] = useState([]);  // ativos com vendas_planejadas
  const [vendidoPorServico, setVendidoPorServico] = useState({});
  const [receitaMes, setReceitaMes] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const debounceRef = useRef(null);
  const debounceServRef = useRef({});

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [nutriRes, servRes, parcelasRes, vendasRes] = await Promise.all([
        supabase.from('nutris')
          .select('meta_mensal, gastos_fixos, horas_semanais')
          .eq('id', user.id).maybeSingle(),
        supabase.from('servicos').select('*')
          .eq('nutri_id', user.id).eq('ativo', true)
          .order('ticket', { ascending: false }),
        supabase.from('parcelas').select('valor, data_pgto')
          .eq('nutri_id', user.id).eq('status', 'pago')
          .gte('data_pgto', inicioMes).lte('data_pgto', fimMes),
        // vendas realizadas no mês corrente para cruzar com planejamento
        supabase.from('vendas').select('servico_id, data_venda')
          .eq('nutri_id', user.id)
          .gte('data_venda', inicioMes).lte('data_venda', fimMes),
      ]);

      if (!active) return;
      const d = nutriRes.data ?? {};
      setConfig({
        meta_mensal:    d.meta_mensal    ?? DEFAULTS.meta_mensal,
        gastos_fixos:   d.gastos_fixos   ?? DEFAULTS.gastos_fixos,
        horas_semanais: d.horas_semanais ?? DEFAULTS.horas_semanais,
      });
      setServicos(servRes.data ?? []);
      setReceitaMes((parcelasRes.data ?? []).reduce((a, p) => a + Number(p.valor ?? 0), 0));

      // Conta vendas realizadas por serviço
      const contagem = {};
      for (const v of vendasRes.data ?? []) {
        if (v.servico_id) {
          contagem[v.servico_id] = (contagem[v.servico_id] ?? 0) + 1;
        }
      }
      setVendidoPorServico(contagem);
    }
    load();
    return () => { active = false; };
  }, [user]);

  function marcarSalvo() {
    setSalvando(false);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1500);
  }

  function atualizarConfig(campo, valor) {
    const novo = { ...config, [campo]: valor };
    setConfig(novo);
    setSalvo(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSalvando(true);
      await supabase.from('nutris').update(novo).eq('id', user.id);
      marcarSalvo();
    }, 800);
  }

  function atualizarVendas(servicoId, vendas) {
    setServicos(curr => curr.map(s => s.id === servicoId ? { ...s, vendas_planejadas: vendas } : s));
    setSalvo(false);
    if (debounceServRef.current[servicoId]) clearTimeout(debounceServRef.current[servicoId]);
    debounceServRef.current[servicoId] = setTimeout(async () => {
      setSalvando(true);
      await supabase.from('servicos').update({ vendas_planejadas: vendas }).eq('id', servicoId);
      marcarSalvo();
    }, 600);
  }

  async function zerarPlanejamento() {
    if (!window.confirm('Zerar o planejamento de todos os serviços?')) return;
    setSalvando(true);
    const ids = servicos.map(s => s.id);
    await supabase.from('servicos').update({ vendas_planejadas: 0 }).in('id', ids);
    setServicos(curr => curr.map(s => ({ ...s, vendas_planejadas: 0 })));
    marcarSalvo();
  }

  if (!config) {
    return (
      <>
        <div className="page-title">Previsibilidade</div>
        <div className="page-sub">Carregando…</div>
      </>
    );
  }

  // Cálculos
  const meta = config.meta_mensal;
  const gastos = config.gastos_fixos;
  const horas = config.horas_semanais;
  const metaLiquida = Math.max(0, meta - gastos);

  const totalPlanejado = servicos.reduce((a, s) => a + Number(s.ticket) * Number(s.vendas_planejadas || 0), 0);
  const totalVendas = servicos.reduce((a, s) => a + Number(s.vendas_planejadas || 0), 0);
  const restante = meta - totalPlanejado;
  const cobreMeta = totalPlanejado >= meta;
  const cobreLiquida = totalPlanejado >= metaLiquida;

  const capacidadeMax = Math.floor(horas * 4 * 60 / DURACAO_CONSULTA_MIN);
  const pctCapacidade = capacidadeMax > 0 ? Math.round((totalVendas / capacidadeMax) * 100) : 0;
  const cabeNasHoras = totalVendas <= capacidadeMax;

  const pctRecebido = meta > 0 ? Math.min(100, (receitaMes / meta) * 100) : 0;

  // Status geral
  let status;
  if (servicos.length === 0) {
    status = null;
  } else if (totalVendas === 0) {
    status = { tipo: 'neutro', msg: 'Defina quantas vendas você planeja para cada serviço.' };
  } else if (!cobreLiquida) {
    status = { tipo: 'red', msg: `Faltam ${brl(metaLiquida - totalPlanejado)} para cobrir a meta líquida.` };
  } else if (!cobreMeta) {
    status = { tipo: 'amber', msg: `Cobre os gastos, mas falta ${brl(meta - totalPlanejado)} para a meta cheia.` };
  } else if (!cabeNasHoras) {
    status = { tipo: 'red', msg: `Mix atinge a meta mas excede sua capacidade (${totalVendas}/${capacidadeMax} consultas).` };
  } else {
    status = { tipo: 'green', msg: `✓ Mix atinge a meta e cabe nas suas horas. Sobra ${brl(totalPlanejado - meta)} acima da meta.` };
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="page-title">Previsibilidade</div>
          <div className="page-sub">Quanto vai faturar — e o que precisa fazer para isso</div>
        </div>
        <div style={{ fontSize: 12, color: salvo ? 'var(--green)' : 'var(--text3)' }}>
          {salvando ? '⟳ salvando…' : salvo ? '✓ salvo' : 'auto-save ativo'}
        </div>
      </div>

      {/* ─── 1. PARÂMETROS BASE ─── */}
      <div className="section-label" style={{ marginTop: 0 }}>1. Parâmetros do mês</div>
      <div className="card">
        <div className="card-body">
          <SliderField label="Meta de faturamento mensal" valor={meta}
            onChange={v => atualizarConfig('meta_mensal', v)}
            min={2000} max={50000} step={500} format={brl}
            hint="Quanto você quer faturar neste mês" />
          <SliderField label="Gastos fixos do consultório" valor={gastos}
            onChange={v => atualizarConfig('gastos_fixos', v)}
            min={0} max={10000} step={100} format={brl}
            hint="Aluguel, software, contadora, etc." />
          <SliderField label="Horas disponíveis por semana" valor={horas}
            onChange={v => atualizarConfig('horas_semanais', Number(v))}
            min={5} max={60} step={1} format={(v) => `${v}h`}
            hint={`Capacidade: ${capacidadeMax} consultas/mês (referência ${DURACAO_CONSULTA_MIN}min)`} />
        </div>
      </div>

      {/* ─── 2. PLANEJAMENTO POR SERVIÇO ─── */}
      <div className="section-label">2. Quanto vender de cada serviço</div>
      {servicos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-package empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem serviços cadastrados</div>
          <div className="empty-sub">
            Cadastre seus serviços (plano trimestral, semestral, consultoria, etc) com nome e ticket
            para planejar o mix de vendas e ver quanto precisa de cada para bater a meta.
          </div>
          <button className="btn" onClick={() => navigate('/nutri/servicos')}>
            <i className="ti ti-plus" aria-hidden="true"></i> Cadastrar serviços
          </button>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, marginBottom: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th style={{ textAlign: 'right' }}>Ticket</th>
                  <th style={{ textAlign: 'center', width: 100 }}>Vendido</th>
                  <th style={{ textAlign: 'center', width: 130 }}>Planejar/mês</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {servicos.map(s => {
                  const sub = Number(s.ticket) * Number(s.vendas_planejadas || 0);
                  const vendido = vendidoPorServico[s.id] ?? 0;
                  const planejado = Number(s.vendas_planejadas || 0);
                  const atingiu = planejado > 0 && vendido >= planejado;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{s.nome}</div>
                        {s.descricao && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.descricao}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontWeight: 500 }}>
                        {brl(s.ticket)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: 14, fontWeight: 600,
                          color: vendido === 0 ? 'var(--text3)' : (atingiu ? 'var(--green)' : 'var(--dark)'),
                        }}>
                          {vendido}
                        </span>
                        {planejado > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 3 }}>/{planejado}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => atualizarVendas(s.id, Math.max(0, (s.vendas_planejadas || 0) - 1))}
                            style={{
                              width: 24, height: 24, border: '0.5px solid var(--border)',
                              background: 'var(--white)', borderRadius: 6, cursor: 'pointer',
                              color: 'var(--text2)', fontSize: 16, lineHeight: 1,
                            }}>−</button>
                          <input
                            type="number" min="0"
                            value={s.vendas_planejadas || 0}
                            onChange={e => atualizarVendas(s.id, Math.max(0, parseInt(e.target.value) || 0))}
                            style={{
                              width: 44, padding: '4px 6px', fontSize: 14,
                              textAlign: 'center', margin: 0,
                              fontFamily: 'var(--font-sans)', fontWeight: 500,
                            }}
                          />
                          <button
                            onClick={() => atualizarVendas(s.id, (s.vendas_planejadas || 0) + 1)}
                            style={{
                              width: 24, height: 24, border: '0.5px solid var(--border)',
                              background: 'var(--white)', borderRadius: 6, cursor: 'pointer',
                              color: 'var(--text2)', fontSize: 16, lineHeight: 1,
                            }}>+</button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500, color: sub > 0 ? 'var(--dark)' : 'var(--text3)' }}>
                        {brl(sub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '0.5px solid var(--border)', background: '#faf8f5' }}>
                  <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>TOTAL PLANEJADO</td>
                  <td></td>
                  <td style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                    {Object.values(vendidoPorServico).reduce((a, b) => a + b, 0)} vend.
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                    {totalVendas} consultas
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600 }}>
                    {brl(totalPlanejado)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <button onClick={() => navigate('/nutri/servicos')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--gold-deep, #a08456)', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true"></i>
              Adicionar ou editar serviços
            </button>
            {totalVendas > 0 && (
              <button onClick={zerarPlanejamento} className="btn-outline" style={{ fontSize: 12 }}>
                <i className="ti ti-refresh" aria-hidden="true"></i> Zerar planejamento
              </button>
            )}
          </div>
        </>
      )}

      {/* ─── 3. RESULTADO ─── */}
      {servicos.length > 0 && (
        <>
          <div className="section-label">3. Resultado do cenário</div>

          {/* Comparação Meta vs Planejado */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
                    Meta vs Planejamento
                  </div>
                  <div style={{ fontSize: 16, marginTop: 4 }}>
                    <strong style={{ fontSize: 18, color: cobreMeta ? 'var(--green)' : 'var(--dark)' }}>{brl(totalPlanejado)}</strong>
                    <span style={{ color: 'var(--text3)' }}> de {brl(meta)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: cobreMeta ? 'var(--green)' : restante > 0 ? 'var(--orange)' : 'var(--text3)',
                  }}>
                    {cobreMeta ? `✓ supera em ${brl(totalPlanejado - meta)}` : `faltam ${brl(restante)}`}
                  </div>
                </div>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: 'var(--bg3, #eae4dc)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${meta > 0 ? Math.min(100, (totalPlanejado / meta) * 100) : 0}%`,
                  background: cobreMeta
                    ? 'linear-gradient(90deg, var(--green) 0%, #5a8f30 100%)'
                    : 'linear-gradient(90deg, var(--amber) 0%, var(--gold-deep, #a08456) 100%)',
                  borderRadius: 6, transition: 'width .4s ease',
                }} />
              </div>
            </div>

            {/* Capacidade */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
                    Capacidade
                  </div>
                  <div style={{ fontSize: 15, marginTop: 4 }}>
                    <strong style={{ fontSize: 18 }}>{totalVendas}</strong>
                    <span style={{ color: 'var(--text3)' }}> de {capacidadeMax} consultas no mês</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: !cabeNasHoras ? 'var(--red)' : pctCapacidade > 80 ? 'var(--orange)' : 'var(--text3)',
                  }}>
                    {pctCapacidade}% da capacidade
                  </div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg3, #eae4dc)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, pctCapacidade)}%`,
                  background: !cabeNasHoras ? 'var(--red)' : pctCapacidade > 80 ? 'var(--amber)' : 'var(--green)',
                  borderRadius: 4, transition: 'width .4s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div style={{
              marginTop: 10,
              background: status.tipo === 'red' ? 'var(--red-bg)'
                : status.tipo === 'amber' ? 'var(--orange-bg)'
                : status.tipo === 'green' ? 'var(--green-bg)'
                : 'var(--bg2)',
              borderLeft: `3px solid var(--${status.tipo === 'red' ? 'red' : status.tipo === 'amber' ? 'amber' : status.tipo === 'green' ? 'green' : 'border'})`,
              borderRadius: 6, padding: '10px 14px',
              fontSize: 14, color: 'var(--text2)', lineHeight: 1.5,
            }}>
              {status.msg}
            </div>
          )}
        </>
      )}

      {/* ─── 4. PROGRESSO REAL ─── */}
      <div className="section-label" style={{ marginTop: 20 }}>4. Onde você está este mês</div>
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--text2)' }}>
            <strong style={{ fontSize: 16 }}>{brl(receitaMes)}</strong> recebidos de {brl(meta)} de meta
          </span>
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: pctRecebido >= 100 ? 'var(--green)' : 'var(--text3)',
          }}>
            {pctRecebido >= 100 ? '✓ meta superada' : `${Math.round(pctRecebido)}%`}
          </span>
        </div>
        <div style={{ height: 12, borderRadius: 6, background: 'var(--bg3, #eae4dc)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pctRecebido}%`,
            background: pctRecebido >= 100
              ? 'linear-gradient(90deg, var(--green) 0%, #5a8f30 100%)'
              : 'linear-gradient(90deg, var(--amber) 0%, var(--gold-deep, #a08456) 100%)',
            borderRadius: 6, transition: 'width .4s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
          Calculado das parcelas pagas no mês corrente (Financeiro real).
        </div>
      </div>
    </>
  );
}

function SliderField({ label, valor, onChange, min, max, step, format, hint }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <input type="range" min={min} max={max} step={step} value={valor}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--amber)' }} />
        <span style={{
          minWidth: 100, textAlign: 'right',
          fontSize: 15, fontWeight: 500, color: 'var(--dark)',
          fontVariantNumeric: 'tabular-nums',
        }}>{format(valor)}</span>
      </div>
      {hint && (<div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>)}
    </div>
  );
}
