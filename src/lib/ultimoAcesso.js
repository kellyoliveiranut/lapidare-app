/**
 * Quando carimbar pacientes.ultimo_acesso. A sessão é hidratada a cada evento
 * do Supabase (inclusive a renovação do token, de hora em hora), e uma aba
 * esquecida aberta também renova — o carimbo antigo tratava isso como "a
 * paciente abriu o app" e enganava o lembrete "volte ao app". Agora só carimba
 * com a aba visível e se o último carimbo já tem INTERVALO_MIN minutos ou mais.
 *
 * `ultimoCarimbo` é o ultimo_acesso que veio do banco na própria carga do
 * perfil: não precisa guardar nada no aparelho.
 */
export const INTERVALO_MIN = 180;

export function deveCarimbarAcesso({ ultimoCarimbo, agora, visivel }) {
  if (!visivel) return false;
  if (!ultimoCarimbo) return true;
  const ult = Date.parse(ultimoCarimbo);
  if (!Number.isFinite(ult)) return true;
  return agora - ult >= INTERVALO_MIN * 60 * 1000;
}
