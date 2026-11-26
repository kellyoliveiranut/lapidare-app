/**
 * "A definir": uma linha por paciente, só a PRÓXIMA consulta a agendar.
 * Pedido de 2026-11-24 — antes a lista mostrava todas as consultas sem data
 * (a mesma paciente podia aparecer 5 vezes). A próxima é a de menor posição
 * no pacote: 1ª, Consulta 2, 3… ; tipos fora do pacote (avaliação, retorno,
 * avulsa) vêm depois. Empate: a mais antiga criada, depois o id.
 */
import { numeroDaRenovacao } from './renovacao.js';

function posicao(tipo) {
  if (tipo === 'primeira') return 1;
  const r = numeroDaRenovacao(tipo);
  if (r !== null) return 6 + r;   // depois das seis do pacote
  const m = String(tipo ?? '').match(/^consulta_(\d+)$/);
  return m ? Number(m[1]) : 100;
}

export function proximaADefinirPorPaciente(lista) {
  const melhor = new Map();
  const semPaciente = [];
  for (const c of lista ?? []) {
    const pid = c.paciente?.id ?? c.paciente_id;
    if (!pid) { semPaciente.push(c); continue; }
    const atual = melhor.get(pid);
    if (!atual) { melhor.set(pid, c); continue; }
    const a = posicao(c.tipo), b = posicao(atual.tipo);
    const antes = a !== b ? a < b
      : String(c.created_at ?? '') !== String(atual.created_at ?? '')
        ? String(c.created_at ?? '') < String(atual.created_at ?? '')
        : String(c.id) < String(atual.id);
    if (antes) melhor.set(pid, c);
  }
  // Mantém a ordem original da lista.
  const escolhidas = new Set([...melhor.values(), ...semPaciente]);
  return (lista ?? []).filter(c => escolhidas.has(c));
}
