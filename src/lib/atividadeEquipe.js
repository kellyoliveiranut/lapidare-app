import { supabase } from './supabase.js';

// Registro de "a secretária abriu a ficha desta paciente". Só para a secretária
// (a Dra. não é registrada). No máximo uma vez por paciente a cada 30 min por
// aparelho, para recarregar a tela não encher o histórico. Nunca atrapalha a tela:
// falha em silêncio.
const JANELA_MS = 30 * 60 * 1000;

export function registrarFichaAberta(secretaria, nutriId, pacienteId) {
  if (!secretaria || !nutriId || !pacienteId) return;
  const chave = `ficha-aberta:${pacienteId}`;
  try {
    const ultimo = Number(sessionStorage.getItem(chave) || 0);
    if (Date.now() - ultimo < JANELA_MS) return;
    sessionStorage.setItem(chave, String(Date.now()));
  } catch { /* sem storage: registra mesmo assim */ }
  supabase.auth.getUser().then(({ data }) => {
    const login = data?.user?.id;
    if (!login) return;
    return supabase.from('atividade_equipe').insert({
      nutri_id: nutriId, user_id: login, acao: 'abriu_ficha', tabela: 'pacientes',
      registro_id: pacienteId, paciente_id: pacienteId,
    });
  }).catch(() => {});
}
