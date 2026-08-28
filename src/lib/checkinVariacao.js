/**
 * Variações do conteúdo do check-in por paciente.
 *
 * POR QUE ESTE ARQUIVO EXISTE: o conteúdo do check-in é copiado DUAS vezes até
 * chegar na paciente — checkinDefault.js → linha em checkin_templates → snapshot
 * em checkin_envios. Havia cinco pontos no app criando um checkin_envio (três em
 * Checkins.jsx, um em Cadastrar.jsx, um em PacientePerfil.jsx), todos com a mesma
 * linha `perguntas: <algo>.perguntas`. Sem um lugar só, a regra de variação
 * viraria cinco cópias — e a sexta seria esquecida.
 *
 * POR QUE A CHAVE É O `id` DA PERGUNTA, E NÃO UM CAMPO NOVO NO TEMPLATE: os
 * templates que a nutri já criou e editou estão GRAVADOS no banco, sem marcação
 * nenhuma. Um filtro que dependesse de campo novo não faria efeito neles — só em
 * template criado dali para frente. Os ids ('humor', 'ciclo', 'sintomas'...) já
 * são estáveis e sobrevivem às três camadas, então a tabela de variação mora
 * aqui, em código, e alcança template antigo, editado e novo sem migration de
 * dados.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ: mexer em envio já criado. O snapshot em
 * checkin_envios continua sendo snapshot — check-in já mandado não muda.
 */

// ── Remoção de perguntas ────────────────────────────────────────────────

/**
 * Quando cada pergunta some, por id. Duas regras DISTINTAS de propósito —
 * elas coincidiam por acidente enquanto só o sexo importava, e viviam num Set
 * único (`SO_FEMININO`) que tratava as duas igual.
 *
 * 'inchaco' depende só do sexo: é queixa de corpo pertinente ao público
 * feminino, sem relação com ciclo ou menopausa.
 *
 * 'ciclo' (fase do ciclo menstrual) some também para QUALQUER paciente
 * oncológica: quimioterapia frequentemente induz menopausa / castração
 * química, então perguntar a fase do ciclo a uma mulher em tratamento é
 * clinicamente errado — e doloroso. Enquanto a remoção morava dentro do
 * `if (!feminino)`, mulher nenhuma podia perder pergunta, e a oncológica
 * recebia a do ciclo.
 *
 * O gate é `objetivo === 'Oncologia'`, que não separa "em quimioterapia agora"
 * de "histórico oncológico". Decidido assim: o erro nesta direção é perder uma
 * pergunta que talvez fosse útil; na outra é perguntar a fase do ciclo a uma
 * mulher castrada quimicamente. Não são comparáveis.
 */
const REMOVER_SE = {
  inchaco: ({ feminino })       => !feminino,
  ciclo:   ({ feminino, onco }) => !feminino || onco,
};

// ── Sexo ────────────────────────────────────────────────────────────────

/**
 * Reescritas de gênero, por id de pergunta. São os QUATRO termos marcados
 * validados na correção manual do Otávio — nada além disso muda de texto.
 *
 * Cada entrada é mesclada por cima da pergunta em merge SHALLOW, então uma
 * chave listada aqui SUBSTITUI a do template inteira. Para 'humor' e 'sono'
 * isso significa repetir o array de opções completo, com o termo já corrigido.
 */
const NEUTRO = {
  // opcoes[4].label: 'Ótima!' → 'Ótimo!'
  humor: {
    opcoes: [
      { emoji: '😞', label: 'Difícil', valor: 1 },
      { emoji: '😕', label: 'Meh',     valor: 2 },
      { emoji: '😐', label: 'Ok',      valor: 3 },
      { emoji: '🙂', label: 'Bem',     valor: 4 },
      { emoji: '😄', label: 'Ótimo!',  valor: 5 },
    ],
  },
  // esquerda: 'Esgotada' → 'Esgotado'. Só a ponta esquerda do slider tem
  // gênero — 'Com energia' serve para os dois.
  energia: {
    esquerda: 'Esgotado',
  },
  // opcoes[0]: '...descansada' → '...descansado'
  // opcoes[2]: 'Acordei cansada...' → 'Acordei cansado...'
  sono: {
    opcoes: [
      'Dormi muito bem, acordei descansado',
      'Sono ok, mas poderia ser melhor',
      'Acordei cansado na maioria dos dias',
      'Dificuldade para dormir ou dormi pouco',
    ],
  },
};

// ── Oncologia ───────────────────────────────────────────────────────────

/**
 * As adições oncológicas NÃO são perguntas novas: são OPÇÕES a mais dentro de
 * perguntas que já existem, dos tipos que aceitam marcar várias.
 *
 * Aplicam-se a QUALQUER paciente com objetivo 'Oncologia', homem ou mulher —
 * náusea e falta de apetite são clinicamente relevantes para os dois. Por isso
 * esta passada é independente da de sexo: uma paciente oncológica recebe estas
 * opções E mantém a seção "Corpo & ciclo".
 */
const ONCO_OPCOES = {
  dificuldades: ['Náusea ou enjoo', 'Falta de apetite'],
  sintomas:     ['Vômito', 'Boca sensível ou feridas na boca'],
};

/**
 * Insere as opções novas ANTES da opção-sentinela — a que contém 🎉
 * ('Nenhuma dificuldade 🎉', 'Nenhum sintoma 🎉'). A sentinela precisa continuar
 * por último: ela é a negação de todas as outras, e uma opção depois dela lê
 * como se fosse mais um sintoma.
 *
 * PROCURA a sentinela em vez de assumir a penúltima posição: nos templates que a
 * nutri editou à mão, a lista pode ter ganhado item depois do 🎉. Se não houver
 * sentinela nenhuma, as opções vão para o fim — é o melhor palpite disponível e
 * não perde conteúdo.
 *
 * NÃO DUPLICA: os templates corrigidos à mão para os pacientes homens já podem
 * ter essas opções escritas. Sem esta checagem, a paciente veria 'Vômito' duas
 * vezes na mesma pergunta.
 */
function inserirAntesDaSentinela(opcoes, novas) {
  if (!Array.isArray(opcoes)) return opcoes;
  const faltantes = novas.filter(n => !opcoes.includes(n));
  if (faltantes.length === 0) return opcoes;
  const iSentinela = opcoes.findIndex(o => typeof o === 'string' && o.includes('🎉'));
  if (iSentinela === -1) return [...opcoes, ...faltantes];
  return [...opcoes.slice(0, iSentinela), ...faltantes, ...opcoes.slice(iSentinela)];
}

// ── Entrada única ───────────────────────────────────────────────────────

/**
 * Devolve as perguntas que devem ir para ESTA paciente.
 *
 * @param perguntas  array do template (ou do snapshot) — nunca é modificado
 * @param paciente   precisa de { sexo, objetivo }; aceita null
 *
 * SEXO NULO/DESCONHECIDO CAI NO MASCULINO. É a versão neutra, e portanto a
 * segura: sobra pouco para quem é mulher, contra perguntar sobre ciclo
 * menstrual a quem não tem. Só 'feminino' explícito abre a versão feminina.
 */
export function perguntasParaPaciente(perguntas, paciente) {
  const feminino = paciente?.sexo === 'feminino';
  const onco     = paciente?.objetivo === 'Oncologia';
  const ctx      = { feminino, onco };

  // 1ª passada — REMOÇÃO, por regra própria de cada pergunta. Roda SEMPRE, e
  // é isso que corrige o caso da paciente oncológica: enquanto isto vivia
  // dentro do `if (!feminino)`, nenhuma regra alcançava quem é do sexo
  // feminino, por mais que a lista mudasse.
  let out = (perguntas ?? []).filter(p => !REMOVER_SE[p?.id]?.(ctx));

  // 2ª passada — NEUTRALIZAÇÃO de gênero, só para quem não é feminino.
  if (!feminino) {
    out = out.map(p => (NEUTRO[p?.id] ? { ...p, ...NEUTRO[p.id] } : p));
  }

  // 3ª passada — oncologia: acrescenta opções dentro de perguntas existentes.
  if (onco) {
    out = out.map(p => (
      ONCO_OPCOES[p?.id]
        ? { ...p, opcoes: inserirAntesDaSentinela(p.opcoes, ONCO_OPCOES[p.id]) }
        : p
    ));
  }

  return out;
}
