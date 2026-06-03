import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { brl, dataBR, iniciais, statusParcela } from '../../lib/utils.js';

// Nº esperado de consultas por tipo de plano (para alertar planos chegando ao fim)
const CONSULTAS_POR_PLANO = {
  trimestral:     6,
  semestral:      12,
  consultoria:    1,
  // 'acompanhamento' = contínuo, sem alerta de fim
};

const STORAGE_OCULTAR_META = 'lapidare:ocultarMeta';

export default function Visao() {
  const navigate = useNavigate();
  const { user, profile } = useSession();
  const [carregando, setCarregando] = useState(true);
  const [pacientes, setPacientes] = useState([]);
  const [consultasSemana, setConsultasSemana] = useState([]);
  const [parcelasSemana, setParcelasSemana] = useState([]);
  const [checkinsPendentes, setCheckinsPendentes] = useState([]);
  const [planosTerminando, setPlanosTerminando] = useState([]);
  const [alertasRelacionais, setAlertasRelacionais] = useState([]);
  const [receitaMes, setReceitaMes] = useState(0);
  const [metaMensal, setMetaMensal] = useState(null);
  const [ocultarMeta, setOcultarMeta] = useState(() => {
    return localStorage.getItem(STORAGE_OCULTAR_META) === '1';
  });

  function toggleOcultarMeta() {
    const novo = !ocultarMeta;
    setOcultarMeta(novo);
    localStorage.setItem(STORAGE_OCULTAR_META, novo ? '1' : '0');
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function carregar() {
      const hoje = new Date();
      // Semana: segunda à domingo
      const dow = (hoje.getDay() + 6) % 7;
      const segunda = new Date(hoje); segunda.setDate(hoje.getDate() - dow); segunda.setHours(0, 0, 0, 0);
      const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6); domingo.setHours(23, 59, 59, 999);
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
      const isoSegunda = segunda.toISOString();
      const isoDomingo = domingo.toISOString();
      const dataSegunda = segunda.toISOString().slice(0, 10);
      const dataDomingo = domingo.toISOString().slice(0, 10);

      // Limites pra queries dos alertas relacionais
      const dias30atras = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const dias7atras  = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

      const [
        pacRes, agSemanaRes, parcRes, checkRes,
        parcelasMesRes, allConsultasRes, nutriRes,
        msgRes, feedRes, supRes, supLogRes,
      ] = await Promise.all([
        // pacientes ativas (com nascimento pra aniversário)
        supabase.from('pacientes').select('id, nome, tipo_plano, nascimento').eq('nutri_id', user.id).eq('status_paciente', 'ativo'),
        // consultas da semana
        supabase.from('consultas').select('id, data_hora, tipo, duracao_min, paciente:pacientes(id, nome)')
          .eq('nutri_id', user.id).neq('status', 'cancelada')
          .gte('data_hora', isoSegunda).lte('data_hora', isoDomingo)
          .order('data_hora'),
        // parcelas vencendo na semana (pendentes ou atrasadas)
        supabase.from('parcelas').select('id, valor, vencimento, status, venda:vendas(servico, paciente:pacientes(id, nome))')
          .eq('nutri_id', user.id).neq('status', 'pago')
          .lte('vencimento', dataDomingo)
          .order('vencimento'),
        // check-ins pendentes
        supabase.from('checkin_envios').select('id, enviado_em, paciente:pacientes(id, nome)')
          .eq('nutri_id', user.id).is('respondido_em', null)
          .order('enviado_em'),
        // receita do mês (parcelas pagas)
        supabase.from('parcelas').select('valor, data_pgto')
          .eq('nutri_id', user.id).eq('status', 'pago')
          .gte('data_pgto', inicioMes).lte('data_pgto', fimMes),
        // todas as consultas não canceladas (para contar por paciente)
        supabase.from('consultas').select('paciente_id, status')
          .eq('nutri_id', user.id).neq('status', 'cancelada'),
        // perfil da nutri (meta_mensal)
        supabase.from('nutris').select('meta_mensal').eq('id', user.id).maybeSingle(),
        // mensagens das pacientes (últimos 30 dias) — pra detectar quem sumiu
        supabase.from('mensagens').select('paciente_id, created_at')
          .eq('nutri_id', user.id).eq('de', 'paciente')
          .gte('created_at', dias30atras)
          .order('created_at', { ascending: false }),
        // posts no feed (últimos 30 dias) — RLS filtra só do nutri logado
        supabase.from('feed_pratos').select('paciente_id, created_at')
          .gte('created_at', dias30atras)
          .order('created_at', { ascending: false }),
        // suplementos ativos
        supabase.from('suplementos').select('id, paciente_id')
          .eq('nutri_id', user.id).eq('ativo', true),
        // logs de suplemento últimos 7 dias
        supabase.from('suplementos_logs').select('suplemento_id, paciente_id, data, tomado')
          .gte('data', dias7atras),
      ]);

      if (!active) return;

      setPacientes(pacRes.data ?? []);
      setConsultasSemana(agSemanaRes.data ?? []);
      setParcelasSemana(parcRes.data ?? []);
      setCheckinsPendentes(checkRes.data ?? []);

      const receita = (parcelasMesRes.data ?? []).reduce((a, p) => a + Number(p.valor ?? 0), 0);
      setReceitaMes(receita);

      const meta = nutriRes.data?.meta_mensal ?? null;
      setMetaMensal(meta);

      // Planos chegando ao fim
      const contagem = {};
      for (const c of allConsultasRes.data ?? []) {
        contagem[c.paciente_id] = (contagem[c.paciente_id] ?? 0) + 1;
      }
      const terminando = (pacRes.data ?? [])
        .map(p => {
          const esperado = CONSULTAS_POR_PLANO[p.tipo_plano];
          if (!esperado) return null;
          const feitas = contagem[p.id] ?? 0;
          const restam = esperado - feitas;
          if (restam > 2) return null;  // só alerta quando faltam 2 ou menos
          return {
            id: p.id, nome: p.nome, tipo_plano: p.tipo_plano,
            feitas, esperado, restam,
            vencido: restam <= 0,
          };
        })
        .filter(Boolean);
      setPlanosTerminando(terminando);

      // ─── ALERTAS RELACIONAIS ───
      const todasPacientes = pacRes.data ?? [];
      const ultimaMsgPorPac = {};
      for (const m of msgRes.data ?? []) {
        if (!ultimaMsgPorPac[m.paciente_id]) ultimaMsgPorPac[m.paciente_id] = m.created_at;
      }
      const ultimoFeedPorPac = {};
      for (const f of feedRes.data ?? []) {
        if (!ultimoFeedPorPac[f.paciente_id]) ultimoFeedPorPac[f.paciente_id] = f.created_at;
      }

      // Aderência aos suplementos por paciente nos últimos 7 dias
      const supAtivosPorPac = {};
      for (const s of supRes.data ?? []) {
        supAtivosPorPac[s.paciente_id] = (supAtivosPorPac[s.paciente_id] ?? 0) + 1;
      }
      const supTomadosPorPac = {};
      for (const l of supLogRes.data ?? []) {
        if (l.tomado) supTomadosPorPac[l.paciente_id] = (supTomadosPorPac[l.paciente_id] ?? 0) + 1;
      }

      const hojeMD = new Date();
      const hojeMes = hojeMD.getMonth() + 1;
      const hojeDia = hojeMD.getDate();

      const alertas = [];
      for (const p of todasPacientes) {
        // 🎂 Aniversário hoje
        if (p.nascimento) {
          const n = new Date(p.nascimento + 'T12:00:00');
          if (n.getMonth() + 1 === hojeMes && n.getDate() === hojeDia) {
            const idade = hojeMD.getFullYear() - n.getFullYear();
            alertas.push({
              tipo: 'aniversario',
              paciente_id: p.id, nome: p.nome,
              emoji: '🎂', cor: 'var(--gold-deep, #a08456)',
              titulo: `Aniversário de ${p.nome.split(' ')[0]}`,
              descricao: `Faz ${idade} anos hoje — mande uma mensagem!`,
              prioridade: 1,
            });
          }
        }

        // 🔕 Sem mensagem da paciente há 7+ dias
        const ultMsg = ultimaMsgPorPac[p.id];
        const diasSemMsg = ultMsg
          ? Math.floor((Date.now() - new Date(ultMsg).getTime()) / 86_400_000)
          : null;
        if (diasSemMsg !== null && diasSemMsg >= 7) {
          alertas.push({
            tipo: 'chat',
            paciente_id: p.id, nome: p.nome,
            emoji: '🔕', cor: 'var(--orange)',
            titulo: `${p.nome.split(' ')[0]} sumiu do chat`,
            descricao: `Não responde há ${diasSemMsg} dias`,
            prioridade: 3,
          });
        }

        // 📷 Sem post no feed há 14+ dias
        const ultFeed = ultimoFeedPorPac[p.id];
        const diasSemFeed = ultFeed
          ? Math.floor((Date.now() - new Date(ultFeed).getTime()) / 86_400_000)
          : null;
        if (diasSemFeed !== null && diasSemFeed >= 14) {
          alertas.push({
            tipo: 'feed',
            paciente_id: p.id, nome: p.nome,
            emoji: '📷', cor: 'var(--blue)',
            titulo: `${p.nome.split(' ')[0]} parou de postar pratos`,
            descricao: `Último post há ${diasSemFeed} dias`,
            prioridade: 4,
          });
        }

        // 💊 Baixa aderência aos suplementos (<40% nos últimos 7 dias)
        const ativos = supAtivosPorPac[p.id] ?? 0;
        if (ativos > 0) {
          const esperado = ativos * 7;
          const cumprido = supTomadosPorPac[p.id] ?? 0;
          const pct = Math.round((cumprido / esperado) * 100);
          if (pct < 40) {
            alertas.push({
              tipo: 'suplementos',
              paciente_id: p.id, nome: p.nome,
              emoji: '💊', cor: 'var(--red)',
              titulo: `${p.nome.split(' ')[0]} com baixa aderência`,
              descricao: `${pct}% nos suplementos (últimos 7 dias)`,
              prioridade: 2,
            });
          }
        }
      }
      alertas.sort((a, b) => a.prioridade - b.prioridade);
      setAlertasRelacionais(alertas);

      setCarregando(false);
    }
    carregar();
    return () => { active = false; };
  }, [user]);

  // Cálculos derivados
  const totalParcelas = parcelasSemana.reduce((a, p) => a + Number(p.valor ?? 0), 0);
  const atrasadas = parcelasSemana.filter(p => statusParcela(p) === 'atrasado').length;
  const semNome = profile?.nome?.split(' ')[0] ?? '';

  // Barra de meta
  const pctMeta = metaMensal && metaMensal > 0 ? Math.min(100, (receitaMes / metaMensal) * 100) : 0;
  const faltaMeta = metaMensal ? Math.max(0, metaMensal - receitaMes) : 0;

  return (
    <>
      <div className="page-title">{semNome ? `${(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })()}, ${semNome}` : 'Visão geral'}</div>
      <div className="page-sub">O que está acontecendo no seu consultório hoje</div>

      {/* ─── STATS RÁPIDAS ─── */}
      <div className="g3">
        <div className="stat">
          <div className="stat-lbl">Pacientes ativas</div>
          <div className="stat-val">{pacientes.length}</div>
          <div className="stat-diff">{pacientes.length === 0 ? 'nenhuma ainda' : 'no total'}</div>
        </div>
        <div className="stat">
          <div className="stat-lbl">Consultas esta semana</div>
          <div className="stat-val">{consultasSemana.length}</div>
          <div className="stat-diff">{consultasSemana.length === 0 ? 'agenda livre' : 'agendadas'}</div>
        </div>
        <div className="stat">
          <div className="stat-lbl">Receita do mês</div>
          <div className="stat-val">{ocultarMeta ? '••••' : brl(receitaMes)}</div>
          <div className="stat-diff">
            {metaMensal
              ? (ocultarMeta ? '—' : `de ${brl(metaMensal)} de meta`)
              : 'registre no financeiro'}
          </div>
        </div>
      </div>

      {/* ─── BARRA DE META ─── */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
              Meta financeira do mês
            </span>
            <button onClick={toggleOcultarMeta}
              title={ocultarMeta ? 'Mostrar valores' : 'Ocultar valores'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', padding: 2, display: 'inline-flex',
              }}>
              <i className={`ti ti-${ocultarMeta ? 'eye-off' : 'eye'}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
            </button>
          </div>
          <button onClick={() => navigate('/nutri/previsibilidade')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--gold-deep, #a08456)', fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            <i className="ti ti-calculator" style={{ fontSize: 13 }} aria-hidden="true"></i>
            {metaMensal ? 'Ajustar em Previsibilidade →' : 'Definir em Previsibilidade →'}
          </button>
        </div>

        {metaMensal ? (
          <>
            <div style={{
              height: 12, borderRadius: 6, background: 'var(--bg3, #eae4dc)',
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', width: `${pctMeta}%`,
                background: pctMeta >= 100
                  ? 'linear-gradient(90deg, var(--green) 0%, #5a8f30 100%)'
                  : 'linear-gradient(90deg, var(--amber) 0%, var(--gold-deep, #a08456) 100%)',
                borderRadius: 6, transition: 'width .4s ease',
              }} />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 8,
              fontSize: 13, color: 'var(--text2)',
            }}>
              {ocultarMeta ? (
                <>
                  <span>•••• de ••••</span>
                  <span style={{ color: 'var(--text3)' }}>—</span>
                </>
              ) : (
                <>
                  <span>
                    <strong>{brl(receitaMes)}</strong> de {brl(metaMensal)}
                  </span>
                  <span style={{ color: pctMeta >= 100 ? 'var(--green)' : 'var(--text3)' }}>
                    {pctMeta >= 100
                      ? `✓ meta superada em ${brl(receitaMes - metaMensal)}`
                      : `faltam ${brl(faltaMeta)} · ${Math.round(pctMeta)}%`}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--text3)' }}>
            Calcule sua meta mensal em <strong>Previsibilidade</strong> — a partir de gastos fixos,
            ticket médio e horas disponíveis. Aqui mostramos o progresso real.
          </div>
        )}
      </div>

      {/* ─── ALERTAS DA SEMANA ─── */}
      <div className="section-label" style={{ marginTop: 8 }}>Atenção esta semana</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10, marginBottom: 18,
      }}>
        <NotifCard
          icon="clipboard-check"
          color="var(--orange)"
          titulo="Check-ins pendentes"
          count={checkinsPendentes.length}
          descricao={checkinsPendentes.length === 0
            ? 'Tudo respondido ✓'
            : `${checkinsPendentes.length} paciente${checkinsPendentes.length === 1 ? '' : 's'} ainda não respondeu`}
          itens={checkinsPendentes.slice(0, 3).map(c => ({
            label: c.paciente?.nome ?? '—',
            sub: `enviado ${dataBR(c.enviado_em)}`,
          }))}
          onClick={() => navigate('/nutri/checkins')}
        />

        <NotifCard
          icon="calendar"
          color="var(--blue)"
          titulo="Consultas da semana"
          count={consultasSemana.length}
          descricao={consultasSemana.length === 0
            ? 'Agenda livre'
            : `${consultasSemana.length} agendada${consultasSemana.length === 1 ? '' : 's'}`}
          itens={consultasSemana.slice(0, 3).map(c => ({
            label: c.paciente?.nome ?? '—',
            sub: new Date(c.data_hora).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''),
          }))}
          onClick={() => navigate('/nutri/agenda')}
        />

        <NotifCard
          icon="cash"
          color={atrasadas > 0 ? 'var(--red)' : 'var(--green)'}
          titulo="Cobranças até domingo"
          count={parcelasSemana.length}
          descricao={parcelasSemana.length === 0
            ? 'Sem cobranças pendentes'
            : `${brl(totalParcelas)} a receber${atrasadas > 0 ? ` · ${atrasadas} em atraso` : ''}`}
          itens={parcelasSemana.slice(0, 3).map(p => ({
            label: p.venda?.paciente?.nome ?? 'Avulso',
            sub: `${brl(p.valor)} · venc. ${dataBR(p.vencimento)}${statusParcela(p) === 'atrasado' ? ' ⚠️' : ''}`,
          }))}
          onClick={() => navigate('/nutri/financeiro')}
        />

        <NotifCard
          icon="alert-triangle"
          color="var(--gold-deep, #a08456)"
          titulo="Planos terminando"
          count={planosTerminando.length}
          descricao={planosTerminando.length === 0
            ? 'Nenhum plano próximo do fim'
            : `${planosTerminando.length} paciente${planosTerminando.length === 1 ? '' : 's'} para renovar`}
          itens={planosTerminando.slice(0, 3).map(p => ({
            label: p.nome,
            sub: p.vencido
              ? `Plano ${p.tipo_plano} vencido (${p.feitas}/${p.esperado})`
              : `${p.feitas}/${p.esperado} consultas · faltam ${p.restam}`,
          }))}
          onClick={() => navigate('/nutri/pacientes')}
        />
      </div>

      {/* ─── ALERTAS RELACIONAIS ─── */}
      {alertasRelacionais.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 8 }}>
            Acompanhamento das pacientes
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10, marginBottom: 18,
          }}>
            {alertasRelacionais.map((a, i) => (
              <button key={i}
                onClick={() => navigate(`/nutri/pacientes/${a.paciente_id}`)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: 14, borderRadius: 12,
                  background: 'var(--white)',
                  border: `0.5px solid var(--border)`,
                  borderLeft: `3px solid ${a.cor}`,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all .15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)', marginBottom: 2 }}>
                    {a.titulo}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {a.descricao}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text3)', marginTop: 4 }} aria-hidden="true"></i>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Estado de boas-vindas se zero pacientes */}
      {!carregando && pacientes.length === 0 && (
        <div className="card empty-card">
          <i className="ti ti-sparkles empty-icon" style={{ color: 'var(--amber)' }} aria-hidden="true"></i>
          <div className="empty-title">Bem-vinda ao seu painel</div>
          <div className="empty-sub">
            Comece cadastrando seus serviços e suas primeiras pacientes. Tudo o que você registrar
            aparecerá aqui como um resumo do seu consultório.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn-outline" onClick={() => navigate('/nutri/servicos')}>
              <i className="ti ti-settings" aria-hidden="true"></i> Cadastrar serviços
            </button>
            <button className="btn" onClick={() => navigate('/nutri/cadastrar')}>
              <i className="ti ti-user-plus" aria-hidden="true"></i> Cadastrar paciente
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   CARD DE NOTIFICAÇÃO
   ============================================================ */
function NotifCard({ icon, color, titulo, count, descricao, itens, onClick }) {
  const ativo = count > 0;
  return (
    <button onClick={onClick}
      style={{
        background: 'var(--white)',
        border: '0.5px solid ' + (ativo ? color : 'var(--border)'),
        borderRadius: 8,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'transform .15s, box-shadow .15s',
        boxShadow: ativo ? `0 1px 0 ${color}` : 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,.04)`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ativo ? `0 1px 0 ${color}` : 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: ativo ? color + '15' : 'var(--bg2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`ti ti-${icon}`} style={{ fontSize: 18, color: ativo ? color : 'var(--text3)' }} aria-hidden="true"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
            {titulo}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: ativo ? color : 'var(--text3)', lineHeight: 1, marginTop: 2 }}>
            {count}
          </div>
        </div>
        <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
      </div>
      <div style={{ fontSize: 13, color: ativo ? 'var(--text2)' : 'var(--text3)', marginBottom: itens.length > 0 ? 8 : 0 }}>
        {descricao}
      </div>
      {itens.length > 0 && (
        <div style={{ borderTop: '0.5px solid #f5f0e8', paddingTop: 8 }}>
          {itens.map((it, i) => (
            <div key={i} style={{
              fontSize: 12, color: 'var(--text2)',
              padding: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 6,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{it.sub}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
