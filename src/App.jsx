import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './lib/session.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RootRedirect from './components/RootRedirect.jsx';
import NutriLayout from './components/NutriLayout.jsx';
import PacienteLayout from './components/PacienteLayout.jsx';
import TermoConsentimento from './components/TermoConsentimento.jsx';

import Login from './app/auth/Login.jsx';
import Callback from './app/auth/Callback.jsx';
import SignupPaciente from './app/auth/SignupPaciente.jsx';

import Visao from './app/nutri/Visao.jsx';
import Pacientes from './app/nutri/Pacientes.jsx';
import PacientePerfil from './app/nutri/PacientePerfil.jsx';
import Agenda from './app/nutri/Agenda.jsx';
import ChatNutri from './app/nutri/Chat.jsx';
import FeedNutri from './app/nutri/Feed.jsx';
import PrescricoesNutri from './app/nutri/Prescricoes.jsx';
import Checkins from './app/nutri/Checkins.jsx';
import Questionarios from './app/nutri/Questionarios.jsx';
import Cadastrar from './app/nutri/Cadastrar.jsx';
import Cerebro from './app/nutri/Cerebro.jsx';
import Servicos from './app/nutri/Servicos.jsx';
import Previsibilidade from './app/nutri/Previsibilidade.jsx';
import Financeiro from './app/nutri/Financeiro.jsx';
import Biblioteca from './app/nutri/Biblioteca.jsx';
import Personalizacao from './app/nutri/Personalizacao.jsx';
import MonitoramentoOncologicoNutri from './app/nutri/MonitoramentoOncologico.jsx';

import Inicio from './app/paciente/Inicio.jsx';
import Plano from './app/paciente/Plano.jsx';
import Compras from './app/paciente/Compras.jsx';
import FeedPaciente from './app/paciente/Feed.jsx';
import Progresso from './app/paciente/Progresso.jsx';
import PrescricoesPaciente from './app/paciente/Prescricoes.jsx';
import ChatPaciente from './app/paciente/Chat.jsx';
import Checkin from './app/paciente/Checkin.jsx';
import EbooksPaciente from './app/paciente/Ebooks.jsx';
import SuplementosPaciente from './app/paciente/Suplementos.jsx';
import HabitosPaciente from './app/paciente/Habitos.jsx';
import MonitoramentoOncologicoPaciente from './app/paciente/MonitoramentoOncologico.jsx';

export default function App() {
  return (
    <SessionProvider>
      <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<Callback />} />
          <Route path="/signup-paciente/:nutriId" element={<SignupPaciente />} />
          <Route path="/signup-paciente/:nutriId/:token" element={<SignupPaciente />} />

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
          <Route element={<RequireAuth role="paciente"><TermoConsentimento><PacienteLayout /></TermoConsentimento></RequireAuth>}>
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
            <Route path="/paciente/checkin/:envioId" element={<Checkin />} />
            <Route path="/paciente/monitoramento-oncologico" element={<MonitoramentoOncologicoPaciente />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ThemeProvider>
    </SessionProvider>
  );
}
