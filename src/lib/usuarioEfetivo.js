// Para a secretária, `user.id` passa a ser o id da nutri: o app inteiro filtra e
// grava com `user.id` como dono dos dados, e o banco (nutri_efetiva()) aceita.
// O id real do login fica em `user.id_real`.
export function usuarioEfetivo(user, secretaria, profile) {
  if (!user || !secretaria || !profile?.id) return user ?? null;
  return { ...user, id: profile.id, id_real: user.id };
}
