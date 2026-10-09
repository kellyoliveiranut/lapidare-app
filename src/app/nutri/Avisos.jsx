import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataConsultaBR } from '../../lib/utils.js';
import { montarAvisos, LIMITE_AVISOS, EVENTO_AVISOS_MUDOU } from '../../lib/avisosNutri.js';

/**
 * Avisos da nutri (avisos_nutri). A tabela é só-leitura para o cliente: quem
 * grava é o trigger do banco, e marcar como visto passa SEMPRE pela função
 * marcar_avisos_vistos — nunca update direto.
 */
export default function Avisos() {
  const { user } = useSession();
  const [aba, setAba] = useState('novos');          // 'novos' | 'vistos'
  const [linhas, setLinhas] = useState(undefined);  // undefined = carregando
  const [erroCarga, setErroCarga] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [enviando, setEnviando] = useState(null);   // id da linha, 'todos' ou null
  const [erroAcao, setErroAcao] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (async () => {
      // A RLS já devolve só os avisos desta nutri.
      let q = supabase
        .from('avisos_nutri')
        .select('id, paciente_id, tipo, criado_em, visto_em')
        // Só contrato: foto do prato tem o número dela no item Feed de pratos.
        .eq('tipo', 'contrato_assinado')
        .order('criado_em', { ascending: false })
        .limit(LIMITE_AVISOS);
      q = aba === 'novos' ? q.is('visto_em', null) : q.not('visto_em', 'is', null);
      const { data, error } = await q;
      if (!vivo) return;
      if (error) { setErroCarga(true); return; }

      // Nomes numa ida só, para todos os paciente_id da página.
      const ids = [...new Set((data ?? []).map(a => a.paciente_id))];
      let nomes = {};
      if (ids.length) {
        const { data: pacs, error: errPacs } = await supabase
          .from('pacientes').select('id, nome').in('id', ids);
        if (!vivo) return;
        if (errPacs) { setErroCarga(true); return; }
        nomes = Object.fromEntries((pacs ?? []).map(p => [p.id, p.nome]));
      }
      setErroCarga(false);
      setLinhas(montarAvisos(data, nomes));
    })();
    return () => { vivo = false; };
  }, [user, aba, tentativa, recarga]);

  function trocarAba(nova) {
    if (nova === aba) return;
    setLinhas(undefined);
    setErroAcao(null);
    setAba(nova);
  }

  function tentarDeNovo() {
    setErroCarga(false);
    setLinhas(undefined);
    setTentativa(n => n + 1);
  }

  // `ids` null = todos os não vistos da nutri (a função decide no banco).
  async function marcar(ids) {
    setEnviando(ids ? ids[0] : 'todos');
    setErroAcao(null);
    const { error } = ids
      ? await supabase.rpc('marcar_avisos_vistos', { p_ids: ids })
      : await supabase.rpc('marcar_avisos_vistos');
    setEnviando(null);
    if (error) {
      setErroAcao(error.message);
      return;
    }
    // Lista e número do menu voltam a sair do banco, não do estado local.
    setRecarga(n => n + 1);
    window.dispatchEvent(new Event(EVENTO_AVISOS_MUDOU));
  }

  const ocupado = enviando !== null;

  return (
    <>
      <div className="page-title">Avisos</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '6px 0 14px' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 10, padding: 3 }}>
          {[['novos', 'Novos'], ['vistos', 'Vistos']].map(([id, rotulo]) => {
            const ativa = aba === id;
            return (
              <button key={id} onClick={() => trocarAba(id)} style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 500,
                borderRadius: 8, border: 'none', cursor: 'pointer',
                color: ativa ? 'var(--dark)' : 'var(--text3)',
                background: ativa ? 'var(--white)' : 'transparent',
                boxShadow: ativa ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
                fontFamily: 'var(--font-sans)',
              }}>{rotulo}</button>
            );
          })}
        </div>
        {aba === 'novos' && linhas?.length > 0 && (
          <button className="btn" onClick={() => marcar(null)} disabled={ocupado}>
            <i className="ti ti-checks" aria-hidden="true"></i> Marcar todos como vistos
          </button>
        )}
      </div>

      {erroAcao && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12,
        }}>{erroAcao}</div>
      )}

      {erroCarga ? (
        <div className="card empty-card">
          <div className="empty-title">Sem conexão</div>
          <button className="btn" onClick={tentarDeNovo}>Tentar de novo</button>
        </div>
      ) : linhas === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : linhas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">{aba === 'novos' ? 'Nenhum aviso novo.' : 'Nenhum aviso.'}</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {linhas.map((a, i) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '12px 16px',
              borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>{a.paciente}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {a.rotulo} · {dataConsultaBR(a.criado_em)}
                </div>
              </div>
              {a.link && (
                <Link to={a.link.to} className="btn-outline" style={{ textDecoration: 'none' }}>
                  {a.link.texto}
                </Link>
              )}
              {!a.visto && (
                <button className="btn-outline" onClick={() => marcar([a.id])} disabled={ocupado}>
                  <i className="ti ti-check" aria-hidden="true"></i> Marcar como visto
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
