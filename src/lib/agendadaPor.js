// "Agendada por Kelly" / "Agendada pela secretária". Consultas antigas ou
// criadas pelo sistema (agendada_por nulo) não mostram nada: não afirmamos
// quem não sabemos.
export function rotuloAgendadaPor(quem, nomeNutri) {
  if (quem === 'secretaria') return 'Agendada pela secretária';
  if (quem === 'nutri') return `Agendada por ${String(nomeNutri ?? '').trim().split(' ')[0] || 'a Dra.'}`;
  return null;
}
