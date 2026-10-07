/**
 * Listas canônicas de sexo, tipo de plano e modalidade da paciente.
 *
 * Mesma razão de existir de lib/objetivos.js: estas listas nasceram copiadas
 * em cada tela que precisava do select. Quando o cadastro rápido pela Agenda
 * pediu uma quarta cópia, elas viraram arquivo — antes que a história de
 * OBJETIVOS se repetisse (três cópias, uma defasada, objetivo da paciente
 * apagado em silêncio ao salvar o perfil).
 *
 * OBJETIVOS mora em lib/objetivos.js e continua lá: aquele módulo carrega
 * também a normalização de texto livre, que só o importador de CSV usa.
 *
 * NÃO confundir MODALIDADES (da paciente, capitalizada, aceita 'Híbrido') com
 * a modalidade da CONSULTA, que é minúscula e só aceita online|presencial —
 * travada pelo check consultas_modalidade_check. A ponte entre as duas é
 * modalidadeDaPaciente(), no fim deste arquivo.
 */

/**
 * Sexo da paciente. Decide a variação de conteúdo do check-in
 * (lib/checkinVariacao.js): 'feminino' mantém a seção "Corpo & ciclo" e o texto
 * atual; 'masculino' — e o NULL de quem nunca foi marcada — caem na versão
 * neutra. NÃO é campo de identidade de gênero: existe para escolher entre DUAS
 * variações de conteúdo, e um terceiro valor não teria conteúdo para apontar.
 *
 * SÓ OS VALORES VÁLIDOS: o "— não informado —" que aparece nos selects é opção
 * de TELA, e cada uma escreve a sua. Deixar o '' fora da lista preserva a
 * regra que vale para PLANOS e MODALIDADES — o que está aqui é gravável no
 * banco, e a constraint pacientes_sexo_check recusaria string vazia.
 */
export const SEXOS = [
  { v: 'feminino',  l: 'Feminino' },
  { v: 'masculino', l: 'Masculino' },
];

/** Tipo de plano contratado. O valor gravado é minúsculo: o gate do plano
 *  avulso compara com 'avulsa' estrito. */
export const PLANOS = [
  { v: 'avulsa',   l: 'Avulsa' },
  { v: 'essentia', l: 'Essentia' },
];

/** Modalidade do acompanhamento, como gravada em pacientes.modalidade. */
export const MODALIDADES = ['Presencial', 'Online', 'Híbrido'];

// ─── Modalidade e local da CONSULTA ─────────────────────────────────
// As duas funções abaixo moravam em Agenda.jsx. Vieram para cá (pedido de
// 2026-10-06) para os modais do pacote e da avulsa, no perfil, usarem a mesma
// regra do ConsultaModal — antes eles nem mandavam modalidade, e toda consulta
// criada por eles ficava 'online' pelo default do banco.

// pacientes.modalidade é capitalizada ('Online'/'Presencial'/'Híbrido') e a
// coluna da consulta é minúscula. Só 'presencial' é herdado: Híbrido, vazio e
// qualquer valor inesperado caem em 'online', o default do banco.
export function modalidadeDaPaciente(modalidade) {
  return (modalidade ?? '').trim().toLowerCase() === 'presencial' ? 'presencial' : 'online';
}

// Local só existe no presencial (check consultas_local_modalidade_check). Um
// único local ativo é escolha óbvia e já vem marcado; com dois ou mais a nutri
// escolhe, e o salvar() trava enquanto ela não escolher.
//
// Com uma data, a regra de dia da semana decide antes. A regra mora no banco,
// em locais_atendimento.dias_semana (1 = segunda ... 5 = sexta), e não mais num
// mapa aqui casado por NOME: renomear o local no cadastro fazia a regra parar
// de casar e não pré-selecionar nada, em silêncio — foi o que aconteceu com
// 'Wanderloock'. Agora o vínculo é a própria linha do local.
//
// É só o valor INICIAL — a nutri troca no select quando quiser, e a flag
// localEditado impede que a data volte a atropelar a escolha dela.
//
// Toda saída que não for uma decisão segura cai no comportamento antigo: sem
// data, data inválida, nenhum local ativo para o dia, ou mais de um. Fim de
// semana se resolve sozinho: getDay() dá 0 ou 6, e o check da coluna só aceita
// 1..5, então nenhum array pode conter esses dias.
export function localPadrao(locais, dataISO) {
  const ativos = (locais ?? []).filter(l => l.ativo);
  const unico = ativos.length === 1 ? ativos[0].id : '';

  if (!dataISO) return unico;

  // O T12:00:00 é obrigatório: new Date('2026-09-07') é lido como UTC e, no
  // fuso de Belém (−3), volta para o dia 6 — segunda viraria domingo e a regra
  // erraria calada, sem nada na tela para desmentir. Mesmo cuidado que
  // addDaysISO e dataBR já tomam neste projeto.
  const d = new Date(dataISO + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return unico;

  // Exatamente um, ou nada: com o mapa antigo era impossível dois locais
  // reivindicarem o mesmo dia, mas com array no banco é. Escolher o primeiro
  // da lista seria decidir por ordem alfabética, calado — cair no fallback e
  // deixar a nutri escolher é a mesma regra do resto desta função.
  const doDia = ativos.filter(l => (l.dias_semana ?? []).includes(d.getDay()));
  return doDia.length === 1 ? doDia[0].id : unico;
}

/**
 * Das datas ('YYYY-MM-DD') de consultas presenciais, as que a regra NÃO
 * consegue ligar a um local. É a lista do aviso dos modais do perfil:
 * presencial sem local bloqueia o lembrete de WhatsApp na Agenda, então a
 * nutri precisa saber antes de salvar. Datas vazias ("a definir") ficam fora.
 */
export function datasSemLocal(datas, locais) {
  return (datas ?? []).filter(d => d && !localPadrao(locais, d));
}

/**
 * Local a gravar quando uma consulta "a definir" ganha data (salvarDataConsulta,
 * no perfil). Consulta presencial criada sem data nasce sem local; ao receber
 * a data, a regra de dia da semana já pode decidir. Devolve o id, ou null para
 * NÃO gravar local:
 *   - modalidade que não é 'presencial' → null;
 *   - já tem local → null (nunca sobrescreve o que está lá);
 *   - senão → localPadrao(locais, dataISO), ou null se a regra não decide.
 * `dataISO` é a data LOCAL da consulta ('YYYY-MM-DD').
 */
export function localParaDefinirData({ modalidade, localId, locais, dataISO }) {
  if (modalidade !== 'presencial') return null;
  if (localId) return null;
  return localPadrao(locais, dataISO) || null;
}
