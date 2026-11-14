import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { confirmar, avisar } from '../../lib/dialogos.js';

/**
 * Card "Secretária" (Personalização): convida por e-mail, mostra o estado
 * (convite enviado / com acesso) e revoga. Só a Dra. vê — a secretária não
 * gerencia a secretária.
 */
export default function Secretaria() {
  const { user, secretaria: souSecretaria } = useSession();
  const [linha, setLinha] = useState(undefined); // undefined = carregando, null = nenhuma
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState(null); // { texto, link }
  const [semTabela, setSemTabela] = useState(false);

  async function carregar() {
    const { data, error } = await supabase.from('secretarias')
      .select('id, nome, email, user_id, convidado_em, ativada_em')
      .eq('nutri_id', user.id).eq('ativo', true).maybeSingle();
    if (error) { setSemTabela(true); setLinha(null); return; }
    setLinha(data ?? null);
  }
  useEffect(() => { if (user?.id && !souSecretaria) carregar(); }, [user?.id, souSecretaria]); // eslint-disable-line react-hooks/exhaustive-deps

  if (souSecretaria) return null;

  async function chamar(corpo) {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch('/.netlify/functions/secretaria-gerenciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  }

  async function convidar(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setAviso(null);
    try {
      const { ok, d } = await chamar({ acao: 'convidar', nome, email });
      if (!ok) { avisar(d.error ?? 'Não consegui enviar o convite.'); return; }
      setAviso({
        texto: d.enviado
          ? `Convite enviado para ${email}. Se não chegar, copie o link abaixo e mande pelo WhatsApp.`
          : 'Não consegui enviar o e-mail. Copie o link abaixo e mande pelo WhatsApp.',
        link: d.link,
      });
      setNome(''); setEmail('');
      carregar();
    } catch { avisar('Sem conexão. Tente de novo.'); } finally { setBusy(false); }
  }

  async function revogar() {
    const ok = await confirmar(
      `Tirar o acesso de ${linha?.nome || 'a secretária'}?\n\nO login dela é apagado e ela deixa de entrar no app na hora. As conversas do chat ficam guardadas.`,
      { confirmarRotulo: 'Tirar acesso' });
    if (!ok) return;
    setBusy(true);
    try {
      const { ok: feito, d } = await chamar({ acao: 'revogar' });
      if (!feito) { avisar(d.error ?? 'Não consegui revogar o acesso.'); return; }
      setAviso(null); carregar();
    } catch { avisar('Sem conexão. Tente de novo.'); } finally { setBusy(false); }
  }

  const ativa = !!linha?.user_id;
  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Secretária</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Acesso completo ao app com login próprio (e-mail e senha dela). Ela e você têm um chat interno privado.
      </div>

      {semTabela && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Este recurso ainda não foi ativado no banco (falta rodar o SQL).
        </div>
      )}

      {!semTabela && linha === undefined && <div style={{ fontSize: 13 }}>Carregando…</div>}

      {!semTabela && linha && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
            <strong>{linha.nome || 'Secretária'}</strong> · {linha.email}
            <div style={{ fontSize: 12, color: ativa ? 'var(--green, #3b6d11)' : 'var(--text3)' }}>
              {ativa ? 'Com acesso ao app' : 'Convite enviado — aguardando ela criar a senha'}
            </div>
          </div>
          <button type="button" className="btn-outline" disabled={busy} onClick={revogar}>
            {ativa ? 'Tirar acesso' : 'Cancelar convite'}
          </button>
        </div>
      )}

      {!semTabela && linha !== undefined && !ativa && (
        <form onSubmit={convidar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label className="field-label">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', margin: 0 }} />
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <label className="field-label">E-mail dela</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', boxSizing: 'border-box', margin: 0 }} />
          </div>
          <button className="btn" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Enviando…' : linha ? 'Reenviar convite' : 'Enviar convite'}
          </button>
        </form>
      )}

      {aviso && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {aviso.texto}
          {aviso.link && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input readOnly value={aviso.link} onFocus={e => e.target.select()} style={{ flex: 1, margin: 0, fontSize: 12 }} />
              <button type="button" className="btn-outline"
                onClick={() => navigator.clipboard?.writeText(aviso.link).catch(() => {})}>Copiar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
