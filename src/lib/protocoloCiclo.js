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

/**
 * Menor intervalo entre ciclos que não faz o D1 do ciclo seguinte cair em cima
 * de uma aplicação do anterior. Estruturado → aplicacoes × cadenciaDias
 * (Taxol: 3 × 7 = 21). Não estruturado → 1, não há o que sobrepor.
 */
export function intervaloMinimoSerie(proto) {
  if (!temEstruturaCiclo(proto)) return 1;
  const ec = proto.estruturaCiclo;
  return ec.aplicacoes * ec.cadenciaDias;
}

/**
 * Linhas de UM ciclo a partir do seu D1. Estruturado → uma linha por aplicação
 * (D1/D8/D15), todas com o mesmo numero_ciclo; senão → uma linha só.
 */
export function linhasDoCiclo(proto, numero_ciclo, dataD1) {
  if (temEstruturaCiclo(proto)) {
    return datasAplicacoesCiclo(proto, dataD1).map(a => ({
      numero_ciclo, aplicacao_no_ciclo: a.aplicacao, data_quimio: a.data, label: a.label,
    }));
  }
  if (!dataD1) return [];
  // Uma aplicação por ciclo — gravado explicitamente para a coluna "Aplic."
  // não ficar nula em linha nova.
  return [{ numero_ciclo, aplicacao_no_ciclo: 1, data_quimio: dataD1, label: 'D1' }];
}

/**
 * Série de ciclos a partir de uma primeira data.
 *
 * A unidade é o CICLO, nunca a linha: em protocolo estruturado cada ciclo passa
 * por datasAplicacoesCiclo e vira N linhas com o mesmo numero_ciclo. Ou seja,
 * `quantidade` conta ciclos e o retorno pode ser bem maior que ela — quem chama
 * precisa mostrar essa multiplicação ao usuário.
 *
 * Não valida intervalo mínimo (ver intervaloMinimoSerie) nem colisão com ciclos
 * já cadastrados: as duas coisas dependem de contexto que só a tela tem. Mas
 * devolve [] para entrada inválida, em vez de emitir data NaN.
 */
export function datasSerieCiclos(proto, { dataInicial, intervaloDias, quantidade, numeroInicial } = {}) {
  const qtd = Math.trunc(Number(quantidade));
  const iv  = Math.trunc(Number(intervaloDias));
  const n0  = Math.trunc(Number(numeroInicial));
  if (!dataInicial) return [];
  if (!Number.isFinite(qtd) || qtd < 1) return [];
  if (!Number.isFinite(iv)  || iv  < 1) return [];
  if (!Number.isFinite(n0)  || n0  < 1) return [];

  const linhas = [];
  for (let i = 0; i < qtd; i++) {
    linhas.push(...linhasDoCiclo(proto, n0 + i, addDaysISO(dataInicial, i * iv)));
  }
  return linhas;
}
