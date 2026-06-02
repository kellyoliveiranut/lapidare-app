import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais } from '../../lib/utils.js';

const HIDRATACAO_LABEL = ['0–2 copos (até 400ml)', '3–4 copos (600–800ml)', '5–6 copos (1000–1200ml)', '7+ copos (1400ml+)'];
const SUPLEMENTO_LABEL = { todos: 'Todos ✓', parcialmente: 'Parcial', nao: 'Não tomou' };

// ── Lógica de semáforo ────────────────────────────────────────────
function calcSemaforo(r) {
  if (!r) return 'gray';
  if (
    (r.nausea    != null && r.nausea    >= 7) ||
    (r.diarreia  != null && r.diarreia  >= 7) ||
    (r.apetite   != null && r.apetite   <= 2) ||
    r.hidratacao === 0 ||
    r.suplemento === 'nao'
  ) return 'red';
  if (
    (r.nausea    != null && r.nausea    >= 4) ||
    (r.diarreia  != null && r.diarreia  >= 4) ||
    (r.apetite   != null && r.apetite   <= 4) ||
    r.hidratacao === 1 ||
    r.suplemento === 'parcialmente' ||
    r.urina_escura === 'sim'
  ) return 'yellow';
  return 'green';
}

const SEM_COR = {
  green:  { bg: '#dcfce7', border: '#16a34a', label: 'Estável',   dot: '#16a34a' },
  yellow: { bg: '#fef9c3', border: '#d97706', label: 'Atenção',   dot: '#d97706' },
  red:    { bg: '#fee2e2', border: '#dc2626', label: 'Crítico',   dot: '#dc2626' },
  gray:   { bg: '#f3f4f6', border: '#9ca3af', label: 'Sem dados', dot: '#9ca3af' },
};

function gerarAlertas(r) {
  if (!r) return [];
  const al = [];
  if (r.nausea   >= 7) al.push({ icon: 'mood-sick',      msg: 'Náusea acima de 7',                    nivel: 'red'    });
  if (r.diarreia >= 7) al.push({ icon: 'droplet',         msg: 'Diarreia acima de 7',                   nivel: 'red'    });
  if (r.apetite  <= 2) al.push({ icon: 'soup-off',        msg: `Apetite muito baixo (${r.apetite}/10)`, nivel: 'red'    });

  const refs = [r.ref_cafe, r.ref_lanche_manha, r.ref_almoco, r.ref_lanche_tarde, r.ref_jantar, r.ref_ceia]
    .filter(v => v != null);
  const mediaRef = refs.length ? refs.reduce((a, b) => a + b, 0) / refs.length : null;
  if (mediaRef !== null && mediaRef < 1.5) al.push({ icon: 'leaf-off', msg: 'Ingesta alimentar muito reduzida', nivel: 'red' });

  if (r.suplemento  === 'nao')       al.push({ icon: 'pill-off',        msg: 'Suplemento não tomado',              nivel: 'yellow' });
  if (r.hidratacao  === 0)           al.push({ icon: 'droplet-half-2',  msg: 'Hidratação muito baixa (0–2 copos, até 400ml)', nivel: 'yellow' });
  if (r.urina_escura === 'sim')      al.push({ icon: 'alert-triangle',  msg: 'Urina escura — possível desidratação', nivel: 'yellow' });
  if (r.energia != null && r.energia <= 2) al.push({ icon: 'battery-1', msg: `Energia muito baixa (${r.energia}/10)`,   nivel: 'yellow' });
  if (r.vomito  != null && r.vomito  >= 5) al.push({ icon: 'circle-x',  msg: `Vômito intenso (${r.vomito}/10)`,        nivel: 'yellow' });
  return al;
}

function avg(arr, fn) {
  const vals = arr.map(fn).filter(v => v != null);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
}

function calcIndicadores(registros) {
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });
  const regs = dias.map(d => registros.find(r => r.data === d) ?? null);
  const comDados = regs.filter(Boolean);
  return {
    diasCheckin:  comDados.length,
    apetiteMedio: avg(comDados, r => r.apetite),
    energiaMedio: avg(comDados, r => r.energia),
    hidratacaoMedio: avg(comDados, r => r.hidratacao),
    diasNausea:   comDados.filter(r => r.nausea  >= 5).length,
    diasVomito:   comDados.filter(r => r.vomito  >= 3).length,
    diasDiarreia: comDados.filter(r => r.diarreia >= 5).length,
    diasFadiga:   comDados.filter(r => r.energia != null && r.energia <= 4).length,
    pctSuplemento: comDados.length
      ? Math.round(comDados.filter(r => r.suplemento === 'todos').length / comDados.length * 100)
      : null,
    diasProteina: comDados.filter(r =>
      r.proteinas?.length > 0 && !r.proteinas?.includes('nao_consegui')
    ).length,
  };
}

// ── Componente principal ──────────────────────────────────────────
export default function MonitoramentoOncologico() {
  const { user } = useSession();
  const [pacientes,  setPacientes]  = useState(null);
  const [registros,  setRegistros]  = useState([]);    // todos os registros dos últimos 7 dias
  const [selecionado, setSelecionado] = useState(null); // id da paciente selecionada
  const [detalheRegs, setDetalheRegs] = useState([]); // registros da paciente selecionada
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    async function carregar() {
      const seteDias = new Date();
      seteDias.setDate(seteDias.getDate() - 7);
      const dataMin = seteDias.toISOString().split('T')[0];

      const [{ data: pacs }, { data: regs }] = await Promise.all([
        supabase.from('pacientes').select('id, nome, email, avatar_url').order('nome'),
        supabase.from('monitoramento_oncologico')
          .select('*')
          .eq('nutri_id', user.id)
          .gte('data', dataMin)
          .order('data', { ascending: false }),
      ]);
      setPacientes(pacs ?? []);
      setRegistros(regs ?? []);
      setLoading(false);
    }
    carregar();
  }, [user]);

  // Último registro por paciente (para semáforo)
  const ultimoReg = useMemo(() => {
    const map = {};
    registros.forEach(r => {
      if (!map[r.paciente_id]) map[r.paciente_id] = r;
    });
    return map;
  }, [registros]);

  // Ao selecionar uma paciente, filtra os registros dela
  function selecionar(id) {
    setSelecionado(id);
    setDetalheRegs(registros.filter(r => r.paciente_id === id));
  }

  const indic = useMemo(
    () => selecionado ? calcIndicadores(detalheRegs) : null,
    [selecionado, detalheRegs]
  );
  const ultR = selecionado ? ultimoReg[selecionado] : null;
  const alertas = useMemo(() => gerarAlertas(ultR), [ultR]);
  const pacSel = selecionado ? pacientes?.find(p => p.id === selecionado) : null;

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>
    );
  }

  return (
    <>
      <div className="page-title">Monitoramento Oncológico</div>
      <div className="page-sub">Acompanhe o estado nutricional das suas pacientes em tratamento</div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Lista de pacientes ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            Pacientes ({pacientes.length})
          </div>
          {pacientes.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>
              Nenhuma paciente cadastrada.
            </div>
          ) : (
            <div style={{ maxHeight: isMobile ? 260 : 'calc(100vh - 220px)', overflowY: 'auto' }}>
              {pacientes.map(p => {
                const ul = ultimoReg[p.id];
                const sem = calcSemaforo(ul);
                const cor = SEM_COR[sem];
                const ativo = selecionado === p.id;
                const diasAgo = ul ? Math.round((Date.now() - new Date(ul.data + 'T12:00:00').getTime()) / 86400000) : null;
                return (
                  <button
                    key={p.id}
                    onClick={() => selecionar(p.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                      background: ativo ? 'var(--bg2)' : 'transparent',
                      border: 'none', borderBottom: '0.5px solid var(--border)',
                      borderLeft: ativo ? `3px solid ${cor.dot}` : '3px solid transparent',
                      transition: 'background .15s',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--bg2)', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, color: 'var(--dark)',
                    }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : iniciais(p.nome)
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.nome.split(' ')[0]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {diasAgo === null ? 'Sem check-in'
                          : diasAgo === 0 ? 'Hoje'
                          : diasAgo === 1 ? 'Ontem'
                          : `Há ${diasAgo} dias`}
                      </div>
                    </div>
                    {/* Semáforo dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: cor.dot, flexShrink: 0,
                    }} title={cor.label} />
                  </button>
                );
              })}
            </div>
          )}
          {/* Legenda */}
          <div style={{ padding: '10px 14px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(SEM_COR).map(([k, c]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Detalhe da paciente selecionada ── */}
        {!selecionado ? (
          <div className="card empty-card">
            <i className="ti ti-user-search empty-icon" aria-hidden="true"></i>
            <div className="empty-title">Selecione uma paciente</div>
            <div className="empty-sub">Clique em uma paciente à esquerda para ver o painel de monitoramento.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Cabeçalho */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'var(--bg2)', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 600,
                }}>
                  {pacSel?.avatar_url
                    ? <img src={pacSel.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : iniciais(pacSel?.nome)
                  }
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{pacSel?.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pacSel?.email}</div>
                </div>
                {/* Semáforo */}
                {(() => {
                  const sem = calcSemaforo(ultR);
                  const cor = SEM_COR[sem];
                  return (
                    <div style={{
                      marginLeft: 'auto',
                      padding: '6px 14px', borderRadius: 999,
                      background: cor.bg, border: `1.5px solid ${cor.border}`,
                      color: cor.dot, fontSize: 13, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor.dot }} />
                      {cor.label}
                    </div>
                  );
                })()}
              </div>
              {!ultR && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8 }}>
                  Esta paciente ainda não realizou o check-in oncológico.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>

              {/* ── Alertas ── */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 12 }}>
                  <i className="ti ti-alert-circle" style={{ color: 'var(--red)', marginRight: 6 }} />
                  Alertas ativos
                </div>
                {alertas.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-circle-check" />
                    Nenhum alerta — tudo dentro do esperado.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {alertas.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13,
                        padding: '8px 10px', borderRadius: 8,
                        background: a.nivel === 'red' ? '#fee2e2' : '#fef9c3',
                        color: a.nivel === 'red' ? '#991b1b' : '#92400e',
                      }}>
                        <i className={`ti ti-${a.icon}`} style={{ marginTop: 1, flexShrink: 0 }} />
                        {a.msg}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Último check-in resumido ── */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 12 }}>
                  <i className="ti ti-clipboard-data" style={{ color: 'var(--gold-deep)', marginRight: 6 }} />
                  Último check-in
                  {ultR && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>{new Date(ultR.data + 'T12:00').toLocaleDateString('pt-BR')}</span>}
                </div>
                {!ultR ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sem registros ainda.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <IndRow label="Apetite"     value={ultR.apetite   != null ? `${ultR.apetite}/10`   : '—'} />
                    <IndRow label="Energia"     value={ultR.energia   != null ? `${ultR.energia}/10`   : '—'} />
                    <IndRow label="Náusea"      value={ultR.nausea    != null ? `${ultR.nausea}/10`    : '—'} />
                    <IndRow label="Diarreia"    value={ultR.diarreia  != null ? `${ultR.diarreia}/10`  : '—'} />
                    <IndRow label="Hidratação"  value={ultR.hidratacao != null ? HIDRATACAO_LABEL[ultR.hidratacao] : '—'} />
                    <IndRow label="Suplemento"  value={SUPLEMENTO_LABEL[ultR.suplemento] ?? '—'} last />
                  </div>
                )}
              </div>
            </div>

            {/* ── Indicadores semanais (últimos 7 dias) ── */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="card-title" style={{ marginBottom: 14 }}>
                <i className="ti ti-chart-bar" style={{ color: 'var(--gold-deep)', marginRight: 6 }} />
                Indicadores — últimos 7 dias
              </div>
              {!indic || indic.diasCheckin === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sem check-ins nos últimos 7 dias.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10 }}>
                  <IndicCard label="Dias com check-in"    value={`${indic.diasCheckin}/7`}            cor="var(--blue)" />
                  <IndicCard label="Apetite médio"        value={indic.apetiteMedio   ? `${indic.apetiteMedio}/10` : '—'} cor={indic.apetiteMedio < 4 ? '#dc2626' : indic.apetiteMedio < 6 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Energia média"        value={indic.energiaMedio   ? `${indic.energiaMedio}/10` : '—'} cor={indic.energiaMedio < 4 ? '#dc2626' : indic.energiaMedio < 6 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Uso de suplemento"    value={indic.pctSuplemento != null ? `${indic.pctSuplemento}%` : '—'} cor={indic.pctSuplemento < 50 ? '#dc2626' : indic.pctSuplemento < 80 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Dias com proteína"    value={`${indic.diasProteina}/7`}           cor={indic.diasProteina < 3 ? '#dc2626' : indic.diasProteina < 5 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Hidratação média"     value={indic.hidratacaoMedio ? HIDRATACAO_LABEL[Math.round(indic.hidratacaoMedio)] : '—'} cor={indic.hidratacaoMedio < 1 ? '#dc2626' : '#d97706'} />
                  <IndicCard label="Dias com náusea ≥5"   value={`${indic.diasNausea} dia${indic.diasNausea !== 1 ? 's' : ''}`}   cor={indic.diasNausea  >= 4 ? '#dc2626' : indic.diasNausea  >= 2 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Dias com diarreia ≥5" value={`${indic.diasDiarreia} dia${indic.diasDiarreia !== 1 ? 's' : ''}`} cor={indic.diasDiarreia >= 3 ? '#dc2626' : indic.diasDiarreia >= 1 ? '#d97706' : '#16a34a'} />
                  <IndicCard label="Dias com fadiga"      value={`${indic.diasFadiga} dia${indic.diasFadiga !== 1 ? 's' : ''}`}    cor={indic.diasFadiga  >= 4 ? '#dc2626' : indic.diasFadiga  >= 2 ? '#d97706' : '#16a34a'} />
                </div>
              )}
            </div>

            {/* ── Histórico ── */}
            {detalheRegs.length > 0 && (
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 12 }}>
                  <i className="ti ti-history" style={{ color: 'var(--gold-deep)', marginRight: 6 }} />
                  Histórico recente
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                        {['Data', 'Apetite', 'Energia', 'Náusea', 'Vômito', 'Diarreia', 'Hidrat.', 'Supl.'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', color: 'var(--text3)', fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalheRegs.slice(0, 14).map(r => {
                        const sem = calcSemaforo(r);
                        return (
                          <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEM_COR[sem].dot, flexShrink: 0 }} />
                                {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </div>
                            </td>
                            <td style={{ padding: '6px 8px' }}><NumCell v={r.apetite}   reverse /></td>
                            <td style={{ padding: '6px 8px' }}><NumCell v={r.energia}   reverse /></td>
                            <td style={{ padding: '6px 8px' }}><NumCell v={r.nausea} /></td>
                            <td style={{ padding: '6px 8px' }}><NumCell v={r.vomito} /></td>
                            <td style={{ padding: '6px 8px' }}><NumCell v={r.diarreia} /></td>
                            <td style={{ padding: '6px 8px' }}>{r.hidratacao != null ? HIDRATACAO_LABEL[r.hidratacao] : '—'}</td>
                            <td style={{ padding: '6px 8px', color: r.suplemento === 'todos' ? '#16a34a' : r.suplemento === 'nao' ? '#dc2626' : 'var(--ink)' }}>
                              {SUPLEMENTO_LABEL[r.suplemento] ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function IndRow({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', fontSize: 12,
      borderBottom: last ? 'none' : '0.5px solid var(--border)',
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function IndicCard({ label, value, cor }) {
  return (
    <div style={{
      padding: '12px', borderRadius: 10,
      background: 'var(--bg2)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function NumCell({ v, reverse }) {
  if (v == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const ruim = reverse ? v <= 3 : v >= 7;
  const ok   = reverse ? v >= 7 : v <= 3;
  const cor  = ruim ? '#dc2626' : ok ? '#16a34a' : 'var(--ink)';
  return <span style={{ color: cor, fontWeight: ruim || ok ? 600 : 400 }}>{v}</span>;
}
