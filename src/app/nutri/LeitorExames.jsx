import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../lib/session.jsx';
import { ROTA_INICIAL_NUTRI } from '../../lib/rotas.js';
import { CREDITO, EX, EXLIB, GRUPOS, TIPS, NUTR, FASES, FORMULAS } from '../../data/maylab_exames.js';
import { statusDoExame, leitorDe, buscarExames, faixaDaFase } from '../../lib/leitorExames.js';
import { ResultadoLeitura, Selo } from '../../components/LeituraFuncionalExames.jsx';

// Apoio da nutricionista: compara valores digitados com faixas funcionais e aponta
// onde olhar. Não grava nada, não vai para a paciente e não é laudo (CFN nº 856).
const EXEMPLO = { hb: '11,2', ht: '35', vcm: '78', hcm: '25', chcm: '30', rdw: '15', hem: '4,3', ferr: '28', tsh: '3,4', t4l: '0,9', t3l: '2,6', t3r: '18', glic: '94', ins: '11', ct: '210', hdl: '48', ldl: '135', tg: '160', neut: '62', linf: '28', mono: '9', eos: '3', vitd: '28', b12: '320', hcy: '13' };

const caixa = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 };
const chip = (ativo) => ({
  padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${ativo ? 'var(--brown)' : 'var(--border)'}`, background: ativo ? 'var(--brown)' : 'var(--white)', color: ativo ? '#fff' : 'var(--text2)',
});
function CartaoExame({ e, aberto, onToggle, fase }) {
  const faixa = faixaDaFase(e, fase);
  return (
    <div style={{ ...caixa, padding: 12 }}>
      <button type="button" onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14 }}>{e.n}</strong>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{e.g}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
          Ótimo: {faixa ?? e.v}{e.u ? ` · ${e.u}` : ''}
        </div>
      </button>
      {aberto && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, display: 'grid', gap: 6 }}>
          {e.f && <div><b>Função:</b> {e.f}</div>}
          {e.cor && <div><b>Correlação clínica:</b> {e.cor}</div>}
          {e.con && <div><b>Conduta:</b> {e.con}</div>}
          {e.a?.length > 0 && <div><b>Pode estar associado a:</b> {e.a.join(', ')}</div>}
          <div style={{ fontSize: 11.5, color: 'var(--text4)' }}>Fonte: {e.s.split('').map(k => ({ G: 'Guia da May', T: 'Tabela de valores ótimos', P: 'Planilha MayLab', N: 'Tabela Notion' }[k])).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}

function Leitor() {
  const [sexo, setSexo] = useState('F');
  const [fase, setFase] = useState('');
  const [valores, setValores] = useState({});
  const [lido, setLido] = useState(false);
  const g = useMemo(() => leitorDe(valores), [valores]);
  const preenchidos = EX.filter(e => g(e.id) != null);

  const mudar = (id, v) => { setValores(a => ({ ...a, [id]: v })); setLido(false); };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={caixa}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Sexo:</span>
          <button type="button" style={chip(sexo === 'F')} onClick={() => { setSexo('F'); setLido(false); }}>Mulher</button>
          <button type="button" style={chip(sexo === 'M')} onClick={() => { setSexo('M'); setFase(''); setLido(false); }}>Homem</button>
        </div>
        {sexo === 'F' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {Object.entries(FASES).map(([k, t]) => (
              <button key={k} type="button" style={chip(fase === k)} onClick={() => setFase(fase === k ? '' : k)}>{t}</button>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '10px 0 0' }}>
          Confira a unidade do laudo e converta se precisar. Não precisa preencher tudo: os cálculos aparecem quando os exames necessários estão preenchidos.
        </p>
      </div>

      {GRUPOS.map(grupo => (
        <details key={grupo} open={['Hemograma', 'Ferro'].includes(grupo)} style={caixa}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{grupo}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10, marginTop: 10 }}>
            {EX.filter(e => e.g === grupo).map(e => {
              const st = lido && g(e.id) != null ? statusDoExame(e, g(e.id)) : null;
              const faixa = faixaDaFase(e, fase);
              return (
                <label key={e.id} style={{ display: 'block' }}>
                  <span className="form-lbl">{e.n}{e.u ? ` (${e.u})` : ''}</span>
                  <input inputMode="decimal" value={valores[e.id] ?? ''} onChange={ev => mudar(e.id, ev.target.value)} placeholder={faixa ?? e.v} />
                  {st && st.classe !== 'na' && <div style={{ marginTop: 3 }}><Selo classe={st.classe} texto={st.texto} /></div>}
                </label>
              );
            })}
          </div>
        </details>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setLido(true)} disabled={!preenchidos.length}>Fazer leitura</button>
        <button type="button" className="btn-outline" onClick={() => { setValores(EXEMPLO); setLido(false); }}>Ver exemplo</button>
        <button type="button" className="btn-outline" onClick={() => { setValores({}); setLido(false); }}>Limpar</button>
      </div>

      {lido && <ResultadoLeitura g={g} sexo={sexo} fase={fase} valores={valores} />}
    </div>
  );
}

function Biblioteca() {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('Todos');
  const [aberto, setAberto] = useState(null);
  const lista = useMemo(() => {
    const todos = [...EX, ...EXLIB.map((e, i) => ({ ...e, id: `lib${i}`, u: '', a: [], f: '' }))];
    const porGrupo = grupo === 'Todos' ? todos : todos.filter(e => e.g === grupo);
    return buscarExames(porGrupo, busca);
  }, [busca, grupo]);
  const grupos = ['Todos', ...GRUPOS, 'Neurotransmissores', 'Metais tóxicos'];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por exame, sintoma ou condição" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {grupos.map(gr => <button key={gr} type="button" style={chip(grupo === gr)} onClick={() => setGrupo(gr)}>{gr}</button>)}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{lista.length} {lista.length === 1 ? 'exame' : 'exames'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
        {lista.map(e => <CartaoExame key={e.id} e={e} fase="" aberto={aberto === e.id} onToggle={() => setAberto(aberto === e.id ? null : e.id)} />)}
      </div>
    </div>
  );
}

function Dicas() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <blockquote style={{ ...caixa, margin: 0, fontStyle: 'italic', color: 'var(--text2)' }}>
        “Mais importante do que avaliar o exame, é avaliar o dono do exame.” — Mayara Della Costa
      </blockquote>
      {TIPS.map(t => (
        <details key={t.t} style={caixa}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t.t}</summary>
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55 }}>
            {t.p.map((p, i) => <p key={i} style={{ margin: '0 0 6px' }}>{p}</p>)}
            {t.li.length > 0 && <ul style={{ margin: '0 0 0 18px', padding: 0 }}>{t.li.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          </div>
        </details>
      ))}
      <details style={caixa}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Recomendação diária e limite máximo (UL)</summary>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text3)' }}><th style={{ padding: 6 }}>Nutriente</th><th style={{ padding: 6 }}>Mulher</th><th style={{ padding: 6 }}>Homem</th><th style={{ padding: 6 }}>Gestante</th><th style={{ padding: 6 }}>UL</th></tr></thead>
            <tbody>
              {Object.values(NUTR).filter(n => n.r).map(n => (
                <tr key={n.n} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{n.n} ({n.u})</td><td style={{ padding: 6 }}>{n.r.F}</td><td style={{ padding: 6 }}>{n.r.M}</td><td style={{ padding: 6 }}>{n.r.G}</td>
                  <td style={{ padding: 6 }}>{n.ul ?? 'sem UL'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {Object.values(NUTR).filter(n => n.nota || n.gnota).map(n => (
            <div key={n.n} style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{n.n}: {[n.nota, n.gnota].filter(Boolean).join(' · ')}</div>
          ))}
        </div>
      </details>
      <details style={caixa}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Fórmulas de suplementação sugeridas (referência)</summary>
        <p style={{ fontSize: 12.5, color: 'var(--red)', margin: '8px 0' }}>
          Referência de outra profissional, não prescrição. Doses e indicação são decididas pela Kelly, caso a caso.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {Object.entries(FORMULAS).map(([nome, texto]) => (
            <div key={nome}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nome}</div>
              <pre style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: 'var(--text2)' }}>{texto}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

const ABAS = [['leitor', 'Leitor de exames'], ['biblioteca', 'Biblioteca'], ['dicas', 'Dicas da May']];

export default function LeitorExames() {
  const { secretaria } = useSession();
  const [aba, setAba] = useState('leitor');
  if (secretaria) return <Navigate to={ROTA_INICIAL_NUTRI} replace />;
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '4px 0 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 22 }}>Leitor de exames</h1>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text3)' }}>Interpretação funcional · apoio da nutricionista, não aparece para a paciente.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {ABAS.map(([k, t]) => <button key={k} type="button" style={chip(aba === k)} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      {aba === 'leitor' && <Leitor />}
      {aba === 'biblioteca' && <Biblioteca />}
      {aba === 'dicas' && <Dicas />}
      <p style={{ fontSize: 12, color: 'var(--text4)', marginTop: 20, lineHeight: 1.5 }}>
        Conteúdo de referência: {CREDITO}. Material de apoio à conduta profissional; a interpretação clínica é sempre da nutricionista responsável.
      </p>
    </div>
  );
}
