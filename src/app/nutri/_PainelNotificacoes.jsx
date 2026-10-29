import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { classificar, linkWhatsapp } from '../../lib/painelNotificacoes.js';

/* ============================================================
   NOTIFICAÇÕES DAS PACIENTES (Visão geral)
   - Sem notificação: quem não receberia o "volte ao app" nem outros avisos;
     botão leva ao WhatsApp com a mensagem pronta de como ativar.
   - Convite não respondido: recebeu "volte ao app" e não abriu o app depois.
   - Voltaram: recebeu e abriu o app depois.
   Dados vêm da função painel_notificacoes_pacientes (só as pacientes da nutri).
   Independente do resto da Visão: se falhar, mostra um aviso discreto.
   ============================================================ */

const MAX_LINHAS = 8;

function diasDesde(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return Number.isFinite(d) ? Math.max(d, 0) : null;
}

function textoAcesso(p) {
  if (!p.ultimo_acesso) return 'nunca abriu o app';
  const d = diasDesde(p.ultimo_acesso);
  if (d === 0) return 'abriu o app hoje';
  return `abriu o app há ${d} dia${d === 1 ? '' : 's'}`;
}

function Bloco({ titulo, dica, lista, vazio, renderAcao, renderDetalhe, abrirPerfil }) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? lista : lista.slice(0, MAX_LINHAS);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {titulo} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({lista.length})</span>
      </div>
      {dica && <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '2px 0 6px' }}>{dica}</div>}
      {lista.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 0' }}>{vazio}</div>
      ) : (
        <>
          {visiveis.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
              borderTop: '0.5px solid var(--border)',
            }}>
              <button type="button" onClick={() => abrirPerfil(p.id)} style={{
                flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit',
              }}>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{renderDetalhe(p)}</div>
              </button>
              {renderAcao?.(p)}
            </div>
          ))}
          {lista.length > MAX_LINHAS && (
            <button type="button" onClick={() => setTudo(v => !v)} style={{
              background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer',
              fontSize: 12, color: 'var(--gold-deep, #a08456)', font: 'inherit',
            }}>
              {tudo ? 'Mostrar menos' : `Ver todas (${lista.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function PainelNotificacoes() {
  const navigate = useNavigate();
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.rpc('painel_notificacoes_pacientes');
      if (!vivo) return;
      if (error) { setErro(true); return; }
      setLinhas(data ?? []);
    })();
    return () => { vivo = false; };
  }, []);

  const r = useMemo(() => classificar(linhas ?? []), [linhas]);
  const abrirPerfil = (id) => navigate(`/nutri/pacientes/${id}`);

  if (erro) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Não foi possível carregar o painel de notificações agora.
      </div>
    );
  }
  if (linhas === null) return null;

  const sem = r.semNotificacao.length;
  const pend = r.convitePendente.length;
  const resumo = [
    `${sem} sem notificação`,
    `${pend} ${pend === 1 ? 'convite' : 'convites'} sem resposta`,
    `${r.voltaram.length} ${r.voltaram.length === 1 ? 'voltou' : 'voltaram'}`,
  ].join(' · ');

  return (
    <div style={{
      background: 'var(--white)', border: '0.5px solid var(--border)', borderRadius: 12,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'none',
        border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
      }}>
        <i className="ti ti-bell" style={{ fontSize: 18, color: 'var(--gold-deep, #a08456)' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>Notificações das pacientes</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{resumo}</div>
        </div>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {aberto && (
        <>
          <Bloco
            titulo="Sem notificação"
            dica="Sem notificação ativa, o app não consegue avisar. Mande a mensagem pronta pelo WhatsApp."
            lista={r.semNotificacao}
            vazio="Todas as pacientes têm notificação ativa."
            abrirPerfil={abrirPerfil}
            renderDetalhe={textoAcesso}
            renderAcao={(p) => {
              const href = linkWhatsapp(p);
              return href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="btn-outline"
                  style={{ fontSize: 12, padding: '5px 10px', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                  <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Avisar
                </a>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>sem telefone</span>
              );
            }}
          />
          <Bloco
            titulo="Convite sem resposta"
            dica={'Receberam o lembrete "volte ao app" e ainda não abriram o app depois.'}
            lista={r.convitePendente}
            vazio="Nenhuma paciente aguardando resposta."
            abrirPerfil={abrirPerfil}
            renderDetalhe={(p) => {
              const d = diasDesde(p.volta_app_enviado_em);
              return `${p.volta_app_envios} lembrete${p.volta_app_envios === 1 ? '' : 's'} · último há ${d} dia${d === 1 ? '' : 's'}`;
            }}
          />
          <Bloco
            titulo="Voltaram"
            dica="Receberam o lembrete e abriram o app depois."
            lista={r.voltaram}
            vazio="Ainda ninguém voltou depois de um lembrete."
            abrirPerfil={abrirPerfil}
            renderDetalhe={textoAcesso}
          />
        </>
      )}
    </div>
  );
}
