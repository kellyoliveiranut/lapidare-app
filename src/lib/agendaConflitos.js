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

import { montarDataHoraISO, partesLocaisISO, dataBR } from './utils.js';
import { validarDiaConsulta, ehFeriado } from './feriados.js';

const MS_DIA = 24 * 3600 * 1000;

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
