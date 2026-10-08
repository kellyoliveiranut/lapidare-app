/* ============================================================
   LISTAS DA AGENDA — o que sai do array de consultas para cada seção

   Função pura, sem supabase nem React, para poder ser testada com um `node`
   avulso (agendaListas.teste.mjs).
   ============================================================ */

const SEM_NOME = 'Paciente sem nome';

/**
 * Pacientes da seção "Canceladas" (pedido 8, 2026-10-08): UMA linha por
 * paciente, e só de quem tem pelo menos uma consulta cancelada e NENHUMA
 * consulta `agendada` ainda por acontecer — futura ou sem data ("a definir").
 * Quem tem nova data ou está esperando uma já está nas outras seções; aqui
 * fica quem saiu da agenda e pode precisar de contato.
 *
 * `consultas` é o mesmo array da Agenda. A paciente vem como `paciente_id` ou,
 * como a Agenda carrega hoje, dentro do join `paciente: { id, nome }`.
 *
 * `agora` é o MESMO valor e a MESMA comparação do `futuras` da Agenda: ISO em
 * string e `data_hora >= agora`. Comparar de outro jeito aqui faria as duas
 * listas discordarem sobre uma consulta bem no limite.
 *
 * Devolve [{ paciente_id, nome }] em ordem alfabética sem acento e sem
 * diferenciar maiúscula; paciente sem nome vai para o fim, como "Paciente sem
 * nome".
 */
export function pacientesComCancelada(consultas, agora) {
  const porPaciente = new Map();
  for (const c of consultas ?? []) {
    const id = c?.paciente_id ?? c?.paciente?.id;
    if (!id) continue;
    let p = porPaciente.get(id);
    if (!p) {
      p = { paciente_id: id, nome: null, temCancelada: false, temPendente: false };
      porPaciente.set(id, p);
    }
    if (!p.nome && c.paciente?.nome) p.nome = c.paciente.nome;
    if (c.status === 'cancelada') p.temCancelada = true;
    if (c.status === 'agendada' && (!c.data_hora || c.data_hora >= agora)) p.temPendente = true;
  }

  const lista = [...porPaciente.values()].filter(p => p.temCancelada && !p.temPendente);
  lista.sort((a, b) => {
    if (!a.nome !== !b.nome) return a.nome ? -1 : 1;
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', { sensitivity: 'base' });
  });
  return lista.map(p => ({ paciente_id: p.paciente_id, nome: p.nome ?? SEM_NOME }));
}
