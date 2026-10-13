/**
 * Selos (números) do menu da nutri a partir dos avisos não vistos
 * (avisos_nutri). Puro, sem React e sem banco, para ser testado no Node.
 *
 * Decisão de 12/10/2026 (bloco-106): cada tipo de aviso soma em UM item só.
 *   Avisos     ← contrato_assinado
 *   Check-ins  ← checkin_respondido (formulário) e checkin_diario (diário sem alerta)
 *   Oncologia  ← alerta_oncologico
 *   Feed       ← foto_prato
 * A LISTA da página Avisos continua com os 4 tipos de TIPOS_AVISOS_LISTA;
 * só o número do item Avisos ficou com o contrato, para nada contar duas vezes.
 */
export const SELO_POR_TIPO = {
  contrato_assinado:  'avisos',
  checkin_respondido: 'checkins',
  checkin_diario:     'checkins',
  alerta_oncologico:  'oncologia',
  foto_prato:         'feed',
};

/** Todos os tipos que algum selo conta (a consulta pede só estes). */
export const TIPOS_COM_SELO = Object.keys(SELO_POR_TIPO);

const ROTA_CHECKINS = '/nutri/checkins';
const ROTA_ONCOLOGIA = '/nutri/monitoramento-oncologico';

const inteiro = n => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * avisosNaoVistos: linhas { tipo } dos avisos com visto_em nulo.
 * chat: não lidas do chat (contadas à parte, na tabela mensagens).
 * feed: ignorado se vier — o número do Feed sai dos avisos foto_prato.
 * → { chat, avisos, checkins, oncologia, feed, total }
 */
export function contarSelos(avisosNaoVistos, { chat = 0 } = {}) {
  const s = { chat: inteiro(chat), avisos: 0, checkins: 0, oncologia: 0, feed: 0 };
  for (const a of Array.isArray(avisosNaoVistos) ? avisosNaoVistos : []) {
    const selo = SELO_POR_TIPO[a?.tipo];
    if (selo) s[selo]++;
  }
  return { ...s, total: s.chat + s.avisos + s.checkins + s.oncologia + s.feed };
}

/**
 * Tipos que viram "vistos" ao abrir a rota (além do Feed, que já marca
 * foto_prato no NutriLayout). Abrir Avisos não marca nada sozinho.
 *
 * O alerta oncológico NUNCA é marcado ao abrir uma tela (bloco-107): abrir
 * Oncologia de passagem apagaria o selo sem a nutri ter visto a paciente. Ele
 * só sai pelo "Marcar como visto" / "Marcar todos como vistos" da tela Avisos.
 * Abrir Oncologia marca só o check-in diário, que ela lê ali.
 */
export function tiposParaMarcarAoAbrir(rota) {
  if (rota === ROTA_CHECKINS) return ['checkin_respondido', 'checkin_diario'];
  if (rota === ROTA_ONCOLOGIA) return ['checkin_diario'];
  return [];
}

/** "1 novo" / "3 novos" — aria-label dos selos. */
export function rotuloSelo(n) {
  return `${n} ${n === 1 ? 'novo' : 'novos'}`;
}
