/**
 * Registro pendente na LISTA de pacientes da nutri (bloco-88).
 *
 * A regra é a mesma de registroPendente() em protocoloCiclo.js — só `false`
 * exato confirma; true, null e ausente contam como pendente —, repetida aqui
 * de propósito: protocoloCiclo.js importa o catálogo de protocolos (~145 KB),
 * e a tela de Pacientes não precisa dele. O teste
 * registroPendenteLista.teste.mjs trava as duas regras juntas.
 */

/** Linha de tratamentos_oncologicos ({ paciente_id, registro_pendente }) pendente? */
export function linhaPendente(linha) {
  if (!linha) return false;
  return linha.registro_pendente !== false;
}

/**
 * Ids das pacientes com registro pendente, a partir do resultado da consulta
 * `select('paciente_id,registro_pendente')`. Paciente sem linha não entra (não
 * há registro a conferir). Erro na consulta (inclusive coluna inexistente)
 * devolve conjunto VAZIO: sem marcador e sem contador, nunca "todas
 * pendentes" por engano.
 */
export function idsComRegistroPendente({ data, error } = {}) {
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.filter(linhaPendente).map(l => l.paciente_id));
}

/** Quantas das pacientes listadas estão no conjunto de pendentes. */
export function contarRegistroPendente(pacientes, ids) {
  return (pacientes ?? []).filter(p => ids.has(p.id)).length;
}
