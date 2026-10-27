/* ============================================================
   EVOLUÇÃO DAS AVALIAÇÕES (aba Evolução da nutri)

   Funções PURAS sobre 'YYYY-MM-DD' (Date.UTC, sem fuso do aparelho).

   Regras:
     - O "início" de CADA métrica é o primeiro registro que tem aquela métrica
       (não o primeiro registro da paciente): peso e % de gordura podem ter
       começado em avaliações diferentes.
     - Avaliações marcadas como "ignorar" saem de todas as contas, mas não são
       apagadas.
     - "Conferir": salto improvável entre duas avaliações seguidas (limite por
       métrica, crescendo com os dias entre elas). É só um aviso — quem decide
       é a nutri.
   ============================================================ */

import { somaDias, diasEntre } from './resultadosClinicos.js';

/** melhorMenor: queda é o sentido desejado (null = sem sentido, cor neutra). */
export const METRICAS = {
  kg:         { rotulo: 'Peso',            unidade: 'kg', casas: 1, melhorMenor: true,  salto: [3, 0.25] },
  cintura_cm: { rotulo: 'Cintura',         unidade: 'cm', casas: 1, melhorMenor: true,  salto: [5, 0.25] },
  quadril_cm: { rotulo: 'Quadril',         unidade: 'cm', casas: 1, melhorMenor: null,  salto: [5, 0.25] },
  abdome_cm:  { rotulo: 'Abdome',           unidade: 'cm', casas: 1, melhorMenor: true,  salto: [5, 0.25] },
  panturrilha_cm: { rotulo: 'Panturrilha',  unidade: 'cm', casas: 1, melhorMenor: null,  salto: [3, 0.15] },
  mm_pct:     { rotulo: 'Massa magra (%)', unidade: '%',  casas: 1, melhorMenor: false, salto: [5, 0.3] },
  hidratacao_pct: { rotulo: 'Hidratação',   unidade: '%',  casas: 1, melhorMenor: null,  salto: [6, 0.3] },
  geb_kcal:   { rotulo: 'GEB',             unidade: 'kcal', casas: 0, melhorMenor: null, salto: [400, 10] },
  get_kcal:   { rotulo: 'GET',             unidade: 'kcal', casas: 0, melhorMenor: null, salto: [500, 12] },
  braco_cm:   { rotulo: 'Braço',           unidade: 'cm', casas: 1, melhorMenor: null,  salto: [4, 0.15] },
  coxa_cm:    { rotulo: 'Coxa',            unidade: 'cm', casas: 1, melhorMenor: null,  salto: [6, 0.25] },
  pgc:        { rotulo: '% de gordura',    unidade: '%',  casas: 1, melhorMenor: true,  salto: [3, 0.15] },
  gordura_kg: { rotulo: 'Gordura',         unidade: 'kg', casas: 1, melhorMenor: true,  salto: [3, 0.2] },
  mm_kg:      { rotulo: 'Massa magra',     unidade: 'kg', casas: 1, melhorMenor: false, salto: [2, 0.1] },
};

/** Variação (em kg) de massa magra que ainda conta como "manteve". */
export const TOLERANCIA_MASSA_MAGRA_KG = 0.3;

/** Número com vírgula: 100.5 → "100,5". null/NaN → "—". */
export function fmtNum(v, casas = 1) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '—';
  return n.toFixed(casas).replace('.', ',');
}

/** Valor com unidade colada à brasileira: "100,5 cm", "46,2%". */
export function fmtValor(campo, v) {
  const m = METRICAS[campo];
  if (!m) return fmtNum(v);
  const n = fmtNum(v, m.casas);
  if (n === '—') return n;
  return m.unidade === '%' ? `${n}%` : `${n} ${m.unidade}`;
}

/** Variação com sinal: "−3,2 kg", "+0,4%". Zero → "0,0 kg". */
export function fmtDelta(campo, dif) {
  const m = METRICAS[campo];
  const n = fmtNum(Math.abs(dif), m?.casas ?? 1);
  const un = !m ? '' : (m.unidade === '%' ? '%' : ` ${m.unidade}`);
  if (n === '—') return n;
  if (Math.round(Math.abs(dif) * 10 ** (m?.casas ?? 1)) === 0) return `${n}${un}`;
  return `${dif < 0 ? '−' : '+'}${n}${un}`;
}

/**
 * O Shaped (importado por IA) grava braço e coxa em braco_dir_cm / coxa_dir_cm;
 * braco_cm / coxa_cm são colunas antigas (mesma convenção do restante do app:
 * "dir" é a referência, a coluna antiga é o reserva). Esta função devolve as
 * avaliações com braco_cm e coxa_cm já resolvidos, para as telas lerem um só campo.
 */
export function normalizarAvaliacoes(avaliacoes) {
  const pega = (a, b) => (Number(a) > 0 ? a : b);
  return (avaliacoes ?? []).map((a) => ({
    ...a,
    braco_cm: pega(a?.braco_dir_cm, a?.braco_cm),
    coxa_cm: pega(a?.coxa_dir_cm, a?.coxa_cm),
  }));
}

const ehData = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

/**
 * Série de uma métrica: [{ id, data, valor }] por data, só valores > 0,
 * sem as avaliações ignoradas (Set de ids). Duas no mesmo dia → a última vence.
 */
export function serieDaMetrica(avaliacoes, campo, ignorados = new Set()) {
  const porDia = new Map();
  for (const a of avaliacoes ?? []) {
    if (!ehData(a?.data) || ignorados.has(a.id)) continue;
    const v = Number(a[campo]);
    if (!Number.isFinite(v) || v <= 0) continue;
    porDia.set(a.data.slice(0, 10), { id: a.id, data: a.data.slice(0, 10), valor: v });
  }
  return [...porDia.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
}

export const PERIODOS = {
  inicio: 'Desde o início',
  '30d': 'Últimos 30 dias',
  ultima: 'Desde a última avaliação',
};

/**
 * Compara o registro mais recente da série com a base do período.
 *   inicio → primeiro registro da série
 *   30d    → último registro até 30 dias ANTES do atual; se não houver, o
 *            primeiro da série (o `dias` devolvido mostra o intervalo real)
 *   ultima → registro imediatamente anterior
 * null se não há dois registros em dias diferentes.
 */
export function comparar(serie, periodo = 'inicio') {
  if (!serie || serie.length < 2) return null;
  const atual = serie[serie.length - 1];
  let base;
  if (periodo === 'ultima') {
    base = serie[serie.length - 2];
  } else if (periodo === '30d') {
    const corte = somaDias(atual.data, -30);
    const antes = serie.filter((r) => r.data <= corte);
    base = antes.length ? antes[antes.length - 1] : serie[0];
  } else {
    base = serie[0];
  }
  if (base.data >= atual.data) return null;
  return {
    base, atual,
    dif: Math.round((atual.valor - base.valor) * 100) / 100,
    dias: diasEntre(base.data, atual.data),
  };
}

/** Sentido da variação para colorir: 'bom' | 'ruim' | 'neutro'. */
export function sentidoDaVariacao(campo, dif, { pesoNeutro = false } = {}) {
  const m = METRICAS[campo];
  if (!m || m.melhorMenor == null || (campo === 'kg' && pesoNeutro)) return 'neutro';
  const casas = m.casas;
  if (Math.round(Math.abs(dif) * 10 ** casas) === 0) return 'neutro';
  const caiu = dif < 0;
  return (m.melhorMenor ? caiu : !caiu) ? 'bom' : 'ruim';
}

/**
 * Saltos improváveis. Devolve Map(id da avaliação → { campo, dif, dias, deData }).
 * A avaliação marcada é a MAIS RECENTE do par; se ela é um pico isolado
 * (sobe e desce de volta), só ela é marcada. Avaliações ignoradas não entram.
 */
export function detectarSuspeitas(avaliacoes, ignorados = new Set()) {
  const suspeitas = new Map();
  for (const [campo, m] of Object.entries(METRICAS)) {
    const s = serieDaMetrica(avaliacoes, campo, ignorados);
    const [base, porDia] = m.salto;
    const absurdo = (a, b) => Math.abs(b.valor - a.valor) > base + porDia * diasEntre(a.data, b.data);
    for (let i = 1; i < s.length; i++) {
      if (!absurdo(s[i - 1], s[i])) continue;
      const proximo = s[i + 1];
      const pico = proximo && absurdo(s[i], proximo)
        && Math.sign(s[i].valor - s[i - 1].valor) !== Math.sign(proximo.valor - s[i].valor);
      if (suspeitas.has(s[i].id)) continue;
      suspeitas.set(s[i].id, {
        campo,
        dif: Math.round((s[i].valor - s[i - 1].valor) * 100) / 100,
        dias: diasEntre(s[i - 1].data, s[i].data),
        deData: s[i - 1].data,
        deId: s[i - 1].id,
      });
      if (pico) i += 1; // o retorno do pico não é um segundo problema
    }
  }
  return suspeitas;
}

/**
 * Composição corporal em kg no período, só com avaliações que têm AS DUAS
 * medidas (gordura_kg e mm_kg), para comparar o mesmo par de datas.
 * status*: 'perdeu' | 'manteve' | 'ganhou'.
 */
export function composicaoCorporal(avaliacoes, periodo = 'inicio', ignorados = new Set()) {
  const completas = (avaliacoes ?? []).filter((a) =>
    Number(a?.gordura_kg) > 0 && Number(a?.mm_kg) > 0);
  const g = comparar(serieDaMetrica(completas, 'gordura_kg', ignorados), periodo);
  const mm = comparar(serieDaMetrica(completas, 'mm_kg', ignorados), periodo);
  if (!g || !mm) return null;
  const st = (dif, tol) => (dif < -tol ? 'perdeu' : dif > tol ? 'ganhou' : 'manteve');
  return {
    deData: g.base.data, ateData: g.atual.data, dias: g.dias,
    gorduraDif: g.dif, massaMagraDif: mm.dif,
    statusGordura: st(g.dif, 0.1),
    statusMassaMagra: st(mm.dif, TOLERANCIA_MASSA_MAGRA_KG),
  };
}

/** Frase da composição: "Perdeu 2,1 kg de gordura e manteve a massa magra." */
export function fraseComposicao(c) {
  if (!c) return null;
  const kg = (n) => fmtNum(Math.abs(n), 1);
  const g = c.statusGordura === 'perdeu' ? `Perdeu ${kg(c.gorduraDif)} kg de gordura`
    : c.statusGordura === 'ganhou' ? `Ganhou ${kg(c.gorduraDif)} kg de gordura`
      : 'Manteve a gordura';
  const m = c.statusMassaMagra === 'perdeu' ? `perdeu ${kg(c.massaMagraDif)} kg de massa magra`
    : c.statusMassaMagra === 'ganhou' ? `ganhou ${kg(c.massaMagraDif)} kg de massa magra`
      : 'manteve a massa magra';
  let liga = ' e ';
  if (c.statusGordura === 'perdeu' && c.statusMassaMagra === 'perdeu') liga = ' e também ';
  else if (c.statusGordura === 'manteve' && c.statusMassaMagra === 'perdeu') liga = ', mas ';
  return `${g}${liga}${m}.`;
}

/** Rótulos amigáveis do tipo de consulta (mesmos da Agenda). */
export function rotuloTipoConsulta(tipo) {
  if (!tipo) return 'Consulta realizada';
  if (tipo === 'primeira') return 'Primeira consulta';
  if (tipo === 'avaliacao') return 'Consulta de avaliação';
  if (tipo === 'retorno') return 'Consulta de retorno';
  if (tipo === 'avulsa') return 'Consulta avulsa';
  const m = String(tipo).match(/^consulta_(\d+)$/);
  if (m) return `Consulta ${String(m[1]).padStart(2, '0')}`;
  return 'Consulta realizada';
}

/** Descrição de uma avaliação na linha do tempo, com vírgula e sem lacunas. */
export function descricaoAvaliacao(a) {
  const partes = [
    Number(a?.kg) > 0 && fmtValor('kg', a.kg),
    Number(a?.cintura_cm) > 0 && `cintura ${fmtValor('cintura_cm', a.cintura_cm)}`,
    Number(a?.pgc) > 0 && `${fmtValor('pgc', a.pgc)} de gordura`,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Registrada';
}

/** Linha do plano publicado: "1.800 kcal · 5 refeições" ou "kcal não informada" quando falta. */
export function descricaoPlano(dados) {
  const kcal = Number(dados?.macros?.kcal);
  const ref = Array.isArray(dados?.refeicoes) ? dados.refeicoes.length : 0;
  const k = Number.isFinite(kcal) && kcal > 0 ? `${Math.round(kcal).toLocaleString('pt-BR')} kcal` : 'kcal não informada';
  return ref > 0 ? `${k} · ${ref} ${ref === 1 ? 'refeição' : 'refeições'}` : k;
}

/**
 * Resumo de um check-in respondido para a linha do tempo: quantas perguntas
 * foram respondidas + até 2 respostas de escala/slider (as mais legíveis).
 * `formatar(pergunta, valor)` é injetado (formatarResposta de checkinDefault).
 */
export function resumoCheckin(envio, formatar) {
  const perguntas = Array.isArray(envio?.perguntas) ? envio.perguntas : [];
  const respostas = envio?.respostas ?? {};
  const preenchida = (p) => {
    const v = respostas[p.id];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  };
  const respondidas = perguntas.filter(preenchida);
  const base = perguntas.length
    ? `${respondidas.length} de ${perguntas.length} perguntas respondidas`
    : 'Respondido';
  const destaques = respondidas
    .filter((p) => p.tipo === 'emoji_scale' || p.tipo === 'slider')
    .slice(0, 2)
    .map((p) => `${p.secao || p.pergunta}: ${formatar(p, respostas[p.id])}`);
  return [base, ...destaques].join(' · ');
}

// ─── Classificação do IMC por faixa etária ─────────────────────────────────
// Idade completa (anos) em `dataISO`, a partir de 'YYYY-MM-DD'. Sem data válida: null.
export function idadeEm(nascimento, dataISO) {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento ?? '');
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO ?? '');
  if (!n || !d) return null;
  let anos = Number(d[1]) - Number(n[1]);
  if (Number(d[2]) < Number(n[2]) || (Number(d[2]) === Number(n[2]) && Number(d[3]) < Number(n[3]))) anos -= 1;
  return anos >= 0 ? anos : null;
}

// Adulto (20–59 anos): OMS. Idoso (≥ 60 anos): Lipschitz (1994), a mesma adotada pelo
// SISVAN/Ministério da Saúde. Abaixo de 20 anos o IMC se classifica por percentil/escore-z
// (curvas da OMS), que não é calculado aqui: devolve null.
export function classificarImc(imc, idade) {
  if (!(imc > 0) || idade == null || idade < 20) return null;
  const v = Math.round(imc * 10) / 10;
  if (idade >= 60) {
    const faixa = v < 22 ? 'Baixo peso' : v <= 27 ? 'Eutrofia' : 'Sobrepeso';
    return { faixa, referencia: 'Idoso · Lipschitz' };
  }
  const faixa = v < 18.5 ? 'Baixo peso' : v < 25 ? 'Eutrofia' : v < 30 ? 'Sobrepeso'
    : v < 35 ? 'Obesidade grau I' : v < 40 ? 'Obesidade grau II' : 'Obesidade grau III';
  return { faixa, referencia: 'Adulto · OMS' };
}

/**
 * Confere avaliações AINDA NÃO SALVAS (importação do Shaped) contra o histórico.
 * `existentes`: avaliações já no banco (as com ignorar_calculo ficam de fora).
 * `novas`: [{ id, data, kg, cintura_cm, … }] com valores numéricos (ou null).
 * Devolve Map(id da nova → [mensagem]) só para as novas que entram num salto
 * improvável — mesma regra do aviso "conferir" da evolução. Não bloqueia nada:
 * quem decide é a nutricionista.
 */
export function conferirNovas(existentes, novas) {
  const base = normalizarAvaliacoes(existentes).filter((a) => !a.ignorar_calculo);
  const novasNorm = normalizarAvaliacoes(novas);
  const ids = new Set(novasNorm.map((n) => n.id));
  const todas = [...base, ...novasNorm];
  const porId = new Map(todas.map((a) => [a.id, a]));
  const avisos = new Map();
  for (const [id, s] of detectarSuspeitas(todas)) {
    const alvo = ids.has(id) ? id : ids.has(s.deId) ? s.deId : null;
    if (!alvo) continue;
    const m = METRICAS[s.campo];
    const de = porId.get(s.deId);
    const txt = `${m.rotulo}: ${fmtDelta(s.campo, s.dif)} em ${s.dias} dia${s.dias === 1 ? '' : 's'}`
      + (de ? ` em relação a ${de.data.slice(8, 10)}/${de.data.slice(5, 7)}/${de.data.slice(0, 4)}` : '');
    if (!avisos.has(alvo)) avisos.set(alvo, []);
    avisos.get(alvo).push(txt);
  }
  return avisos;
}
