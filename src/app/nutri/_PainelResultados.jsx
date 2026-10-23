import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { dataLocalISO, partesLocaisISO, iniciais } from '../../lib/utils.js';
import {
  DIAS_PARA_ADERIR, somaDias, resumirPeso, resumirAdesao, resumirCheckins, novasNoMes, nomeCurto,
} from '../../lib/resultadosClinicos.js';

/* ============================================================
   RESULTADOS DAS PACIENTES (Visão geral)

   Duas partes:
     - PainelResultados      busca os dados e calcula (src/lib/resultadosClinicos.js);
     - PainelResultadosView  só desenha, a partir do resultado já calculado.

   Independente do resto da Visão: se qualquer consulta falhar, aparece só um
   aviso discreto e o restante da tela continua normal. Só leitura.

   Estilos: .res-* em src/styles/nutri.css (paleta Essentia: creme, areia,
   dourado e o marrom do cartão de destaque).
   ============================================================ */

const PAGINA = 1000;          // limite de linhas por chamada da API
const MAX_NA_LISTA = 10;      // "sem registro" mostra no máximo estas

/** Todas as linhas de uma consulta, em páginas. `montar` devolve a query SEM range. */
async function buscarTudo(montar) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().order('id').range(de, de + PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return linhas;
}

function agrupar(linhas, chave, valor) {
  const m = new Map();
  for (const l of linhas) {
    const k = l[chave];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(valor(l));
  }
  return m;
}

const fmt1 = (n) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sinal = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
const kg = (n) => (n == null ? '—' : `${sinal(n)}${fmt1(n)} kg`);
const pct = (n) => (n == null ? '—' : `${sinal(n)}${fmt1(n)}%`);

export default function PainelResultados({ nutriId }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);     // null = carregando
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!nutriId) return undefined;
    let vivo = true;
    (async () => {
      try {
        const hoje = dataLocalISO();
        const dia30 = somaDias(hoje, -30);
        // Instante de corte dos timestamptz: 30 dias atrás, meia-noite de Belém (UTC-3).
        const instante30 = `${dia30}T03:00:00.000Z`;

        const { data: pacs, error: ePac } = await supabase
          .from('pacientes')
          .select('id, nome, objetivo, created_at, user_id')
          .eq('nutri_id', nutriId)
          .eq('status_paciente', 'ativo');
        if (ePac) throw ePac;
        const ativas = (pacs ?? []).map((p) => ({
          ...p,
          // created_at é timestamptz: leva pro dia da clínica antes de contar dias.
          created_at: p.created_at ? partesLocaisISO(p.created_at).data : null,
        }));
        const ids = ativas.map((p) => p.id);
        if (ids.length === 0) { if (vivo) setDados({ vazio: true }); return; }

        const [pesos, habitos, suplementos, pratos, envios, monitoramento, treinos] = await Promise.all([
          buscarTudo(() => supabase.from('peso_registros').select('id, paciente_id, data, kg').in('paciente_id', ids)),
          // Hábito registrado com valor 0 é "não fiz": não conta como adesão.
          buscarTudo(() => supabase.from('habitos_logs').select('id, paciente_id, data, valor').in('paciente_id', ids).gte('data', dia30)),
          buscarTudo(() => supabase.from('suplementos_logs').select('id, paciente_id, data').in('paciente_id', ids).eq('tomado', true).gte('data', dia30)),
          buscarTudo(() => supabase.from('feed_pratos').select('id, paciente_id, created_at').in('paciente_id', ids).gte('created_at', instante30)),
          buscarTudo(() => supabase.from('checkin_envios').select('id, paciente_id, enviado_em, respondido_em').eq('nutri_id', nutriId).gte('enviado_em', instante30)),
          // "Como você está hoje" (oncologia): um registro por dia.
          buscarTudo(() => supabase.from('monitoramento_oncologico').select('id, paciente_id, data').in('paciente_id', ids).gte('data', dia30)),
          buscarTudo(() => supabase.from('treinos_registros').select('id, paciente_id, data_execucao').in('paciente_id', ids).gte('data_execucao', instante30)),
        ]);

        // Dias com algum registro, por paciente.
        const diasPorPaciente = new Map();
        const marcar = (id, dia) => {
          if (!id || !dia) return;
          if (!diasPorPaciente.has(id)) diasPorPaciente.set(id, new Set());
          diasPorPaciente.get(id).add(dia);
        };
        for (const h of habitos) if (Number(h.valor) > 0) marcar(h.paciente_id, h.data);
        for (const s of suplementos) marcar(s.paciente_id, s.data);
        for (const f of pratos) marcar(f.paciente_id, partesLocaisISO(f.created_at).data);
        for (const e of envios) if (e.respondido_em) marcar(e.paciente_id, partesLocaisISO(e.respondido_em).data);
        for (const m of monitoramento) marcar(m.paciente_id, m.data);
        for (const t of treinos) marcar(t.paciente_id, partesLocaisISO(t.data_execucao).data);

        const resultado = {
          vazio: false,
          peso: resumirPeso(ativas, agrupar(pesos, 'paciente_id', (r) => ({ data: r.data, kg: r.kg })), hoje),
          adesao: resumirAdesao(ativas, diasPorPaciente, hoje),
          checkins: resumirCheckins(
            envios.map((e) => ({ enviadoDia: partesLocaisISO(e.enviado_em).data, respondido: !!e.respondido_em })),
            hoje,
          ),
          novas: novasNoMes(ativas, hoje),
        };
        if (vivo) setDados(resultado);
      } catch {
        if (vivo) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
  }, [nutriId]);

  if (falhou) {
    return (
      <div className="res-aviso">
        Não consegui carregar os resultados das pacientes agora. O resto da tela continua normal.
      </div>
    );
  }
  if (dados?.vazio) return null;

  return (
    <PainelResultadosView
      dados={dados}
      onAbrirPaciente={(id) => navigate(`/nutri/pacientes/${id}`, { state: { from: '/nutri', label: 'Visão geral' } })}
    />
  );
}

/* ─────────────────────────  parte visual  ───────────────────────── */

export function PainelResultadosView({ dados, onAbrirPaciente }) {
  const carregando = dados == null;

  return (
    <section className="res" aria-label="Resultados das pacientes">
      <header className="res-cab">
        <h2 className="res-titulo">Resultados das pacientes</h2>
        <span className="res-sub">Peso em 30 dias e desde o início · adesão na última semana</span>
      </header>

      {carregando ? <Esqueleto /> : <Corpo dados={dados} onAbrirPaciente={onAbrirPaciente} />}
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="res-grade" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className="res-card res-esq" />)}
    </div>
  );
}

function Corpo({ dados, onAbrirPaciente }) {
  const { peso, adesao, checkins, novas } = dados;
  const { trinta, inicio } = peso;
  const semRegistro = adesao.semRegistro;

  return (
    <>
      <div className="res-grade">
        <CartaoPeso destaque icone="trending-down" titulo="Peso · últimos 30 dias" r={trinta} />
        <CartaoPeso icone="flag" titulo="Peso · desde o início" r={inicio} />

        <div className="res-card">
          <Cab icone="circle-check" titulo="Aderindo bem" />
          <div className="res-anel-linha">
            <Anel valor={adesao.pct} cor="#a08456" rotulo="Adesão" />
            <div className="res-anel-texto">
              {adesao.pct == null
                ? <span>Ninguém elegível ainda</span>
                : (
                  <>
                    <strong>{adesao.aderindo} de {adesao.base}</strong>
                    <span>pacientes com registro em {DIAS_PARA_ADERIR}+ dos últimos 7 dias</span>
                  </>
                )}
            </div>
          </div>
        </div>

        <div className="res-card">
          <Cab icone="clipboard-check" titulo="Check-ins respondidos" />
          <div className="res-anel-linha">
            <Anel valor={checkins.pct} cor="#7a4f3b" rotulo="Check-ins respondidos" />
            <div className="res-anel-texto">
              {checkins.pct == null
                ? <span>Sem check-ins nos últimos 30 dias</span>
                : (
                  <>
                    <strong>{checkins.respondidos} de {checkins.enviados}</strong>
                    <span>enviados nos últimos 30 dias</span>
                  </>
                )}
            </div>
          </div>
        </div>
      </div>

      <div className="res-grade res-grade-2">
        <div className="res-card res-largo">
          <Cab
            icone="bell-off"
            titulo="Sem nenhum registro nos últimos 7 dias"
            contagem={semRegistro.length}
          />
          {semRegistro.length === 0 ? (
            <p className="res-vazio">
              {adesao.base === 0
                ? 'Ninguém elegível ainda: falta paciente com acesso ao app há mais de 7 dias.'
                : 'Todas as pacientes com acesso registraram algo nesta semana.'}
            </p>
          ) : (
            <div className="res-chips">
              {semRegistro.slice(0, MAX_NA_LISTA).map((p) => (
                <button key={p.id} type="button" className="res-chip" onClick={() => onAbrirPaciente?.(p.id)}>
                  <span className="res-avatar" aria-hidden="true">{iniciais(p.nome)}</span>
                  <span className="res-chip-nome">{nomeCurto(p.nome)}</span>
                  <span className="res-chip-dias">{p.diasDesde == null ? 'há +30 dias' : `há ${p.diasDesde} dias`}</span>
                </button>
              ))}
              {semRegistro.length > MAX_NA_LISTA && (
                <span className="res-mais">e mais {semRegistro.length - MAX_NA_LISTA}</span>
              )}
            </div>
          )}
        </div>

        <div className="res-card res-novas">
          <Cab icone="user-plus" titulo="Novas no mês" />
          <div className="res-valor">{novas}</div>
          <div className="res-leg">{novas === 1 ? 'paciente cadastrada' : 'pacientes cadastradas'}</div>
        </div>
      </div>

      <details className="res-como">
        <summary>Como isso é calculado</summary>
        <ul>
          <li>Peso: só pacientes em Emagrecimento. Oncologia fica de fora, o foco é função e força.</li>
          <li>Adesão: registro em {DIAS_PARA_ADERIR} ou mais dos últimos 7 dias. Conta prato no feed, hábito, suplemento tomado, treino, “como estou hoje” e check-in respondido. Conversa no chat não conta.</li>
          <li>Ficam fora da adesão quem ainda não tem acesso ao app e quem foi cadastrada há menos de 7 dias.</li>
          <li>Check-in enviado há menos de 2 dias ainda está no prazo e não entra no percentual.</li>
          <li>“Manteve” é variação de até 0,1 kg.</li>
        </ul>
      </details>
    </>
  );
}

function Cab({ icone, titulo, contagem }) {
  return (
    <div className="res-cab-card">
      <span className="res-icone" aria-hidden="true"><i className={`ti ti-${icone}`} /></span>
      <span className="res-rotulo">{titulo}</span>
      {contagem != null && <span className="res-contagem">{contagem}</span>}
    </div>
  );
}

function CartaoPeso({ destaque, icone, titulo, r }) {
  const sem = r.comDados === 0;
  return (
    <div className={`res-card${destaque ? ' res-destaque' : ''}`}>
      <Cab icone={icone} titulo={titulo} />
      {sem ? (
        <>
          <div className="res-valor">—</div>
          <div className="res-leg">Sem pesagens suficientes ainda</div>
        </>
      ) : (
        <>
          <div className="res-valor">
            {r.perdendo} <span className="res-de">de {r.comDados}</span>
          </div>
          <div className="res-leg">perderam peso</div>
          <div className="res-leg">
            Média {kg(r.mediaKg)} <span className="res-leg-suave">({pct(r.mediaPct)})</span>
          </div>
          <div
            className="res-seg"
            role="img"
            aria-label={`${r.perdendo} perderam, ${r.mantendo} mantiveram, ${r.ganhando} ganharam`}
          >
            {r.perdendo > 0 && <span className="res-seg-perdeu" style={{ flexGrow: r.perdendo }} />}
            {r.mantendo > 0 && <span className="res-seg-manteve" style={{ flexGrow: r.mantendo }} />}
            {r.ganhando > 0 && <span className="res-seg-ganhou" style={{ flexGrow: r.ganhando }} />}
          </div>
          <div className="res-legenda">
            {r.perdendo > 0 && <span><i className="res-pt res-pt-perdeu" />{r.perdendo} perderam</span>}
            {r.mantendo > 0 && <span><i className="res-pt res-pt-manteve" />{r.mantendo} mantiveram</span>}
            {r.ganhando > 0 && <span><i className="res-pt res-pt-ganhou" />{r.ganhando} ganharam</span>}
          </div>
          {r.semDados > 0 && (
            <div className="res-nota">{r.semDados} sem pesagens suficientes</div>
          )}
        </>
      )}
    </div>
  );
}

/** Anel de progresso. valor = 0–100 ou null (sem dados). */
function Anel({ valor, cor, rotulo }) {
  const R = 30;
  const circ = 2 * Math.PI * R;
  const v = valor == null ? 0 : Math.max(0, Math.min(100, valor));
  const faltando = circ * (1 - v / 100);
  return (
    <div className="res-anel" role="img" aria-label={valor == null ? `${rotulo}: sem dados` : `${rotulo}: ${valor}%`}>
      <svg viewBox="0 0 72 72" width="84" height="84" aria-hidden="true">
        <circle cx="36" cy="36" r={R} fill="none" stroke="#efe7da" strokeWidth="7" />
        {valor != null && v > 0 && (
          <circle
            className="res-anel-arco"
            cx="36" cy="36" r={R} fill="none" stroke={cor} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={faltando}
            style={{ '--circ': circ }}
            transform="rotate(-90 36 36)"
          />
        )}
      </svg>
      <span className="res-anel-num">{valor == null ? '—' : `${valor}%`}</span>
    </div>
  );
}
