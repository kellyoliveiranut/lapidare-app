/**
 * Conflito e bloqueio de agenda — a regra mora aqui, não nas telas.
 *
 * Quatro caminhos gravam o horário de uma consulta, e até aqui nenhum olhava
 * o que já existia: o banco não tem constraint de sobreposição e nunca teve.
 * A régua do dia já desenhava duas pacientes às 14:00 lado a lado
 * (reguaDoDia.js, distribuirEmFaixas) — o conflito sempre foi visível na tela
 * e nunca foi impedido na gravação.
 *
 * DUAS SEVERIDADES, por quem é a outra consulta (decisão de 2026-09-29):
 *   impedimentos → travam: feriado, fim de semana, bloqueio, duração inválida
 *                  e conflito com OUTRA paciente. Até 2026-09-29 este último
 *                  era aviso, para permitir encaixe; a Kelly decidiu travar,
 *                  sabendo que isso tira o encaixe intencional.
 *   avisos       → pedem confirmação: conflito com a PRÓPRIA paciente, seja
 *                  entre as candidatas (as seis do pacote) ou com uma consulta
 *                  dela já gravada.
 *
 * IMPEDIMENTO É { tipo, texto }, E AVISO É STRING. tipo em
 * 'feriado' | 'fds' | 'bloqueio' | 'duracao' | 'conflito'. A tela AGE
 * diferente conforme o tipo ao editar (ver impedimentosQueTravam); filtrar
 * pelo texto seria frágil. Aviso só tem um tipo, então não carrega rótulo.
 *
 * `supabase` VEM POR PARÂMETRO, e não por import no topo como em push.js e
 * imagem.js. Assim este arquivo não arrasta o cliente para quem só quer a
 * geometria dos intervalos, e as funções puras podem ser testadas com um
 * `node` avulso. É desvio consciente da convenção dos outros libs de IO.
 *
 * FUSO: converte só por montarDataHoraISO (candidato) e partesLocaisISO (o
 * que já está gravado). Nunca `new Date('YYYY-MM-DD')`, que o JS lê como UTC
 * e devolve o dia anterior a oeste de Greenwich.
 */

import { montarDataHoraISO, partesLocaisISO, dataBR, HORARIOS_CONSULTA } from './utils.js';
import { validarDiaConsulta, ehFeriado } from './feriados.js';

const MS_DIA = 24 * 3600 * 1000;

// Duração assumida para consulta GRAVADA sem duração (ver horariosLivres).
// Mesmo valor do padrão da Agenda e do default da coluna (2026-09-18b).
const DURACAO_LEGADA_MIN = 30;

/** 'HH:MM:SS' (como o PostgREST devolve `time`) ou 'HH:MM' → 'HH:MM'. */
export function hhmm(t) {
  return typeof t === 'string' ? t.slice(0, 5) : null;
}

/** 'HH:MM' → minutos desde 00:00. */
function minutosDe(hora) {
  const [h, m] = hhmm(hora).split(':').map(Number);
  return h * 60 + m;
}

/**
 * 'HH:MM' + minutos → 'HH:MM'.
 * Não trata virada de meia-noite: a grade de agendamento termina às 18:00 e a
 * duração é de dezenas de minutos. Se um dia existir consulta atravessando a
 * virada, isto aqui passa de 24h — e o teste cobre esse limite.
 */
export function horaMais(hora, min) {
  const t = minutosDe(hora) + Number(min || 0);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 60))}:${p(t % 60)}`;
}

/** Intervalo [início, fim) de uma consulta, em ms, no fuso da clínica. */
export function intervaloConsulta(data, hora, duracaoMin) {
  const inicio = new Date(montarDataHoraISO(data, hora)).getTime();
  return { inicio, fim: inicio + Number(duracaoMin || 0) * 60000 };
}

/**
 * Dois intervalos meio-abertos se cruzam?
 * 14:00-14:45 e 14:45-15:30 NÃO se cruzam — encostam. É o que permite agendar
 * de 30 em 30 minutos sem aviso falso em toda consulta seguida.
 */
export function intervalosSeCruzam(a, b) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/**
 * O bloqueio cobre este item?
 *
 * Compara em MINUTOS DO DIA, não em instante. O bloqueio é relógio de parede
 * (date + time, sem fuso); convertê-lo para instante reintroduziria fuso numa
 * conta que não precisa dele.
 */
export function bloqueioCobre(bloqueio, { data, hora, duracaoMin }) {
  if (!bloqueio || bloqueio.data !== data) return false;
  if (!bloqueio.hora_inicio) return true;               // dia inteiro
  const ini = minutosDe(hora);
  const fim = ini + Number(duracaoMin || 0);
  return minutosDe(bloqueio.hora_inicio) < fim
      && ini < minutosDe(bloqueio.hora_fim);            // hora_fim é exclusivo
}

/**
 * Horários da grade em que uma consulta de `duracaoMin` cabe INTEIRA no dia.
 *
 * Um horário só é livre se o intervalo [início, início + duração) não cruza
 * nenhuma consulta nem bloqueio — a mesma geometria meio-aberta da trava
 * (intervalosSeCruzam e bloqueioCobre), para a lista e o salvar nunca
 * discordarem sobre o que é "ocupado".
 *
 * `consultas` são as linhas já gravadas ({ id, data_hora, duracao_min, status }),
 * de QUALQUER paciente, inclusive da própria (decisão de 2026-10-06): a lista
 * oferece só o que está de fato vazio, e o aviso de "mesma paciente" continua
 * no salvar como rede de segurança. Canceladas e "a definir" (data_hora null)
 * não ocupam. Pode vir mais de um dia: o cruzamento é por instante, então a
 * consulta da véspera que atravessa a meia-noite também conta.
 *
 * Duração vazia (null, 0, undefined) numa consulta GRAVADA conta como
 * DURACAO_LEGADA_MIN. Sem isso o intervalo teria tamanho zero, não cruzaria
 * nada, e o horário dela apareceria como livre. A coluna é NOT NULL default 30
 * no repo, então o caso é de dado legado ou de select sem a coluna.
 *
 * `ignorarIds`: ao editar, a própria consulta não ocupa o próprio horário.
 *
 * `grade` é a lista de inícios possíveis, HORARIOS_CONSULTA por padrão
 * (08:00 a 18:00 como último início — decisão de 2026-10-06, sem mexer na
 * lista compartilhada com os modais do perfil).
 *
 * Função pura, sem supabase nem React: quem chama traz as consultas e os
 * bloqueios do dia. Sem data ou com duração inválida, devolve lista vazia.
 */
export function horariosLivres({
  data,
  duracaoMin,
  consultas = [],
  bloqueios = [],
  ignorarIds = [],
  grade = HORARIOS_CONSULTA,
}) {
  if (!data || !(Number(duracaoMin) > 0)) return [];
  const ignorar = new Set(ignorarIds.filter(Boolean));
  const ocupadas = (consultas ?? [])
    .filter(c => c?.data_hora && c.status !== 'cancelada' && !ignorar.has(c.id))
    .map(c => {
      const p = partesLocaisISO(c.data_hora);
      const dur = Number(c.duracao_min) > 0 ? Number(c.duracao_min) : DURACAO_LEGADA_MIN;
      return intervaloConsulta(p.data, p.hora, dur);
    });
  return grade.filter(hora => {
    const alvo = intervaloConsulta(data, hora, duracaoMin);
    if (ocupadas.some(o => intervalosSeCruzam(alvo, o))) return false;
    return !(bloqueios ?? []).some(b => bloqueioCobre(b, { data, hora, duracaoMin }));
  });
}

/**
 * Primeiro horário da lista a partir de `preferido` ('HH:MM'); se não houver
 * nenhum depois, o primeiro da lista; lista vazia → null. A lista vem em ordem
 * de relógio, e 'HH:MM' compara certo como texto.
 */
export function primeiroLivreAPartirDe(lista, preferido) {
  if (!lista?.length) return null;
  return lista.find(h => h >= preferido) ?? lista[0];
}

/**
 * O que o select de Horário do ConsultaModal mostra. Pura: a tela só desenha.
 *
 * Entrada:
 *   livres     horariosLivres() do dia, ou a grade inteira se a leitura falhou
 *   atual      horário original da consulta editada, no MESMO dia; null ao criar
 *   hora       o que está no estado do formulário
 *   preferido  de onde procurar quando `hora` não está entre as opções
 *              (14:00 ao criar, o horário original ao editar)
 *   carregando / temData
 *
 *   escolherSozinho  true ao criar; false ao editar/remarcar (opção B)
 *
 * Saída { opcoes: [{ valor, rotulo }], valor, placeholder, desabilitado, semHorario, precisaEscolher }:
 *   - `atual` fora da lista (fora da grade, ou ocupado depois de aumentar a
 *     duração) entra como "HH:MM (atual)", na ordem do relógio — decisões 2 e 5
 *     de 2026-10-06. A trava do salvar continua avisando se ele colidir.
 *   - `valor` é o que o select deve mostrar e o salvar deve gravar: `hora` se
 *     ela é uma das opções; senão, ao criar, o primeiro livre a partir de
 *     `preferido`, e ao editar, null com `precisaEscolher`. Desabilitado (sem
 *     data, carregando, sem livre) → null. É derivado, não estado, para o
 *     select nunca exibir uma opção diferente do que vai ser salvo (o defeito
 *     do select de Duração com 50 min).
 *   - `semHorario`: nenhum livre e nenhum "(atual)" → o Salvar desabilita.
 *   Horário passado não é escondido (decisão 4).
 */
export function opcoesHorario({
  livres = [], atual = null, hora = null, preferido = '14:00',
  carregando = false, temData = true, escolherSozinho = true,
}) {
  // Desabilitado → valor null: o salvar nunca grava o horário do ESTADO por
  // baixo de um select que não está mostrando nenhum horário.
  const vazio = { opcoes: [], valor: null, desabilitado: true, semHorario: false, precisaEscolher: false };
  if (!temData)   return { ...vazio, placeholder: 'Escolha a data' };
  if (carregando) return { ...vazio, placeholder: 'Carregando horários…' };

  const valores = [...livres];
  if (atual && !valores.includes(atual)) valores.push(atual);
  valores.sort();
  if (!valores.length) {
    return { ...vazio, placeholder: 'Nenhum horário livre neste dia', semHorario: true };
  }
  const opcoes = valores.map(v => ({
    valor: v,
    rotulo: v === atual && !livres.includes(v) ? `${v} (atual)` : v,
  }));
  const base = { opcoes, desabilitado: false, semHorario: false };
  if (valores.includes(hora)) return { ...base, valor: hora, placeholder: null, precisaEscolher: false };
  // Editar/remarcar (decisão de 2026-10-06, opção B): o horário NÃO troca
  // sozinho. O select pede a escolha e o Salvar espera — na remarcação a hora
  // é combinada com a paciente, e trocar em silêncio gravaria uma que ninguém
  // combinou. Só a consulta nova escolhe sozinha (regra das 14:00).
  if (!escolherSozinho) return { ...base, valor: null, placeholder: 'Escolha o horário', precisaEscolher: true };
  return { ...base, valor: primeiroLivreAPartirDe(valores, preferido), placeholder: null, precisaEscolher: false };
}

function descreverBloqueio(bloqueio, data) {
  const faixa = bloqueio.hora_inicio
    ? ` das ${hhmm(bloqueio.hora_inicio)} às ${hhmm(bloqueio.hora_fim)}`
    : '';
  const motivo = bloqueio.motivo ? ` (${bloqueio.motivo})` : '';
  return `${dataBR(data)} está bloqueado${faixa}${motivo}. Ajuste a data.`;
}

/** Remove repetidos pela chave dada, preservando a ordem. */
function semRepetir(lista, chave) {
  const vistos = new Set();
  return lista.filter(x => {
    const k = chave(x);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Junta os textos dos impedimentos numa mensagem só, para o setErro. */
export function textoImpedimentos(impedimentos) {
  return impedimentos.map(i => i.texto).join(' ');
}

/**
 * Texto do confirm — UM diálogo só, com todos os avisos.
 * Três diálogos seguidos é onde se clica no automático sem ler.
 */
export function textoConfirmacao(avisos) {
  const corpo = avisos.length === 1
    ? avisos[0]
    : `${avisos.length} conflitos de horário:\n\n` + avisos.map(a => `• ${a}`).join('\n');
  return `${corpo}\n\nAgendar mesmo assim?`;
}

/**
 * Dos impedimentos, quais travam o salvamento no modal da Agenda.
 *
 * - bloqueio e duracao: sempre travam.
 * - conflito: trava quando o HORÁRIO muda (data, hora, duração) ou quando a
 *   consulta sai de 'cancelada'. Editar só a obs ou o local de uma consulta que
 *   já colidia antes da regra não trava: a colisão é legada, não criada agora.
 *   Salvar como 'cancelada' nunca trava por conflito.
 * - feriado/fds: perdoados ao editar sem mudar a data (consulta antiga de
 *   sábado precisa poder trocar de local).
 */
export function impedimentosQueTravam(impedimentos, { isEdit, inicial, atual }) {
  const mudouData = !isEdit || atual.data !== inicial.data;
  const mudouHorario = mudouData
    || atual.hora !== inicial.hora
    || Number(atual.duracao) !== Number(inicial.duracao)
    || inicial.status === 'cancelada';
  return impedimentos.filter(i => {
    if (i.tipo === 'bloqueio' || i.tipo === 'duracao') return true;
    if (i.tipo === 'conflito') return atual.status !== 'cancelada' && mudouHorario;
    return mudouData;
  });
}

/**
 * Verifica uma ou várias consultas candidatas contra feriado, fim de semana,
 * bloqueio e consultas já agendadas.
 *
 * `itens` é lista porque o pacote de 6 precisa checar as seis de uma vez —
 * inclusive entre si, que é a colisão que ninguém via: as seis entram em
 * bloco num insert só.
 *
 * `ignorarIds` são as consultas a desconsiderar. Ao editar, a própria linha
 * sempre "conflitaria" consigo mesma.
 *
 * `pacienteId` é de quem são as candidatas. Separa o conflito com outra
 * paciente (trava) do conflito com a própria (avisa). Sem ele, todo conflito
 * conta como outra paciente: na dúvida, o lado seguro é travar.
 *
 * Devolve { impedimentos: [{ tipo, texto }], avisos: [string] },
 * com tipo em 'feriado' | 'fds' | 'bloqueio' | 'duracao' | 'conflito'.
 */
export async function verificarAgenda(supabase, {
  nutriId,
  pacienteId = null,
  itens,
  ignorarIds = [],
  permitirFds = false,
  dicaFds = '',
}) {
  const impedimentos = [];
  const avisos = [];

  const validos = (itens ?? []).filter(i => i?.data && i?.hora);
  if (!validos.length || !nutriId) return { impedimentos, avisos };

  // 1. Dia: feriado e fim de semana. Mesma função que as telas já usavam —
  //    centralizar aqui é o que impede uma tela nova nascer sem a trava. O
  //    ehFeriado separa os dois casos que a validarDiaConsulta funde numa
  //    string só; é o tipo que a Agenda usa para perdoar um sem perdoar o outro.
  for (const it of validos) {
    const problema = validarDiaConsulta(it.data, { permitirFds, dicaFds });
    if (problema) {
      impedimentos.push({ tipo: ehFeriado(it.data) ? 'feriado' : 'fds', texto: problema });
    }
  }

  // 1b. Duração. Intervalo de tamanho zero não cruza nada (intervalosSeCruzam
  //     é meio-aberto), então uma duração vazia desligaria a trava de
  //     conflito em silêncio. Nenhuma tela manda isso hoje; aqui fica o piso.
  for (const it of validos) {
    if (!(Number(it.duracaoMin) > 0)) {
      impedimentos.push({ tipo: 'duracao', texto: 'Escolha a duração da consulta.' });
    }
  }

  const datas = [...new Set(validos.map(i => i.data))].sort();

  // 2. Bloqueios. A coluna é `date`, então .in() por data resolve.
  const { data: bloqueios, error: errBloq } = await supabase
    .from('bloqueios_agenda')
    .select('data, hora_inicio, hora_fim, motivo')
    .eq('nutri_id', nutriId)
    .in('data', datas);
  if (errBloq) throw errBloq;

  for (const it of validos) {
    for (const b of bloqueios ?? []) {
      if (bloqueioCobre(b, it)) {
        impedimentos.push({ tipo: 'bloqueio', texto: descreverBloqueio(b, it.data) });
      }
    }
  }

  // 3. Consultas já agendadas. Outra paciente TRAVA; a própria só AVISA.
  //    data_hora é timestamptz e não aceita .in() por dia: janela de um dia a
  //    mais em cada ponta, barata, e cobre a consulta que começa perto da virada.
  const de  = new Date(new Date(montarDataHoraISO(datas[0], '00:00')).getTime() - MS_DIA);
  const ate = new Date(new Date(montarDataHoraISO(datas[datas.length - 1], '23:30')).getTime() + MS_DIA);

  const { data: existentes, error: errCons } = await supabase
    .from('consultas')
    .select('id, paciente_id, data_hora, duracao_min, paciente:pacientes(nome)')
    .eq('nutri_id', nutriId)
    .neq('status', 'cancelada')
    .not('data_hora', 'is', null)
    .gte('data_hora', de.toISOString())
    .lte('data_hora', ate.toISOString());
  if (errCons) throw errCons;

  const ignorar = new Set(ignorarIds.filter(Boolean));

  for (const it of validos) {
    const alvo = intervaloConsulta(it.data, it.hora, it.duracaoMin);
    for (const c of existentes ?? []) {
      if (ignorar.has(c.id)) continue;
      const p = partesLocaisISO(c.data_hora);
      if (!intervalosSeCruzam(alvo, intervaloConsulta(p.data, p.hora, c.duracao_min))) continue;
      const faixa = `${dataBR(p.data)}, das ${p.hora} às ${horaMais(p.hora, c.duracao_min)}`;
      if (pacienteId && c.paciente_id === pacienteId) {
        avisos.push(`Esta paciente já tem outra consulta em ${faixa}.`);
      } else {
        impedimentos.push({ tipo: 'conflito', texto:
          `${c.paciente?.nome ?? 'Outra paciente'} já tem consulta em ${faixa}. Escolha outro horário.` });
      }
    }
  }

  // 4. Os candidatos entre si — a colisão que o pacote de 6 nunca viu. Todos
  //    são da mesma paciente, então fica como aviso.
  for (let i = 0; i < validos.length; i++) {
    for (let j = i + 1; j < validos.length; j++) {
      const a = validos[i], b = validos[j];
      if (!intervalosSeCruzam(
        intervaloConsulta(a.data, a.hora, a.duracaoMin),
        intervaloConsulta(b.data, b.hora, b.duracaoMin),
      )) continue;
      const rotA = a.rotulo ?? `Consulta ${i + 1}`;
      const rotB = b.rotulo ?? `Consulta ${j + 1}`;
      avisos.push(`${rotA} e ${rotB} estão no mesmo horário (${dataBR(a.data)}, ${a.hora}).`);
    }
  }

  // Deduplica: dois itens no mesmo dia bloqueado gerariam a frase idêntica
  // duas vezes, e ler a mesma linha repetida não informa nada.
  return {
    impedimentos: semRepetir(impedimentos, i => i.texto),
    avisos:       semRepetir(avisos, a => a),
  };
}

/**
 * Consultas e bloqueios que ocupam `data`, para horariosLivres().
 *
 * As MESMAS duas leituras do verificarAgenda — consultas não canceladas numa
 * janela de um dia a mais em cada ponta (data_hora é timestamptz e não aceita
 * .in() por dia) e os bloqueios do dia —, para a lista e a trava olharem o
 * mesmo recorte. Os bloqueios que a Agenda já tem em memória NÃO servem: cobrem
 * só o mês visível no calendário.
 *
 * Erro de leitura é lançado; quem chama decide (o modal cai na grade inteira e
 * deixa a trava do salvar como rede de segurança).
 */
export async function carregarOcupacaoDoDia(supabase, { nutriId, data }) {
  if (!nutriId || !data) return { consultas: [], bloqueios: [] };
  const de  = new Date(new Date(montarDataHoraISO(data, '00:00')).getTime() - MS_DIA);
  const ate = new Date(new Date(montarDataHoraISO(data, '23:30')).getTime() + MS_DIA);

  const [cons, bloq] = await Promise.all([
    supabase
      .from('consultas')
      .select('id, data_hora, duracao_min, status')
      .eq('nutri_id', nutriId)
      .neq('status', 'cancelada')
      .not('data_hora', 'is', null)
      .gte('data_hora', de.toISOString())
      .lte('data_hora', ate.toISOString()),
    supabase
      .from('bloqueios_agenda')
      .select('data, hora_inicio, hora_fim')
      .eq('nutri_id', nutriId)
      .eq('data', data),
  ]);
  if (cons.error) throw cons.error;
  if (bloq.error) throw bloq.error;
  return { consultas: cons.data ?? [], bloqueios: bloq.data ?? [] };
}
