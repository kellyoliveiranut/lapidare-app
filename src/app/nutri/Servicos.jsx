import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { brl, valorBR } from '../../lib/utils.js';

const NIVEIS = [
  { value: 'entrada',        label: 'Entrada',         desc: 'Baixo ticket — porta de entrada' },
  { value: 'intermediario',  label: 'Intermediário',   desc: 'Acompanhamento padrão' },
  { value: 'premium',        label: 'Premium',         desc: 'Alto ticket / longo prazo' },
  { value: 'avulso',         label: 'Avulso',          desc: 'Consulta única ou pontual' },
];

function nivelLabel(n) { return NIVEIS.find(x => x.value === n)?.label ?? n; }
function nivelColor(n) {
  if (n === 'premium')      return 'var(--gold-deep, #a08456)';
  if (n === 'intermediario') return 'var(--green)';
  if (n === 'entrada')      return 'var(--blue)';
  return 'var(--text3)';
}

export default function Servicos() {
  const { user } = useSession();
  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null); // null = não, {} = novo, {id} = editar
  const [toast, setToast] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from('servicos')
      .select('*').eq('nutri_id', user.id)
      .order('ativo', { ascending: false }).order('ticket', { ascending: false });
    setServicos(data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [user]);

  function mostraToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function toggleAtivo(s) {
    await supabase.from('servicos').update({ ativo: !s.ativo }).eq('id', s.id);
    carregar();
  }
  async function excluir(s) {
    if (!window.confirm(`Excluir "${s.nome}"?`)) return;
    await supabase.from('servicos').delete().eq('id', s.id);
    mostraToast('Serviço excluído');
    carregar();
  }

  const ativos = servicos.filter(s => s.ativo);
  const inativos = servicos.filter(s => !s.ativo);
  const ticketMedio = ativos.length > 0 ? Math.round(ativos.reduce((a, s) => a + Number(s.ticket), 0) / ativos.length) : 0;

  return (
    <>
      <div className="page-title">Meus serviços</div>
      <div className="page-sub">
        Catálogo dos produtos que você vende. Aparecem no <strong>Financeiro</strong> (ao registrar venda) e na <strong>Previsibilidade</strong> (planejamento do mês).
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {ativos.length > 0 && (
            <>
              <strong style={{ color: 'var(--dark)' }}>{ativos.length} serviço{ativos.length === 1 ? '' : 's'} ativo{ativos.length === 1 ? '' : 's'}</strong>
              {' · ticket médio '} <strong style={{ color: 'var(--dark)' }}>{brl(ticketMedio)}</strong>
            </>
          )}
        </div>
        <button className="btn" onClick={() => setEditando({})}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo serviço
        </button>
      </div>

      {carregando ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : servicos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-package empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum serviço cadastrado</div>
          <div className="empty-sub">
            Cadastre seus produtos (plano trimestral, semestral, consultoria, etc) com nome, ticket e nível.
            Eles aparecerão automaticamente em Previsibilidade para você planejar quanto vender de cada.
          </div>
          <button className="btn" onClick={() => setEditando({})}>
            <i className="ti ti-plus" aria-hidden="true"></i> Cadastrar primeiro serviço
          </button>
        </div>
      ) : (
        <>
          {ativos.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 0 }}>Serviços ativos ({ativos.length})</div>
              <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                {ativos.map((s, i) => (
                  <ServicoRow key={s.id} s={s} isLast={i === ativos.length - 1}
                    onEditar={() => setEditando(s)}
                    onToggle={() => toggleAtivo(s)}
                    onExcluir={() => excluir(s)} />
                ))}
              </div>
            </>
          )}

          {inativos.length > 0 && (
            <details>
              <summary style={{
                fontSize: 13, color: 'var(--text3)', cursor: 'pointer',
                listStyle: 'none', padding: '4px 0',
              }}>
                Mostrar inativos ({inativos.length})
              </summary>
              <div className="card" style={{ padding: 0, opacity: .55, marginTop: 8 }}>
                {inativos.map((s, i) => (
                  <ServicoRow key={s.id} s={s} isLast={i === inativos.length - 1}
                    onEditar={() => setEditando(s)}
                    onToggle={() => toggleAtivo(s)}
                    onExcluir={() => excluir(s)} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {editando !== null && (
        <EditorServico
          servico={editando}
          nutriId={user.id}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); await carregar(); mostraToast('Serviço salvo'); }}
        />
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

function ServicoRow({ s, isLast, onEditar, onToggle, onExcluir }) {
  const cor = nivelColor(s.nivel);
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: cor + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <i className="ti ti-package" style={{ fontSize: 17, color: cor }} aria-hidden="true"></i>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{s.nome}</span>
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 20,
            background: cor + '20', color: cor, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>{nivelLabel(s.nivel)}</span>
        </div>
        {s.descricao && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{s.descricao}</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)' }}>{brl(s.ticket)}</div>
      </div>
      <div style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
        <button onClick={onToggle} title={s.ativo ? 'Desativar' : 'Ativar'}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text3)', fontSize: 13,
          }}>
          <i className={`ti ti-${s.ativo ? 'eye' : 'eye-off'}`} aria-hidden="true"></i>
        </button>
        <button onClick={onEditar}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 13,
          }}>
          <i className="ti ti-pencil" aria-hidden="true"></i>
        </button>
        <button onClick={onExcluir}
          style={{
            background: 'none', border: '0.5px solid var(--red)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--red)', fontSize: 13,
          }}>
          <i className="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

function EditorServico({ servico, nutriId, onClose, onSaved }) {
  const isEdit = !!servico?.id;
  const [nome, setNome] = useState(servico?.nome ?? '');
  const [nivel, setNivel] = useState(servico?.nivel ?? 'intermediario');
  const [ticket, setTicket] = useState(servico?.ticket != null ? String(servico.ticket).replace('.', ',') : '');
  const [descricao, setDescricao] = useState(servico?.descricao ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome do serviço.');
    const t = valorBR(ticket);
    if (!t || t <= 0) return setErro('Informe um ticket válido.');

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      nome: nome.trim(),
      nivel,
      ticket: t,
      descricao: descricao.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('servicos').update(payload).eq('id', servico.id)
      : await supabase.from('servicos').insert(payload);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>
          {isEdit ? 'Editar serviço' : 'Novo serviço'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Aparecerá no planejamento da Previsibilidade
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Nome do serviço</label>
        <input value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Ex: Plano trimestral · Acompanhamento mensal" />

        <label className="form-lbl">Nível na esteira</label>
        <select value={nivel} onChange={e => setNivel(e.target.value)}>
          {NIVEIS.map(n => <option key={n.value} value={n.value}>{n.label} — {n.desc}</option>)}
        </select>

        <label className="form-lbl">Ticket (R$)</label>
        <input inputMode="decimal" value={ticket} onChange={e => setTicket(e.target.value)}
          placeholder="Ex: 1500" />

        <label className="form-lbl">Descrição (opcional)</label>
        <textarea rows="2" value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Ex: 3 meses, 6 consultas + chat ilimitado" />

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
