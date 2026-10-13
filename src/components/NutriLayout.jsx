import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession, signOut } from '../lib/session.jsx';
import { useTheme } from '../lib/theme.jsx';
import { supabase } from '../lib/supabase.js';
import { avisarStatus } from '../lib/realtime.js';
import BrandFooter from './BrandFooter.jsx';
import BannerNovidades from './BannerNovidades.jsx';
import { iniciais, mesAno } from '../lib/utils.js';
import { EVENTO_AVISOS_MUDOU, EVENTO_FEED_RECARREGAR } from '../lib/avisosNutri.js';
import { contarSelos, tiposParaMarcarAoAbrir, rotuloSelo, TIPOS_COM_SELO } from '../lib/selosMenuNutri.js';
import '../styles/nutri.css';

const NAV_CONFIG = [
  {
    group: 'Atendimento',
    items: [
      { id: 'visao',        path: '/nutri/visao',        label: 'Visão geral',         icon: 'layout-dashboard' },
      { id: 'pacientes',    path: '/nutri/pacientes',    label: 'Pacientes',           icon: 'users' },
      { id: 'agenda',       path: '/nutri/agenda',       label: 'Agenda',              icon: 'calendar' },
      { id: 'chat',         path: '/nutri/chat',         label: 'Chat',                icon: 'message-circle' },
      { id: 'avisos',       path: '/nutri/avisos',       label: 'Avisos',              icon: 'bell' },
      { id: 'feed',         path: '/nutri/feed',         label: 'Feed de pratos',      icon: 'camera' },
      { id: 'biblioteca',      path: '/nutri/biblioteca',      label: 'Biblioteca',              icon: 'book-2' },
      { id: 'monitoramento',    path: '/nutri/monitoramento-oncologico', label: 'Oncologia',           icon: 'atom-2' },
      { id: 'protocolos',       path: '/nutri/protocolos',       label: 'Protocolos',              icon: 'list-search' },
      { id: 'mensagem-motivacional', path: '/nutri/mensagem-motivacional', label: 'Mensagem motivacional', icon: 'message-heart' },
      { id: 'checkins',        path: '/nutri/checkins',        label: 'Check-ins',               icon: 'clipboard-check' },
      // "Pré-consulta" (/nutri/questionarios) saiu do menu em 2026-08-20: zero
      // modelos cadastrados e dois envios antigos, que continuam visíveis pela
      // aba de check-ins do perfil da paciente. A rota, o trigger que dispara
      // os envios no cadastro e as tabelas seguem intactos — só o atalho saiu.
    ],
  },
  {
    group: 'Gestão do consultório',
    items: [
      { id: 'cerebro',          path: '/nutri/cerebro',         label: 'Cérebro do negócio', icon: 'brain' },
      { id: 'servicos',         path: '/nutri/servicos',        label: 'Meus serviços',       icon: 'settings' },
      // Logo abaixo de "Meus serviços" de propósito: um é o catálogo do que ela
      // vende, o outro o estoque do que ela entrega junto.
      { id: 'boxes',            path: '/nutri/boxes',           label: 'Box de boas-vindas',  icon: 'gift' },
      { id: 'previsibilidade',  path: '/nutri/previsibilidade', label: 'Previsibilidade',     icon: 'trending-up' },
      { id: 'financeiro',       path: '/nutri/financeiro',      label: 'Financeiro real',     icon: 'credit-card' },
      { id: 'personalizacao',   path: '/nutri/personalizacao',  label: 'Personalização',      icon: 'palette' },
    ],
  },
];

const ROUTE_META = NAV_CONFIG.flatMap(g =>
  g.items.map(it => ({ ...it, zone: g.group }))
).reduce((acc, it) => { acc[it.path] = it; return acc; }, {});

export default function NutriLayout() {
  const { profile, user } = useSession();
  const tema = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [avisosNovos, setAvisosNovos] = useState(0);
  const [fotosNovas, setFotosNovas] = useState(0);
  const [checkinsNovos, setCheckinsNovos] = useState(0);
  const [oncoNovos, setOncoNovos] = useState(0);
  const location = useLocation();

  // Fecha drawer ao trocar de rota (mobile)
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const meta = useMemo(() => {
    if (ROUTE_META[location.pathname]) return ROUTE_META[location.pathname];
    if (location.pathname.startsWith('/nutri/pacientes/')) return ROUTE_META['/nutri/pacientes'];
    if (location.pathname === '/nutri/monitoramento-oncologico') return ROUTE_META['/nutri/monitoramento-oncologico'];
    return { zone: '', label: '' };
  }, [location.pathname]);

  // Conta mensagens não lidas (vindas das pacientes)
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function recarregar() {
      const { count } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('nutri_id', user.id)
        .eq('de', 'paciente')
        .eq('lida', false);
      if (active) setUnreadChat(count ?? 0);
    }

    recarregar();
    const channel = supabase
      .channel(`nutri-unread-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mensagens',
        filter: `nutri_id=eq.${user.id}`,
      }, recarregar)
      .subscribe(avisarStatus('nutri-unread'));

    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  // Conta avisos não vistos (avisos_nutri; a RLS já filtra pela nutri), um
  // número por item do menu (selosMenuNutri.js): contrato em Avisos, formulário
  // e check-in diário em Check-ins, alerta em Oncologia, foto no Feed. Uma
  // consulta só (tipo das linhas não vistas), agrupada no cliente; não vistos
  // ficam sempre poucos (abrir cada tela marca os dela), longe do teto de 1000
  // linhas por consulta.
  // Mesmo molde do contador do chat, com dois reforços: a recontagem ao voltar
  // à aba (o websocket costuma cair no celular em segundo plano) e o evento
  // disparado depois de marcar como visto (página Avisos e, aqui embaixo, a
  // abertura do Feed). Se o canal
  // falhar, o número segue certo por esses dois caminhos e pelo reload.
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function recarregar() {
      const { data, error } = await supabase
        .from('avisos_nutri')
        .select('tipo')
        .is('visto_em', null)
        .in('tipo', TIPOS_COM_SELO);
      if (!active || error) return;   // com erro, os números ficam como estavam
      const s = contarSelos(data);
      setAvisosNovos(s.avisos);
      setCheckinsNovos(s.checkins);
      setOncoNovos(s.oncologia);
      setFotosNovas(s.feed);
    }

    recarregar();
    const filtro = { schema: 'public', table: 'avisos_nutri', filter: `nutri_id=eq.${user.id}` };
    const channel = supabase
      .channel(`nutri-avisos-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', ...filtro }, recarregar)
      .on('postgres_changes', { event: 'UPDATE', ...filtro }, recarregar)
      .subscribe(avisarStatus('nutri-avisos'));

    function onVisible() {
      if (document.visibilityState === 'visible') recarregar();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(EVENTO_AVISOS_MUDOU, recarregar);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(EVENTO_AVISOS_MUDOU, recarregar);
    };
  }, [user]);

  // Abrir o Feed de pratos zera o número de fotos novas. `location.key` muda a
  // cada navegação, então clicar de novo em "Feed de pratos" estando nele
  // também zera; abrir o app direto na rota também. Falha (rede, função ainda
  // ausente no banco) é ignorada: o número continua vindo do banco, sem texto
  // de erro e sem nova tentativa.
  useEffect(() => {
    if (!user || !location.pathname.startsWith('/nutri/feed')) return;
    const desde = Date.now();
    supabase.rpc('marcar_avisos_tipo_vistos', { p_tipo: 'foto_prato' })
      .then(({ error }) => {
        if (error) return;
        window.dispatchEvent(new Event(EVENTO_AVISOS_MUDOU));
        // O número zerou: a lista do Feed tem de mostrar o que foi contado.
        window.dispatchEvent(new CustomEvent(EVENTO_FEED_RECARREGAR, { detail: { desde } }));
      }, () => {});
  }, [user, location.pathname, location.key]);

  // Abrir Check-ins marca formulário e check-in diário como vistos; abrir
  // Oncologia, só o check-in diário (a nutri lê o diário ali). O alerta nunca
  // sai ao abrir tela: só pelo "Marcar como visto" da tela Avisos. Mesmo molde
  // do Feed acima: por rota, falha silenciosa, e os selos recontam do banco.
  useEffect(() => {
    if (!user) return;
    const tipos = tiposParaMarcarAoAbrir(location.pathname);
    if (!tipos.length) return;
    Promise.all(tipos.map(p_tipo => supabase.rpc('marcar_avisos_tipo_vistos', { p_tipo })))
      .then(rs => {
        if (rs.some(r => !r.error)) window.dispatchEvent(new Event(EVENTO_AVISOS_MUDOU));
      }, () => {});
  }, [user, location.pathname, location.key]);

  const totalSelos = unreadChat + avisosNovos + checkinsNovos + oncoNovos + fotosNovas;

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className={`nutri-panel ${mobileOpen ? 'mobile-drawer-open' : ''}`}>
      <div className="mobile-overlay" onClick={() => setMobileOpen(false)}></div>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-head">
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
            aria-label="Alternar menu"
          >‹</button>
          {tema.logo_url ? (
            <img src={tema.logo_url} alt={tema.marca_nome}
              className="sidebar-logo" loading="lazy" decoding="async"
              style={{ maxHeight: 28, maxWidth: '80%', objectFit: 'contain', marginBottom: 4 }} />
          ) : null}
          <div className="sidebar-brand">{tema.marca_nome}</div>
          <div className="sidebar-title">{tema.marca_subtitulo || 'Painel da Nutri'}</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_CONFIG.map(group => (
            <div key={group.group}>
              <div className="nav-group">{group.group}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                >
                  <span className="nav-icon"><i className={`ti ti-${item.icon}`} aria-hidden="true"></i></span>
                  <span>{item.label}</span>
                  {item.id === 'chat' && unreadChat > 0 && (
                    <span className="nav-badge" aria-label={rotuloSelo(unreadChat)}>{unreadChat}</span>
                  )}
                  {item.id === 'avisos' && avisosNovos > 0 && (
                    <span className="nav-badge" aria-label={rotuloSelo(avisosNovos)}>{avisosNovos}</span>
                  )}
                  {item.id === 'checkins' && checkinsNovos > 0 && (
                    <span className="nav-badge" aria-label={rotuloSelo(checkinsNovos)}>{checkinsNovos}</span>
                  )}
                  {item.id === 'monitoramento' && oncoNovos > 0 && (
                    <span className="nav-badge" aria-label={rotuloSelo(oncoNovos)}>{oncoNovos}</span>
                  )}
                  {item.id === 'feed' && fotosNovas > 0 && (
                    <span className="nav-badge" aria-label={rotuloSelo(fotosNovas)}>{fotosNovas}</span>
                  )}
                </NavLink>
              ))}
              {group.group === 'Atendimento' && <div className="nav-divider"></div>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-label">Sessão</div>
          <div className="sidebar-footer-val">{profile?.nome ?? '—'}</div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <i className="ti ti-logout" style={{ fontSize: 15 }} aria-hidden="true"></i>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-toggle"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <i className="ti ti-menu-2" aria-hidden="true"></i>
            {/* Celular: um número só no botão do menu, somando todos os selos
                (chat, avisos, check-ins, oncologia e fotos); cada item segue com
                o seu dentro do menu. Cada aviso conta em um selo só. */}
            {totalSelos > 0 && (
              <span className="mobile-toggle-badge" aria-label={rotuloSelo(totalSelos)}>{totalSelos}</span>
            )}
          </button>
          <span className="topbar-zone">{meta.zone}</span>
          <span className="topbar-sep">·</span>
          <span className="topbar-page">{meta.label}</span>
          <div className="topbar-right">
            <span className="topbar-date">{mesAno()}</span>
            <div className="topbar-avatar">{iniciais(profile?.nome)}</div>
          </div>
        </header>

        <div className="content">
          <BannerNovidades />
          <Outlet />
          <BrandFooter />
        </div>
      </main>
    </div>
  );
}
