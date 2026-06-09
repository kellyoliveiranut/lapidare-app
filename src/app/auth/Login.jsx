import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { useTheme } from '../../lib/theme.jsx';
import BrandFooter from '../../components/BrandFooter.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, role, loading: sessionLoading } = useSession();
  const tema = useTheme();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [crn, setCrn] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function handleForgotPassword(e) {
    e.preventDefault();
    setErro(null); setAviso(null);
    if (!email.trim()) return setErro('Informe seu email.');
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      setBusy(false);
      if (error) return setErro(mensagemAmigavel(error));
      setAviso('Pronto! Verifique seu email (e a caixa de spam) — chegou um link pra criar uma nova senha. Funciona por 1 hora.');
    } catch (err) {
      setBusy(false);
      setErro(mensagemAmigavel(err));
    }
  }

  // Redireciona automaticamente após login bem-sucedido
  useEffect(() => {
    if (sessionLoading || !session) return;
    const from = location.state?.from;
    if (role === 'nutri') {
      navigate(from?.startsWith('/nutri') ? from : '/nutri/visao', { replace: true });
    } else if (role === 'paciente') {
      navigate(from?.startsWith('/paciente') ? from : '/paciente/inicio', { replace: true });
    }
  }, [session, role, sessionLoading, navigate, location.state]);

  // Traduz erros técnicos em mensagens acionáveis pra nutri
  function mensagemAmigavel(error) {
    if (!error) return null;
    const msg = (error.message || String(error)).toLowerCase();

    // Erro de fetch / conexão = quase sempre variáveis do Netlify mal configuradas
    if (msg.includes('failed to fetch') ||
        msg.includes('falha ao buscar') ||
        msg.includes('networkerror') ||
        msg.includes('err_name_not_resolved') ||
        msg.includes('load failed')) {
      return 'Não consegui conectar com o Supabase. Isso geralmente significa:\n\n' +
             '1) Você esqueceu de fazer Trigger Deploy no Netlify depois de adicionar as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.\n\n' +
             '2) Ou a URL do Supabase está errada (precisa ser https://SEU-PROJECT-ID.supabase.co — confira em Supabase → Settings → General → Reference ID).\n\n' +
             'Detalhes em SETUP.md → Problemas comuns.';
    }

    // Outros erros conhecidos
    if (msg.includes('invalid login credentials')) return 'Email ou senha incorretos.';
    if (msg.includes('email rate limit')) return 'Limite de emails atingido. Desligue "Confirm email" em Supabase → Authentication → Sign In / Providers.';
    if (msg.includes('user already registered')) return 'Já existe uma conta com esse email. Tente fazer login.';

    return error.message;
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    try {
      let emailFinal = email.trim();

      const parecePhone = !emailFinal.includes('@') && emailFinal.replace(/\D/g, '').length >= 8;
      if (parecePhone) {
        const digitsOnly = emailFinal.replace(/\D/g, '');
        const { data: pacientes, error: lookupErr } = await supabase
          .from('pacientes')
          .select('email, telefone');
        if (lookupErr) {
          setBusy(false);
          return setErro('Não foi possível buscar pelo telefone. Tente usar o email.');
        }
        const match = (pacientes ?? []).find(p => {
          const d = (p.telefone ?? '').replace(/\D/g, '');
          return d === digitsOnly || d.endsWith(digitsOnly) || digitsOnly.endsWith(d);
        });
        if (!match) {
          setBusy(false);
          return setErro('Telefone não encontrado. Verifique o número ou use seu email.');
        }
        emailFinal = match.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: emailFinal, password: senha });
      setBusy(false);
      if (error) setErro(mensagemAmigavel(error));
    } catch (err) {
      setBusy(false);
      setErro(mensagemAmigavel(err));
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (!nome.trim()) return setErro('Informe o nome completo.');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { role: 'nutri', nome: nome.trim(), crn: crn.trim() },
        },
      });
      setBusy(false);
      if (error) return setErro(mensagemAmigavel(error));
      if (!data.session) {
        setAviso('Conta criada. Verifique seu email para confirmar e depois faça login.');
        setMode('signin');
      }
    } catch (err) {
      setBusy(false);
      setErro(mensagemAmigavel(err));
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, var(--bg-soft) 0%, var(--bg-deep) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-sans)'
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--paper)', border: '0.5px solid var(--hair)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: 32
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {tema.logo_url ? (
            <img
              src={tema.logo_url}
              alt={tema.marca_nome ?? 'Essentia'}
              loading="lazy" decoding="async"
              style={{
                height: 'clamp(140px, 20vw, 160px)',
                width: 'auto', maxWidth: '80%',
                margin: '0 auto 8px', display: 'block',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{
              fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase',
              color: 'var(--muted)', marginBottom: 4
            }}>
              {tema.marca_nome ?? 'Essentia'}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 28,
            letterSpacing: '-0.02em', color: 'var(--ink)'
          }}>
            {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {mode === 'signin'
              ? (tema.mensagem_login ?? 'Acesse seu painel ou app')
              : mode === 'signup'
                ? 'Cadastro de nutricionista'
                : 'Esqueceu? A gente te ajuda 💛'}
          </p>
        </div>

        {/* Tabs — escondidas no modo forgot pra focar a UX */}
        <div style={{
          display: mode === 'forgot' ? 'none' : 'flex',
          gap: 2, background: 'var(--bg-deep)',
          borderRadius: 10, padding: 3, marginBottom: 18
        }}>
          {[
            { id: 'signin', label: 'Entrar' },
            { id: 'signup', label: 'Criar conta' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setErro(null); setAviso(null); }}
              style={{
                flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 500,
                borderRadius: 8,
                color: mode === t.id ? 'var(--ink)' : 'var(--muted)',
                background: mode === t.id ? 'var(--paper)' : 'transparent',
                boxShadow: mode === t.id ? 'var(--shadow-sm)' : 'none',
                transition: 'all .2s'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={
          mode === 'signin' ? handleSignIn :
          mode === 'signup' ? handleSignUp :
          handleForgotPassword
        }>
          {mode === 'signup' && (
            <>
              <Field label="Nome completo" value={nome} onChange={setNome} required autoFocus />
              <Field label="CRN" value={crn} onChange={setCrn} placeholder="opcional" />
            </>
          )}
          <Field
            label={mode === 'signin' ? 'Email ou telefone' : 'Email'}
            type={mode === 'signin' ? 'text' : 'email'}
            value={email}
            onChange={setEmail}
            required
            autoFocus={mode === 'signin' || mode === 'forgot'}
          />
          {mode !== 'forgot' && (
            <Field label="Senha" type="password" value={senha} onChange={setSenha} required minLength={6} />
          )}

          {/* Link "Esqueci minha senha" só aparece no modo signin */}
          {mode === 'signin' && (
            <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 12 }}>
              <button type="button"
                onClick={() => { setMode('forgot'); setErro(null); setAviso(null); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--gold-deep)', padding: 0,
                  textDecoration: 'underline', fontFamily: 'var(--font-sans)',
                }}>
                Esqueci minha senha
              </button>
            </div>
          )}

          {/* Link "voltar pro login" no modo forgot */}
          {mode === 'forgot' && (
            <div style={{ marginTop: -6, marginBottom: 12, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Digite seu email cadastrado. Vamos te enviar um link pra criar uma nova senha.
            </div>
          )}

          {erro && (
            <div style={{
              fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', whiteSpace: 'pre-line', lineHeight: 1.5,
              padding: '8px 12px', borderRadius: 8, marginBottom: 12
            }}>
              {erro}
            </div>
          )}
          {aviso && (
            <div style={{
              fontSize: 12, color: 'var(--green)', background: 'var(--green-soft)',
              padding: '8px 12px', borderRadius: 8, marginBottom: 12, lineHeight: 1.5,
            }}>
              {aviso}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%', padding: '11px 18px',
              background: 'var(--ink)', color: 'var(--bg-soft)',
              borderRadius: 12, fontSize: 13, fontWeight: 500,
              opacity: busy ? .6 : 1, transition: 'opacity .15s'
            }}>
            {busy ? '...' : (
              mode === 'signin' ? 'Entrar' :
              mode === 'signup' ? 'Criar conta de nutri' :
              'Enviar link de recuperação'
            )}
          </button>

          {mode === 'forgot' && (
            <button type="button"
              onClick={() => { setMode('signin'); setErro(null); setAviso(null); }}
              style={{
                marginTop: 10, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--muted)', padding: 6,
                textDecoration: 'underline', fontFamily: 'var(--font-sans)',
              }}>
              ← Voltar pro login
            </button>
          )}
        </form>
        <BrandFooter />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder, autoFocus, minLength }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, letterSpacing: '.04em',
        color: 'var(--ink-soft)', marginBottom: 5, fontWeight: 500
      }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        minLength={minLength}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          background: 'var(--bg-soft)',
          border: '0.5px solid var(--hair)',
          borderRadius: 10, outline: 'none',
          color: 'var(--ink)',
        }}
      />
    </label>
  );
}
