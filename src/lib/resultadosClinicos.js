/* ============================================================
   RESULTADOS CLÍNICOS DA VISÃO GERAL

   Funções PURAS: recebem os dados e a data de hoje ('YYYY-MM-DD') e nunca
   leem o relógio nem o banco, para o teste fixar o instante.

   Toda conta de data é feita sobre strings 'YYYY-MM-DD' com Date.UTC, sem
   fuso: somar/subtrair dias de um dia de calendário não depende do aparelho.

   Regras (combinadas com a Kelly em 23/10/2026):
     - Aderindo bem = registrou algo em pelo menos 4 dos últimos 7 dias
       (hoje incluído). "Registrar algo" = prato no feed, hábito, suplemento
       tomado ou check-in respondido. Mensagem de chat NÃO conta.
     - Peso: duas progressões, "últimos 30 dias" e "desde o início", só para
       quem tem objetivo Emagrecimento. Oncologia fica de fora de propósito:
       o foco delas é função e força, nunca meta de peso.
   ============================================================ */

const MS_DIA = 86_400_000;

/** Dias mínimos de registro, nos últimos 7, para contar como "aderindo bem". */
export const DIAS_PARA_ADERIR = 4;
/** Variação de peso (kg) abaixo da qual a paciente conta como "manteve". */
export const TOLERANCIA_KG = 0.1;

function partes(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** 'YYYY-MM-DD' somado de n dias (n pode ser negativo). */
export function somaDias(iso, n) {
  const [y, m, d] = partes(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dias de calendário de a até b (b − a). */
export function diasEntre(a, b) {
  const [ya, ma, da] = partes(a);
  const [yb, mb, db] = partes(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / MS_DIA);
}

const ehData = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

/** Só quem tem objetivo Emagrecimento exato — mesmo critério de Pacientes.jsx. */
export function ehEmagrecimento(p) {
  return (p?.objetivo ?? '').trim() === 'Emagrecimento';
}

/**
 * Registros de peso válidos: ordenados por data, no máximo um por dia (o último
 * da lista vence) e sem datas futuras.
 */
function pesosValidos(registros, hoje) {
  const porDia = new Map();
  for (const r of registros ?? []) {
    const kg = Number(r?.kg);
    if (!ehData(r?.data) || !Number.isFinite(kg) || kg <= 0) continue;
    const dia = r.data.slice(0, 10);
    if (dia > hoje) continue;
    porDia.set(dia, kg);
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([data, kg]) => ({ data, kg }));
}

export function statusDoPeso(deltaKg) {
  if (deltaKg < -TOLERANCIA_KG) return 'perdeu';
  if (deltaKg > TOLERANCIA_KG) return 'ganhou';
  return 'manteve';
}

/**
 * Progressão de peso de UMA paciente.
 *   janelaDias = 30   → compara o peso mais recente (dentro dos 30 dias) com o
 *                       peso de 30 dias atrás: o último registro até esse dia
 *                       ou, se não houver, o primeiro dentro da janela.
 *   janelaDias = null → primeiro registro × último registro.
 * Devolve null quando não há dois registros em dias diferentes.
 */
export function progressaoPeso(registros, hoje, janelaDias = null) {
  const v = pesosValidos(registros, hoje);
  if (v.length < 2) return null;

  let base;
  let atual;
  if (janelaDias == null) {
    base = v[0];
    atual = v[v.length - 1];
  } else {
    const corte = somaDias(hoje, -janelaDias);
    const naJanela = v.filter((r) => r.data >= corte);
    if (naJanela.length === 0) return null;
    atual = naJanela[naJanela.length - 1];
    const antes = v.filter((r) => r.data <= corte);
    base = antes.length ? antes[antes.length - 1] : naJanela[0];
  }
  if (base.data >= atual.data) return null;

  const deltaKg = Math.round((atual.kg - base.kg) * 100) / 100;
  return {
    deltaKg,
    pct: Math.round((deltaKg / base.kg) * 1000) / 10,
    dias: diasEntre(base.data, atual.data),
    status: statusDoPeso(deltaKg),
  };
}

function agregarPeso(progressoes) {
  const com = progressoes.filter(Boolean);
  const conta = (s) => com.filter((x) => x.status === s).length;
  const media = (campo) => (com.length
    ? Math.round((com.reduce((a, x) => a + x[campo], 0) / com.length) * 10) / 10
    : null);
  return {
    total: progressoes.length,
    comDados: com.length,
    semDados: progressoes.length - com.length,
    perdendo: conta('perdeu'),
    mantendo: conta('manteve'),
    ganhando: conta('ganhou'),
    mediaKg: media('deltaKg'),
    mediaPct: media('pct'),
  };
}

/**
 * Peso das pacientes em Emagrecimento nas duas janelas.
 * pesosPorPaciente: Map(id → [{data, kg}]).
 */
export function resumirPeso(pacientes, pesosPorPaciente, hoje) {
  const grupo = (pacientes ?? []).filter(ehEmagrecimento);
  const regs = (p) => pesosPorPaciente.get(p.id) ?? [];
  return {
    trinta: agregarPeso(grupo.map((p) => progressaoPeso(regs(p), hoje, 30))),
    inicio: agregarPeso(grupo.map((p) => progressaoPeso(regs(p), hoje, null))),
  };
}

/**
 * Adesão: quem registrou algo em pelo menos DIAS_PARA_ADERIR dos últimos 7 dias.
 *
 * Fora da conta, porque não tinham como registrar ainda:
 *   - sem acesso ao app (user_id vazio);
 *   - cadastradas há menos de 7 dias (em adaptação).
 *
 * diasPorPaciente: Map(id → Set('YYYY-MM-DD')) com os dias de registro.
 * semRegistro: quem não registrou NADA nos últimos 7 dias; `diasDesde` é há
 * quantos dias foi o último registro, ou null se não há nenhum na janela dos
 * dados carregados (30 dias).
 */
export function resumirAdesao(pacientes, diasPorPaciente, hoje) {
  const inicio7 = somaDias(hoje, -6);
  const elegiveis = (pacientes ?? []).filter((p) => {
    if (!p.user_id) return false;
    if (ehData(p.created_at) && diasEntre(p.created_at.slice(0, 10), hoje) < 7) return false;
    return true;
  });

  let aderindo = 0;
  const semRegistro = [];
  for (const p of elegiveis) {
    const dias = diasPorPaciente.get(p.id) ?? new Set();
    const nos7 = [...dias].filter((d) => d >= inicio7 && d <= hoje).length;
    if (nos7 >= DIAS_PARA_ADERIR) aderindo += 1;
    if (nos7 === 0) {
      const ultimo = [...dias].filter((d) => d <= hoje).sort().pop();
      semRegistro.push({ id: p.id, nome: p.nome, diasDesde: ultimo ? diasEntre(ultimo, hoje) : null });
    }
  }
  // Maior tempo sem registrar primeiro; quem não tem nenhum na janela vem antes de todos.
  semRegistro.sort((a, b) => {
    const da = a.diasDesde ?? Infinity;
    const db = b.diasDesde ?? Infinity;
    if (da !== db) return db - da;
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', { sensitivity: 'base' });
  });

  return {
    base: elegiveis.length,
    aderindo,
    pct: elegiveis.length ? Math.round((aderindo / elegiveis.length) * 100) : null,
    semRegistro,
  };
}

/**
 * Check-ins dos últimos 30 dias. Um envio entra na conta se já foi respondido
 * ou se foi enviado há 2 dias ou mais — o que acabou de sair ainda está no
 * prazo e não pode derrubar o percentual.
 * envios: [{ enviadoDia: 'YYYY-MM-DD', respondido: boolean }]
 */
export function resumirCheckins(envios, hoje) {
  const corte = somaDias(hoje, -30);
  const limite = somaDias(hoje, -2);
  const conta = (envios ?? []).filter((e) =>
    ehData(e?.enviadoDia) && e.enviadoDia >= corte && e.enviadoDia <= hoje
    && (e.respondido || e.enviadoDia <= limite));
  const respondidos = conta.filter((e) => e.respondido).length;
  return {
    enviados: conta.length,
    respondidos,
    pct: conta.length ? Math.round((respondidos / conta.length) * 100) : null,
  };
}

/** Pacientes cadastradas no mês corrente (hoje = 'YYYY-MM-DD'). */
export function novasNoMes(pacientes, hoje) {
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  return (pacientes ?? []).filter((p) => ehData(p.created_at) && p.created_at.slice(0, 10) >= inicioMes).length;
}
