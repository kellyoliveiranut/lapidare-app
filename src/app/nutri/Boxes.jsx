import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { TZ_CLINICA } from '../../lib/utils.js';

// Os dois tipos de box. A grafia é IDÊNTICA à de src/lib/objetivos.js e ao
// check de box_tipo na migration 2026-08-22 — os três precisam concordar, e um
// deles com caixa diferente faria o insert ser recusado pelo banco.
// 'atom-2' é o mesmo ícone que Oncologia já usa no NAV_CONFIG.
const BOX_TIPOS = [
  { id: 'Emagrecimento', icon: 'flame' },
  { id: 'Oncologia',     icon: 'atom-2' },
];

const MOTIVOS = {
  montagem_box: { label: 'Box montada', icon: 'package' },
  compra:       { label: 'Compra',      icon: 'shopping-cart' },
  ajuste:       { label: 'Ajuste',      icon: 'pencil' },
  estorno:      { label: 'Estorno',     icon: 'arrow-back-up' },
};

/**
 * Quantas boxes completas dá para montar, e qual é o item limitante.
 *
 * Espelha o cálculo de public.montar_box (migration 2026-08-22). Os dois
 * PRECISAM concordar: se a tela contar diferente do banco, ela promete uma box
 * que o RPC recusa, ou esconde uma que daria para montar.
 *
 * Por isso `ativo` NÃO entra aqui — a função do banco também não filtra por
 * ele. `ativo` só esconde o item do seletor de "adicionar à receita"; item
 * inativo que já está numa receita continua sendo descontado, e a linha da
 * receita avisa disso na tela.
 *
 * Três estados, nunca dois: receita vazia e estoque zerado são problemas
 * OPOSTOS — um pede cadastrar a receita, o outro pede comprar item. A função do
 * banco também os separa, em dois raise distintos.
 */
function calcularBox(boxTipo, itens, receitas) {
  const linhas = receitas.filter(r => r.box_tipo === boxTipo);
  if (linhas.length === 0) return { estado: 'sem_receita', possiveis: 0, linhas: [] };

  const porItem = linhas.map(r => {
    const item = itens.find(i => i.id === r.item_id) ?? null;
    const disponivel = item?.quantidade ?? 0;
    return {
      receitaId:  r.id,
      item,
      necessaria: r.quantidade_necessaria,
      possiveis:  Math.floor(disponivel / r.quantidade_necessaria),
    };
  });

  const limitante = porItem.reduce((a, b) => (b.possiveis < a.possiveis ? b : a));
  return {
    estado:    limitante.possiveis === 0 ? 'sem_estoque' : 'ok',
    possiveis: limitante.possiveis,
    limitante,
    linhas:    porItem,
  };
}

/**
 * Agrupa os movimentos por evento: uma montagem gera N linhas, uma por item da
 * receita, todas no mesmo instante. Sem agrupar, três entregas de uma box de 6
 * itens já enchem a tela com 18 linhas soltas.
 *
 * A chave é created_at + motivo + box_tipo. O created_at das linhas de uma
 * montagem vem do mesmo now() da transação, então bate exato — o agrupamento é
 * por igualdade, não por janela de tempo aproximada.
 */
function agruparMovimentos(movimentos) {
  const grupos = [];
  const porChave = new Map();
  for (const m of movimentos) {
    const chave = `${m.created_at}|${m.motivo}|${m.box_tipo ?? ''}`;
    let g = porChave.get(chave);
    if (!g) {
      g = { chave, created_at: m.created_at, motivo: m.motivo, box_tipo: m.box_tipo, itens: [] };
      porChave.set(chave, g);
      grupos.push(g);
    }
    g.itens.push(m);
  }
  return grupos;
}

function dataHoraBR(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TZ_CLINICA,
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const ABAS = [
  { id: 'itens',     emoji: '📦', label: 'Itens'     },
  { id: 'receitas',  emoji: '🧾', label: 'Receitas'  },
  { id: 'historico', emoji: '🕘', label: 'Histórico' },
];

export default function Boxes() {
  const { user } = useSession();
  const [itens, setItens] = useState([]);
  const [receitas, setReceitas] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('itens');
  const [editando, setEditando] = useState(null);  // null = não, {} = novo, {id} = editar
  const [montando, setMontando] = useState(null);  // box_tipo em andamento
  const [toast, setToast] = useState(null);
  const [erro, setErro] = useState(null);

  async function carregar() {
    if (!user) return;
    const [itRes, recRes, movRes] = await Promise.all([
      supabase.from('estoque_itens')
        .select('*').eq('nutri_id', user.id)
        .order('ativo', { ascending: false }).order('nome'),
      supabase.from('box_receitas')
        .select('*').eq('nutri_id', user.id),
      // O índice estoque_movimentos_nutri_data_idx da migration é exatamente
      // (nutri_id, created_at desc) — esta consulta o usa direto.
      supabase.from('estoque_movimentos')
        .select('id, delta, motivo, box_tipo, created_at, item:estoque_itens(nome)')
        .eq('nutri_id', user.id)
        .order('created_at', { ascending: false }).limit(100),
    ]);
    setItens(itRes.data ?? []);
    setReceitas(recRes.data ?? []);
    setMovimentos(movRes.data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [user]);

  function mostraToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function toggleAtivo(item) {
    setErro(null);
    const { error } = await supabase.from('estoque_itens')
      .update({ ativo: !item.ativo }).eq('id', item.id);
    if (error) return setErro('Erro ao atualizar: ' + error.message);
    carregar();
  }

  async function excluirItem(item) {
    setErro(null);
    if (!window.confirm(`Excluir "${item.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('estoque_itens').delete().eq('id', item.id);
    if (error) {
      // 23503 = foreign_key_violation. O `on delete restrict` de box_receitas
      // (migration 2026-08-22) recusa excluir item usado em receita — de
      // propósito, senão a contagem de boxes subiria sozinha. Casar pelo
      // CÓDIGO, não pela mensagem: a do Postgres vem em inglês e cita o nome
      // do constraint, que não diz nada para quem está na tela.
      if (error.code === '23503') {
        return setErro(`"${item.nome}" está na receita de uma box. Remova de lá antes de excluir.`);
      }
      return setErro('Erro ao excluir: ' + error.message);
    }
    mostraToast('Item excluído');
    carregar();
  }

  async function adicionarNaReceita(boxTipo, itemId, quantidade) {
    setErro(null);
    const { error } = await supabase.from('box_receitas').insert({
      nutri_id:              user.id,
      box_tipo:              boxTipo,
      item_id:               itemId,
      quantidade_necessaria: quantidade,
    });
    // 23505 = unique_violation: box_receitas_unq impede o mesmo item duas
    // vezes na mesma receita, o que faria o desconto rodar em dobro.
    if (error) {
      if (error.code === '23505') return setErro('Esse item já está na receita dessa box.');
      return setErro('Erro ao adicionar: ' + error.message);
    }
    carregar();
  }

  async function removerDaReceita(receitaId) {
    setErro(null);
    const { error } = await supabase.from('box_receitas').delete().eq('id', receitaId);
    if (error) return setErro('Erro ao remover: ' + error.message);
    carregar();
  }

  async function montarBox(boxTipo) {
    setErro(null);
    setMontando(boxTipo);
    const { error } = await supabase.rpc('montar_box', { p_box_tipo: boxTipo });
    setMontando(null);
    if (error) {
      // Caminho de exceção, não o normal: o botão só fica habilitado quando o
      // cálculo local diz que dá para montar. Chegar aqui significa que o
      // estoque mudou por fora desta tela — mostra o que o banco disse e
      // recarrega, em vez de traduzir a mensagem. Os dois raise da função saem
      // com o mesmo errcode P0001, então não há como distingui-los por código,
      // e casar por texto quebraria em silêncio se a frase mudasse.
      setErro('Não foi possível montar: ' + error.message);
      carregar();
      return;
    }
    // Recarrega tudo em vez de usar o retorno do RPC: o histórico mudou, e a
    // OUTRA box pode ter mudado junto se as duas compartilham um item.
    mostraToast(`Box de ${boxTipo} montada`);
    carregar();
  }

  const resumos = useMemo(
    () => BOX_TIPOS.map(b => ({ ...b, ...calcularBox(b.id, itens, receitas) })),
    [itens, receitas],
  );
  const grupos = useMemo(() => agruparMovimentos(movimentos), [movimentos]);
  // Só o seletor de "adicionar à receita" filtra por ativo — o cálculo não.
  const itensAtivos = useMemo(() => itens.filter(i => i.ativo), [itens]);

  return (
    <>
      <div className="page-title">Box de boas-vindas</div>
      <div className="page-sub">
        Estoque dos componentes e montagem das boxes de entrada. Quantas boxes dá para montar
        é sempre calculado a partir do estoque dos itens — nunca digitado.
      </div>

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span style={{ flex: 1 }}>{erro}</span>
          <button onClick={() => setErro(null)} title="Fechar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      )}

      {/* Resumo fora das abas: é a pergunta que faz abrir esta tela. Dentro de
          uma aba seria um clique a mais toda vez. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))',
        gap: 12, marginBottom: 18,
      }}>
        {resumos.map(r => (
          <BoxResumoCard key={r.id} resumo={r} montando={montando === r.id}
            onMontar={() => montarBox(r.id)} />
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16,
        overflowX: 'auto', scrollbarWidth: 'thin',
      }}>
        {ABAS.map(a => {
          const ativa = aba === a.id;
          const n = a.id === 'itens' ? itens.length : a.id === 'historico' ? grupos.length : null;
          return (
            <button key={a.id} onClick={() => { setAba(a.id); setErro(null); }}
              style={{
                flex: '0 0 auto', padding: '7px 14px',
                fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer',
                color: ativa ? 'var(--dark)' : 'var(--text3)',
                background: ativa ? 'var(--white)' : 'transparent',
                boxShadow: ativa ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {a.emoji} {a.label}
              {n > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 20,
                  background: ativa ? 'var(--bg2)' : 'transparent', color: 'var(--text3)',
                }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : aba === 'itens' ? (
        <SecaoItens
          itens={itens}
          onNovo={() => setEditando({})}
          onEditar={item => setEditando(item)}
          onToggle={toggleAtivo}
          onExcluir={excluirItem} />
      ) : aba === 'receitas' ? (
        <SecaoReceitas
          resumos={resumos}
          itensAtivos={itensAtivos}
          onAdicionar={adicionarNaReceita}
          onRemover={removerDaReceita} />
      ) : (
        <SecaoHistorico grupos={grupos} />
      )}

      {editando !== null && (
        <EditorItem
          item={editando}
          nutriId={user.id}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); await carregar(); mostraToast('Item salvo'); }} />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--dark)', color: '#faf8f5',
          padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 200,
        }}>{toast}</div>
      )}
    </>
  );
}

// ─── Resumo de uma box ───────────────────────────────────────────────────────
// Os três estados de calcularBox() viram três textos e três estados de botão.
// "Receita não cadastrada" e "Sem estoque" NUNCA se misturam: um pede cadastro,
// o outro pede compra, e tratá-los como "0 boxes" esconderia qual é o problema.
function BoxResumoCard({ resumo, montando, onMontar }) {
  const { id, icon, estado, possiveis, limitante } = resumo;
  const nomeLimitante = limitante?.item?.nome ?? 'item removido';

  const podeMontar = estado === 'ok';
  const rotuloBotao =
    montando                    ? 'Montando…'
    : estado === 'sem_receita'  ? 'Cadastre a receita primeiro'
    : estado === 'sem_estoque'  ? `Falta ${nomeLimitante}`
    : 'Montar e entregar';

  const cor =
    estado === 'ok'          ? 'var(--green)'
    : estado === 'sem_estoque' ? 'var(--red)'
    : 'var(--text3)';

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          // var(--x) + '15' é o idioma do Servicos.jsx, mas produz CSS inválido
          // (o sufixo fica fora do var()) e o navegador descarta a regra. Token
          // sólido aqui; a cor do estado fica no ícone, que é onde se lê.
          width: 34, height: 34, borderRadius: 9, background: 'var(--bg2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ti-${icon}`} style={{ fontSize: 17, color: cor }} aria-hidden="true"></i>
        </div>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{id}</span>
      </div>

      <div>
        {estado === 'sem_receita' ? (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text3)' }}>
              Receita não cadastrada
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Escolha os itens desta box na aba Receitas
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: cor, lineHeight: 1.1 }}>
              {possiveis}
              <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 6 }}>
                box{possiveis === 1 ? '' : 'es'} completa{possiveis === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {estado === 'sem_estoque'
                ? <>Falta <strong style={{ color: 'var(--dark)' }}>{nomeLimitante}</strong> — a receita pede {limitante?.necessaria}</>
                : <>Limita: <strong style={{ color: 'var(--dark)' }}>{nomeLimitante}</strong> ({limitante?.item?.quantidade ?? 0} em estoque)</>}
            </div>
          </>
        )}
      </div>

      <button
        className={podeMontar ? 'btn' : 'btn-outline'}
        onClick={onMontar}
        disabled={!podeMontar || !!montando}
        title={podeMontar ? `Desconta os itens da receita de ${id}` : rotuloBotao}
        style={{
          justifyContent: 'center', width: '100%',
          cursor: podeMontar && !montando ? 'pointer' : 'default',
          opacity: podeMontar ? (montando ? .7 : 1) : .55,
        }}>
        <i className="ti ti-package-export" aria-hidden="true"></i> {rotuloBotao}
      </button>
    </div>
  );
}

// ─── Aba 1: itens em estoque ─────────────────────────────────────────────────
function SecaoItens({ itens, onNovo, onEditar, onToggle, onExcluir }) {
  if (itens.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-package empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Nenhum item cadastrado</div>
        <div className="empty-sub">
          Cadastre os componentes que entram nas boxes (caneca, shaker, ebook impresso, sachê…).
          Depois monte a receita de cada box na aba ao lado.
        </div>
        <button className="btn" onClick={onNovo}>
          <i className="ti ti-plus" aria-hidden="true"></i> Cadastrar primeiro item
        </button>
      </div>
    );
  }

  const ativos = itens.filter(i => i.ativo);
  const inativos = itens.filter(i => !i.ativo);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          <strong style={{ color: 'var(--dark)' }}>{ativos.length} item{ativos.length === 1 ? '' : 's'} ativo{ativos.length === 1 ? '' : 's'}</strong>
        </div>
        <button className="btn" onClick={onNovo}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo item
        </button>
      </div>

      {ativos.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          {ativos.map((it, i) => (
            <ItemRow key={it.id} item={it} isLast={i === ativos.length - 1}
              onEditar={() => onEditar(it)} onToggle={() => onToggle(it)} onExcluir={() => onExcluir(it)} />
          ))}
        </div>
      )}

      {inativos.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, color: 'var(--text3)', cursor: 'pointer', listStyle: 'none', padding: '4px 0' }}>
            Mostrar inativos ({inativos.length})
          </summary>
          <div className="card" style={{ padding: 0, opacity: .55, marginTop: 8 }}>
            {inativos.map((it, i) => (
              <ItemRow key={it.id} item={it} isLast={i === inativos.length - 1}
                onEditar={() => onEditar(it)} onToggle={() => onToggle(it)} onExcluir={() => onExcluir(it)} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function ItemRow({ item, isLast, onEditar, onToggle, onExcluir }) {
  const zerado = item.quantidade === 0;
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <i className="ti ti-box" style={{ fontSize: 17, color: zerado ? 'var(--red)' : 'var(--gold-deep, #a08456)' }} aria-hidden="true"></i>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{item.nome}</span>
        {!item.ativo && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 20, marginLeft: 6,
            background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>inativo</span>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)',
          color: zerado ? 'var(--red)' : 'var(--dark)',
        }}>
          {item.quantidade}
          {item.unidade && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 3 }}>{item.unidade}</span>}
        </div>
      </div>

      <div style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
        <button onClick={onToggle} title={item.ativo ? 'Desativar' : 'Ativar'}
          style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text3)', fontSize: 13 }}>
          <i className={`ti ti-${item.ativo ? 'eye' : 'eye-off'}`} aria-hidden="true"></i>
        </button>
        <button onClick={onEditar} title="Editar"
          style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text2)', fontSize: 13 }}>
          <i className="ti ti-pencil" aria-hidden="true"></i>
        </button>
        <button onClick={onExcluir} title="Excluir"
          style={{ background: 'none', border: '0.5px solid var(--red)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--red)', fontSize: 13 }}>
          <i className="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

function EditorItem({ item, nutriId, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [nome, setNome] = useState(item?.nome ?? '');
  const [quantidade, setQuantidade] = useState(item?.quantidade != null ? String(item.quantidade) : '0');
  const [unidade, setUnidade] = useState(item?.unidade ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome do item.');
    const q = Number(quantidade);
    // Inteiro e não-negativo: é o mesmo contrato do check (quantidade >= 0) e
    // do tipo integer da coluna. Barrar aqui dá mensagem em português; deixar
    // passar daria o erro cru do Postgres.
    if (!Number.isInteger(q) || q < 0) return setErro('A quantidade deve ser um número inteiro, zero ou maior.');

    setBusy(true);
    const payload = {
      nutri_id:   nutriId,
      nome:       nome.trim(),
      quantidade: q,
      unidade:    unidade.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('estoque_itens').update(payload).eq('id', item.id)
      : await supabase.from('estoque_itens').insert(payload);
    setBusy(false);
    if (error) {
      // 23505 = unique_violation em estoque_itens_nutri_nome_idx. Dois itens
      // com o mesmo nome espalhariam o saldo em duas linhas e fariam o
      // limitante mentir — por isso o índice existe.
      if (error.code === '23505') return setErro('Já existe um item com esse nome.');
      return setErro(error.message);
    }
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>
          {isEdit ? 'Editar item' : 'Novo item'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Componente que entra nas boxes
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Nome do item</label>
        <input value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Ex: Caneca · Shaker · Ebook impresso" />

        <label className="form-lbl">Quantidade em estoque</label>
        <input inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)}
          placeholder="Ex: 20" />

        <label className="form-lbl">Unidade (opcional)</label>
        <input value={unidade} onChange={e => setUnidade(e.target.value)}
          placeholder="Ex: un · sachê · g" />

        {isEdit && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
            Alterar a quantidade por aqui <strong>não</strong> gera linha no histórico — só a
            montagem de box gera. O histórico registra saídas, não ajustes manuais.
          </div>
        )}

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Aba 2: receitas ─────────────────────────────────────────────────────────
function SecaoReceitas({ resumos, itensAtivos, onAdicionar, onRemover }) {
  return (
    <>
      {resumos.map(r => (
        <ReceitaBox key={r.id} resumo={r} itensAtivos={itensAtivos}
          onAdicionar={onAdicionar} onRemover={onRemover} />
      ))}
    </>
  );
}

function ReceitaBox({ resumo, itensAtivos, onAdicionar, onRemover }) {
  const { id, linhas } = resumo;
  // Item já na receita não volta ao seletor: box_receitas_unq recusaria o
  // insert, e oferecer uma opção que sempre dá erro é ruído.
  const disponiveis = itensAtivos.filter(i => !linhas.some(l => l.item?.id === i.id));

  return (
    <>
      <div className="section-label" style={{ marginTop: 0 }}>Box de {id}</div>
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        {linhas.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text3)' }}>
            Esta box ainda não tem receita. Escolha abaixo os itens que ela leva.
          </div>
        ) : (
          linhas.map(l => (
            <ReceitaLinha key={l.receitaId} linha={l}
              onRemover={() => onRemover(l.receitaId)} />
          ))
        )}

        <AdicionarNaReceita
          boxTipo={id}
          disponiveis={disponiveis}
          temItens={itensAtivos.length > 0}
          onAdicionar={onAdicionar} />
      </div>
    </>
  );
}

function ReceitaLinha({ linha, onRemover }) {
  const { item, necessaria, possiveis } = linha;
  const estoque = item?.quantidade ?? 0;
  const falta = possiveis === 0;

  return (
    <div style={{
      padding: '12px 16px',
      // Sem ternário de isLast, ao contrário das outras listas: aqui a linha de
      // adicionar vem sempre depois, então a última receita também leva borda.
      borderBottom: '0.5px solid #f5f0e8',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{item?.nome ?? 'item removido'}</span>
        {/* Item inativo continua sendo descontado pelo montar_box — a função do
            banco não filtra por ativo. O aviso existe para isso não surpreender. */}
        {item && !item.ativo && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 20, marginLeft: 6,
            background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>inativo · ainda conta</span>
        )}
        <div style={{ fontSize: 12, color: falta ? 'var(--red)' : 'var(--text3)', marginTop: 2 }}>
          leva {necessaria} · {estoque} em estoque · dá para {possiveis} box{possiveis === 1 ? '' : 'es'}
        </div>
      </div>

      <button onClick={onRemover} title="Remover da receita"
        style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text3)', fontSize: 13 }}>
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  );
}

function AdicionarNaReceita({ boxTipo, disponiveis, temItens, onAdicionar }) {
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [busy, setBusy] = useState(false);

  async function adicionar() {
    const q = Number(quantidade);
    // > 0 é o mesmo contrato do check (quantidade_necessaria > 0) da migration,
    // que existe porque um zero causaria divisão por zero no limitante.
    if (!itemId || !Number.isInteger(q) || q < 1) return;
    setBusy(true);
    await onAdicionar(boxTipo, itemId, q);
    setBusy(false);
    setItemId('');
    setQuantidade('1');
  }

  if (!temItens) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text3)' }}>
        Cadastre itens na aba <strong>Itens</strong> para montar a receita.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={itemId} onChange={e => setItemId(e.target.value)}
        style={{
          flex: '1 1 180px', padding: '7px 10px', borderRadius: 8,
          border: '0.5px solid var(--border)', fontSize: 13,
          background: 'var(--white)', fontFamily: 'var(--font-sans)',
        }}>
        <option value="">{disponiveis.length === 0 ? 'Todos os itens já estão nesta receita' : 'Adicionar item…'}</option>
        {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
      </select>

      <input inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)}
        title="Quantas unidades deste item a box leva"
        style={{
          width: 72, padding: '7px 10px', borderRadius: 8,
          border: '0.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-sans)',
        }} />

      <button className="btn-outline" onClick={adicionar} disabled={busy || !itemId}
        style={{ opacity: busy || !itemId ? .55 : 1 }}>
        <i className="ti ti-plus" aria-hidden="true"></i> Adicionar
      </button>
    </div>
  );
}

// ─── Aba 3: histórico ────────────────────────────────────────────────────────
// Agrupado por evento: uma montagem de box de 6 itens gera 6 linhas em
// estoque_movimentos, e três entregas encheriam a tela com 18 linhas soltas.
function SecaoHistorico({ grupos }) {
  if (grupos.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-history empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Nenhuma movimentação ainda</div>
        <div className="empty-sub">
          Cada box montada registra aqui os itens que saíram do estoque, com data e hora.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {grupos.map((g, i) => (
        <MovimentoGrupo key={g.chave} grupo={g} isLast={i === grupos.length - 1} />
      ))}
    </div>
  );
}

function MovimentoGrupo({ grupo, isLast }) {
  const [aberto, setAberto] = useState(false);
  const info = MOTIVOS[grupo.motivo] ?? { label: grupo.motivo, icon: 'point' };
  const titulo = grupo.motivo === 'montagem_box' && grupo.box_tipo
    ? `Box de ${grupo.box_tipo} montada`
    : info.label;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8' }}>
      <button
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        title={aberto ? 'Recolher itens' : 'Ver itens'}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
          textAlign: 'left', fontFamily: 'var(--font-sans)',
        }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ti-${info.icon}`} style={{ fontSize: 15, color: 'var(--text3)' }} aria-hidden="true"></i>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>{titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {dataHoraBR(grupo.created_at)} · {grupo.itens.length} {grupo.itens.length === 1 ? 'item' : 'itens'}
          </div>
        </div>

        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`}
          style={{ fontSize: 15, color: 'var(--text3)' }} aria-hidden="true"></i>
      </button>

      {aberto && (
        <div style={{ padding: '0 16px 12px 60px' }}>
          {grupo.itens.map(m => (
            <div key={m.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13, padding: '4px 0', color: 'var(--text2)',
            }}>
              <span>{m.item?.nome ?? 'item excluído'}</span>
              <span style={{
                fontFamily: 'var(--font-serif)', fontWeight: 600,
                color: m.delta < 0 ? 'var(--red)' : 'var(--green)',
              }}>
                {m.delta > 0 ? '+' : ''}{m.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
