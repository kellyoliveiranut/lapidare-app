import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';

function Loading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: 'var(--muted)', fontSize: 13,
      fontFamily: 'var(--font-sans)'
    }}>
      Carregando…
    </div>
  );
}

export default function RequireAuth({ children, role }) {
  const { session, role: userRole, loading } = useSession();
  const location = useLocation();

  if (loading) return <Loading />;

  if (!session) {
    // Com a query junto: o push da avaliação leva a /paciente/avaliacao?link=…
    // e sem o search a paciente deslogada voltaria do login sem o link.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (role && userRole && userRole !== role) {
    const dest = userRole === 'nutri' ? '/nutri/visao' : '/paciente/inicio';
    return <Navigate to={dest} replace />;
  }

  if (role && !userRole) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', fontFamily: 'var(--font-sans)',
        color: 'var(--ink-soft)', maxWidth: 480, margin: '60px auto'
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, marginBottom: 8 }}>
          Conta sem perfil
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Este email está autenticado, mas não está vinculado a uma nutricionista nem a uma paciente.
          Faça logout e use um convite válido.
        </p>
      </div>
    );
  }

  return children;
}
