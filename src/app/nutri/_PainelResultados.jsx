import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { dataLocalISO, partesLocaisISO } from '../../lib/utils.js';
import {
  DIAS_PARA_ADERIR, somaDias, resumirPeso, resumirAdesao, resumirCheckins, novasNoMes,
} from '../../lib/resultadosClinicos.js';

/* ============================================================
   RESULTADOS DAS PACIENTES (Visão geral)

   Componente independente: busca o que precisa, calcula com
   src/lib/resultadosClinicos.js e só mostra. Se qualquer consulta falhar, o
   resto da Visão geral continua como está — aqui aparece só um aviso discreto.

   Só leitura. Não grava nada.
   ============================================================ */

const PAGINA = 1000;          // limite de linhas por chamada da API
const MAX_NA_LISTA = 8;       // "sem registro" mostra no máximo estas

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

const kg = (n) => {
  if (n == null) return '—';
  const s = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s} kg`;
};
const pct = (n) => {
  if (n == null) return '—';
  const s = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}%`;
};

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

        const [pesos, habitos, suplementos, pratos, envios] = await Promise.all([
          buscarTudo(() => supabase.from('peso_registros').select('id, paciente_id, data, kg').in('paciente_id', ids)),
          // Hábito registrado com valor 0 é "não fiz": não conta como adesão.
          buscarTudo(() => supabase.from('habitos_logs').select('id, paciente_id, data, valor').in('paciente_id', ids).gte('data', dia30)),
          buscarTudo(() => supabase.from('suplementos_logs').select('id, paciente_id, data').in('paciente_id', ids).eq('tomado', true).gte('data', dia30)),
          buscarTudo(() => supabase.from('feed_pratos').select('id, paciente_id, created_at').in('paciente_id', ids).gte('created_at', instante30)),
          buscarTudo(() => supabase.from('checkin_envios').select('id, paciente_id, enviado_em, respondido_em').eq('nutri_id', nutriId).gte('enviado_em', instante30)),
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
      <div style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 14px' }}>
        Não consegui carregar os resultados das pacientes agora. O resto da tela continua normal.
      </div>
    );
  }
  if (dados === null || dados.vazio) return null;

  const { peso, adesao, checkins, novas } = dados;
  const { trinta, inicio } = peso;

  return (
    <section style={{ marginBottom: 18 }} aria-label="Resultados das pacientes">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>
          Resultados das pacientes
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Card
          titulo="Perderam peso · 30 dias"
          valor={trinta.comDados ? `${trinta.perdendo} de ${trinta.comDados}` : '—'}
          linhas={trinta.comDados
            ? [
              `Média ${kg(trinta.mediaKg)} (${pct(trinta.mediaPct)})`,
              `${trinta.mantendo} mantiveram · ${trinta.ganhando} ganharam`,
              trinta.semDados ? `${trinta.semDados} sem pesagens suficientes` : null,
            ]
            : ['Sem pesagens suficientes ainda']}
        />
        <Card
          titulo="Perderam peso · desde o início"
          valor={inicio.comDados ? `${inicio.perdendo} de ${inicio.comDados}` : '—'}
          linhas={inicio.comDados
            ? [
              `Média ${kg(inicio.mediaKg)} (${pct(inicio.mediaPct)})`,
              `${inicio.mantendo} mantiveram · ${inicio.ganhando} ganharam`,
              inicio.semDados ? `${inicio.semDados} sem pesagens suficientes` : null,
            ]
            : ['Sem pesagens suficientes ainda']}
        />
        <Card
          titulo="Aderindo bem"
          valor={adesao.pct == null ? '—' : `${adesao.pct}%`}
          linhas={adesao.pct == null
            ? ['Ninguém elegível ainda']
            : [`${adesao.aderindo} de ${adesao.base} pacientes`, `Registro em ${DIAS_PARA_ADERIR}+ dos últimos 7 dias`]}
        />
        <Card
          titulo="Check-ins respondidos"
          valor={checkins.pct == null ? '—' : `${checkins.pct}%`}
          linhas={checkins.pct == null
            ? ['Sem check-ins nos últimos 30 dias']
            : [`${checkins.respondidos} de ${checkins.enviados}`, 'Últimos 30 dias']}
        />
        <Card
          titulo="Novas no mês"
          valor={String(novas)}
          linhas={[novas === 1 ? 'paciente cadastrada' : 'pacientes cadastradas']}
        />
      </div>

      {adesao.semRegistro.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500, marginBottom: 6 }}>
            Sem nenhum registro nos últimos 7 dias · {adesao.semRegistro.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {adesao.semRegistro.slice(0, MAX_NA_LISTA).map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/nutri/pacientes/${p.id}`, { state: { from: '/nutri', label: 'Visão geral' } })}
                style={{
                  background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 999,
                  padding: '4px 10px', fontSize: 12, color: 'var(--dark)', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {p.nome}
                <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
                  {p.diasDesde == null ? 'há +30 dias' : `há ${p.diasDesde} dias`}
                </span>
              </button>
            ))}
            {adesao.semRegistro.length > MAX_NA_LISTA && (
              <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>
                e mais {adesao.semRegistro.length - MAX_NA_LISTA}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>
        Peso: só pacientes em Emagrecimento (oncologia fica de fora, o foco é função e força).
        Adesão conta pratos, hábitos, suplementos tomados e check-ins respondidos; quem ainda não
        tem acesso ao app ou entrou há menos de 7 dias não entra na conta.
      </div>
    </section>
  );
}

function Card({ titulo, valor, linhas }) {
  return (
    <div className="stat">
      <div className="stat-lbl">{titulo}</div>
      <div className="stat-val">{valor}</div>
      {linhas.filter(Boolean).map((l, i) => (
        <div key={i} className="stat-diff">{l}</div>
      ))}
    </div>
  );
}
