import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais } from '../../lib/utils.js';
import ConversaPanel from './_Conversa.jsx';

function fmtDataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, hoje)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, ontem)) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Ordem da lista de conversas: atividade primeiro, alfabética no rabo.
 * Quem nunca mandou mensagem vai para o fim — e entre si fica em ordem de
 * nome, que é a ordem que a tela sempre teve.
 */
function porAtividade(a, b) {
  const ta = a.ultima?.created_at;
  const tb = b.ultima?.created_at;
  if (ta && tb) return new Date(tb) - new Date(ta);  // as duas: mais recente no topo
  if (ta) return -1;                                  // só `a` tem mensagem: sobe
  if (tb) return 1;                                   // só `b` tem: sobe
  // localeCompare com a locale, não comparação crua: sem isso "Ângela" cairia
  // depois de "Zuleica", porque Â está fora da faixa A–Z da tabela de caracteres.
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

/**
 * Regra única de casamento da busca. Vive fora dos dois filtros de propósito:
 * a lista visível e a explicação de "por que ela não está aqui" precisam casar
 * pelo MESMO critério. Se divergirem, a tela consegue dizer "não existe" para
 * uma paciente que o filtro de cima teria mostrado — o oposto do conserto.
 */
function casaBusca(p, q) {
  return p.nome?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
}

/** Por que ela não está no Chat. Finalizado e óbito dividem a mesma frase de
 *  propósito: a tela não distingue os dois. */
const MOTIVO = {
  plano:   'o Chat é só para pacientes do plano Essentia.',
  inativa: 'não está em acompanhamento ativo.',
};
const MOTIVO_CURTO = {
  plano:   'fora do plano Essentia',
  inativa: 'sem acompanhamento ativo',
};

export default function ChatNutri() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [lista, setLista] = useState(undefined);  // [{id, nome, email, ultima, naoLidas}]
  const [selecionada, setSelecionada] = useState(null);
  const [busca, setBusca] = useState('');
  // Catálogo completo da nutri (todos os planos, todos os status). Carregado
  // na primeira busca que não achar nada e válido pela sessão: serve para
  // explicar uma ausência, não para decidir nada clínico.
  const [todas, setTodas] = useState(null);
  const recarregarRef = useRef(null);

  // Duas requisições em paralelo e UM setState: a lista nasce ordenada, então
  // não existe momento em que a chave de ordenação esteja ausente da tela.
  async function carregar() {
    if (!user) return;
    const [{ data: pacs }, { data: pend }] = await Promise.all([
      supabase
        .from('pacientes')
        .select('id, nome, email, mensagens(created_at, texto, imagem_path, de)')
        .eq('nutri_id', user.id)
        .eq('status_paciente', 'ativo')
        .eq('tipo_plano', 'essentia')
        // Sem !inner de propósito: filtro em recurso embutido poda só as
        // mensagens, nunca a paciente. Quem nunca escreveu tem que continuar
        // na lista — é ela que vai para o fim, não para fora.
        .eq('mensagens.nutri_id', user.id)
        .order('nome')
        .order('created_at', { referencedTable: 'mensagens', ascending: false })
        .limit(1, { referencedTable: 'mensagens' }),
      supabase
        .from('mensagens')
        .select('paciente_id')
        .eq('nutri_id', user.id)
        .eq('de', 'paciente')
        .eq('lida', false),
    ]);

    const naoLidas = {};
    for (const m of pend ?? []) naoLidas[m.paciente_id] = (naoLidas[m.paciente_id] ?? 0) + 1;

    setLista(
      (pacs ?? [])
        .map(p => ({
          id: p.id, nome: p.nome, email: p.email,
          ultima: p.mensagens?.[0] ?? null,
          naoLidas: naoLidas[p.id] ?? 0,
        }))
        .sort(porAtividade)
    );
  }

  useEffect(() => { carregar(); }, [user]);

  // Subscribe global: qualquer INSERT em mensagens das pacientes da nutri.
  // Recarga com debounce: uma troca rápida de mensagens dispara vários INSERT
  // seguidos, e sem isso a lista se reordenaria a cada um.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-nutri-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens',
        filter: `nutri_id=eq.${user.id}`,
      }, () => {
        clearTimeout(recarregarRef.current);
        recarregarRef.current = setTimeout(carregar, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(recarregarRef.current);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Filtro na renderização, não no estado: `carregar` substitui `lista` inteira
  // a cada mensagem nova que o realtime avisa, e uma busca aplicada ao estado
  // seria desfeita junto. `selecionada` também fica de fora de propósito — a
  // conversa aberta continua aberta mesmo quando a busca a tira da lista.
  const filtradas = useMemo(() => {
    if (!lista) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(c => casaBusca(c, q));
  }, [lista, busca]);

  // A busca falhou na lista visível — só aqui vale perguntar ao banco.
  const semResultado = !!lista && busca.trim() !== '' && filtradas.length === 0;

  // Uma requisição por sessão, no máximo. Quem nunca erra uma busca nunca
  // paga por ela; quem erra paga uma vez e as buscas seguintes saem de memória.
  useEffect(() => {
    if (!semResultado || todas || !user) return;
    supabase
      .from('pacientes')
      .select('id, nome, email, tipo_plano, status_paciente')
      .eq('nutri_id', user.id)
      .then(({ data }) => setTodas(data ?? []));
  }, [semResultado, todas, user]);

  // Derivado, não estado: a busca falhou e o catálogo ainda não chegou. Erro
  // de rede cai em `todas = []`, que encerra a espera e devolve o texto antigo.
  const checando = semResultado && todas === null;

  // Status antes de plano: quem saiu do acompanhamento se encaixa nas duas
  // regras, e aí o plano virou detalhe. Até 3 — "ana" pega Mariana e Juliana
  // junto, e uma lista longa não explica melhor que uma curta.
  const foraDoFiltro = useMemo(() => {
    if (!semResultado || !todas) return [];
    const q = busca.trim().toLowerCase();
    return todas
      .filter(p => casaBusca(p, q))
      .map(p => ({
        id: p.id,
        nome: p.nome,
        motivo: p.status_paciente !== 'ativo' ? 'inativa' : 'plano',
      }))
      .slice(0, 3);
  }, [semResultado, todas, busca]);

  if (lista === undefined) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Carregando…</div>
      </>
    );
  }

  if (lista.length === 0) {
    return (
      <>
        <div className="page-title">Chat</div>
        <div className="page-sub">Mensagens com todas as pacientes</div>
        <div className="card empty-card">
          <i className="ti ti-message-circle empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma conversa disponível</div>
          <div className="empty-sub">
            O chat é do plano Essentia e mostra apenas pacientes ativas. Quem está
            em consulta avulsa, ou com o atendimento finalizado, não aparece aqui.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-title">Chat</div>
      <div className="page-sub">Conversas com suas pacientes em tempo real</div>

      <div className="chat-layout">
        {/* Lista de conversas */}
        <div className="card" style={{ padding: 0, overflowY: 'auto' }}>
          {/* Sticky porque o card inteiro é o que rola: sem isso o campo subiria
              junto e sumiria no primeiro scroll da lista. */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--white)',
            padding: '10px 12px',
            borderBottom: '0.5px solid #f5f0e8',
          }}>
            <input
              className="input-field"
              style={{ margin: 0 }}
              placeholder="Buscar paciente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          {filtradas.length === 0 ? (
            <div style={{
              padding: '18px 14px', fontSize: 12,
              color: 'var(--text3)', textAlign: 'center',
            }}>
              {checando ? (
                // Sem este estado a tela afirma "não encontrada" e se corrige
                // depois — exatamente o susto que a mudança existe para tirar.
                'Procurando…'
              ) : foraDoFiltro.length === 0 ? (
                <>Nenhuma paciente encontrada para "{busca}".</>
              ) : foraDoFiltro.length === 1 ? (
                <>
                  <strong style={{ fontWeight: 600 }}>{foraDoFiltro[0].nome}</strong>{' '}
                  está cadastrada, mas {MOTIVO[foraDoFiltro[0].motivo]}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    Nenhuma conversa para "{busca}". Fora do Chat:
                  </div>
                  {foraDoFiltro.map(p => (
                    <div key={p.id} style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{p.nome}</div>
                      <div style={{ fontSize: 11 }}>{MOTIVO_CURTO[p.motivo]}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : filtradas.map(c => {
            const ativo = selecionada?.id === c.id;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelecionada(c)}
                onKeyDown={e => {
                  // O item deixou de ser <button> para caber o nome clicável
                  // dentro dele; o teclado precisa voltar na mão.
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelecionada(c);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', width: '100%', textAlign: 'left',
                  background: ativo ? '#f5f0e8' : 'transparent',
                  border: 'none', borderBottom: '0.5px solid #f5f0e8',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  borderLeft: ativo ? '2px solid var(--amber)' : '2px solid transparent',
                  transition: 'background .15s',
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--bg2)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: 'var(--dark)', flexShrink: 0,
                }}>{iniciais(c.nome)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <button
                      type="button"
                      title={`Abrir perfil de ${c.nome}`}
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/nutri/pacientes/${c.id}`, { state: { from: '/nutri/chat', label: 'Chat' } });
                      }}
                      onKeyDown={e => {
                        // Sem isto, Enter/Espaço no nome também acionariam o
                        // item inteiro: abriria o perfil e trocaria a conversa.
                        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                      }}
                      style={{
                        fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: 'none', border: 'none', padding: 0,
                        fontFamily: 'inherit', color: 'inherit', textAlign: 'left',
                        cursor: 'pointer',
                      }}>
                      {c.nome}
                    </button>
                    {c.ultima && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                        {fmtDataCurta(c.ultima.created_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontSize: 12, color: 'var(--text3)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      flex: 1,
                    }}>
                      {c.ultima
                        ? (c.ultima.de === 'nutri' ? 'Você: ' : '') + (c.ultima.texto || (c.ultima.imagem_path ? '📷 Foto' : ''))
                        : 'Sem mensagens ainda'}
                    </span>
                    {c.naoLidas > 0 && (
                      <span style={{
                        background: 'var(--amber)', color: 'var(--dark)',
                        fontSize: 11, fontWeight: 600,
                        padding: '1px 6px', borderRadius: 20, flexShrink: 0, minWidth: 16, textAlign: 'center',
                      }}>{c.naoLidas}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Painel da conversa */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selecionada ? (
            <ConversaPanel
              paciente={selecionada}
              nutriId={user.id}
              onAfterAction={carregar}
              onVerPerfil={() => navigate(`/nutri/pacientes/${selecionada.id}`, {
                state: { from: '/nutri/chat', label: 'Chat' },
              })}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24, textAlign: 'center',
            }}>
              <div>
                <i className="ti ti-messages" style={{ fontSize: 36, color: 'var(--border)' }} aria-hidden="true"></i>
                <div style={{ fontSize: 15, color: 'var(--text3)', marginTop: 10 }}>
                  Selecione uma conversa na lista ao lado
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
