import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useTheme } from '../../lib/theme.jsx';
import BrandFooter from '../../components/BrandFooter.jsx';

/**
 * Tela onde a paciente (ou nutri) chega DEPOIS de clicar no link do email
 * de "redefinir senha". Recupera o token do hash da URL (Supabase coloca
 * lá automaticamente), pede senha nova, e finaliza.
 */
export default function RedefinirSenha() {
  const navigate = useNavigate();
  const tema = useTheme();

  const [senha, setSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [tokenOk, setTokenOk] = useState(undefined); // undefined = checando, true = ok, false = inválido

  // Quando a paciente clica no link do email, o Supabase joga o token no
  // hash da URL e dispara o evento PASSWORD_RECOVERY no client.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTokenOk(true);
      } else if (event === 'SIGNED_IN' && session) {
        setTokenOk(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setTokenOk(true);
      else setTokenOk((v) => v ?? false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) return setErro('A senha precisa de pelo menos 6 caracteres.');
    if (senha !== confirmaSenha) return setErro('As senhas não conferem.');

    const { data: sessaoAtual } = await supabase.auth.getSession();
    if (!sessaoAtual.session) return setErro('Sessão expirada. Peça um novo link na tela de Login.');

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      setBusy(false);
      if (error) {
        if (/expired|invalid|token/i.test(error.message)) {
          return setErro('Esse link expirou ou já foi usado. Peça um novo na tela de Login → "Esqueci minha senha".');
        }
        return setErro(error.message);
      }
      setSucesso(true);
      await supabase.auth.signOut().catch(() => null);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setBusy(false);
      setErro(err?.message || 'Erro inesperado.');
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
            <img src={tema.logo_url} alt={tema.marca_nome ?? 'Essentia'}
              loading="lazy" decoding="async"
              style={{ maxHeight: 48, maxWidth: 200, margin: '0 auto 8px', display: 'block' }} />
          ) : (
            <div style={{
              fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase',
              color: 'var(--gold-deep)', marginBottom: 4, fontWeight: 600
            }}>
              {tema.marca_nome ?? 'Essentia'}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 28,
            letterSpacing: '-0.02em', color: 'var(--ink)'
          }}>
            {sucesso ? 'Senha alterada!' : 'Nova senha'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {sucesso
              ? 'Faça login com sua nova senha.'
              : 'Crie uma nova senha pra entrar no app'}
          </p>
        </div>

        {tokenOk === undefined && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>
            Validando link...
          </div>
        )}

        {tokenOk === false && (
          <div style={{
            fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)',
            padding: '14px 16px', borderRadius: 10, marginBottom: 14, lineHeight: 1.5,
          }}>
            <strong>Link inválido ou expirado.</strong><br />
            Peça um novo link na tela de Login → "Esqueci minha senha".
            <button onClick={() => navigate('/login', { replace: true })}
              style={{
                marginTop: 10, width: '100%',
                background: 'var(--ink)', color: 'var(--bg-soft)',
                padding: '8px 14px', borderRadius: 8,
                border: 'none', cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-sans)',
              }}>
              Voltar pro Login
            </button>
          </div>
        )}

        {tokenOk === true && !sucesso && (
          <form onSubmit={handleSubmit}>
            <Field label="Nova senha" type="password" value={senha} onChange={setSenha}
              required minLength={6} autoFocus />
            <Field label="Confirmar senha" type="password" value={confirmaSenha}
              onChange={setConfirmaSenha} required minLength={6} />

            {erro && (
              <div style={{
                fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)',
                padding: '8px 12px', borderRadius: 8, marginBottom: 12, lineHeight: 1.5,
              }}>{erro}</div>
            )}

            <button type="submit" disabled={busy}
              style={{
                width: '100%', padding: '11px 18px',
                background: 'var(--ink)', color: 'var(--bg-soft)',
                borderRadius: 12, fontSize: 13, fontWeight: 500,
                opacity: busy ? .6 : 1, transition: 'opacity .15s',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
              {busy ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </form>
        )}

        {sucesso && (
          <div style={{
            fontSize: 13, color: 'var(--green)', background: 'var(--green-soft)',
            padding: '14px 16px', borderRadius: 10, textAlign: 'center', lineHeight: 1.5,
          }}>
            ✅ <strong>Tudo certo!</strong><br />
            Sua senha foi atualizada. Você pode fechar essa página ou esperar o redirecionamento.
          </div>
        )}

        <BrandFooter />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, autoFocus, minLength }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, letterSpacing: '.04em',
        color: 'var(--ink-soft)', marginBottom: 5, fontWeight: 500
      }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        minLength={minLength}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          background: 'var(--bg-soft)', border: '0.5px solid var(--hair)',
          borderRadius: 10, outline: 'none', color: 'var(--ink)',
          fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
