import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { EX, CREDITO } from '../data/maylab_exames.js';
import { statusDoExame, leitorDe, calculos, padroes, faixaDaFase } from '../lib/leitorExames.js';
import { valoresParaLeitor, sexoDoLeitor } from '../lib/leituraDoPaciente.js';
import { dataBR } from '../lib/utils.js';

// Leitura funcional (MayLab) dentro da área de exames da paciente. Só a nutricionista vê;
// não grava nada e não vai para a paciente nem para os PDFs.
const COR = {
  ok: { c: 'var(--green)', bg: 'var(--green-bg)' },
  ok2: { c: 'var(--blue)', bg: 'var(--blue-bg)' },
  lo: { c: 'var(--orange)', bg: 'var(--orange-bg)' },
  hi: { c: 'var(--red)', bg: 'var(--red-bg)' },
  na: { c: 'var(--text3)', bg: 'var(--bg2)' },
};
const caixaLeitura = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 };

export const Selo = ({ classe, texto }) => {
  const k = COR[classe] ?? COR.na;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: k.c, background: k.bg }}>{texto}</span>;
};

/** Painéis de resultado: exames lidos, cálculos e padrões. `valores` só serve para mostrar o que foi digitado. */
export function ResultadoLeitura({ g, sexo, fase = '', valores = null }) {
  const preenchidos = EX.filter(e => g(e.id) != null);
  const cal = useMemo(() => calculos(g, sexo), [g, sexo]);
  const pad = useMemo(() => padroes(g), [g]);
  const mostrar = (e) => (valores && valores[e.id] != null && valores[e.id] !== '' ? valores[e.id] : String(g(e.id)).replace('.', ','));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={caixaLeitura}>
        <strong>Exames lidos ({preenchidos.length})</strong>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {preenchidos.map(e => {
            const st = statusDoExame(e, g(e.id));
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
                <span>{e.n}: <b>{mostrar(e)}</b> {e.u} <span style={{ color: 'var(--text3)' }}>· ótimo {faixaDaFase(e, fase) ?? e.v}</span></span>
                <Selo classe={st.classe} texto={st.texto || '—'} />
              </div>
            );
          })}
        </div>
      </div>
      {cal.length > 0 && (
        <div style={caixaLeitura}>
          <strong>Cálculos</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {cal.map(c => (
              <div key={c.n} style={{ fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>{c.n}: <b>{c.v}</b></span><Selo classe={c.s.classe} texto={c.s.texto} />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text4)' }}>{c.fx}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pad.length > 0 && (
        <div style={caixaLeitura}>
          <strong>Padrões que merecem atenção</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {pad.map(p => <div key={p.t} style={{ fontSize: 13.5 }}><b>{p.t}.</b> {p.d}</div>)}
          </div>
        </div>
      )}
      {!cal.length && !pad.length && (
        <div style={{ ...caixaLeitura, fontSize: 13.5, color: 'var(--text2)' }}>Nenhum cálculo ou padrão com os exames preenchidos. Adicione mais marcadores para cruzar.</div>
      )}
    </div>
  );
}

/**
 * Card recolhido na aba de exames da paciente.
 * exames: lista de linhas do banco, mais recente primeiro. origem: 'emagrecimento' | 'oncologia'.
 */
export default function LeituraFuncionalExames({ exames, origem, sexo }) {
  const { secretaria } = useSession();
  const [aberto, setAberto] = useState(false);
  const [idx, setIdx] = useState(0);
  const lista = exames ?? [];
  const linha = lista[Math.min(idx, Math.max(lista.length - 1, 0))];
  const valores = useMemo(() => valoresParaLeitor(origem, linha), [origem, linha]);
  const g = useMemo(() => leitorDe(valores), [valores]);
  const qtd = Object.keys(valores).length;
  if (secretaria || !lista.length) return null;

  return (
    <details className="card" style={{ padding: '12px 16px' }} open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        🔬 Leitura funcional <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>— compara com valores ótimos, calcula razões e aponta padrões</span>
      </summary>
      {aberto && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <label htmlFor="leitura-data">Exame de</label>
            <select id="leitura-data" value={idx} onChange={e => setIdx(Number(e.target.value))} style={{ width: 'auto' }}>
              {lista.map((l, i) => <option key={l.id ?? i} value={i}>{dataBR(l.data_exame)}</option>)}
            </select>
            <span style={{ color: 'var(--text3)' }}>{qtd} {qtd === 1 ? 'marcador lido' : 'marcadores lidos'} · sexo: {sexoDoLeitor(sexo) === 'M' ? 'homem' : 'mulher'}</span>
            <Link to="/nutri/leitor-exames" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Abrir o leitor completo</Link>
          </div>
          {qtd === 0
            ? <div style={{ ...caixaLeitura, fontSize: 13.5, color: 'var(--text2)' }}>Este exame não tem marcadores que o leitor reconheça.</div>
            : <ResultadoLeitura g={g} sexo={sexoDoLeitor(sexo)} />}
          <p style={{ fontSize: 12, color: 'var(--text4)', margin: 0, lineHeight: 1.5 }}>
            Faixas ótimas funcionais ({CREDITO}); diferem da referência do laboratório. Apoio à conduta: a interpretação é da nutricionista e não aparece para a paciente.
            Marcadores sem unidade compatível (ex.: SHBG em nmol/L, PCR convencional) não entram.
          </p>
        </div>
      )}
    </details>
  );
}
