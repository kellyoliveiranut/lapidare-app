/**
 * Acompanhamento da paciente a partir do que ela JÁ registra: o monitoramento diário
 * (monitoramento_oncologico) e o check-in semanal (checkin_envios). Nenhuma tela nova:
 * alimenta os cartões e as metas da tela de evolução.
 *
 * Regra de linguagem: só fatos ("N de 7 dias"), nunca "bom" ou "ruim", nunca meta
 * numérica e nunca peso. O que cada número significa clinicamente é da nutricionista.
 */
import { somaDias, diasEntre } from './resultadosClinicos.js';

const MOVIMENTO = new Set(['caminhei_casa', 'caminhei_fora', 'exercicio']);
const ehData = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const dia = (s) => String(s).slice(0, 10);

/** Registros dentro da janela [hoje − (dias − 1), hoje], um por data. */
function naJanela(registros, hoje, dias, deslocamento = 0) {
  const fim = somaDias(hoje, -deslocamento);
  const ini = somaDias(fim, -(dias - 1));
  const porData = new Map();
  for (const r of registros ?? []) {
    if (!ehData(r?.data)) continue;
    const d = dia(r.data);
    if (d >= ini && d <= fim) porData.set(d, r);
  }
  return [...porData.values()];
}

/** Dias em que registrou o monitoramento nos últimos `dias` dias. */
export function constancia(monit, hoje, dias = 14) {
  return { registrados: naJanela(monit, hoje, dias).length, dias };
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Disposição (0–10) média dos últimos 7 dias e dos 7 anteriores. null sem registro. */
export function disposicao(monit, hoje) {
  const nota = (r) => (Number.isFinite(Number(r.disposicao)) && r.disposicao != null ? Number(r.disposicao) : null);
  const valores = (desloc) => naJanela(monit, hoje, 7, desloc).map(nota).filter((v) => v != null);
  const atual = media(valores(0));
  const anterior = media(valores(7));
  if (atual == null) return null;
  return { atual, anterior, dif: anterior == null ? null : atual - anterior };
}

/** Dias com movimento (caminhou ou fez exercício) entre os registrados nos últimos 7 dias. */
export function movimento(monit, hoje) {
  const regs = naJanela(monit, hoje, 7).filter((r) => r.mobilidade);
  if (regs.length === 0) return null;
  return { dias: regs.filter((r) => MOVIMENTO.has(r.mobilidade)).length, registrados: regs.length };
}

/** Dias de hidratação registrados nos últimos 7 dias. */
function hidratacaoRegistrada(monit, hoje) {
  return naJanela(monit, hoje, 7).filter((r) => r.hidratacao != null).length;
}

/** Último check-in respondido (lista já ordenada ou não). */
function ultimoCheckin(checkins) {
  let melhor = null;
  for (const c of checkins ?? []) {
    if (!ehData(c?.respondido_em)) continue;
    if (!melhor || dia(c.respondido_em) > dia(melhor.respondido_em)) melhor = c;
  }
  return melhor;
}

const fmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Linha de acompanhamento de uma meta do catálogo, ou null quando não há como medir
 * com o que a paciente já registra. ctx = { hoje, monit, checkins }.
 */
export function progressoDaMeta(id, { hoje, monit = [], checkins = [] }) {
  switch (id) {
    case 'geral_checkin':
    case 'onco_sintomas': {
      const u = ultimoCheckin(checkins);
      const recente = u && diasEntre(dia(u.respondido_em), hoje) <= 6 && diasEntre(dia(u.respondido_em), hoje) >= 0;
      return recente ? 'Check-in desta semana: respondido' : 'Check-in desta semana: ainda não respondido';
    }
    case 'geral_plano': {
      const u = ultimoCheckin(checkins);
      const v = Number(u?.respostas?.adesao);
      return u && Number.isFinite(v) && u.respostas?.adesao != null ? `Seguiu o plano em ${v} de 7 dias no último check-in` : null;
    }
    case 'onco_atividade': {
      const m = movimento(monit, hoje);
      return m ? `Movimento em ${m.dias} de ${m.registrados} dias registrados nos últimos 7 dias` : null;
    }
    case 'onco_hidratacao': {
      const n = hidratacaoRegistrada(monit, hoje);
      return n > 0 ? `Hidratação registrada em ${n} dos últimos 7 dias` : null;
    }
    case 'onco_forca': {
      const d = disposicao(monit, hoje);
      return d ? `Disposição média dos últimos 7 dias: ${fmt1(d.atual)} de 10` : null;
    }
    default:
      return null;
  }
}

export { fmt1 };
