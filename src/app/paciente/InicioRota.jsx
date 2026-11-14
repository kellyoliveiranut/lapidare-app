import { lazy, Suspense } from 'react';
import { useSession } from '../../lib/session.jsx';

const Inicio = lazy(() => import('./Inicio.jsx'));
const InicioSimples = lazy(() => import('./InicioSimples.jsx'));

// Escolhe a tela inicial pelo flag da nutri (pacientes.modo_simples).
export default function InicioRota() {
  const { profile } = useSession();
  return (
    <Suspense fallback={null}>
      {profile?.modo_simples ? <InicioSimples /> : <Inicio />}
    </Suspense>
  );
}
