import protocolosEfeitosData from '../data/protocolos_efeitos.json';

/** Fallback atual: mesmos offsets/labels/fases de hoje (+3/+7/+10/+14). */
export const MARCOS_FALLBACK = [
  { dia: 3,  label: 'D+3',  desc: 'Início da piora', fase: 'alerta' },
  { dia: 7,  label: 'D+7',  desc: 'Janela de risco', fase: 'risco'  },
  { dia: 10, label: 'D+10', desc: 'Pico de risco',   fase: 'risco'  },
  { dia: 14, label: 'D+14', desc: 'Fim da janela',   fase: 'alerta' },
];

export function getProtocolo(nome) {
  if (!nome) return null;
  return protocolosEfeitosData.protocolos.find(p => p.nome === nome) ?? null;
}

/** Só é "estruturado" quando tem estruturaCiclo E marcosEfeito. */
export function temEstruturaCiclo(proto) {
  return !!(proto?.estruturaCiclo && Array.isArray(proto?.marcosEfeito) && proto.marcosEfeito.length > 0);
}

function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Marcos de efeito de UMA aplicação (dataAplicacao = 'YYYY-MM-DD').
 * Estruturado → usa marcosEfeito (dia = campo `de`); senão → MARCOS_FALLBACK.
 * Retorna [{ dia, de, ate, label, desc, fase, data }]. Nunca lê d3/d7/d10/d14.
 */
export function marcosEfeitoAplicacao(proto, dataAplicacao) {
  const base = temEstruturaCiclo(proto)
    ? proto.marcosEfeito.map(m => ({ dia: m.de, de: m.de, ate: m.ate, label: m.label, desc: m.desc, fase: m.fase }))
    : MARCOS_FALLBACK.map(m => ({ ...m, de: m.dia, ate: m.dia }));
  return base.map(m => ({ ...m, data: dataAplicacao ? addDaysISO(dataAplicacao, m.dia) : null }));
}

/**
 * Janela de risco (offsets relativos à aplicação): menor `de` de fase 'risco'
 * até o maior `ate` de fase 'alerta' posterior. Fallback → {7, 14} (= hoje).
 */
export function janelaRisco(proto) {
  const src = temEstruturaCiclo(proto)
    ? proto.marcosEfeito.map(m => ({ de: m.de, ate: m.ate, fase: m.fase }))
    : MARCOS_FALLBACK.map(m => ({ de: m.dia, ate: m.dia, fase: m.fase }));
  const risco = src.filter(m => m.fase === 'risco');
  const inicio = risco.length ? Math.min(...risco.map(m => m.de)) : 7;
  const alertaPos = src.filter(m => m.fase === 'alerta' && m.ate > inicio);
  const fim = alertaPos.length ? Math.max(...alertaPos.map(m => m.ate))
            : (risco.length ? Math.max(...risco.map(m => m.ate)) : 14);
  return { inicio, fim };
}

/** Datas das aplicações de um ciclo, a partir do D1. [{aplicacao, label:'D1/D8/D15', data}] */
export function datasAplicacoesCiclo(proto, dataD1) {
  const ec = proto?.estruturaCiclo;
  if (!ec || !dataD1) return [];
  return Array.from({ length: ec.aplicacoes }, (_, i) => ({
    aplicacao: i + 1,
    label: `D${i * ec.cadenciaDias + 1}`,          // D1, D8, D15
    data: addDaysISO(dataD1, i * ec.cadenciaDias),
  }));
}
