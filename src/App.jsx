import { lazy, Suspense } from 'react';

function LoadingSpinner() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '2.5px solid var(--hair)',
        borderTopColor: 'var(--gold-deep)',
        animation: 'essentia-spin 0.75s linear infinite',
      }} />
    </div>
  );
}
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './lib/session.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RootRedirect from './components/RootRedirect.jsx';
import PacienteErrorBoundary from './components/PacienteErrorBoundary.jsx';

// Login e Callback ficam eager — são o caminho crítico para usuários não autenticados
import Login from './app/auth/Login.jsx';
import Callback from './app/auth/Callback.jsx';

const SignupPaciente = lazy(() => import('./app/auth/SignupPaciente.jsx'));
const RedefinirSenha = lazy(() => import('./app/auth/RedefinirSenha.jsx'));

const NutriLayout = lazy(() => import('./components/NutriLayout.jsx'));
const PacienteLayout = lazy(() => import('./components/PacienteLayout.jsx'));
const TermoConsentimento = lazy(() => import('./components/TermoConsentimento.jsx'));

const Visao = lazy(() => import('./app/nutri/Visao.jsx'));
const Pacientes = lazy(() => import('./app/nutri/Pacientes.jsx'));
const PacientePerfil = lazy(() => import('./app/nutri/PacientePerfil.jsx'));
const Agenda = lazy(() => import('./app/nutri/Agenda.jsx'));
const ChatNutri = lazy(() => import('./app/nutri/Chat.jsx'));
const FeedNutri = lazy(() => import('./app/nutri/Feed.jsx'));
const PrescricoesNutri = lazy(() => import('./app/nutri/Prescricoes.jsx'));
const Checkins = lazy(() => import('./app/nutri/Checkins.jsx'));
const Questionarios = lazy(() => import('./app/nutri/Questionarios.jsx'));
const Cadastrar = lazy(() => import('./app/nutri/Cadastrar.jsx'));
const Cerebro = lazy(() => import('./app/nutri/Cerebro.jsx'));
const Servicos = lazy(() => import('./app/nutri/Servicos.jsx'));
const Previsibilidade = lazy(() => import('./app/nutri/Previsibilidade.jsx'));
const Financeiro = lazy(() => import('./app/nutri/Financeiro.jsx'));
const Biblioteca = lazy(() => import('./app/nutri/Biblioteca.jsx'));
const Personalizacao = lazy(() => import('./app/nutri/Personalizacao.jsx'));
const MonitoramentoOncologicoNutri = lazy(() => import('./app/nutri/MonitoramentoOncologico.jsx'));

const Inicio = lazy(() => import('./app/paciente/Inicio.jsx'));
const Plano = lazy(() => import('./app/paciente/Plano.jsx'));
const Compras = lazy(() => import('./app/paciente/Compras.jsx'));
const FeedPaciente = lazy(() => import('./app/paciente/Feed.jsx'));
const Progresso = lazy(() => import('./app/paciente/Progresso.jsx'));
const PrescricoesPaciente = lazy(() => import('./app/paciente/Prescricoes.jsx'));
const ChatPaciente = lazy(() => import('./app/paciente/Chat.jsx'));
const Checkin = lazy(() => import('./app/paciente/Checkin.jsx'));
const EbooksPaciente = lazy(() => import('./app/paciente/Ebooks.jsx'));
const SuplementosPaciente = lazy(() => import('./app/paciente/Suplementos.jsx'));
const HabitosPaciente = lazy(() => import('./app/paciente/Habitos.jsx'));
const MonitoramentoOncologicoPaciente = lazy(() => import('./app/paciente/MonitoramentoOncologico.jsx'));
const TreinosPaciente = lazy(() => import('./app/paciente/Treinos.jsx'));
const CheckinsPaciente = lazy(() => import('./app/paciente/CheckinsPaciente.jsx'));

export default function App() {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<Callback />} />
              <Route path="/signup-paciente/:nutriId" element={<SignupPaciente />} />
              <Route path="/signup-paciente/:nutriId/:token" element={<SignupPaciente />} />
              <Route path="/redefinir-senha" element={<RedefinirSenha />} />

              {/* Painel da Nutri */}
              <Route element={<RequireAuth role="nutri"><NutriLayout /></RequireAuth>}>
                <Route path="/nutri" element={<Navigate to="/nutri/visao" replace />} />
                <Route path="/nutri/visao" element={<Visao />} />
                <Route path="/nutri/pacientes" element={<Pacientes />} />
                <Route path="/nutri/pacientes/:id" element={<PacientePerfil />} />
                <Route path="/nutri/agenda" element={<Agenda />} />
                <Route path="/nutri/chat" element={<ChatNutri />} />
                <Route path="/nutri/feed" element={<FeedNutri />} />
                <Route path="/nutri/prescricoes" element={<PrescricoesNutri />} />
                <Route path="/nutri/checkins" element={<Checkins />} />
                <Route path="/nutri/questionarios" element={<Questionarios />} />
                <Route path="/nutri/cadastrar" element={<Cadastrar />} />
                <Route path="/nutri/cerebro" element={<Cerebro />} />
                <Route path="/nutri/servicos" element={<Servicos />} />
                <Route path="/nutri/previsibilidade" element={<Previsibilidade />} />
                <Route path="/nutri/financeiro" element={<Financeiro />} />
                <Route path="/nutri/biblioteca" element={<Biblioteca />} />
                <Route path="/nutri/monitoramento-oncologico" element={<MonitoramentoOncologicoNutri />} />
                <Route path="/nutri/personalizacao" element={<Personalizacao />} />
              </Route>

              {/* App da Paciente */}
              <Route element={<RequireAuth role="paciente"><PacienteErrorBoundary><TermoConsentimento><PacienteLayout /></TermoConsentimento></PacienteErrorBoundary></RequireAuth>}>
                <Route path="/paciente" element={<Navigate to="/paciente/inicio" replace />} />
                <Route path="/paciente/inicio" element={<Inicio />} />
                <Route path="/paciente/plano" element={<Plano />} />
                <Route path="/paciente/compras" element={<Compras />} />
                <Route path="/paciente/feed" element={<FeedPaciente />} />
                <Route path="/paciente/progresso" element={<Progresso />} />
                <Route path="/paciente/prescricoes" element={<PrescricoesPaciente />} />
                <Route path="/paciente/chat" element={<ChatPaciente />} />
                <Route path="/paciente/ebooks" element={<EbooksPaciente />} />
                <Route path="/paciente/suplementos" element={<SuplementosPaciente />} />
                <Route path="/paciente/habitos" element={<HabitosPaciente />} />
                <Route path="/paciente/checkins" element={<CheckinsPaciente />} />
                <Route path="/paciente/checkin/:envioId" element={<Checkin />} />
                <Route path="/paciente/monitoramento-oncologico" element={<MonitoramentoOncologicoPaciente />} />
                <Route path="/paciente/treinos" element={<TreinosPaciente />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeProvider>
    </SessionProvider>
  );
}
