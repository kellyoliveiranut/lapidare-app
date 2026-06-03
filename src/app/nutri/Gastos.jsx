import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import DateInput from '../../components/DateInput.jsx';
import {
  brl, dataBR,
  CATEGORIAS_GASTO, infoCategoria,
  FORMAS_PGTO_GASTO_LIST, labelFormaPgtoGasto, iconFormaPgtoGasto,
} from '../../lib/utils.js';

const MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function Gastos() {
  const { user } = useSession();
  const [gastos, setGastos] = useState(undefined);
  const [editor, setEditor] = useState(null); // null = fechado | {} = novo | obj = editar
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | recorrentes | esporadicos
  const [filtroCat, setFiltroCat] = useState('todas');

  async function carregar() {
    if (!user) return;
    const { data } = await supabase
      .from('gastos').select('*')
      .eq('nutri_id', user.id)
      .order('recorrente', { ascending: false })
      .order('data_gasto', { ascending: false, nullsLast: true })
      .order('created_at', { ascending: false });
    setGastos(data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  // ─── Stats ───
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const recorrentesAtivos = (gastos ?? []).filter(g => g.recorrente && g.ativo);
  const totalRecorrente = recorrentesAtivos.reduce((a, g) => a + Number(g.valor), 0);

  const esporadicosMes = (gastos ?? []).filter(g => {
    if (g.recorrente) return false;
    if (!g.data_gasto) return false;
    const d = new Date(g.data_gasto + 'T00:00:00');
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });
  const totalEsporadicoMes = esporadicosMes.reduce((a, g) => a + Number(g.valor), 0);
  const totalGastoMes = totalRecorrente + totalEsporadicoMes;

  // ─── Linha temporal 13 meses (6 passados + atual + 6 futuros) ───
  const linhaTempo = useMemo(() => {
    if (!gastos) return [];
    const meses = [];
    for (let offset = -6; offset <= 6; offset++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
      // Esporádicos com data nesse mês
      const esporadico = gastos
        .filter(g => !g.recorrente && g.data_gasto)
        .filter(g => {
          const gd = new Date(g.data_gasto + 'T00:00:00');
          return gd.getFullYear() === d.getFullYear() && gd.getMonth() === d.getMonth();
        })
        .reduce((a, g) => a + Number(g.valor), 0);

      meses.push({
        mes: d.getMonth(),
        ano: d.getFullYear(),
        recorrente: totalRecorrente,  // recorrentes ativos contam em todos os meses
        esporadico,
        total: totalRecorrente + esporadico,
        ehAtual: offset === 0,
        ehFuturo: offset > 0,
        ehPassado: offset < 0,
      });
    }
    return meses;
  }, [gastos, totalRecorrente]);

  const maxLinhaTempo = Math.max(...linhaTempo.map(m => m.total), 1);
  const temAlgumGasto = (gastos?.length ?? 0) > 0;

  // ─── Filtro ───
  const filtrados = useMemo(() => {
    if (!gastos) return [];
    return gastos.filter(g => {
      if (filtroTipo === 'recorrentes' && !g.recorrente) return false;
      if (filtroTipo === 'esporadicos' && g.recorrente) return false;
      if (filtroCat !== 'todas' && g.categoria !== filtroCat) return false;
      return true;
    });
  }, [gastos, filtroTipo, filtroCat]);

  async function excluir(g) {
    if (!window.confirm(`Excluir "${g.descricao}"?`)) return;
    await supabase.from('gastos').delete().eq('id', g.id);
    carregar();
  }

  async function toggleAtivo(g) {
    await supabase.from('gastos').update({ ativo: !g.ativo }).eq('id', g.id);
    carregar();
  }

  return (
    <>
      {/* Stats topo */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Gasto fixo mensal</div>
          <div className="stat-val" style={{ color: 'var(--red)' }}>{brl(totalRecorrente)}</div>
          <div className="stat-sub">{recorrentesAtivos.length} gasto{recorrentesAtivos.length === 1 ? '' : 's'} recorrente{recorrentesAtivos.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Esporádicos este mês</div>
          <div className="stat-val" style={{ color: 'var(--text2)' }}>{brl(totalEsporadicoMes)}</div>
          <div className="stat-sub">{esporadicosMes.length} pagamento{esporadicosMes.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Saída total este mês</div>
          <div className="stat-val">{brl(totalGastoMes)}</div>
          <div className="stat-sub">fixos + esporádicos</div>
        </div>
      </div>

      {/* Hint */}
      <div className="al-b" style={{
        marginBottom: 12, background: 'var(--bg2)',
        borderLeftColor: 'var(--text3)',
      }}>
        <i className="ti ti-info-circle" style={{ fontSize: 16, marginTop: 1 }} aria-hidden="true"></i>
        <div>
          <div className="al-t">Como funciona</div>
          <div className="al-d">
            <strong>Recorrentes</strong> são gastos fixos (sala, wifi, software) — anote uma vez e o sistema conta todo mês automaticamente.
            <strong> Esporádicos</strong> são pontuais (almoço, gasolina, livro) — anote a cada pagamento.
            Não registre o mesmo gasto nos dois.
          </div>
        </div>
      </div>

      {/* Gráfico 13 meses */}
      {temAlgumGasto && (
        <>
          <div className="section-header">
            <div className="section-title">Saídas · mês a mês</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: 'var(--red)', borderRadius: 2 }}></span>
                Recorrente
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: '#d68a8a', borderRadius: 2 }}></span>
                Esporádico
              </span>
            </div>
          </div>
          <div className="card" style={{ padding: '20px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200 }}>
              {linhaTempo.map((m, i) => {
                const altRec = (m.recorrente / maxLinhaTempo) * 150;
                const altEsp = (m.esporadico / maxLinhaTempo) * 150;
                return (
                  <div key={i} style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 4, minWidth: 0,
                  }}>
                    <div style={{
                      fontSize: 10, color: 'var(--text2)',
                      height: 12, fontWeight: 500, whiteSpace: 'nowrap',
                    }}>
                      {m.total > 0 ? brl(m.total).replace('R$ ', '').replace(',00', '') : ''}
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column-reverse',
                      width: '100%', maxWidth: 36, minHeight: 4,
                    }}
                    title={`Total: ${brl(m.total)}\nRecorrente: ${brl(m.recorrente)}\nEsporádico: ${brl(m.esporadico)}`}>
                      {m.recorrente > 0 && (
                        <div style={{
                          height: Math.max(3, altRec),
                          background: 'linear-gradient(180deg, #b03030 0%, var(--red) 100%)',
                          borderRadius: altEsp > 0 ? '0' : '4px 4px 0 0',
                          opacity: m.ehFuturo ? .6 : 1,
                        }} />
                      )}
                      {m.esporadico > 0 && (
                        <div style={{
                          height: Math.max(3, altEsp),
                          background: '#d68a8a',
                          borderRadius: '4px 4px 0 0',
                        }} />
                      )}
                      {m.total === 0 && (
                        <div style={{ height: 2, background: 'var(--bg2)', borderRadius: 1 }} />
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: m.ehAtual ? 'var(--dark)' : 'var(--text3)',
                      fontWeight: m.ehAtual ? 700 : 500,
                      textTransform: 'uppercase', letterSpacing: '.3px',
                      paddingTop: m.ehAtual ? 1 : 3,
                      borderTop: m.ehAtual ? '1.5px solid var(--red)' : 'none',
                      width: '100%', textAlign: 'center',
                    }}>
                      {MES_CURTO[m.mes]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 13, marginRight: 4 }} aria-hidden="true"></i>
              Meses futuros (translúcidos) mostram só recorrentes ativos como projeção — esporádicos são imprevisíveis.
            </div>
          </div>

          {/* Tabela mês a mês */}
          <div className="section-header" style={{ marginTop: 14 }}>
            <div className="section-title">Detalhe por mês</div>
            <span className="card-sub">últimos 6 + 6 próximos</span>
          </div>
          <div className="card" style={{ padding: 0, marginBottom: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th style={{ textAlign: 'right' }}>Recorrente</th>
                  <th style={{ textAlign: 'right' }}>Esporádico</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhaTempo.map((m, i) => {
                  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                  return (
                    <tr key={i} style={{
                      ...(m.ehAtual ? { background: 'var(--red-bg)' } : {}),
                      opacity: m.ehFuturo ? .7 : 1,
                    }}>
                      <td>
                        <strong>{nomes[m.mes]}/{String(m.ano).slice(2)}</strong>
                        {m.ehAtual && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, padding: '1px 5px',
                            background: 'var(--red)', color: 'var(--white)',
                            borderRadius: 20, fontWeight: 600,
                          }}>ATUAL</span>
                        )}
                        {m.ehFuturo && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, padding: '1px 5px',
                            background: 'var(--bg2)', color: 'var(--text3)',
                            borderRadius: 20, fontWeight: 600,
                          }}>PROJ</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>
                        {m.recorrente > 0 ? brl(m.recorrente) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: m.esporadico > 0 ? '#d68a8a' : 'var(--text3)' }}>
                        {m.esporadico > 0 ? brl(m.esporadico) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
                        {m.total > 0 ? brl(m.total) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#faf8f5', borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>SOMA (13 meses)</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)', fontSize: 13 }}>
                    {brl(linhaTempo.reduce((a, m) => a + m.recorrente, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#d68a8a', fontSize: 13 }}>
                    {brl(linhaTempo.reduce((a, m) => a + m.esporadico, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600 }}>
                    {brl(linhaTempo.reduce((a, m) => a + m.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { id: 'todos',       label: 'Todos' },
            { id: 'recorrentes', label: 'Recorrentes' },
            { id: 'esporadicos', label: 'Esporádicos' },
          ].map(f => (
            <button key={f.id}
              className={filtroTipo === f.id ? 'btn' : 'btn-outline'}
              onClick={() => setFiltroTipo(f.id)}
              style={{ fontSize: 13 }}>
              {f.label}
            </button>
          ))}
          <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
            style={{ width: 160, margin: 0 }}>
            <option value="todas">Todas categorias</option>
            {CATEGORIAS_GASTO.map(c => (
              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={() => setEditor({})}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo gasto
        </button>
      </div>

      {/* Lista */}
      {gastos === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-receipt-off empty-icon" aria-hidden="true"></i>
          <div className="empty-title">
            {gastos.length === 0 ? 'Nenhum gasto registrado' : 'Nada com esses filtros'}
          </div>
          <div className="empty-sub">
            {gastos.length === 0
              ? 'Registre seus custos fixos (sala, wifi, software) e gastos esporádicos para acompanhar o fluxo de caixa de saída.'
              : 'Tente outros filtros ou registre um novo gasto.'}
          </div>
          {gastos.length === 0 && (
            <button className="btn" onClick={() => setEditor({})}>
              <i className="ti ti-plus" aria-hidden="true"></i> Primeiro gasto
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Tipo</th>
                <th>Pagamento</th>
                <th>Quando</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(g => {
                const cat = infoCategoria(g.categoria);
                return (
                  <tr key={g.id} style={{ opacity: g.recorrente && !g.ativo ? .5 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                        <span style={{ fontSize: 13, color: cat.color, fontWeight: 500 }}>{cat.label}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{g.descricao}</div>
                      {g.obs && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontStyle: 'italic' }}>"{g.obs}"</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--red)' }}>
                      {brl(g.valor)}
                    </td>
                    <td>
                      {g.recorrente ? (
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                          background: g.ativo ? 'var(--orange-bg)' : 'var(--bg2)',
                          color: g.ativo ? 'var(--orange)' : 'var(--text3)',
                          textTransform: 'uppercase', letterSpacing: '.5px',
                        }}>
                          {g.ativo ? '↻ Recorrente' : '⏸ Pausado'}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                          background: 'var(--bg2)', color: 'var(--text3)',
                          textTransform: 'uppercase', letterSpacing: '.5px',
                        }}>
                          • Esporádico
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <i className={`ti ti-${iconFormaPgtoGasto(g.forma_pgto)}`} style={{ fontSize: 14, color: 'var(--text3)' }} aria-hidden="true"></i>
                        {labelFormaPgtoGasto(g.forma_pgto)}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {g.recorrente
                        ? `dia ${g.dia_recorrencia ?? '?'} de cada mês`
                        : dataBR(g.data_gasto)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {g.recorrente && (
                          <button onClick={() => toggleAtivo(g)}
                            title={g.ativo ? 'Pausar' : 'Ativar'}
                            style={{
                              background: 'none', border: '0.5px solid var(--border)',
                              borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                              color: 'var(--text3)', fontSize: 13,
                            }}>
                            <i className={`ti ti-${g.ativo ? 'player-pause' : 'player-play'}`} aria-hidden="true"></i>
                          </button>
                        )}
                        <button onClick={() => setEditor(g)}
                          className="btn-outline" style={{ fontSize: 12, padding: '4px 8px' }}>
                          <i className="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <button onClick={() => excluir(g)}
                          style={{
                            background: 'none', border: '0.5px solid var(--red)',
                            borderRadius: 6, padding: '4px 8px',
                            color: 'var(--red)', cursor: 'pointer',
                          }}>
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor !== null && (
        <EditorGasto
          gasto={editor}
          nutriId={user.id}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await carregar(); }}
        />
      )}
    </>
  );
}

/* ============================================================
   EDITOR DE GASTO
   ============================================================ */
function EditorGasto({ gasto, nutriId, onClose, onSaved }) {
  const isEdit = !!gasto?.id;
  const hojeStr = new Date().toISOString().slice(0, 10);

  const [descricao, setDescricao]   = useState(gasto?.descricao ?? '');
  const [categoria, setCategoria]   = useState(gasto?.categoria ?? 'outros');
  const [valor, setValor]           = useState(gasto?.valor != null ? String(gasto.valor).replace('.', ',') : '');
  const [formaPgto, setFormaPgto]   = useState(gasto?.forma_pgto ?? 'pix');
  const [tipo, setTipo]             = useState(gasto?.recorrente ? 'recorrente' : 'esporadico');
  const [dataGasto, setDataGasto]   = useState(gasto?.data_gasto ?? hojeStr);
  const [diaRec, setDiaRec]         = useState(gasto?.dia_recorrencia ?? 5);
  const [obs, setObs]               = useState(gasto?.obs ?? '');
  const [ativo, setAtivo]           = useState(gasto?.ativo ?? true);
  const [busy, setBusy]             = useState(false);
  const [erro, setErro]             = useState(null);

  async function salvar() {
    setErro(null);
    if (!descricao.trim()) return setErro('Informe a descrição.');
    const valorNum = Number(String(valor).replace(',', '.'));
    if (!valorNum || valorNum <= 0) return setErro('Informe um valor válido.');
    if (tipo === 'esporadico' && !dataGasto) return setErro('Informe a data do gasto.');
    if (tipo === 'recorrente' && (!diaRec || diaRec < 1 || diaRec > 31)) return setErro('Dia do mês inválido (1-31).');

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      descricao: descricao.trim(),
      categoria,
      valor: valorNum,
      forma_pgto: formaPgto,
      recorrente: tipo === 'recorrente',
      data_gasto: tipo === 'esporadico' ? dataGasto : null,
      dia_recorrencia: tipo === 'recorrente' ? Number(diaRec) : null,
      ativo: tipo === 'recorrente' ? ativo : true,
      obs: obs.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('gastos').update(payload).eq('id', gasto.id)
      : await supabase.from('gastos').insert(payload);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 460, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>
          {isEdit ? 'Editar gasto' : 'Novo gasto'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Registre uma saída do consultório
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Descrição</label>
        <input value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Ex: Aluguel sala 305, Wifi Vivo, Notion Pro" />

        <label className="form-lbl">Categoria</label>
        <select value={categoria} onChange={e => setCategoria(e.target.value)}>
          {CATEGORIAS_GASTO.map(c => (
            <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
          ))}
        </select>

        <label className="form-lbl">Valor (R$)</label>
        <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
          placeholder="0,00" />

        <label className="form-lbl">Tipo</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {[
            { id: 'esporadico',  label: 'Esporádico',  icon: 'calendar-event', desc: 'Pagamento único, em uma data' },
            { id: 'recorrente',  label: 'Recorrente',  icon: 'refresh', desc: 'Fixo todo mês (sala, wifi, etc)' },
          ].map(t => {
            const ativoBtn = tipo === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                style={{
                  border: ativoBtn ? 'none' : '0.5px solid var(--border)',
                  background: ativoBtn ? 'var(--dark)' : 'var(--white)',
                  color: ativoBtn ? 'var(--white)' : 'var(--text2)',
                  borderRadius: 7, padding: '10px 12px', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-sans)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500 }}>
                  <i className={`ti ti-${t.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
                  {t.label}
                </div>
                <div style={{ fontSize: 12, opacity: .75, marginTop: 3 }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        {tipo === 'esporadico' && (
          <>
            <label className="form-lbl">Data do gasto</label>
            <DateInput value={dataGasto} onChange={e => setDataGasto(e.target.value)} />
          </>
        )}

        {tipo === 'recorrente' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="form-lbl">Dia de vencimento</label>
                <select value={diaRec} onChange={e => setDiaRec(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>dia {d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-lbl">Status</label>
                <select value={ativo ? '1' : '0'} onChange={e => setAtivo(e.target.value === '1')}>
                  <option value="1">Ativo (conta no mês)</option>
                  <option value="0">Pausado</option>
                </select>
              </div>
            </div>
          </>
        )}

        <label className="form-lbl">Forma de pagamento</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {FORMAS_PGTO_GASTO_LIST.map(f => {
            const ativoF = formaPgto === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFormaPgto(f.id)}
                style={{
                  border: ativoF ? 'none' : '0.5px solid var(--border)',
                  background: ativoF ? 'var(--dark)' : 'var(--white)',
                  color: ativoF ? 'var(--white)' : 'var(--text2)',
                  borderRadius: 7, padding: '8px 12px',
                  fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontFamily: 'var(--font-sans)',
                }}>
                <i className={`ti ti-${f.icon}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
                {f.label}
              </button>
            );
          })}
        </div>

        <label className="form-lbl">Observação (opcional)</label>
        <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Ex: contrato até dez/2026, reajuste em maio..." style={{ resize: 'none' }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
