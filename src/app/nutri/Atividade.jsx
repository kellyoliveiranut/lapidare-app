import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { descreverAtividade } from '../../lib/atividadeTexto.js';
import { ROTA_INICIAL_NUTRI } from '../../lib/rotas.js';

// "Atividade da secretária": o que ela criou, alterou, excluiu e quais fichas
// abriu. Só a Dra. vê (o banco também só devolve para ela).
const quando = iso => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default function Atividade() {
  const { user, secretaria } = useSession();
  const navigate = useNavigate();
  const [itens, setItens] = useState(null);
  const [nomes, setNomes] = useState({});
  const [erro, setErro] = useState(false);
  const [soAlteracoes, setSoAlteracoes] = useState(false);

  useEffect(() => {
    if (!user?.id || secretaria) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from('atividade_equipe')
        .select('id, acao, tabela, registro_id, paciente_id, detalhe, criado_em')
        .eq('nutri_id', user.id).order('criado_em', { ascending: false }).limit(300);
      if (!vivo) return;
      if (error) { setErro(true); setItens([]); return; }
      setItens(data ?? []);
      const ids = [...new Set((data ?? []).map(a => a.paciente_id).filter(Boolean))];
      if (ids.length) {
        const { data: pacs } = await supabase.from('pacientes').select('id, nome').in('id', ids);
        if (vivo) setNomes(Object.fromEntries((pacs ?? []).map(p => [p.id, p.nome])));
      }
    })();
    return () => { vivo = false; };
  }, [user?.id, secretaria]);

  if (secretaria) return <Navigate to={ROTA_INICIAL_NUTRI} replace />;

  const lista = (itens ?? []).filter(a => !soAlteracoes || a.acao !== 'abriu_ficha');

  return (
    <div>
      <div className="page-title">Atividade da secretária</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 14px' }}>
        O que ela criou, alterou ou excluiu e quais fichas abriu. Só você vê esta tela.
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={soAlteracoes} onChange={e => setSoAlteracoes(e.target.checked)} />
        Esconder "abriu a ficha"
      </label>

      <div className="card" style={{ padding: 0 }}>
        {itens === null && <div style={{ padding: 18, fontSize: 13 }}>Carregando…</div>}
        {erro && (
          <div style={{ padding: 18, fontSize: 13, color: 'var(--text3)' }}>
            Este recurso ainda não foi ativado no banco (falta rodar o SQL).
          </div>
        )}
        {itens !== null && !erro && lista.length === 0 && (
          <div style={{ padding: 18, fontSize: 13, color: 'var(--text3)' }}>Nenhuma atividade ainda.</div>
        )}
        {lista.map((a, i) => (
          <div key={a.id} style={{
            display: 'flex', gap: 12, alignItems: 'baseline', padding: '11px 16px',
            borderBottom: i === lista.length - 1 ? 'none' : '0.5px solid #f5f0e8', fontSize: 14,
          }}>
            <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap', minWidth: 92 }}>{quando(a.criado_em)}</span>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              A secretária {descreverAtividade(a, nomes[a.paciente_id])}
              {a.paciente_id && (
                <button type="button" onClick={() => navigate(`/nutri/pacientes/${a.paciente_id}`)}
                  style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--gold-deep, #a08456)', cursor: 'pointer', fontSize: 12 }}>
                  ver ficha →
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
