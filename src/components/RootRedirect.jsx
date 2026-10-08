import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { ROTA_INICIAL_NUTRI } from '../lib/rotas.js';

/**
 * Decide para onde mandar o usuário na raiz "/":
 *   • sem sessão → /login
 *   • nutri      → /nutri/agenda
 *   • paciente   → /paciente/inicio
 */
export default function RootRedirect() {
  const { session, role, loading } = useSession();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--muted)', fontSize: 13
      }}>
        Carregando…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (role === 'nutri') return <Navigate to={ROTA_INICIAL_NUTRI} replace />;
  if (role === 'paciente') return <Navigate to="/paciente/inicio" replace />;
  return <Navigate to="/login" replace />;
}
