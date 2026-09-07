/* ============================================================
   GEOMETRIA DA RÉGUA DO DIA

   A primeira geometria por PROPORÇÃO do app: até aqui, toda "linha do
   tempo" daqui era um stepper de espaçamento igual (LinhaDoTempoCiclo,
   _Evolucao). Aqui, 30 minutos ocupam de fato metade de 60.

   Tudo sai de UMA constante: quantos pixels vale uma hora.

     ALTURA_HORA = 66  →  PX_POR_MIN = 1,1
     30 min = 33px · 45 = 49,5px · 60 = 66px · 90 = 99px

   Uma consulta de 14:00 fica em (840 − 480) × 1,1 = 396px do topo; com 45
   min ocupa 49,5px e termina em 445,5px, que é exatamente topoDe(14:45).
   É essa igualdade que faz o bloco encostar na linha certa.

   POR QUE px-por-minuto E NÃO porcentagem: porcentagem exigiria um pai de
   altura fixa de qualquer jeito, e obrigaria a recalcular tudo se a faixa
   mudasse. Aqui a altura total é DERIVADA da faixa — mexer em HORA_FIM
   reposiciona a régua inteira sem tocar em mais nada.

   POR QUE 66px A HORA: é o menor valor em que o bloco mínimo (30 min =
   33px) ainda cabe uma linha de texto de 13px com respiro.

   Arquivo .js e não .jsx de propósito: assim roda no node e pode ser
   conferido, e o componente fica só com componente (react-refresh).
   ============================================================ */

export const HORA_INICIO = 8;      // 08:00
export const HORA_FIM    = 19.5;   // 19:30 — cobre o último slot (18:00) + 90min

export const MIN_INICIO  = HORA_INICIO * 60;   // 480
export const MIN_FIM     = HORA_FIM * 60;      // 1170

export const ALTURA_HORA = 66;                       // px de uma hora
export const PX_POR_MIN  = ALTURA_HORA / 60;         // 1.1
export const ALTURA_TOTAL = (MIN_FIM - MIN_INICIO) * PX_POR_MIN;   // 759

/** Duração de desenho de uma tarefa. CONVENÇÃO, não dado: tarefa não tem duração. */
export const DURACAO_TAREFA_MIN = 30;

/** Minutos desde a meia-noite → distância do topo da régua, em px. */
export function topoDe(min) {
  return (min - MIN_INICIO) * PX_POR_MIN;
}

/** Duração em minutos → altura do bloco, em px. */
export function alturaDe(dur) {
  return dur * PX_POR_MIN;
}

/**
 * 'HH:MM' ou 'HH:MM:SS' → minutos desde a meia-noite.
 * O sufixo de segundos importa: o PostgREST devolve a coluna `time` como
 * 'HH:MM:SS', então lembretes_nutri.hora chega com segundos e consultas
 * (via partesLocaisISO) chegam sem.
 */
export function minutosDeHHMM(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':');
  const hn = Number(h), mn = Number(m);
  if (!Number.isFinite(hn) || !Number.isFinite(mn)) return null;
  return hn * 60 + mn;
}

/** 'HH:MM' a partir de 'HH:MM:SS' (ou de 'HH:MM', que passa intacto). */
export function hhmm(valor) {
  return valor ? String(valor).slice(0, 5) : '';
}

/**
 * As horas que a tarefa pode ter, derivadas dos MESMOS limites da régua —
 * é isso que impede criar tarefa que a régua não saberia desenhar.
 * NÃO é HORARIOS_CONSULTA: aquele para às 18:00, porque é o último horário
 * em que ela COMEÇA a atender; a régua vai até 19:30.
 */
export const HORARIOS_TAREFA = (() => {
  const out = [];
  for (let m = MIN_INICIO; m <= MIN_FIM; m += 30) {
    const h = Math.floor(m / 60), mi = m % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  }
  return out;
})();

/** Rótulos da coluna da esquerda: 08:00 … 19:00 (a borda de 19:30 é o fim). */
export const HORAS_CHEIAS = (() => {
  const out = [];
  for (let h = HORA_INICIO; h < HORA_FIM; h++) out.push(h);
  return out;
})();

/**
 * Recorta um intervalo à faixa visível.
 * Devolve null quando o item está INTEIRAMENTE fora — quem chama manda esse
 * para a tira "Fora da régua", em vez de sumir com ele.
 */
export function recortar(inicio, fim) {
  if (fim <= MIN_INICIO || inicio >= MIN_FIM) return null;
  return {
    inicio: Math.max(inicio, MIN_INICIO),
    fim:    Math.min(fim, MIN_FIM),
    cortadoTopo: inicio < MIN_INICIO,
    cortadoBase: fim > MIN_FIM,
  };
}

/**
 * Sobreposição: distribui os itens em FAIXAS lado a lado.
 *
 * Sem isso, duas consultas às 14:00 seriam desenhadas uma em cima da outra
 * em largura cheia, e uma paciente sumiria da tela.
 *
 * Algoritmo: ordena por início; cada item entra na primeira faixa cujo
 * último item já terminou; itens que se encavalam formam um GRUPO, e o
 * número de faixas do grupo vale para todos os seus membros — é o que
 * mantém as colunas alinhadas dentro do mesmo bloco de horário.
 *
 * Devolve cada item com { faixa, nFaixas }. Sem sobreposição, nFaixas = 1
 * e nada muda visualmente.
 */
export function distribuirEmFaixas(itens) {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  const saida = [];
  let grupo = [];
  let faixasFim = [];   // fim do último item de cada faixa
  let fimGrupo = -Infinity;

  const fecharGrupo = () => {
    const n = faixasFim.length || 1;
    for (const it of grupo) saida.push({ ...it, nFaixas: n });
    grupo = [];
    faixasFim = [];
    fimGrupo = -Infinity;
  };

  for (const it of ordenados) {
    // Começou depois de todo mundo do grupo terminar: grupo novo.
    if (grupo.length && it.inicio >= fimGrupo) fecharGrupo();
    let faixa = faixasFim.findIndex(f => f <= it.inicio);
    if (faixa === -1) {
      faixa = faixasFim.length;
      faixasFim.push(it.fim);
    } else {
      faixasFim[faixa] = it.fim;
    }
    grupo.push({ ...it, faixa });
    fimGrupo = Math.max(fimGrupo, it.fim);
  }
  if (grupo.length) fecharGrupo();
  return saida;
}
