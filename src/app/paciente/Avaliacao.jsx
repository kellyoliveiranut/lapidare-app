import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { normalizarUrlShaped } from '../../lib/shaped.js';

// Tela da avaliação física (Shaped).
//
// Existe por causa do iOS: clients.openWindow() com URL de outra origem falha
// em silêncio no WebKit, então o push não conseguia levar a paciente direto ao
// Shaped. O push aponta para cá (mesma origem, que o navigate() abre) e quem
// faz o salto para fora é o toque dela no link abaixo.
//
// A FONTE DO LINK é a tabela avaliacao_envios, não mais a querystring. Antes o
// push ERA o dado: notificação dispensada = link perdido, sem recuperação. Hoje
// se chega aqui também pelo banner da tela inicial.
//
// PRIORIDADE: pendente na tabela > ?link= > vazio. A querystring continua
// aceita para os pushes antigos, já entregues, que ainda carregam o parâmetro —
// mas perde para a tabela, que é o registro de verdade.
export default function Avaliacao() {
  const [params] = useSearchParams();
  const { user, profile } = useSession();
  const pacienteId = profile?.id ?? user?.id;

  // undefined = ainda carregando; null = não há pendente.
  const [pendente, setPendente] = useState(undefined);
  const [marcando, setMarcando] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pacienteId) return;
      const { data } = await supabase
        .from('avaliacao_envios')
        .select('id, url, enviado_em')
        .eq('paciente_id', pacienteId)
        .is('preenchido_em', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) setPendente(data ?? null);
    }
    load();
    return () => { active = false; };
  }, [pacienteId]);

  // normalizarUrlShaped nos DOIS caminhos. Na querystring é o que impede a tela
  // de virar open redirect no nosso domínio; no valor da tabela é redundante
  // (o check avaliacao_envios_url_shaped já garante), e fica de propósito — a
  // tela não precisa confiar em quem escreveu a linha.
  const linkPendente = normalizarUrlShaped(pendente?.url);
  const linkParam    = normalizarUrlShaped(params.get('link'));
  const link         = linkPendente ?? linkParam;

  async function marcarPreenchida() {
    setMarcando(true);
    setErro(null);
    try {
      // RPC sem parâmetro: ela descobre a paciente pela sessão e fecha o
      // pendente DELA. Passar um id abriria a porta para fechar o de outra.
      const { error } = await supabase.rpc('marcar_avaliacao_preenchida');
      if (error) throw error;
      setMarcado(true);
      setPendente(null);
    } catch (err) {
      setErro(err.message ?? 'Não consegui marcar agora — tente de novo.');
    } finally {
      setMarcando(false);
    }
  }

  if (pendente === undefined && !linkParam) {
    return (
      <div className="empty-state">
        <i className="ti ti-loader empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Carregando…</div>
      </div>
    );
  }

  if (marcado) {
    return (
      <div className="empty-state">
        <i className="ti ti-circle-check empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Avaliação marcada como preenchida</div>
        <div className="empty-sub">
          Obrigada! Sua nutricionista vai buscar o resultado no Shaped.
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="empty-state">
        <i className="ti ti-link-off empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Nenhuma avaliação pendente</div>
        <div className="empty-sub">
          Quando sua nutricionista enviar o link da avaliação física, ele aparece
          aqui e na sua tela inicial.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
        Sua nutricionista enviou o link da sua avaliação física.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', margin: '0 0 18px' }}>
        O formulário abre em outra aba, no site do Shaped. Quando terminar, é só
        voltar para o Essentia.
      </p>
      {/* <a> de verdade, não window.location.href: no PWA standalone do iOS o
          gesto nativo abre o Shaped por fora e mantém o Essentia aberto atrás. */}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="btn primary full"
      >
        <i className="ti ti-external-link" aria-hidden="true" style={{ marginRight: 6 }} />
        Abrir avaliação
      </a>

      {/* Só com pendente na tabela: sem linha para fechar, o RPC devolveria
          erro. Um push antigo, que chega só com ?link=, não tem o que marcar. */}
      {linkPendente && (
        <>
          <button
            type="button"
            className="btn ghost full"
            onClick={marcarPreenchida}
            disabled={marcando}
            style={{ marginTop: 10 }}
          >
            <i className="ti ti-check" aria-hidden="true" style={{ marginRight: 6 }} />
            {marcando ? 'Marcando…' : 'Já preenchi'}
          </button>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', margin: '8px 0 0' }}>
            Toque aqui depois de terminar no Shaped, para este aviso sair da sua
            tela inicial.
          </p>
        </>
      )}

      {erro && (
        <p style={{ fontSize: 12, lineHeight: 1.5, color: '#c0392b', margin: '8px 0 0' }}>
          {erro}
        </p>
      )}
    </div>
  );
}
