import protocolosEfeitosData from '../data/protocolos_efeitos.json';

/**
 * Marcos de quem não traz `marcosEfeito` próprio no catálogo (+3/+7/+10/+14).
 *
 * `de`/`ate` são deslocamentos em dias a partir da infusão — são eles que geram
 * as datas e que casam com as colunas d3/d7/d10/d14 do banco. O rótulo do dia
 * do ciclo NÃO é escrito aqui nem no catálogo: sai de rotuloMarco(). Não existe
 * campo `label` de propósito, para o rótulo não poder divergir do
 * deslocamento — foi assim que o "D0" nasceu e sobreviveu.
 */
export const MARCOS_FALLBACK = [
  { de: 3,  ate: 3,  desc: 'Início da piora', fase: 'alerta' },
  { de: 7,  ate: 7,  desc: 'Janela de risco', fase: 'risco'  },
  { de: 10, ate: 10, desc: 'Pico de risco',   fase: 'risco'  },
  { de: 14, ate: 14, desc: 'Fim da janela',   fase: 'alerta' },
];

/**
 * Rótulo de um marco em dia do ciclo. Na nomenclatura de enfermagem e medicina
 * a infusão é D1, então o dia do ciclo é o deslocamento + 1. Marco de dia único
 * (de === ate) sai como "D8"; faixa sai como "D7–D14".
 *
 * Fonte única do rótulo no app inteiro — telas, cabeçalhos de tabela e banner.
 */
export function rotuloMarco(de, ate) {
  return de === ate ? `D${de + 1}` : `D${de + 1}–D${ate + 1}`;
}

/**
 * Chave de comparação de nome de protocolo: sem acento, sem caixa, sem nada que
 * não seja letra ou dígito. O campo "Protocolo" do cadastro é texto livre, então
 * "Flox", "T--DD" e "T DD" chegam aqui como grafias da mesma coisa.
 */
function chaveProtocolo(s) {
  return String(s ?? '')
    // NFD separa o acento da letra base; o strip abaixo leva a marca embora
    // junto com o resto do que não é [a-z0-9]. Sem o NFD, 'Manutenção' viraria
    // 'manuteno' em vez de 'manutencao'.
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Protocolo do catálogo por nome. Tenta igualdade exata primeiro; se não achar,
 * compara por chave normalizada.
 *
 * O casamento é por IGUALDADE de chave, nunca por inclusão: 'AC' não pode casar
 * com 'AC-T', nem 'TC' com 'TCHP' — são protocolos diferentes, e casar o
 * protocolo errado mostra à paciente a janela de risco errada. Verificado que as
 * 72 chaves do catálogo são únicas; se entrar protocolo novo cuja chave colida
 * com uma existente, o certo é renomear ou usar `aliases`, não afrouxar isto.
 *
 * Grafia que não vira a mesma chave (ex.: 'T-DXd' para 'T-DD') não é caso de
 * normalização: precisa de `aliases` explícito no catálogo.
 */
export function getProtocolo(nome) {
  if (!nome) return null;
  const exato = protocolosEfeitosData.protocolos.find(p => p.nome === nome);
  if (exato) return exato;
  const chave = chaveProtocolo(nome);
  if (!chave) return null;
  return protocolosEfeitosData.protocolos.find(p =>
    chaveProtocolo(p.nome) === chave ||
    (p.aliases ?? []).some(a => chaveProtocolo(a) === chave)
  ) ?? null;
}

/**
 * Só é "estruturado" quando tem estruturaCiclo E marcosEfeito.
 *
 * Isso governa a GERAÇÃO DE LINHAS (ver linhasDoCiclo): N aplicações por ciclo,
 * cada uma virando uma linha. Não tem nada a ver com rotulagem — protocolo com
 * marcos próprios e uma aplicação só por ciclo (BEP, FLOX, R-CHOP, T-DD) fica
 * fora daqui e continua com uma linha por ciclo.
 */
export function temEstruturaCiclo(proto) {
  return !!(proto?.estruturaCiclo && Array.isArray(proto?.marcosEfeito) && proto.marcosEfeito.length > 0);
}

/**
 * Marcos de um protocolo, ordenados por deslocamento: os do catálogo quando
 * existirem, senão MARCOS_FALLBACK. Independe de estruturaCiclo.
 *
 * Retorna [{ de, ate, fase, desc, label, infusao }].
 */
export function marcosDoProtocolo(proto) {
  const src = Array.isArray(proto?.marcosEfeito) && proto.marcosEfeito.length > 0
    ? proto.marcosEfeito
    : MARCOS_FALLBACK;
  return [...src]
    .map(m => ({
      de: m.de, ate: m.ate, fase: m.fase,
      label: rotuloMarco(m.de, m.ate),
      // Marco que começa no dia da infusão ocupa, na linha do tempo, o lugar da
      // bolinha "Quimio" — que é suprimida para não sobrepor duas bolinhas na
      // mesma data. Então ele precisa carregar essa informação, senão a
      // paciente perde a referência de qual dia foi a infusão: `infusao` pinta
      // a bolinha de verde e o desc diz "Quimio" antes do efeito.
      infusao: m.de === 0,
      desc: m.de === 0 ? `Quimio · ${m.desc}` : m.desc,
    }))
    .sort((a, b) => a.de - b.de || a.ate - b.ate);
}

function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Marcos de UMA aplicação, já datados (dataAplicacao = 'YYYY-MM-DD').
 * A data sai sempre de `de` — `ate` só existe para o rótulo e para a janela de
 * risco, e nunca vira ponto na linha do tempo. Nunca lê d3/d7/d10/d14.
 *
 * Retorna [{ de, ate, fase, desc, label, infusao, dia, data }].
 */
export function marcosEfeitoAplicacao(proto, dataAplicacao) {
  return marcosDoProtocolo(proto).map(m => ({
    ...m,
    dia:  m.de,
    data: dataAplicacao ? addDaysISO(dataAplicacao, m.de) : null,
  }));
}

/**
 * Janela de risco em deslocamentos: o span dos marcos de fase 'risco'.
 *
 * A regra antiga estendia a janela até o maior `ate` de qualquer 'alerta'
 * posterior. Isso funcionava para os 4 marcos do fallback, mas estoura em
 * protocolo com faixas sobrepostas: no BEP a faixa de toxicidade cumulativa vai
 * até D21 e arrastava a "janela de risco imunológico" junto, quando o nadir
 * dele é D7–D14. Sem marco de risco, cai no antigo {7, 14}.
 */
export function janelaRisco(proto) {
  const risco = marcosDoProtocolo(proto).filter(m => m.fase === 'risco');
  if (!risco.length) return { inicio: 7, fim: 14 };
  return {
    inicio: Math.min(...risco.map(m => m.de)),
    fim:    Math.max(...risco.map(m => m.ate)),
  };
}

/** Janela de risco em dia do ciclo, para banner. Ex.: "D8–D11". */
export function rotuloJanelaRisco(proto) {
  const { inicio, fim } = janelaRisco(proto);
  return rotuloMarco(inicio, fim);
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
