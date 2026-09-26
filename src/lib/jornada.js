// Mapa da jornada Essentia — cálculo PURO, sem supabase e sem React.
//
// Recebe as linhas cruas (consultas, contratos, último plano) e devolve a
// trilha pronta: contrato → consulta 1 → plano → consultas 2..6 → fim.
// Fica fora do componente para ser testável no Node com fixtures.
//
// O PACOTE ATUAL NÃO EXISTE NO BANCO: não há venda_id nem pacote_id em
// consultas, e a renovação reusa os mesmos rótulos primeira/consulta_2..6.
// A âncora é a `primeira` mais recente por created_at. O modal do pacote grava
// as seis num insert só, e o now() do default é o início da transação — as
// seis nascem com o MESMO created_at (conferido no banco em 2026-09-24: 51
// levas com created_at idêntico, grupos menores só por exclusão de linha).
// Tudo que tem número de pacote e nasceu na âncora ou depois é o pacote atual.
//
// Três casos que o banco real TEM e esta função precisa aguentar:
//   - buraco na numeração (consulta apagada): o slot fica "a agendar", a
//     sequência 1..6 nunca é presumida completa;
//   - número repetido no mesmo pacote: vale a realizada; sem realizada, a
//     não cancelada criada por último;
//   - slot só com cancelada (conferido em 2026-09-25: 2..5 cancelados e a 6
//     agendada no mesmo pacote): a cancelada ocupa o slot, para a trilha
//     mostrar o que aconteceu em vez de um buraco. Ela nunca vira âncora.

export const TOTAL_CONSULTAS_PACOTE = 6;

// 'primeira' → 1, 'consulta_4' → 4, qualquer outro tipo → null (avulsa,
// retorno e avaliacao são atendimentos fora do pacote). Mesma regra do
// ehConsultaDoPacote da Visão.
export function numeroDoPacote(tipo) {
  if (tipo === 'primeira') return 1;
  const m = /^consulta_(\d+)$/.exec(tipo ?? '');
  return m ? Number(m[1]) : null;
}

// Date.parse e não comparação de string: o PostgREST devolve microssegundos
// e offset, e a igualdade que importa é a do instante.
function ms(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
}

/**
 * Slots 1..6 do pacote atual. Cada slot é a linha escolhida ou null (buraco).
 * Devolve também se houve renovação (mais de uma `primeira` válida), que o
 * marco do plano usa.
 */
export function pacoteAtual(consultas) {
  const numeradas = (consultas ?? [])
    .map(c => ({ ...c, _n: numeroDoPacote(c.tipo), _criada: ms(c.created_at) }))
    .filter(c => c._n != null);
  const validas = numeradas.filter(c => c.status !== 'cancelada');

  const primeiras = validas.filter(c => c._n === 1 && c.tipo === 'primeira');
  const ancora = primeiras.reduce(
    (max, c) => (c._criada != null && (max == null || c._criada > max) ? c._criada : max),
    null,
  );

  // Sem nenhuma `primeira` (paciente agendada só pela Agenda, ou importada):
  // não há como separar pacotes, então vale tudo que tem número.
  const doPacote = ancora == null
    ? numeradas
    : numeradas.filter(c => c._criada != null && c._criada >= ancora);

  const maisRecente = lista => lista.slice()
    .sort((a, b) => (b._criada ?? 0) - (a._criada ?? 0))[0];

  const slots = [];
  for (let n = 1; n <= TOTAL_CONSULTAS_PACOTE; n++) {
    const candidatas = doPacote.filter(c => c._n === n);
    // Cancelada só quando é tudo que o slot tem: remarcar é cancelar uma e
    // criar outra com o mesmo número, e a nova é que vale.
    const escolhida = candidatas.find(c => c.status === 'realizada')
      ?? maisRecente(candidatas.filter(c => c.status !== 'cancelada'))
      ?? maisRecente(candidatas)
      ?? null;
    slots.push(escolhida);
  }

  return { slots, ancora, renovacao: primeiras.length > 1 };
}

/**
 * Monta a trilha completa.
 *
 * @param {object}   p
 * @param {object[]} p.consultas  linhas de consultas da paciente (todas)
 * @param {object[]} p.contratos  linhas de contratos_essentia (id, aceito_em, created_at)
 * @param {string}   p.planoPublicadoEm  publicado_em do plano mais recente, ou null
 *
 * Estados de cada passo:
 *   feito    — aconteceu
 *   atual    — "você está aqui": o primeiro slot não cancelado depois da
 *              última realizada
 *   pendente — depende da Dra. e já devia ter acontecido (plano depois da
 *              consulta 1, contrato criado e não assinado)
 *   cancelada — o slot só tem consulta cancelada, esteja antes ou depois do
 *              marcador; é fato registrado, não ausência
 *   pulado   — slot sem linha, ou agendada esquecida, com uma realizada
 *              depois dele
 *   futuro   — ainda não chegou a vez
 *   encerrado — só no passo "fim": o pacote parou antes da 6 porque o resto
 *              foi cancelado (ver `situacao`)
 */
export function montarJornada({ consultas, contratos, planoPublicadoEm }) {
  const { slots, ancora, renovacao } = pacoteAtual(consultas);
  const realizadas = slots.filter(s => s?.status === 'realizada').length;
  // TOTAL_CONSULTAS_PACOTE é o número de SLOTS da trilha e não muda. A meta
  // da paciente desconta os cancelados: 2..5 canceladas dá "1 de 2", não
  // "1 de 6" — senão o pacote nunca fecharia. Slot vazio NÃO desconta.
  const total = TOTAL_CONSULTAS_PACOTE - slots.filter(s => s?.status === 'cancelada').length;
  // Fechado: não sobra slot a realizar (vazio conta como a realizar).
  // Fechou COM a 6 realizada → concluído: o pacote correu até o fim, mesmo
  // que alguma do meio tenha sido cancelada. Fechou ANTES da 6 → encerrado:
  // parou porque o resto foi cancelado, não porque terminou.
  const fechado = total > 0 && realizadas >= total;
  const situacao = !fechado ? 'em_andamento'
    : slots[TOTAL_CONSULTAS_PACOTE - 1]?.status === 'realizada' ? 'concluido'
    : 'encerrado';
  const concluido = situacao === 'concluido';
  // "Você está aqui" é o primeiro slot NÃO cancelado depois da última
  // realizada. Um slot vazio antes dela ficou para trás (a nutri seguiu para
  // a consulta seguinte) e não pode prender o marcador — caso real: slot 2
  // vazio com 3, 4 e 5 já feitas. Cancelada também não segura o marcador —
  // caso real: 2..5 canceladas e a 6 agendada. Vazio DEPOIS da última
  // realizada segura, porque é consulta ainda a agendar.
  // Sem slot elegível (a 6 feita, ou tudo depois cancelado): nenhum "atual".
  const ultimaFeita = slots.findLastIndex(s => s?.status === 'realizada');
  let idxAtual = -1;
  if (!fechado) {
    for (let i = ultimaFeita + 1; i < TOTAL_CONSULTAS_PACOTE; i++) {
      if (slots[i]?.status !== 'cancelada') { idxAtual = i; break; }
    }
  }

  const passos = [];

  // ── Contrato ──
  // O mais recente decide: numa renovação, um pendente novo vale mais que o
  // aceito do pacote anterior. Sem nenhuma linha (Essentia antiga, anterior ao
  // contrato digital) o passo é OMITIDO — marcar "assinado" sem data seria
  // inventar um fato.
  const lista = (contratos ?? []).slice()
    .sort((a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0));
  const contrato = lista[0] ?? null;
  if (contrato) {
    passos.push({
      chave: 'contrato',
      titulo: 'Contrato assinado',
      estado: contrato.aceito_em ? 'feito' : 'pendente',
      data: contrato.aceito_em ?? null,
    });
  }

  // ── Consultas + plano ──
  // Plano: numa renovação só conta o publicado a partir da âncora — senão o
  // plano do pacote anterior marcaria o passo como feito no dia 1. No
  // primeiro pacote qualquer plano conta: a âncora pode ser posterior ao
  // plano quando a consulta 1 foi criada à parte, e aí o passo ficaria
  // pendente com o plano na mão da paciente.
  const tPlano = ms(planoPublicadoEm);
  const planoFeito = tPlano != null && (!renovacao || ancora == null || tPlano >= ancora);
  const c1Feita = slots[0]?.status === 'realizada';

  slots.forEach((c, i) => {
    const feita = c?.status === 'realizada';
    passos.push({
      chave: `consulta_${i + 1}`,
      // Sem "de N": o total desconta canceladas e "Consulta 6 de 2" não faz
      // sentido. O contador "X de Y" é de quem chama, com realizadas/total.
      titulo: `Consulta ${i + 1}`,
      estado: feita ? 'feito'
        : c?.status === 'cancelada' ? 'cancelada'
        : i === idxAtual ? 'atual'
        : i < ultimaFeita ? 'pulado'
        : 'futuro',
      // Realizada mostra a data MARCADA, não encerrada_em: a nutri às vezes
      // registra dias depois, pela Agenda, e a paciente lembraria da consulta
      // numa data que não é a que aparece.
      data: c ? (c.data_hora ?? (feita ? c.encerrada_em : null)) : null,
      consulta: c,
    });

    if (i === 0) {
      passos.push({
        chave: 'plano',
        titulo: 'Plano alimentar publicado',
        estado: planoFeito ? 'feito' : c1Feita ? 'pendente' : 'futuro',
        data: planoFeito ? planoPublicadoEm : null,
      });
    }
  });

  passos.push({
    chave: 'fim',
    titulo: 'Fim do acompanhamento',
    estado: situacao === 'concluido' ? 'feito'
      : situacao === 'encerrado' ? 'encerrado'
      : 'futuro',
    data: null,
  });

  return {
    passos,
    realizadas,
    total,
    // 'em_andamento' | 'concluido' | 'encerrado'
    situacao,
    concluido,
    // Sem nenhuma consulta de pacote a trilha não tem o que mostrar — quem
    // chama decide esconder o card/estado vazio.
    vazia: slots.every(s => s == null),
  };
}
