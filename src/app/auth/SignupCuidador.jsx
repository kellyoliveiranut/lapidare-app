import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import BrandFooter from '../../components/BrandFooter.jsx';

/**
 * Tela do convite do cuidador (/cuidador/:token). O convite é conferido e a conta
 * criada pela função cuidador-convite (servidor). Aqui só se escolhe a senha;
 * depois entra direto no app da paciente.
 */
const centro = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: '24px 16px', background: 'var(--bg, #faf8f5)',
};
const caixa = {
  width: '100%', maxWidth: 420, background: 'var(--white, #fff)', borderRadius: 16,
  border: '1px solid var(--border)', padding: '28px 22px', boxSizing: 'border-box',
};

export default function SignupCuidador() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [estado, setEstado] = useState('consultando');   // consultando | ok | invalido | vencido | erro
  const [info, setInfo] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado('consultando');
    fetch(`/.netlify/functions/cuidador-convite?token=${encodeURIComponent(token ?? '')}`)
      .then(async r => ({ r, d: await r.json().catch(() => ({})) }))
      .then(({ r, d }) => {
        if (!vivo) return;
        if (r.ok) { setInfo(d); setEstado('ok'); return; }
        setMensagem(d.error ?? '');
        setEstado(r.status === 410 ? 'vencido' : r.status === 404 ? 'invalido' : 'erro');
      })
      .catch(() => { if (vivo) setEstado('erro'); });
    return () => { vivo = false; };
  }, [token, tentativa]);

  async function criar(e) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) return setErro('A senha precisa de pelo menos 6 caracteres.');
    if (senha !== confirma) return setErro('As senhas não conferem.');
    setBusy(true);
    try {
      const r = await fetch('/.netlify/functions/cuidador-convite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error ?? 'Não consegui criar o acesso.'); return; }
      const { error } = await supabase.auth.signInWithPassword({ email: d.email, password: senha });
      if (error) { setErro('Acesso criado! Entre pelo link do aplicativo com o seu e-mail e a senha.'); return; }
      navigate('/paciente/inicio', { replace: true });
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const titulo = { fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: 'var(--dark)' };
  const texto = { fontSize: 14, color: 'var(--text2)', lineHeight: 1.5, margin: '0 0 14px' };
  const campo = { width: '100%', boxSizing: 'border-box', marginBottom: 12 };

  return (
    <div style={centro}>
      <div style={caixa}>
        {estado === 'consultando' && <p style={texto}>Abrindo o seu convite…</p>}

        {estado === 'invalido' && (<>
          <h1 style={titulo}>Link inválido</h1>
          <p style={texto}>Este convite não é válido ou já foi usado. Peça à nutricionista um novo link.</p>
        </>)}

        {estado === 'vencido' && (<>
          <h1 style={titulo}>Convite vencido</h1>
          <p style={texto}>Este convite venceu. Peça à nutricionista um novo link.</p>
        </>)}

        {estado === 'erro' && (<>
          <h1 style={titulo}>Não consegui abrir</h1>
          <p style={texto}>{mensagem || 'Confira a sua internet e tente de novo.'}</p>
          <button className="btn" onClick={() => setTentativa(t => t + 1)}>Tentar de novo</button>
        </>)}

        {estado === 'ok' && (
          <form onSubmit={criar}>
            <h1 style={titulo}>Olá{info?.cuidador_nome ? `, ${info.cuidador_nome.split(' ')[0]}` : ''}!</h1>
            <p style={texto}>
              Crie a sua senha para acompanhar {info?.paciente_primeiro_nome ? `a ${info.paciente_primeiro_nome}` : 'a paciente'} no app do Essentia.
              Depois, você entra com o e-mail <strong>{info?.email}</strong> e esta senha.
            </p>
            <label className="field-label">Senha</label>
            <input type="password" autoComplete="new-password" value={senha}
              onChange={e => setSenha(e.target.value)} style={campo} />
            <label className="field-label">Repita a senha</label>
            <input type="password" autoComplete="new-password" value={confirma}
              onChange={e => setConfirma(e.target.value)} style={campo} />
            {erro && <div role="alert" style={{ fontSize: 13, color: 'var(--red, #e05252)', marginBottom: 12 }}>{erro}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Criando…' : 'Criar acesso e entrar'}
            </button>
          </form>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
