import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * SessionContext expõe:
 *   • session  — objeto de sessão do Supabase (ou null)
 *   • user     — atalho para session.user (ou null)
 *   • role     — 'nutri' | 'paciente' | null
 *   • profile  — linha da tabela nutris/pacientes correspondente
 *   • loading  — true enquanto ainda determina sessão+role
 */
const SessionContext = createContext({
  session: null,
  user: null,
  role: null,
  profile: null,
  loading: true,
});

async function resolveRole(userId) {
  if (!userId) return { role: null, profile: null };

  // Queries em paralelo — elimina 1 round-trip extra para pacientes
  const [nutriRes, pacienteRes] = await Promise.all([
    supabase.from('nutris').select('*').eq('id', userId).maybeSingle(),
    supabase.from('pacientes').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (nutriRes.data) return { role: 'nutri', profile: nutriRes.data };
  if (pacienteRes.data) return { role: 'paciente', profile: pacienteRes.data };
  return { role: null, profile: null };
}

export function SessionProvider({ children }) {
  const [state, setState] = useState({
    session: null,
    user: null,
    role: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    async function hydrate(session) {
      const { role, profile } = await resolveRole(session?.user?.id);
      if (!active) return;
      setState({
        session,
        user: session?.user ?? null,
        role,
        profile,
        loading: false,
      });
      // Carimba o último acesso da paciente. Fire-and-forget: nunca aguardamos
      // nem deixamos um erro (rede/RLS) afetar a hidratação da sessão.
      if (role === 'paciente' && profile?.id) {
        supabase
          .from('pacientes')
          .update({ ultimo_acesso: new Date().toISOString() })
          .eq('id', profile.id)
          .then(() => {}, () => {});
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      hydrate(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      hydrate(newSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Re-busca o profile sem perder a sessão (usado depois de updates,
  // ex.: paciente aceita o termo de consentimento).
  async function refreshProfile() {
    if (!state.user?.id) return;
    const { role, profile } = await resolveRole(state.user.id);
    setState(s => ({ ...s, role, profile }));
  }

  return (
    <SessionContext.Provider value={{ ...state, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export async function signOut() {
  await supabase.auth.signOut();
}
