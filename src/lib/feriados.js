/**
 * Feriados que bloqueiam agendamento de consulta.
 *
 * Também é a casa de validarDiaConsulta(), no fim do arquivo, que junta feriado
 * e fim de semana numa resposta só. As duas regras vivem juntas porque as telas
 * sempre perguntam as duas ao mesmo tempo — separá-las foi o que deixou a
 * consulta avulsa sem trava enquanto o pacote de 6 tinha.
 *
 * Escopo: feriados NACIONAIS + os de Belém/PA, que é onde a Kelly atende. Não
 * é uma biblioteca de feriados do Brasil — é a lista que importa para não
 * marcar consulta em dia fechado.
 *
 * TUDO EM HORÁRIO LOCAL. As datas circulam pelo app como 'YYYY-MM-DD' e são
 * construídas com `new Date(ano, mes - 1, dia)`, que é local por definição.
 * Nunca `new Date('2026-10-11')`, que o JS interpreta como UTC e volta um dia
 * antes em qualquer fuso a oeste de Greenwich — o Pará é UTC-3.
 */

/** 'YYYY-MM-DD' de um Date local. */
function iso(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date local a partir de ano/mês(1-12)/dia. */
function data(ano, mes, dia) {
  return new Date(ano, mes - 1, dia);
}

/** Soma dias a um Date, devolvendo outro Date (não muta o original). */
function mais(d, dias) {
  const n = new Date(d);
  n.setDate(n.getDate() + dias);
  return n;
}

/**
 * Domingo de Páscoa — algoritmo de Meeus/Butcher (gregoriano anônimo).
 * Vale de 1583 a 4099, muito além de qualquer uso aqui.
 */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return data(ano, mes, dia);
}

/**
 * 2º domingo de outubro — a data do Círio de Nazaré.
 * Acha o primeiro domingo e soma uma semana.
 */
export function segundoDomingoDeOutubro(ano) {
  const primeiro = data(ano, 10, 1);
  const ateDomingo = (7 - primeiro.getDay()) % 7;   // getDay() 0 = domingo
  return mais(primeiro, ateDomingo + 7);
}

// Memória por ano: gerarDatas chama isto seis vezes seguidas, e a validação
// mais uma vez por data. Recalcular a Páscoa a cada chamada seria desperdício.
const cache = new Map();

/**
 * Map de 'YYYY-MM-DD' -> nome do feriado, para um ano.
 *
 * MÓVEIS (derivadas da Páscoa): Carnaval segunda e terça, Sexta-feira Santa e
 * Corpus Christi. A Quarta-feira de Cinzas fica FORA por decisão da Kelly —
 * é ponto facultativo e ela atende.
 *
 * NACIONAIS: inclui 20/11, Consciência Negra, feriado nacional desde a Lei
 * 14.759/2023 (primeiro ano de vigência: 2024). Anos anteriores não são
 * distinguidos: este app agenda para frente, não reconstrói passado.
 *
 * BELÉM/PA: 15/08 (Adesão do Pará à Independência), 08/12 (Nossa Senhora da
 * Conceição, padroeira da cidade), Círio e Recírio. Círio e Recírio caem
 * sempre em domingo, então na prática o bloqueio de fim de semana já os pega —
 * estão aqui para a mensagem sair com o nome certo quando a nutri marcar
 * "permitir fim de semana".
 */
export function feriadosDoAno(ano) {
  if (cache.has(ano)) return cache.get(ano);

  const p = pascoa(ano);
  const circio = segundoDomingoDeOutubro(ano);
  const m = new Map();
  const por = (d, nome) => m.set(iso(d), nome);

  // ── Móveis ──
  por(mais(p, -48), 'Carnaval (segunda)');
  por(mais(p, -47), 'Carnaval (terça)');
  por(mais(p, -2),  'Sexta-feira Santa');
  por(mais(p, 60),  'Corpus Christi');

  // ── Nacionais fixos ──
  por(data(ano,  1,  1), 'Confraternização Universal');
  por(data(ano,  4, 21), 'Tiradentes');
  por(data(ano,  5,  1), 'Dia do Trabalho');
  por(data(ano,  9,  7), 'Independência do Brasil');
  por(data(ano, 10, 12), 'Nossa Senhora Aparecida');
  por(data(ano, 11,  2), 'Finados');
  por(data(ano, 11, 15), 'Proclamação da República');
  por(data(ano, 11, 20), 'Consciência Negra');
  por(data(ano, 12, 25), 'Natal');

  // ── Belém / Pará ──
  // O 12/10 pode coincidir com o Círio (acontece quando o 2º domingo cai no
  // dia 12, como em 2025). O Map guarda um nome só, e o do Círio vence porque
  // é escrito depois — em Belém é o nome que a nutri reconhece. Os dois
  // bloqueiam de qualquer jeito; a colisão só decide o rótulo.
  por(data(ano, 8, 15), 'Adesão do Pará à Independência');
  por(data(ano, 12, 8), 'Nossa Senhora da Conceição');
  por(circio,           'Círio de Nazaré');
  // +15, e o resultado cai numa SEGUNDA-FEIRA — não é engano de quem escreveu.
  // Confirmado no site oficial do Círio de Nazaré: "quinze dias após o Círio,
  // em uma segunda-feira, acontece o Recírio". Não trocar para 14 achando que
  // conserta o dia da semana.
  por(mais(circio, 15), 'Recírio');

  cache.set(ano, m);
  return m;
}

/**
 * Nome do feriado, ou null. Recebe 'YYYY-MM-DD'.
 *
 * Devolver o NOME e não só um booleano é o que permite a tela dizer POR QUE a
 * data foi recusada. "Há consulta em feriado" manda a nutri caçar qual;
 * "12/10 é Nossa Senhora Aparecida" ela resolve na hora.
 */
export function feriadoDe(dataLocal) {
  if (typeof dataLocal !== 'string' || dataLocal.length < 10) return null;
  const ano = Number(dataLocal.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  return feriadosDoAno(ano).get(dataLocal.slice(0, 10)) ?? null;
}

/** Atalho booleano. Recebe 'YYYY-MM-DD'. */
export function ehFeriado(dataLocal) {
  return feriadoDe(dataLocal) !== null;
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', para a mensagem de tela. */
function formatarBR(dataISO) {
  const [a, m, d] = dataISO.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * A data serve para marcar consulta? Recebe 'YYYY-MM-DD'.
 *
 * Devolve null quando serve, e a MENSAGEM PRONTA quando não serve — nomeando a
 * data e o motivo. Mensagem e não booleano pela mesma razão do feriadoDe: se
 * quem chama tiver que escrever o texto, cada tela inventa o seu e a regra volta
 * a ter três versões, que foi exatamente como a avulsa ficou sem trava.
 *
 * Feriado é rígido em toda tela. Fim de semana também, EXCETO no pacote de 6 —
 * a única tela com o checkbox "permitir fim de semana". Por isso permitirFds é
 * parâmetro e não constante.
 *
 * dicaFds é acrescentada só à mensagem de fim de semana, e só onde o checkbox
 * existe: apontar um controle que a tela não tem seria pior que não dizer nada.
 *
 * Data vazia devolve null de propósito: "sem data" não é dia inválido, e as três
 * telas já tratam isso antes ("Preencha a data").
 */
export function validarDiaConsulta(dataISO, { permitirFds = false, dicaFds = '' } = {}) {
  if (typeof dataISO !== 'string' || dataISO.length < 10) return null;

  // Feriado primeiro: quando a data é as duas coisas (o Círio cai sempre num
  // domingo), o nome do feriado diz mais do que "cai num domingo".
  const feriado = feriadoDe(dataISO);
  if (feriado) return `${formatarBR(dataISO)} é feriado (${feriado}). Ajuste a data.`;

  if (!permitirFds) {
    const d = new Date(`${dataISO}T00:00:00`);   // meia-noite LOCAL, sem UTC
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      return `${formatarBR(dataISO)} cai num ${dow === 0 ? 'domingo' : 'sábado'}. Ajuste a data.${dicaFds}`;
    }
  }

  return null;
}
