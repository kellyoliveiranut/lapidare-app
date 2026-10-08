import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../lib/session.jsx';
import { ROTA_INICIAL_NUTRI } from '../../lib/rotas.js';

/**
 * Rota chamada pelo link de convite e pelo magic link do Supabase.
 * O SDK já lê o token da URL automaticamente (detectSessionInUrl).
 * Esperamos a sessão materializar e redirecionamos conforme o role.
 */
export default function Callback() {
  const navigate = useNavigate();
  const { session, role, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }
    if (role === 'nutri') navigate(ROTA_INICIAL_NUTRI, { replace: true });
    else if (role === 'paciente') navigate('/paciente/inicio', { replace: true });
    // se role=null o RequireAuth com role exibirá o aviso
    else navigate('/login', { replace: true });
  }, [session, role, loading, navigate]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: 'var(--muted)', fontSize: 13,
      fontFamily: 'var(--font-sans)'
    }}>
      Finalizando autenticação…
    </div>
  );
}
