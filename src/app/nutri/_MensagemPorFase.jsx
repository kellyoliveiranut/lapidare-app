import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { escolherDaSemana, estaFixada, restanteFixada } from '../../lib/rotacaoMensagens.js';

// A mecânica de UMA aba de mensagem motivacional guardada em mensagens_ciclo:
// LISTA de mensagens com rotação semanal e fixação temporária, opcionalmente
// dividida por sub-fase do ciclo.
//
// Existe porque Oncologia e Neutras fazem a mesma coisa em fases diferentes —
// duas cópias da mesma lógica divergiriam na primeira correção feita só de um
// lado. O que muda entre as abas vem por prop.
//
// Até 2026-08-20 era mensagem ÚNICA por fase: a tabela tinha unique
// (nutri_id, fase) e a tela salvava por upsert com onConflict. A migration
// 2026-08-20_mensagens_ciclo_lista_e_grupo.sql derrubou esse unique e trouxe
// `ordem`, `fixada_em` e `grupo_ciclo` — a mesma mecânica que
// mensagens_emagrecimento já usa desde julho.
//
// Emagrecimento continua NÃO usando este componente: vive em outra tabela,
// sem sub-fase. O que as duas telas compartilham é lib/rotacaoMensagens.js.
//
// Nomes de coluna: aqui é `mensagem` e `ativo`; em mensagens_emagrecimento é
// `texto` e `ativa`. A divergência é do banco e fica — ver o comentário da
// seção 1 da migration.

const temPlaceholder = t => /\{nome\}/.test(t);

// Chave de grupo para uso em objeto e comparação. Espelha o
// coalesce(grupo_ciclo, '') do índice mensagens_ciclo_uma_fixada: em JS, um
// objeto indexado por null viraria a string "null", e a genérica é '' dos dois
// lados.
const chaveGrupo = g => g ?? '';

// PostgREST: .eq('grupo_ciclo', null) vira grupo_ciclo=eq.null, que NÃO casa
// com NULL — filtraria zero linhas, calado. O ramo do nulo tem que ser .is().
const filtrarGrupo = (query, g) =>
  g === null ? query.is('grupo_ciclo', null) : query.eq('grupo_ciclo', g);

/**
 * @param fase       valor gravado na coluna `fase` ('oncologia', 'neutra'…)
 * @param titulo     título do card
 * @param descricao  nó React explicando quem vê estas mensagens
 * @param grupos     [{ id: string|null, label }] — sem eles, a aba não mostra
 *                   seletor e tudo grava grupo_ciclo = null
 * @param biblioteca com `grupos`, um mapa { chaveGrupo: [{ label?, itens }] };
 *                   sem eles, o array de seções direto. Sem ela, a seção some.
 */
export default function MensagemPorFase({ fase, titulo, descricao, grupos = null, biblioteca = null }) {
  const { user } = useSession();
  const [msgs, setMsgs] = useState([]);        // todas as mensagens desta fase
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Sub-fase aberta. Sem seletor é sempre null — a genérica.
  const [grupo, setGrupo] = useState(grupos?.[0]?.id ?? null);

  // edição inline
  const [editandoId, setEditandoId] = useState(null);
  const [editTexto, setEditTexto] = useState('');

  // adicionar nova
  const [novoTexto, setNovoTexto] = useState('');

  function mostrarFeedback(tipo, msg) {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  // Uma consulta só, com TODOS os grupos da fase — os contadores dos chips
  // saem dela sem ida extra ao banco. `fase` nas deps: hoje cada aba é um lazy
  // próprio e remonta ao trocar, mas se um dia ficarem montadas juntas a
  // consulta continua seguindo a fase certa.
  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('mensagens_ciclo')
      .select('*')
      .eq('nutri_id', user.id)
      .eq('fase', fase)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setMsgs(data ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, fase]);

  function trocarGrupo(id) {
    setGrupo(id);
    cancelarEdicao();   // a mensagem em edição pertence ao grupo que está saindo
  }

  function iniciarEdicao(m) {
    setEditandoId(m.id);
    setEditTexto(m.mensagem);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditTexto('');
  }

  async function salvarEdicao(m) {
    const mensagem = editTexto.trim();
    if (!mensagem || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from('mensagens_ciclo')
      .update({ mensagem })
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao salvar: ' + error.message); return; }
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, mensagem } : x)));
    cancelarEdicao();
    mostrarFeedback('ok', 'Mensagem atualizada!');
  }

  async function toggleAtivo(m) {
    if (!user) return;
    const novo = !m.ativo;
    // update otimista — reverte se der erro
    setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ativo: novo } : x)));
    const { error } = await supabase
      .from('mensagens_ciclo')
      .update({ ativo: novo })
      .eq('id', m.id);
    if (error) {
      setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ativo: !novo } : x)));
      mostrarFeedback('erro', 'Erro ao atualizar: ' + error.message);
    }
  }

  async function toggleFixar(m) {
    if (!user) return;
    const g = m.grupo_ciclo ?? null;

    if (estaFixada(m)) {
      // Desfixar — volta pra rotação automática.
      setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, fixada_em: null } : x)));
      const { error } = await supabase
        .from('mensagens_ciclo')
        .update({ fixada_em: null })
        .eq('id', m.id);
      if (error) {
        setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, fixada_em: m.fixada_em } : x)));
        mostrarFeedback('erro', 'Erro ao desfixar: ' + error.message);
      }
      return;
    }

    // Só fixa mensagem ativa.
    if (!m.ativo) return;
    setBusy(true);
    const agora = new Date().toISOString();

    // No máximo UMA fixada POR GRUPO — o escopo é (nutri, fase, grupo), não a
    // nutri inteira: fixar uma de Recuperação não pode desfixar a de Infusão.
    // É o mesmo escopo do índice único mensagens_ciclo_uma_fixada, que estoura
    // 23505 se este limpa errar o alvo.
    const limpa = await filtrarGrupo(
      supabase
        .from('mensagens_ciclo')
        .update({ fixada_em: null })
        .eq('nutri_id', user.id)
        .eq('fase', fase)
        .not('fixada_em', 'is', null),
      g
    );
    if (limpa.error) {
      setBusy(false);
      mostrarFeedback('erro', 'Erro ao fixar: ' + limpa.error.message);
      return;
    }

    const { error } = await supabase
      .from('mensagens_ciclo')
      .update({ fixada_em: agora })
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao fixar: ' + error.message); return; }

    setMsgs(prev => prev.map(x => {
      if (x.id === m.id) return { ...x, fixada_em: agora };
      // o banco só limpou as do mesmo grupo; o estado local acompanha
      return (x.grupo_ciclo ?? null) === g ? { ...x, fixada_em: null } : x;
    }));
    mostrarFeedback('ok', 'Mensagem fixada por até 3 dias.');
  }

  async function excluir(m) {
    if (!user) return;
    if (!window.confirm('Excluir esta mensagem? Essa ação não pode ser desfeita.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('mensagens_ciclo')
      .delete()
      .eq('id', m.id);
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao excluir: ' + error.message); return; }
    setMsgs(prev => prev.filter(x => x.id !== m.id));
    mostrarFeedback('ok', 'Mensagem excluída.');
  }

  async function adicionar() {
    const mensagem = novoTexto.trim();
    if (!mensagem || !user) return;
    setBusy(true);
    // Fim da rotação DO GRUPO — `ordem` é por grupo, como o índice de leitura
    // (nutri_id, fase, grupo_ciclo, ordem).
    const maxOrdem = doGrupo.reduce((max, m) => Math.max(max, m.ordem ?? 0), 0);
    const { data, error } = await supabase
      .from('mensagens_ciclo')
      .insert({
        nutri_id: user.id,
        fase,
        grupo_ciclo: grupo,
        mensagem,
        ordem: maxOrdem + 1,
        ativo: true,
      })
      .select()
      .single();
    setBusy(false);
    if (error) { mostrarFeedback('erro', 'Erro ao adicionar: ' + error.message); return; }
    setMsgs(prev => [...prev, data]);
    setNovoTexto('');
    mostrarFeedback('ok', 'Mensagem adicionada!');
  }

  // ─── Derivados ────────────────────────────────────────────────────────────
  const doGrupo = msgs.filter(m => (m.grupo_ciclo ?? null) === grupo);
  const ativasDoGrupo = doGrupo.filter(m => m.ativo);
  // A mesma função que a tela da paciente usa — o que aparece aqui é o que ela lê.
  const noAr = escolherDaSemana(ativasDoGrupo);

  const rotuloGrupo = grupos?.find(g => g.id === grupo)?.label ?? null;

  const secoes = Array.isArray(biblioteca)
    ? biblioteca
    : (biblioteca?.[chaveGrupo(grupo)] ?? []);
  // Uma seção só ocupa a largura toda: em duas colunas ficaria espremida à
  // esquerda, com metade do card vazia.
  const umaColuna = secoes.length <= 1;

  return (
    <div>
      <style>{`
        .mc-msgs { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .mc-exemplos { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 900px) {
          .mc-msgs { grid-template-columns: 1fr 1fr; }
          .mc-msg--editando { grid-column: 1 / -1; }
          .mc-exemplos--duplo { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* ── SELETOR DE GRUPO (só nas abas que têm sub-fase) ── */}
      {grupos && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{
              fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
              color: 'var(--text3)', fontWeight: 600, marginBottom: 10,
            }}>
              Momento do ciclo
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {grupos.map(g => {
                const n = msgs.filter(m => (m.grupo_ciclo ?? null) === g.id);
                const ativas = n.filter(m => m.ativo).length;
                const aberto = g.id === grupo;
                return (
                  <button
                    key={chaveGrupo(g.id)}
                    type="button"
                    onClick={() => trocarGrupo(g.id)}
                    className={aberto ? 'btn' : 'btn-outline'}
                    style={{ fontSize: 12, padding: '6px 13px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {g.label}
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 20,
                      padding: '1px 6px', lineHeight: 1.6,
                      background: aberto ? 'rgba(255,255,255,.22)' : 'var(--bg3)',
                      color: aberto ? '#fff' : 'var(--text3)',
                    }}>
                      {ativas}/{n.length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
              Cada momento tem lista, rotação e fixada próprias. A paciente recebe o
              do dia em que ela está — quem não tem ciclo identificável no cadastro,
              ou terminou o tratamento, cai nas <strong>Genéricas</strong>.
            </div>
          </div>
        </div>
      )}

      {/* ── NO AR ESTA SEMANA ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">{titulo}</div>
          <div className="card-sub">{descricao}</div>
        </div>
        <div className="card-body">
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            No ar esta semana{rotuloGrupo ? ` · ${rotuloGrupo}` : ''}
          </div>

          {loading ? (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: 'var(--bg2)', border: '1px dashed var(--border)',
              fontSize: 12, color: 'var(--text3)', textAlign: 'center',
            }}>
              Carregando…
            </div>
          ) : noAr ? (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: 'var(--green-bg, #f0fdf4)',
              border: '1.5px solid var(--green, #16a34a)',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 10, fontWeight: 700, color: 'var(--green, #16a34a)',
                letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5,
              }}>
                {estaFixada(noAr) ? (
                  <>📌 Fixada · {restanteFixada(noAr.fixada_em)}</>
                ) : (
                  <>
                    <i className="ti ti-check" style={{ fontSize: 12 }} />
                    Na rotação
                  </>
                )}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: 'var(--ink)',
                fontFamily: 'var(--font-sans)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {noAr.mensagem}
              </div>
              {ativasDoGrupo.length > 1 && !estaFixada(noAr) && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 7 }}>
                  Gira para a próxima da lista toda segunda-feira.
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: 'var(--bg2)', border: '1px dashed var(--border)',
              fontSize: 12, color: 'var(--text3)', textAlign: 'center',
            }}>
              {doGrupo.length > 0
                ? 'Nenhuma mensagem ativa aqui — as da lista estão todas desativadas.'
                : grupo === null
                  ? 'Nenhuma mensagem ainda. Adicione a primeira abaixo.'
                  : 'Nenhuma mensagem neste momento do ciclo — quem estiver nele recebe a Genérica.'}
            </div>
          )}

          {/* ── ADICIONAR NOVA ── */}
          <div style={{
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 600, marginBottom: 8,
          }}>
            Adicionar nova mensagem
          </div>

          <textarea
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            rows={3}
            placeholder="Escreva a mensagem… (ex.: {nome}, seguimos juntas 💚)"
            style={{
              width: '100%', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: novoTexto.trim() ? 'var(--bg-soft)' : 'var(--bg2)',
              fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
              outline: 'none', color: 'var(--ink)',
            }}
          />
          {novoTexto.trim() && !temPlaceholder(novoTexto) && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              💡 Essa mensagem não tem <code style={{ fontSize: 11 }}>{'{nome}'}</code> — ela
              aparecerá igual para todas as pacientes.
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>
              Use{' '}
              <code style={{
                background: 'var(--bg3)', borderRadius: 4,
                padding: '1px 5px', fontSize: 11, fontFamily: 'monospace',
              }}>{'{nome}'}</code>
              {' '}para o primeiro nome da paciente.
            </span>
            <button
              className="btn"
              onClick={adicionar}
              disabled={busy || !novoTexto.trim()}
            >
              {busy ? 'Salvando…' : rotuloGrupo ? `Adicionar em ${rotuloGrupo}` : 'Adicionar'}
            </button>
          </div>

          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
            }}>
              {feedback.msg}
            </div>
          )}
        </div>
      </div>

      {/* ── LISTA DO GRUPO ── */}
      {!loading && doGrupo.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title" style={{ fontSize: 15 }}>
              Mensagens da rotação{rotuloGrupo ? ` · ${rotuloGrupo}` : ''}
            </div>
            <div className="card-sub">
              {doGrupo.length} mensagem{doGrupo.length > 1 ? 's' : ''} ·{' '}
              {ativasDoGrupo.length} ativa{ativasDoGrupo.length === 1 ? '' : 's'} na rotação
            </div>
          </div>
          <div className="card-body">
            <div className="mc-msgs">
              {doGrupo.map((m, i) => (
                <div
                  key={m.id}
                  className={editandoId === m.id ? 'mc-msg--editando' : undefined}
                  style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: m.ativo ? '1px solid var(--border)' : '1px dashed var(--border)',
                    background: m.ativo ? 'var(--bg-soft)' : 'var(--bg2)',
                  }}
                >
                  {editandoId === m.id ? (
                    <>
                      <textarea
                        value={editTexto}
                        onChange={e => setEditTexto(e.target.value)}
                        rows={3}
                        autoFocus
                        style={{
                          width: '100%', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
                          padding: '9px 11px', borderRadius: 8,
                          border: '1.5px solid var(--border)', background: 'var(--bg2)',
                          fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55,
                          outline: 'none', color: 'var(--ink)',
                        }}
                      />
                      {editTexto.trim() && !temPlaceholder(editTexto) && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                          💡 Sem <code style={{ fontSize: 11 }}>{'{nome}'}</code> — aparecerá igual para todas.
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button
                          onClick={cancelarEdicao}
                          disabled={busy}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
                            fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn"
                          onClick={() => salvarEdicao(m)}
                          disabled={busy || !editTexto.trim()}
                        >
                          {busy ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                          textTransform: 'uppercase', marginBottom: 5,
                          color: 'var(--text3)',
                        }}>
                          #{i + 1}
                          {!m.ativo && <span style={{ color: 'var(--muted)' }}>· inativa</span>}
                          {estaFixada(m) && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              color: 'var(--green, #16a34a)', fontWeight: 700,
                            }}>
                              📌 Fixada · {restanteFixada(m.fixada_em)}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-sans)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          color: m.ativo ? 'var(--ink)' : 'var(--text3)',
                        }}>
                          {m.mensagem}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleFixar(m)}
                          disabled={busy || (!estaFixada(m) && !m.ativo)}
                          title={
                            estaFixada(m)
                              ? 'Desfixar (voltar à rotação)'
                              : !m.ativo
                                ? 'Só é possível fixar mensagens ativas'
                                : 'Fixar por até 3 dias (ganha da rotação neste momento do ciclo)'
                          }
                          style={{
                            background: 'none', border: 'none',
                            cursor: (!estaFixada(m) && !m.ativo) ? 'not-allowed' : 'pointer',
                            color: estaFixada(m) ? 'var(--green, #16a34a)' : 'var(--muted)',
                            opacity: (!estaFixada(m) && !m.ativo) ? 0.4 : 1,
                            padding: '5px 7px',
                          }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1, filter: estaFixada(m) ? 'none' : 'grayscale(1) opacity(0.5)' }}>📌</span>
                        </button>
                        <button
                          onClick={() => toggleAtivo(m)}
                          title={m.ativo ? 'Desativar (tirar da rotação)' : 'Ativar (voltar à rotação)'}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: m.ativo ? 'var(--green, #16a34a)' : 'var(--muted)',
                            padding: '5px 7px',
                          }}
                        >
                          <i className={`ti ti-${m.ativo ? 'circle-check-filled' : 'circle'}`} style={{ fontSize: 16 }} />
                        </button>
                        <button
                          onClick={() => iniciarEdicao(m)}
                          title="Editar"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', padding: '5px 7px',
                          }}
                        >
                          <i className="ti ti-pencil" style={{ fontSize: 15 }} />
                        </button>
                        <button
                          onClick={() => excluir(m)}
                          disabled={busy}
                          title="Excluir"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', padding: '5px 7px',
                          }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: 15 }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BIBLIOTECA DE EXEMPLOS ── */}
      {secoes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: 15 }}>
              Biblioteca de exemplos{rotuloGrupo ? ` · ${rotuloGrupo}` : ''}
            </div>
            <div className="card-sub">
              Clicar preenche o campo acima — você ajusta o texto e adiciona.
            </div>
          </div>
          <div className="card-body">
            <div className={`mc-exemplos${umaColuna ? '' : ' mc-exemplos--duplo'}`}>
              {secoes.map((secao, s) => (
                <div key={secao.label ?? s}>
                  {secao.label && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text2)',
                      marginBottom: 7,
                    }}>
                      {secao.label}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(secao.itens ?? []).map((ex, i) => {
                      const jaNaLista = doGrupo.some(m => m.mensagem === ex);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setNovoTexto(ex)}
                          title={jaNaLista ? 'Já está na lista deste momento' : 'Usar como base'}
                          style={{
                            textAlign: 'left', padding: '9px 12px', borderRadius: 9,
                            border: '1px solid var(--border)',
                            background: jaNaLista ? 'var(--bg2)' : 'var(--bg-soft)',
                            cursor: 'pointer', fontSize: 12, lineHeight: 1.55,
                            color: jaNaLista ? 'var(--text3)' : 'var(--text2)',
                            fontFamily: 'var(--font-sans)',
                            transition: 'border .15s, background .15s',
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                          }}
                        >
                          {jaNaLista && (
                            <i className="ti ti-check"
                               style={{ fontSize: 13, color: 'var(--green, #16a34a)', flexShrink: 0, marginTop: 1 }} />
                          )}
                          <span>{ex}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
