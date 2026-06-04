import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession, signOut } from '../lib/session.jsx';
import { useTheme } from '../lib/theme.jsx';
import { supabase } from '../lib/supabase.js';
import BrandFooter from './BrandFooter.jsx';
import { iniciais, mesAno } from '../lib/utils.js';
import '../styles/nutri.css';

const NAV_CONFIG = [
  {
    group: 'Atendimento',
    items: [
      { id: 'visao',        path: '/nutri/visao',        label: 'Visão geral',         icon: 'layout-dashboard' },
      { id: 'pacientes',    path: '/nutri/pacientes',    label: 'Pacientes',           icon: 'users' },
      { id: 'agenda',       path: '/nutri/agenda',       label: 'Agenda',              icon: 'calendar' },
      { id: 'chat',         path: '/nutri/chat',         label: 'Chat',                icon: 'message-circle' },
      { id: 'feed',         path: '/nutri/feed',         label: 'Feed de pratos',      icon: 'camera' },
      { id: 'biblioteca',      path: '/nutri/biblioteca',      label: 'Biblioteca',              icon: 'book-2' },
      { id: 'monitoramento',   path: '/nutri/monitoramento-oncologico', label: 'Oncologia',         icon: 'atom-2' },
      { id: 'checkins',        path: '/nutri/checkins',        label: 'Check-ins',               icon: 'clipboard-check' },
      { id: 'questionarios', path: '/nutri/questionarios', label: 'Pré-consulta',       icon: 'clipboard-list' },
    ],
  },
  {
    group: 'Gestão do consultório',
    items: [
      { id: 'cerebro',          path: '/nutri/cerebro',         label: 'Cérebro do negócio', icon: 'brain' },
      { id: 'servicos',         path: '/nutri/servicos',        label: 'Meus serviços',       icon: 'settings' },
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
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

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
                    <span className="nav-badge">{unreadChat}</span>
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
            {unreadChat > 0 && (
              <span className="mobile-toggle-badge">{unreadChat}</span>
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
          <Outlet />
          <BrandFooter />
        </div>
      </main>
    </div>
  );
}
