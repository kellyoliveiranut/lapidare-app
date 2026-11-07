import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { confirmar, avisar } from '../../lib/dialogos.js';
import { copiarTexto } from '../../lib/copiarTexto.js';
import { linkConviteCuidador } from '../../lib/convite.js';
import { mensagemConviteCuidador } from '../../lib/mensagemAcesso.js';
import { telefoneWhatsapp } from '../../lib/painelNotificacoes.js';

const VALIDADE_DIAS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const botao = {
  background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 6,
  padding: '4px 10px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 5,
};

function conviteVencido(p) {
  if (!p.cuidador_convidado_em) return false;
  return Date.now() - new Date(p.cuidador_convidado_em).getTime() > VALIDADE_DIAS * 86400000;
}

/**
 * Cuidador da paciente (1 por paciente, mesmo acesso dela). A nutri cadastra nome,
 * e-mail e telefone, gera o convite e manda pelo WhatsApp. O cuidador cria a senha
 * em /cuidador/:token. Revogar desliga o vínculo e apaga o login dele.
 */
export default function Cuidador({ paciente, onMudou }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(paciente.cuidador_nome ?? '');
  const [email, setEmail] = useState(paciente.cuidador_email ?? '');
  const [telefone, setTelefone] = useState(paciente.cuidador_telefone ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Sem a migração, a coluna nem vem no select('*'): a seção fica escondida.
  if (!('cuidador_user_id' in paciente)) return null;

  const ativo = !!paciente.cuidador_user_id;
  const pendente = !ativo && !!paciente.cuidador_token;
  const vencido = pendente && conviteVencido(paciente);

  function textoConvite() {
    return mensagemConviteCuidador({
      primeiroNome: (paciente.cuidador_nome ?? '').trim().split(/\s+/)[0] || 'tudo bem',
      pacientePrimeiroNome: (paciente.nome ?? '').split(' ')[0],
      link: linkConviteCuidador(paciente.cuidador_token),
    });
  }

  async function gerarConvite() {
    setErro(null);
    // Nome e e-mail digitados nos campos trocados: avisa o que houve em vez de
    // dizer só que o e-mail é inválido.
    if (EMAIL_RE.test(nome.trim()) && !EMAIL_RE.test(email.trim())) {
      return setErro('O nome e o e-mail parecem estar trocados: o e-mail foi digitado no campo do nome. Confira os dois campos.');
    }
    if (!nome.trim()) return setErro('Informe o nome do cuidador.');
    if (!EMAIL_RE.test(email.trim())) return setErro('Informe um e-mail válido: é com ele que o cuidador vai entrar.');
    if (email.trim().toLowerCase() === (paciente.email ?? '').trim().toLowerCase()) {
      return setErro('O e-mail do cuidador precisa ser diferente do e-mail da paciente.');
    }
    setBusy(true);
    const r = await gravar(supabase.from('pacientes').update({
      cuidador_nome: nome.trim(),
      cuidador_email: email.trim().toLowerCase(),
      cuidador_telefone: telefone.trim() || null,
      cuidador_token: crypto.randomUUID(),
      cuidador_convidado_em: new Date().toISOString(),
    }).eq('id', paciente.id), { esperado: 1, rotulo: 'gerar o convite do cuidador' });
    setBusy(false);
    if (!r.ok) return setErro(r.msg);
    setEditando(false);
    onMudou?.();
  }

  function enviarWhatsApp() {
    const tel = telefoneWhatsapp(paciente.cuidador_telefone);
    if (!tel) return avisar('Cadastre o telefone do cuidador para enviar pelo WhatsApp.');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(textoConvite())}`, '_blank', 'noopener');
  }

  async function copiar() {
    const ok = await copiarTexto(textoConvite());
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 2500);
  }

  async function revogar(acao) {
    const primeiro = (paciente.cuidador_nome ?? 'o cuidador').split(' ')[0];
    const msg = acao === 'cancelar'
      ? `Cancelar o convite de ${primeiro}? O link deixa de funcionar.`
      : `Revogar o acesso de ${primeiro}?\n\nO login dele é apagado e ele deixa de ver o app da paciente na hora.`;
    if (!await confirmar(msg, { confirmarRotulo: acao === 'cancelar' ? 'Cancelar convite' : 'Revogar acesso' })) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada. Recarregue a página.');
      const resp = await fetch('/.netlify/functions/cuidador-revogar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paciente_id: paciente.id }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || 'Falha na chamada.');
      setNome(''); setEmail(''); setTelefone('');
      onMudou?.();
    } catch (e) {
      avisar(e?.message ?? 'Não consegui concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const rotulo = { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 };
  const campo = { width: '100%', boxSizing: 'border-box', marginBottom: 8 };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <div className="card-title" style={{ margin: 0, fontSize: 14 }}>Cuidador</div>
        <span style={rotulo}>mesmo acesso da paciente</span>
      </div>

      {ativo && (
        <div>
          <div style={{ fontSize: 13 }}>
            <strong>{paciente.cuidador_nome || 'Cuidador'}</strong>
            {paciente.cuidador_email && <span style={{ color: 'var(--text3)' }}> · {paciente.cuidador_email}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--green, #2f855a)', margin: '4px 0 8px' }}>
            Acesso ativo{paciente.cuidador_ativado_em
              ? ` desde ${new Date(paciente.cuidador_ativado_em).toLocaleDateString('pt-BR')}` : ''}
          </div>
          <button style={botao} disabled={busy} onClick={() => revogar('revogar')}>
            <i className="ti ti-user-off" aria-hidden="true" /> Revogar acesso
          </button>
        </div>
      )}

      {pendente && !editando && (
        <div>
          <div style={{ fontSize: 13 }}>
            <strong>{paciente.cuidador_nome}</strong>
            <span style={{ color: 'var(--text3)' }}> · {paciente.cuidador_email}</span>
          </div>
          <div style={{ fontSize: 12, color: vencido ? 'var(--red, #e05252)' : 'var(--orange)', margin: '4px 0 8px' }}>
            {vencido ? 'Convite vencido: gere um novo.' : 'Convite enviado: aguardando o cuidador criar a senha.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!vencido && (
              <button style={{ ...botao, color: '#25D366' }} onClick={enviarWhatsApp}
                disabled={!paciente.cuidador_telefone?.trim()}
                title={!paciente.cuidador_telefone?.trim() ? 'Cadastre o telefone do cuidador' : undefined}>
                <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar convite
              </button>
            )}
            {!vencido && (
              <button style={botao} onClick={copiar}>
                <i className={`ti ti-${copiado ? 'check' : 'copy'}`} aria-hidden="true" /> {copiado ? 'Copiado!' : 'Copiar mensagem'}
              </button>
            )}
            <button style={botao} onClick={() => setEditando(true)}>
              <i className="ti ti-refresh" aria-hidden="true" /> Gerar novo convite
            </button>
            <button style={botao} disabled={busy} onClick={() => revogar('cancelar')}>Cancelar convite</button>
          </div>
        </div>
      )}

      {!ativo && !pendente && !editando && (
        <button style={botao} onClick={() => setEditando(true)}>
          <i className="ti ti-user-plus" aria-hidden="true" /> Adicionar cuidador
        </button>
      )}

      {editando && (
        <div style={{ marginTop: 6 }}>
          <label className="field-label">Nome do cuidador</label>
          <input value={nome} onChange={e => setNome(e.target.value)} style={campo} />
          <label className="field-label">E-mail (é com ele que entra no app)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={campo} />
          <label className="field-label">Telefone (para enviar o convite pelo WhatsApp)</label>
          <input inputMode="tel" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(91) 99999-9999" style={campo} />
          {erro && <div role="alert" style={{ fontSize: 12, color: 'var(--red, #e05252)', marginBottom: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={gerarConvite} disabled={busy}>{busy ? 'Gerando…' : 'Gerar convite'}</button>
            <button style={botao} onClick={() => { setEditando(false); setErro(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
