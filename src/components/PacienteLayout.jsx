import { useState, useMemo, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BrandFooter from './BrandFooter.jsx';
import { useSession, signOut } from '../lib/session.jsx';
import { useTheme } from '../lib/theme.jsx';
import { supabase } from '../lib/supabase.js';
import { iniciais, diasAte } from '../lib/utils.js';
import { ativarNotificacoes } from '../lib/push.js';
import '../styles/paciente.css';

const TABS = [
  { id: 'inicio',     path: '/paciente/inicio',                   label: 'Início',      icon: 'home-2' },
  { id: 'plano',      path: '/paciente/plano',                    label: 'Plano',       icon: 'salad' },
  { id: 'feed',       path: '/paciente/feed',                     label: 'Pratos',      icon: 'camera' },
  { id: 'habitos',    path: '/paciente/habitos',                   label: 'Hábitos',     icon: 'checklist' },
  { id: 'tratamento', path: '/paciente/monitoramento-oncologico', label: 'Tratamento',  icon: 'stethoscope' },
  { id: 'mais',                                                    label: 'Mais',        icon: 'menu-2' },
];

const MAIS_ITEMS = [
  { path: '/paciente/checkins',    icon: 'clipboard-check', label: 'Check-ins',          sub: 'Formulários da Dra.' },
  { path: '/paciente/progresso',   icon: 'trending-up',     label: 'Progresso',          sub: 'Evolução e medidas' },
  { path: '/paciente/compras',     icon: 'shopping-cart',   label: 'Lista de compras',   sub: 'Lista da semana' },
  { path: '/paciente/suplementos', icon: 'pill',            label: 'Suplementos',        sub: 'Lista do dia' },
  { path: '/paciente/prescricoes', icon: 'file-text',       label: 'Prescrições',        sub: 'Documentos da Dra.' },
  { path: '/paciente/ebooks',      icon: 'book-2',          label: 'E-books',            sub: 'Materiais da Dra.' },
  { path: '/paciente/chat',        icon: 'message-circle',  label: 'Chat com a Dra.',    sub: 'Conversa direta' },
  { path: '/paciente/treinos',     icon: 'run',             label: 'Treinos',            sub: 'Plano de exercícios' },
];

// Paths acessíveis no plano Avulsa — todo o resto fica bloqueado
const AVULSA_ALLOWED = new Set([
  '/paciente/inicio',
  '/paciente/plano',
  '/paciente/prescricoes',
  '/paciente/ebooks',
]);

const HEADERS = {
  '/paciente/inicio':       (nome) => { const h = new Date().getHours(); const s = h < 5 || h >= 18 ? 'Boa noite' : h < 12 ? 'Bom dia' : 'Boa tarde'; return { eyebrow: 'Essentia', title: `${s}, ${nome}` }; },
  '/paciente/plano':        () =>                ({ eyebrow: 'Plano alimentar',  title: 'Meu plano',         subtitle: '' }),
  '/paciente/feed':         () =>                ({ eyebrow: 'Diário alimentar', title: 'Pratos',            subtitle: 'Registre o que você comeu' }),
  '/paciente/progresso':    () =>                ({ eyebrow: 'Minha evolução',   title: 'Progresso' }),
  '/paciente/compras':      () =>                ({ eyebrow: 'Lista',            title: 'Compras',           subtitle: 'Para a semana' }),
  '/paciente/prescricoes':  () =>                ({ eyebrow: 'Documentos',       title: 'Prescrições' }),
  '/paciente/ebooks':       () =>                ({ eyebrow: 'Materiais',        title: 'E-books',           subtitle: 'Compartilhados pela sua nutri' }),
  '/paciente/suplementos':  () =>                ({ eyebrow: 'Habit tracker',    title: 'Meus suplementos',  subtitle: 'Marque diariamente' }),
  '/paciente/habitos':      () =>                ({ eyebrow: 'Hábitos do dia',   title: 'Meus hábitos',      subtitle: 'Acompanhe sua rotina' }),
  '/paciente/treinos':                  ()                => ({ eyebrow: 'Plano de exercícios',    title: 'Meus treinos' }),
  '/paciente/chat':                     (_nome, nutriNome) => ({ eyebrow: 'Conversa',              title: nutriNome || 'Sua nutri',      subtitle: 'Online' }),
  '/paciente/checkins':                  ()                => ({ eyebrow: 'Formulários',             title: 'Check-ins',                   subtitle: 'Enviados pela sua nutri' }),
  '/paciente/monitoramento-oncologico': ()                => ({ eyebrow: 'Check-in diário',      title: 'Como você está hoje?',        subtitle: 'Leva menos de 2 minutos' }),
};

export default function PacienteLayout() {
  const { profile, user, refreshProfile } = useSession();
  const tema = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [ebooksNovos, setEbooksNovos] = useState(0);
  const [checkinsPendentes, setCheckinsPendentes] = useState(0);
  const [prescricoesNovas, setPrescricoesNovas] = useState(0);
  const [suplementosNovos, setSuplementosNovos] = useState(0);
  const [treinosNovos, setTreinosNovos] = useState(0);
  const [progressoNovos, setProgressoNovos] = useState(0);
  const [comprasNovas, setComprasNovas] = useState(0);
  const [lockToast, setLockToast] = useState(false);
  const [proximaBanner, setProximaBanner] = useState(null);
  const [bannerTick, setBannerTick] = useState(0);

  const isChat = location.pathname === '/paciente/chat';
  const primeiroNome = profile?.apelido || profile?.nome?.split(' ')[0] || '';

  const isBlocked = (path) => {
    if (!path) return false;
    if (profile?.tipo_plano !== 'avulsa') return false;
    return !AVULSA_ALLOWED.has(path);
  };

  function handleBlocked() {
    setLockToast(true);
    setTimeout(() => setLockToast(false), 3000);
  }

  // Conta mensagens não lidas vindas da nutri
  const pacienteId = profile?.id ?? user?.id;
  useEffect(() => {
    if (!pacienteId) return;
    let active = true;

    async function recarregar() {
      const { count } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', pacienteId)
        .eq('de', 'nutri')
        .eq('lida', false);
      if (active) setUnreadChat(count ?? 0);
    }

    recarregar();
    const channel = supabase
      .channel(`paciente-unread-${pacienteId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mensagens',
        filter: `paciente_id=eq.${pacienteId}`,
      }, recarregar)
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [pacienteId]);

  // Conta e-books não visualizados — badge no item E-books e no botão Mais
  useEffect(() => {
    if (!pacienteId) return;
    let active = true;

    async function recarregarEbooks() {
      const { count } = await supabase
        .from('ebooks_pacientes')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', pacienteId)
        .is('visto_em', null);
      if (active) setEbooksNovos(count ?? 0);
    }

    recarregarEbooks();
    const ch = supabase
      .channel(`paciente-ebooks-${pacienteId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ebooks_pacientes',
        filter: `paciente_id=eq.${pacienteId}`,
      }, recarregarEbooks)
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [pacienteId]);

  // Conta check-ins enviados pela nutri ainda não respondidos
  useEffect(() => {
    if (!pacienteId) return;
    let active = true;

    async function recarregarCheckins() {
      const { count } = await supabase
        .from('checkin_envios')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', pacienteId)
        .is('respondido_em', null);
      if (active) setCheckinsPendentes(count ?? 0);
    }

    recarregarCheckins();
    const ch = supabase
      .channel(`paciente-checkins-${pacienteId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checkin_envios',
        filter: `paciente_id=eq.${pacienteId}`,
      }, recarregarCheckins)
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [pacienteId]);

  // Conta novidades por seção via secoes_vistas (prescricoes, suplementos, treinos, progresso, compras)
  useEffect(() => {
    if (!pacienteId) return;
    let active = true;

    async function recarregarNovidadesSecoes() {
      const { data: vistos } = await supabase
        .from('secoes_vistas')
        .select('secao, visto_em')
        .eq('paciente_id', pacienteId);
      const vm = Object.fromEntries((vistos ?? []).map(v => [v.secao, v.visto_em]));
      const ep = '1970-01-01T00:00:00.000Z';

      const [presc, sup, trei, prog, comp] = await Promise.all([
        supabase.from('prescricoes').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).gt('created_at', vm['prescricoes'] ?? ep),
        supabase.from('suplementos').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).eq('ativo', true).gt('created_at', vm['suplementos'] ?? ep),
        supabase.from('treinos_prescritos').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).eq('ativo', true).gt('created_at', vm['treinos'] ?? ep),
        supabase.from('peso_registros').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).gt('created_at', vm['progresso'] ?? ep),
        supabase.from('listas_compras').select('id', { count: 'exact', head: true })
          .eq('paciente_id', pacienteId).gt('publicado_em', vm['compras'] ?? ep),
      ]);

      if (!active) return;
      setPrescricoesNovas(presc.count ?? 0);
      setSuplementosNovos(sup.count ?? 0);
      setTreinosNovos(trei.count ?? 0);
      setProgressoNovos(prog.count ?? 0);
      setComprasNovas(comp.count ?? 0);
    }

    recarregarNovidadesSecoes();

    const chs = [
      supabase.channel(`sv-presc-${pacienteId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prescricoes', filter: `paciente_id=eq.${pacienteId}` }, recarregarNovidadesSecoes).subscribe(),
      supabase.channel(`sv-sups-${pacienteId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suplementos', filter: `paciente_id=eq.${pacienteId}` }, recarregarNovidadesSecoes).subscribe(),
      supabase.channel(`sv-trei-${pacienteId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'treinos_prescritos', filter: `paciente_id=eq.${pacienteId}` }, recarregarNovidadesSecoes).subscribe(),
      supabase.channel(`sv-prog-${pacienteId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'peso_registros', filter: `paciente_id=eq.${pacienteId}` }, recarregarNovidadesSecoes).subscribe(),
      supabase.channel(`sv-comp-${pacienteId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'listas_compras', filter: `paciente_id=eq.${pacienteId}` }, recarregarNovidadesSecoes).subscribe(),
    ];

    return () => { active = false; chs.forEach(ch => supabase.removeChannel(ch)); };
  }, [pacienteId]);

  // Ao entrar em uma seção, zera o badge imediatamente e persiste visto_em em secoes_vistas
  useEffect(() => {
    if (!pacienteId) return;
    const secoesMap = {
      '/paciente/prescricoes': ['prescricoes', setPrescricoesNovas],
      '/paciente/suplementos': ['suplementos', setSuplementosNovos],
      '/paciente/treinos':     ['treinos',      setTreinosNovos],
      '/paciente/progresso':   ['progresso',    setProgressoNovos],
      '/paciente/compras':     ['compras',      setComprasNovas],
    };
    const entry = secoesMap[location.pathname];
    if (!entry) return;
    const [secao, resetFn] = entry;
    resetFn(0);
    supabase.from('secoes_vistas').upsert(
      { paciente_id: pacienteId, secao, visto_em: new Date().toISOString() },
      { onConflict: 'paciente_id,secao' }
    );
  }, [location.pathname, pacienteId]);

  // Banner de consulta: busca a próxima dentro de 48h (ou até 15min passada)
  useEffect(() => {
    if (!pacienteId) return;
    let active = true;

    async function fetchBanner() {
      const janela15m  = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const janela48h  = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('consultas')
        .select('id, data_hora, tipo, status')
        .eq('paciente_id', pacienteId)
        .eq('status', 'agendada')
        .gte('data_hora', janela15m)
        .lte('data_hora', janela48h)
        .order('data_hora', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (active) setProximaBanner(data ?? null);
    }

    fetchBanner();

    // Tick a cada minuto para reavaliar condição de tempo
    const tick = setInterval(() => setBannerTick(n => n + 1), 60_000);

    // Realtime: se a nutri finalizar ou cancelar, some o banner imediatamente
    const channel = supabase
      .channel(`banner-consulta-${pacienteId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'consultas',
        filter: `paciente_id=eq.${pacienteId}`,
      }, () => { if (active) fetchBanner(); })
      .subscribe();

    return () => {
      active = false;
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [pacienteId]);

  // Bloqueia acesso direto por URL para paciente Avulsa (mesma regra do menu)
  useEffect(() => {
    if (!profile) return;
    if (isBlocked(location.pathname)) {
      navigate('/paciente/inicio', { replace: true });
      setLockToast(true);
      setTimeout(() => setLockToast(false), 3000);
    }
  }, [location.pathname, profile?.tipo_plano]);

  // mostrarBanner: reavalia a cada tick de minuto e a cada mudança de proximaBanner
  const mostrarBanner = useMemo(() => {
    if (!proximaBanner) return false;
    const agora = Date.now();
    const dh    = new Date(proximaBanner.data_hora).getTime();
    return (
      proximaBanner.status === 'agendada' &&
      dh - agora <= 48 * 3600 * 1000 &&   // ainda dentro das 48h
      agora < dh + 15 * 60 * 1000          // não passou 15min do horário
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximaBanner, bannerTick]);

  const bannerDias = mostrarBanner ? diasAte(proximaBanner.data_hora) : null;
  const bannerHora = mostrarBanner
    ? new Date(proximaBanner.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const header = useMemo(() => {
    const factory = HEADERS[location.pathname];
    return factory ? factory(primeiroNome, tema.nutri_nome) : { eyebrow: '', title: '' };
  }, [location.pathname, primeiroNome, tema.nutri_nome]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const sectionBadges = {
    '/paciente/prescricoes': prescricoesNovas,
    '/paciente/suplementos': suplementosNovos,
    '/paciente/treinos':     treinosNovos,
    '/paciente/progresso':   progressoNovos,
    '/paciente/compras':     comprasNovas,
  };
  const totalNovas = prescricoesNovas + suplementosNovos + treinosNovos + progressoNovos + comprasNovas;

  return (
    <div className="paciente-app">
      <header className="app-header">
        {isChat && (
          <button
            onClick={() => navigate('/paciente/inicio')}
            aria-label="Voltar"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0, marginBottom: 4,
            }}>
            <i className="ti ti-chevron-left" style={{ fontSize: 22, color: 'var(--dark-text)' }} aria-hidden="true"></i>
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {header.eyebrow && <div className="eyebrow">{header.eyebrow}</div>}
          <div className="app-title">{header.title}</div>
          {header.subtitle && <div className="app-subtitle">{header.subtitle}</div>}
        </div>
        <div className="header-right">
          <button
            className="header-avatar"
            onClick={() => setPerfilOpen(true)}
            aria-label="Editar perfil"
            style={{ border: 'none', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
          >
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : iniciais(profile?.nome)
            }
          </button>
        </div>
      </header>

      {/* Banner de lembrete de consulta — fixo entre header e body, sem scroll */}
      {mostrarBanner && (
        <div style={{
          padding: '9px max(16px, env(safe-area-inset-right)) 9px max(16px, env(safe-area-inset-left))',
          background: 'var(--paper)',
          borderBottom: '0.5px solid var(--hair)',
          borderLeft: '3px solid var(--green, #3a7a46)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>📅</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 8, letterSpacing: '.18em', textTransform: 'uppercase',
              color: 'var(--green, #3a7a46)', fontWeight: 600, marginBottom: 1,
            }}>
              Lembrete
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.35 }}>
              Consulta{' '}
              <strong>{bannerDias === 0 ? 'hoje' : 'amanhã'}</strong>
              {bannerHora && ` às ${bannerHora}`}
              {tema.nutri_nome && ` · ${tema.nutri_nome}`}
            </div>
          </div>
        </div>
      )}

      <div className="body">
        <Outlet />
        <div style={{
          textAlign: 'center', padding: '20px 24px 6px',
          fontSize: 11, color: 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          lineHeight: 1.4,
        }}>
          🔒 Seus dados estão protegidos pela Lei Geral de Proteção de Dados (LGPD).
        </div>
        <BrandFooter compact />
      </div>

      {!isChat && (
        <nav className="tabbar" role="tablist">
          {TABS.map(t => {
            const active = t.path
              ? location.pathname === t.path
              : ['/paciente/checkins', '/paciente/progresso', '/paciente/compras', '/paciente/suplementos', '/paciente/prescricoes', '/paciente/ebooks', '/paciente/chat', '/paciente/treinos'].includes(location.pathname);
            const blocked = isBlocked(t.path);

            if (!t.path) {
              return (
                <button
                  key={t.id}
                  className={`tab ${active ? 'active' : ''}`}
                  onClick={() => setMoreOpen(true)}
                  role="tab"
                  style={{ position: 'relative' }}
                >
                  <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
                  <span>{t.label}</span>
                  {(unreadChat + ebooksNovos + checkinsPendentes + totalNovas) > 0 && (
                    <span style={{
                      position: 'absolute', top: 2, right: 'calc(50% - 16px)',
                      background: unreadChat > 0 ? 'var(--red)' : 'var(--gold-deep)',
                      color: 'var(--paper)',
                      fontSize: 9, fontWeight: 600,
                      minWidth: 14, height: 14, borderRadius: 7,
                      padding: '0 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--paper)',
                    }}>{unreadChat + ebooksNovos + checkinsPendentes + totalNovas}</span>
                  )}
                </button>
              );
            }

            if (blocked) {
              return (
                <button
                  key={t.id}
                  className="tab"
                  onClick={handleBlocked}
                  role="tab"
                  style={{ position: 'relative', opacity: 0.75 }}
                >
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
                    <i className="ti ti-lock" aria-hidden="true" style={{
                      position: 'absolute', top: -4, right: -7,
                      fontSize: 9, color: 'var(--muted)', opacity: 0.6,
                    }} />
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            }

            return (
              <NavLink
                key={t.id}
                to={t.path}
                className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
                role="tab"
              >
                <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
                <span>{t.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="grabber"></div>
            <div className="serif" style={{ fontSize: 22, marginBottom: 14 }}>Mais</div>
            {MAIS_ITEMS.map(item => {
              const isChatItem = item.path === '/paciente/chat';
              const blocked = isBlocked(item.path);
              return (
                <button key={item.path}
                  className="sheet-item"
                  style={blocked ? { opacity: 0.7 } : {}}
                  onClick={() => {
                    if (blocked) { setMoreOpen(false); handleBlocked(); return; }
                    setMoreOpen(false); navigate(item.path);
                  }}>
                  <div className="icon-wrap" style={{ position: 'relative' }}>
                    <i className={`ti ti-${item.icon}`} aria-hidden="true"></i>
                    {blocked && (
                      <i className="ti ti-lock" aria-hidden="true" style={{
                        position: 'absolute', top: -3, right: -4,
                        fontSize: 10, opacity: 0.6,
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="label">{item.label}</div>
                    <div className="sub">{item.sub}</div>
                  </div>
                  {isChatItem && unreadChat > 0 && !blocked && (
                    <span style={{
                      background: 'var(--red)', color: 'var(--paper)',
                      fontSize: 10, fontWeight: 600,
                      minWidth: 18, height: 18, borderRadius: 9,
                      padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{unreadChat}</span>
                  )}
                  {item.path === '/paciente/ebooks' && ebooksNovos > 0 && !blocked && (
                    <span style={{
                      background: 'var(--gold-deep)', color: 'var(--paper)',
                      fontSize: 10, fontWeight: 600,
                      minWidth: 18, height: 18, borderRadius: 9,
                      padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{ebooksNovos}</span>
                  )}
                  {item.path === '/paciente/checkins' && checkinsPendentes > 0 && !blocked && (
                    <span style={{
                      background: 'var(--gold-deep)', color: 'var(--paper)',
                      fontSize: 10, fontWeight: 600,
                      minWidth: 18, height: 18, borderRadius: 9,
                      padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{checkinsPendentes}</span>
                  )}
                  {sectionBadges[item.path] > 0 && !blocked && (
                    <span style={{
                      background: 'var(--gold-deep)', color: 'var(--paper)',
                      fontSize: 10, fontWeight: 600,
                      minWidth: 18, height: 18, borderRadius: 9,
                      padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{sectionBadges[item.path]}</span>
                  )}
                  <i className="ti ti-chevron-right" style={{ color: 'var(--muted)' }} aria-hidden="true"></i>
                </button>
              );
            })}

            <div style={{ height: 1, background: 'var(--hair)', margin: '12px 0 8px' }}></div>

            <button
              className="sheet-item"
              onClick={async () => {
                if (window.confirm('Tem certeza que deseja sair?')) {
                  setMoreOpen(false);
                  await handleSignOut();
                }
              }}>
              <div className="icon-wrap" style={{ background: 'var(--red-soft)' }}>
                <i className="ti ti-logout" style={{ color: 'var(--red)' }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1 }}>
                <div className="label" style={{ color: 'var(--red)' }}>Sair</div>
                <div className="sub">Encerrar sessão</div>
              </div>
            </button>
          </div>
        </div>
      )}
      {perfilOpen && (
        <PerfilSheet
          profile={profile}
          user={user}
          onClose={() => setPerfilOpen(false)}
          refreshProfile={refreshProfile}
        />
      )}

      {lockToast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ink)', color: 'var(--paper)',
          padding: '10px 18px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, zIndex: 600,
          maxWidth: '85vw', textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          whiteSpace: 'nowrap',
          animation: 'fadeInUp .2s ease',
        }}>
          <i className="ti ti-lock" aria-hidden="true" />
          Esta área está disponível no plano Essentia.
        </div>
      )}

      <AtivarNotificacoesPaciente />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Banner de convite para ativar notificações push
   Aparece apenas em modo standalone (PWA instalado),
   permissão ainda não decidida, e se não foi dispensado.
   ───────────────────────────────────────────────────────── */
function AtivarNotificacoesPaciente() {
  const [visivel, setVisivel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    const suporte = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const dispensado = localStorage.getItem('push_convite_dispensado');
    const permissao = suporte ? Notification.permission : null;

    if (standalone && suporte && permissao === 'default' && !dispensado) {
      // Pequeno delay para não disputar atenção com o carregamento inicial
      const t = setTimeout(() => setVisivel(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visivel) return null;

  async function handleAtivar() {
    setBusy(true);
    setErro(null);
    try {
      await ativarNotificacoes();
      setVisivel(false);
    } catch (err) {
      setErro(err.message);
      setBusy(false);
    }
  }

  function handleDispensado() {
    localStorage.setItem('push_convite_dispensado', '1');
    setVisivel(false);
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 72,
      left: 12,
      right: 12,
      zIndex: 590,
      background: '#2C3A30',
      borderRadius: 16,
      padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,.32)',
      animation: 'fadeInUp .25s ease',
    }}>
      {/* Ícone + texto */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,255,255,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-bell-ringing" style={{ fontSize: 18, color: '#C9A96E' }} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: '#FDFBF8',
            marginBottom: 3, fontFamily: 'var(--font-sans)',
            lineHeight: 1.3,
          }}>
            Ativar avisos do app
          </div>
          <div style={{
            fontSize: 12, color: 'rgba(253,251,248,.7)',
            lineHeight: 1.5, fontFamily: 'var(--font-sans)',
          }}>
            Quer receber avisos quando sua nutri enviar seu plano, materiais e lembretes de consulta?
          </div>
        </div>
      </div>

      {/* Erro inline */}
      {erro && (
        <div style={{
          fontSize: 11.5, color: '#fca5a5',
          marginBottom: 10, lineHeight: 1.4,
          fontFamily: 'var(--font-sans)',
        }}>
          {erro}
        </div>
      )}

      {/* Botões */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleAtivar}
          disabled={busy}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: '#C9A96E', border: 'none',
            color: '#1a2318', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)',
            opacity: busy ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <i className="ti ti-bell" style={{ fontSize: 14 }} aria-hidden="true" />
          {busy ? 'Ativando…' : 'Ativar avisos'}
        </button>
        <button
          onClick={handleDispensado}
          disabled={busy}
          style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'transparent',
            border: '1px solid rgba(253,251,248,.2)',
            color: 'rgba(253,251,248,.7)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

function PerfilSheet({ profile, user, onClose, refreshProfile }) {
  const [apelido, setApelido] = useState(profile?.apelido ?? '');
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatares_pacientes')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setErro('Erro ao enviar foto.'); setUploading(false); return; }
    const { data } = supabase.storage.from('avatares_pacientes').getPublicUrl(path);
    // Adiciona timestamp para evitar cache do browser
    setAvatarPreview(data.publicUrl + '?t=' + Date.now());
    setUploading(false);
  }

  async function salvar() {
    setErro(null);
    setSaving(true);
    const updates = { apelido: apelido.trim() || null };
    if (avatarPreview && avatarPreview !== profile?.avatar_url) {
      updates.avatar_url = avatarPreview;
    }
    const { error } = await supabase
      .from('pacientes')
      .update(updates)
      .eq('id', profile?.id);
    setSaving(false);
    if (error) { setErro('Erro ao salvar: ' + error.message); return; }
    await refreshProfile();
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="grabber"></div>
        <div className="serif" style={{ fontSize: 22, marginBottom: 20 }}>Meu perfil</div>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--gold)', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 600, color: 'var(--ink)',
            }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : iniciais(profile?.nome)
              }
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--ink)', border: '2px solid var(--paper)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0,
              }}>
              <i className="ti ti-camera" style={{ fontSize: 13, color: '#fff' }} aria-hidden="true"></i>
            </button>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              marginTop: 10, background: 'none', border: 'none',
              fontSize: 12, color: 'var(--gold-deep)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', padding: 0,
            }}>
            {uploading ? 'Enviando...' : 'Trocar foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {/* Apelido */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 5, fontWeight: 500 }}>
            Como gostaria de ser chamada?
          </span>
          <input
            type="text"
            value={apelido}
            onChange={e => setApelido(e.target.value)}
            placeholder={profile?.nome?.split(' ')[0] ?? ''}
            maxLength={30}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              border: '0.5px solid var(--hair)', borderRadius: 10,
              outline: 'none', fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box', background: 'var(--bg-soft)',
            }}
          />
        </label>

        {erro && (
          <div style={{
            fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: 'var(--red-soft)', color: 'var(--red)',
          }}>{erro}</div>
        )}

        <button
          onClick={salvar}
          disabled={saving || uploading}
          style={{
            width: '100%', padding: '12px 18px',
            background: 'var(--ink)', color: 'var(--paper)',
            border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            opacity: (saving || uploading) ? 0.6 : 1,
          }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
