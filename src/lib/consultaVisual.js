/* ============================================================
   APARÊNCIA DA CONSULTA — cor por tipo e rótulo de modalidade

   Saiu de dentro de Agenda.jsx quando a régua do dia (_ReguaDoDia.jsx)
   passou a precisar das mesmas cores e do mesmo ícone. Importar da Agenda
   criaria ciclo (Agenda → Régua → Agenda), então as três coisas puras
   vieram para cá.

   Nada de estado, nada de React: só a tradução de um valor do banco para
   o que aparece na tela.
   ============================================================ */

/** Cor do tipo de consulta. É a mesma da bolinha do calendário e da legenda. */
export function tipoColor(tipo) {
  if (tipo === 'primeira') return 'var(--blue)';
  if (tipo === 'avaliacao') return 'var(--orange)';
  return 'var(--green)';
}

/**
 * Versão clara da cor do tipo, para fundo de linha. Mesmo mapa do tipoColor,
 * com os tokens *-soft do tokens.css — e não alpha concatenado na custom
 * property, que é CSS inválido.
 */
export function tipoColorSoft(tipo) {
  if (tipo === 'primeira') return 'var(--blue-soft)';
  if (tipo === 'avaliacao') return 'var(--orange-soft)';
  return 'var(--green-soft)';
}

// Consultas do pacote que o select de Tipo oferece: 1ª e Consulta 02 a 06.
const ULTIMA_DO_PACOTE = 6;

/** 'consulta_7' → 7; 'primeira' → 1; qualquer outro tipo → null. */
export function numeroDoTipo(value) {
  if (value === 'primeira') return 1;
  const m = typeof value === 'string' ? value.match(/^consulta_(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Opções do select de Tipo do modal da consulta (pedido 10, 2026-10-08): só as
 * seis do pacote (1ª e Consulta 02 a 06) e os tipos que não são do pacote
 * (Avaliação, Retorno, Consulta avulsa), na ordem e com os rótulos de `tipos`.
 * Consulta 07 em diante saem.
 *
 * `tipos` vem por parâmetro (a lista TIPOS da Agenda), para este módulo não
 * depender do Agenda.jsx.
 *
 * `atual` é o tipo que a consulta tinha ao ABRIR o modal. Se ele ficou de fora
 * (uma consulta_7 antiga), entra na posição que ocuparia, como "Consulta 07
 * (atual)" — mesmo padrão do select de Duração com 50 min: o select nunca
 * mostra uma opção diferente do valor gravado. Desconhecido entra no fim, com
 * o próprio valor. Ao criar (`atual` vazio), nada a mais entra.
 */
export function opcoesTipoConsulta(tipos, atual) {
  const lista = Array.isArray(tipos) ? tipos : [];
  const opcoes = [];
  let atualEntrou = !atual;
  for (const t of lista) {
    const n = numeroDoTipo(t.value);
    if (n === null || n <= ULTIMA_DO_PACOTE) {
      opcoes.push({ value: t.value, label: t.label });
      if (t.value === atual) atualEntrou = true;
    } else if (t.value === atual) {
      opcoes.push({ value: t.value, label: `${t.label} (atual)` });
      atualEntrou = true;
    }
  }
  if (!atualEntrou && lista.length) opcoes.push({ value: atual, label: `${atual} (atual)` });
  return opcoes;
}

/**
 * Tipo sugerido ao CRIAR uma consulta, pela posição `n` dela (a contagem da
 * Agenda + 1). Para em consulta_6: depois do pacote, sugere 'avulsa' (pedido
 * 10) — nunca consulta_7 ou maior, que o select não oferece mais e que o
 * salvar gravaria sem a nutri ver. `n` inválido cai na 1ª consulta.
 */
export function tipoSugerido(n) {
  if (!Number.isInteger(n) || n < 1) return 'primeira';
  if (n === 1) return 'primeira';
  if (n <= ULTIMA_DO_PACOTE) return `consulta_${n}`;
  return 'avulsa';
}

// Modalidade da consulta. O banco só aceita 'online' | 'presencial'
// (check consultas_modalidade_check). Híbrido não existe aqui — segue só em
// pacientes.modalidade, no perfil da paciente.
export const MODALIDADES_CONSULTA = [
  { value: 'online',     label: 'Online',     icone: 'ti-video'   },
  { value: 'presencial', label: 'Presencial', icone: 'ti-map-pin' },
];

export function modalidadeInfo(modalidade) {
  return MODALIDADES_CONSULTA.find(m => m.value === modalidade) ?? MODALIDADES_CONSULTA[0];
}

/**
 * Paciente Essentia: a próxima consulta é a primeira vaga livre do pacote de 6
 * (1ª, Consulta 02 a 06), olhando os tipos que ela JÁ tem lançados (realizados
 * ou agendados, sem os cancelados). Avaliação, Retorno e Avulsa não ocupam vaga.
 * Pacote cheio (as seis lançadas) sugere 'avulsa'.
 *
 * É diferente de contar consultas: uma consulta avulsa ou um retorno antes do
 * pacote não pode empurrar a numeração.
 */
export function proximoTipoDoPacote(tiposLancados) {
  const usados = new Set(
    (tiposLancados ?? []).map(numeroDoTipo).filter(n => n !== null && n <= ULTIMA_DO_PACOTE));
  for (let n = 1; n <= ULTIMA_DO_PACOTE; n++) {
    if (!usados.has(n)) return tipoSugerido(n);
  }
  return 'avulsa';
}

/**
 * Situação de cada vaga do pacote para uma paciente: tipo → { id, status, data_hora }.
 * Só conta consulta não cancelada; havendo duas do mesmo tipo, vale a mais antiga.
 * `ignorarId` tira a própria consulta quando o modal é de edição (ela não "ocupa"
 * a vaga contra si mesma).
 */
export function vagasLancadas(lancadas, ignorarId = null) {
  const mapa = new Map();
  const ordenadas = [...(lancadas ?? [])]
    .filter(c => c && c.status !== 'cancelada' && c.id !== ignorarId)
    .sort((a, b) => String(a.data_hora ?? '').localeCompare(String(b.data_hora ?? '')));
  for (const c of ordenadas) if (!mapa.has(c.tipo)) mapa.set(c.tipo, c);
  return mapa;
}

/** Quantas das seis vagas do pacote (1ª a Consulta 06) já estão lançadas. */
export function vagasUsadasDoPacote(mapa) {
  let n = 0;
  for (let i = 1; i <= ULTIMA_DO_PACOTE; i++) {
    if (mapa.has(i === 1 ? 'primeira' : `consulta_${i}`)) n++;
  }
  return n;
}
