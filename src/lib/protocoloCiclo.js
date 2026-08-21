import protocolosEfeitosData from '../data/protocolos_efeitos.json';
import { dataLocalISO } from './utils.js';

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
 * Dias inteiros entre duas datas 'YYYY-MM-DD'. Meio-dia dos dois lados pela
 * mesma razão de addDaysISO: a diferença atravessa horário de verão sem virar
 * 23 ou 25 horas, e o arredondamento não erra o dia.
 */
function diffDias(de, ate) {
  const a = new Date(de + 'T12:00:00');
  const b = new Date(ate + 'T12:00:00');
  return Math.round((b - a) / 86_400_000);
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

/**
 * Sub-fases do ciclo, na ordem de precedência com que são testadas. É o
 * vocabulário que casa a mensagem motivacional com o momento do tratamento —
 * ver mensagens_ciclo.grupo_ciclo.
 *
 * São quatro, e não os seis rótulos da biblioteca de exemplos, porque estes
 * valem para os 73 protocolos do catálogo. "Início da piora" e "Fim da janela"
 * são ambos 'alerta'; "Janela" e "Pico" são ambos 'risco'. Casar mensagem pelo
 * `desc` do marco funcionaria só para quem cai no MARCOS_FALLBACK e falharia
 * calado em BEP, Taxol Semanal, FLOX, R-CHOP, T-DD e FOLFIRINOX, que têm
 * marcos próprios com outras descrições.
 */
export const GRUPOS_CICLO = ['infusao', 'risco', 'alerta', 'recuperacao'];

/**
 * Em que sub-fase do ciclo a paciente está HOJE.
 *
 * Devolve 'infusao' | 'risco' | 'alerta' | 'recuperacao' | null. null quer
 * dizer "não dá para afirmar" — sem aplicação, data anterior à aplicação ou
 * ciclo velho demais —, e quem chama deve cair na mensagem genérica em vez de
 * arriscar um palpite.
 *
 * `dataAplicacao` é a ÚLTIMA aplicação que já aconteceu ('YYYY-MM-DD'). Quem
 * chama filtra por data_quimio <= hoje: a nutri cadastra ciclos futuros, e o
 * mais recente da lista não é necessariamente o último aplicado.
 *
 * Precedência infusao > risco > alerta > recuperacao. Ela existe porque os
 * marcos SE SOBREPÕEM: no BEP o D+7 cai ao mesmo tempo em 'risco' (de 6 a 13)
 * e em 'alerta' (7 a 7). Sem ordem fixa, a fase sairia de quem viesse primeiro
 * no array — e o mais grave é que deve ganhar. A infusão vem antes de tudo:
 * no dia da aplicação a mensagem certa é a do dia da aplicação, mesmo quando um
 * marco de efeito começa nele (BEP tem marco com `de: 0`).
 */
export function faseDoDia(proto, dataAplicacao, { hoje = dataLocalISO(), intervaloDias } = {}) {
  if (!dataAplicacao || !hoje) return null;
  if (hoje < dataAplicacao) return null;
  if (hoje === dataAplicacao) return 'infusao';

  const marcos = marcosDoProtocolo(proto);
  const fimMarcos = marcos.reduce((max, m) => Math.max(max, m.ate), 0);

  // Até quando esta aplicação ainda "explica" o dia de hoje. Sem este teto, a
  // última quimio de um tratamento encerrado há meses continuaria valendo para
  // sempre, e quem terminou o tratamento receberia mensagem de ciclo.
  //
  // duracaoCiclo do catálogo → intervalo do cadastro → 21. E nunca menos que o
  // último marco: protocolo cujo marco passa da duração (o BEP vai até D+20)
  // perderia o próprio fim de janela se o teto cortasse antes.
  const base = proto?.duracaoCiclo ?? intervaloDias ?? 21;
  const limite = Math.max(base, fimMarcos);

  const d = diffDias(dataAplicacao, hoje);
  if (d > limite) return null;

  // ZONAS CONTÍNUAS, não "hoje cai em cima de um marco?".
  //
  // Os marcos são PONTOS na linha do tempo — no fallback, os dias 3, 7, 10 e
  // 14. Testar pertencimento a marco deixava 15 dos 22 dias sem fase, caindo
  // todos em 'recuperacao': a paciente lia "fase boa pra recuperar o pique" em
  // D+1, no dia seguinte à quimio. Aqui os marcos definem FRONTEIRAS, e cada
  // dia do ciclo pertence a alguma faixa:
  //
  //   D+0                              infusao
  //   D+1 até a véspera da janela       alerta      (efeitos agudos subindo)
  //   janela de risco (janelaRisco)     risco
  //   do fim da janela ao último marco  alerta      (efeitos ainda em curso)
  //   depois do último marco            recuperacao
  //
  // A janela vem de janelaRisco() — a mesma que pinta o banner e a linha do
  // tempo —, então a fase nunca discorda do resto do app sobre onde o risco
  // começa e termina.
  const { inicio, fim } = janelaRisco(proto);
  if (d < inicio) return 'alerta';
  if (d <= fim) return 'risco';
  if (d <= fimMarcos) return 'alerta';

  return 'recuperacao';
}
