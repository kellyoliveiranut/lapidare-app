import { useState, useMemo, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BrandFooter from './BrandFooter.jsx';
import { useSession, signOut } from '../lib/session.jsx';
import { useTheme } from '../lib/theme.jsx';
import { supabase } from '../lib/supabase.js';
import { iniciais } from '../lib/utils.js';
import '../styles/paciente.css';

const TABS = [
  { id: 'inicio',     path: '/paciente/inicio',                      label: 'Início',     icon: 'home' },
  { id: 'plano',      path: '/paciente/plano',                       label: 'Plano',      icon: 'salad' },
  { id: 'feed',       path: '/paciente/feed',                        label: 'Pratos',     icon: 'camera' },
  { id: 'tratamento', path: '/paciente/monitoramento-oncologico',    label: 'Tratamento', icon: 'stethoscope' },
  { id: 'mais',                                                       label: 'Mais',       icon: 'menu-2' },
];

const MAIS_ITEMS = [
  { path: '/paciente/progresso',   icon: 'trending-up',    label: 'Progresso',           sub: 'Evolução e medidas' },
  { path: '/paciente/compras',     icon: 'shopping-cart',  label: 'Lista de compras',    sub: 'Lista da semana' },
  { path: '/paciente/suplementos', icon: 'pill',           label: 'Suplementos',         sub: 'Lista do dia' },
  { path: '/paciente/habitos',     icon: 'checklist',      label: 'Hábitos',             sub: 'Tracker diário' },
  { path: '/paciente/prescricoes', icon: 'file-text',      label: 'Prescrições',         sub: 'Documentos da Dra.' },
  { path: '/paciente/ebooks',      icon: 'book-2',         label: 'E-books',             sub: 'Materiais da Dra.' },
  { path: '/paciente/chat',        icon: 'message-circle', label: 'Chat com a Dra.',     sub: 'Conversa direta' },
  { path: '/paciente/treinos',     icon: 'run',            label: 'Treinos',             sub: 'Plano de exercícios' },
];

// Paths acessíveis no plano Avulsa — todo o resto fica bloqueado
const AVULSA_ALLOWED = new Set([
  '/paciente/inicio',
  '/paciente/plano',
  '/paciente/prescricoes',
  '/paciente/ebooks',
]);

const HEADERS = {
  '/paciente/inicio':       (nome) =>           ({ eyebrow: 'Essentia',          title: `Bom dia, ${nome}` }),
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
  const [lockToast, setLockToast] = useState(false);

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
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function recarregar() {
      const { count } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', user.id)
        .eq('de', 'nutri')
        .eq('lida', false);
      if (active) setUnreadChat(count ?? 0);
    }

    recarregar();
    const channel = supabase
      .channel(`paciente-unread-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mensagens',
        filter: `paciente_id=eq.${user.id}`,
      }, recarregar)
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  const header = useMemo(() => {
    const factory = HEADERS[location.pathname];
    return factory ? factory(primeiroNome, tema.nutri_nome) : { eyebrow: '', title: '' };
  }, [location.pathname, primeiroNome, tema.nutri_nome]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

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
            <i className="ti ti-chevron-left" style={{ fontSize: 22, color: 'var(--ink)' }} aria-hidden="true"></i>
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
              : ['/paciente/progresso', '/paciente/compras', '/paciente/suplementos', '/paciente/habitos', '/paciente/prescricoes', '/paciente/ebooks', '/paciente/chat', '/paciente/treinos'].includes(location.pathname);
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
                  {unreadChat > 0 && (
                    <span style={{
                      position: 'absolute', top: 2, right: 'calc(50% - 18px)',
                      background: 'var(--red)', color: 'var(--paper)',
                      fontSize: 9, fontWeight: 600,
                      minWidth: 14, height: 14, borderRadius: 7,
                      padding: '0 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--paper)',
                    }}>{unreadChat}</span>
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
      .eq('id', user.id);
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
