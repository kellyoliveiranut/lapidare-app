// Regra de acesso por plano da paciente. Mora aqui, e não no PacienteLayout,
// porque duas telas precisam dela: o layout (menu + bloqueio por URL) usa a
// lista, e a Jornada usa o ehAvulsa para não carregar nada no render que
// acontece antes do redirect do layout.

// Paths acessíveis no plano Avulsa — todo o resto fica bloqueado.
// É ALLOWLIST: esquecer uma linha não deixa a tela "meio acessível", deixa a
// avulsa levando redirect com toast.
export const AVULSA_ALLOWED = new Set([
  '/paciente/inicio',
  '/paciente/plano',
  '/paciente/feed',
  '/paciente/habitos',
  '/paciente/compras',
  '/paciente/progresso',
  '/paciente/suplementos',
  '/paciente/ebooks',
  '/paciente/avaliacao',
  // Solicitação de exames vale para TODA paciente, independente do plano — foi
  // requisito explícito.
  '/paciente/exames',
  // '/paciente/jornada' fica FORA de propósito (Kelly, 2026-09-26): a Avulsa
  // não tem pacote, e não vê a Jornada de jeito nenhum — cadeado no menu e
  // redirect por URL, como qualquer área do Essentia.
]);

// Normaliza na leitura: protege mesmo se alguma linha escapar capitalizada ou
// com espaço. A lógica do bloqueio é NEGATIVA — qualquer valor diferente de
// 'avulsa' (inclusive nulo) libera tudo.
export function ehAvulsa(profile) {
  return profile?.tipo_plano?.trim().toLowerCase() === 'avulsa';
}

export function bloqueadoNoPlano(profile, path) {
  if (!path) return false;
  return ehAvulsa(profile) && !AVULSA_ALLOWED.has(path);
}
