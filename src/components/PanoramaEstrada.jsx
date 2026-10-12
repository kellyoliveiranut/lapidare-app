import { useState } from 'react';
import { FASES_PANORAMA, faseValida, estadoDaEtapa, rotuloEtapa } from '../lib/panoramaFases.js';
import '../styles/panorama.css';

// Geometria (unidades do viewBox; largura 360, mobile-first). As estações
// alternam esquerda/direita e a estrada chega e sai de cada uma na VERTICAL,
// para o título ao lado da estação não ficar em cima da faixa.
const LARGURA = 360;
const X_ESQ = 84, X_DIR = 276;
const Y0 = 96, PASSO = 150;
const R = 20, R_ATUAL = 25;
const pos = i => ({ x: i % 2 === 0 ? X_ESQ : X_DIR, y: Y0 + i * PASSO });
const N = FASES_PANORAMA.length;
const Y_FIM = pos(N - 1).y + 92;
const ALTURA = Y_FIM + 46;

function caminhoDaEstrada() {
  const p0 = pos(0);
  let d = `M ${p0.x} 18 L ${p0.x} ${p0.y}`;
  for (let i = 1; i < N; i++) {
    const a = pos(i - 1), b = pos(i);
    d += ` C ${a.x} ${a.y + PASSO / 2}, ${b.x} ${b.y - PASSO / 2}, ${b.x} ${b.y}`;
  }
  const u = pos(N - 1);
  return `${d} L ${u.x} ${Y_FIM}`;
}
const CAMINHO = caminhoDaEstrada();

/**
 * Estrada do Panorama do tratamento: 6 estações numeradas, a atual destacada.
 * `fase` inválida ou nula = nenhuma destacada e nenhum "Você está aqui".
 * Quem chama deve montar com key={fase} se a fase puder chegar depois.
 */
export default function PanoramaEstrada({ fase }) {
  const temFase = faseValida(fase);
  // null = a paciente ainda não tocou em nenhuma: o painel mostra a atual (ou a 1)
  // e nenhuma estação ganha o contorno grosso de "escolhida" — sem etapa definida,
  // nada pode parecer destacado.
  const [tocada, setTocada] = useState(null);
  const selecionada = tocada ?? (temFase ? fase : 1);
  const sel = FASES_PANORAMA[selecionada - 1];

  return (
    <div>
      <svg className="panorama-estrada" viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="group"
           aria-label="Estrada com as 6 etapas do acompanhamento">
        {/* Faixa da estrada, borda fina e o tracejado dourado do centro */}
        <path d={CAMINHO} fill="none" stroke="var(--hair)" strokeWidth="34" strokeLinecap="round" />
        <path d={CAMINHO} fill="none" stroke="var(--bg-deep)" strokeWidth="31" strokeLinecap="round" />
        <path d={CAMINHO} fill="none" stroke="var(--gold)" strokeWidth="2" strokeDasharray="8 9" strokeLinecap="round" />

        {/* Início: marca no começo da estrada e o rótulo ao lado, fora da faixa */}
        <circle cx={pos(0).x} cy={18} r={5} fill="var(--gold-deep)" />
        <text x={pos(0).x + 26} y={22} fontFamily="var(--font-sans)" fontSize="11" letterSpacing="1.6"
              fill="var(--muted)">INÍCIO</text>

        {/* Bandeirinha no fim da estrada */}
        <g aria-hidden="true">
          <line x1={pos(N - 1).x} y1={Y_FIM} x2={pos(N - 1).x} y2={Y_FIM - 34} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
          <path d={`M ${pos(N - 1).x} ${Y_FIM - 34} L ${pos(N - 1).x + 22} ${Y_FIM - 27} L ${pos(N - 1).x} ${Y_FIM - 20} Z`} fill="var(--gold)" />
          <circle cx={pos(N - 1).x} cy={Y_FIM} r={4} fill="var(--ink)" />
        </g>

        {FASES_PANORAMA.map((f, i) => {
          const { x, y } = pos(i);
          const estado = estadoDaEtapa(f.numero, fase);
          const atual = estado === 'atual';
          const r = atual ? R_ATUAL : R;
          const esquerda = x === X_ESQ;
          const tx = esquerda ? x + r + 14 : x - r - 14;
          const anchor = esquerda ? 'start' : 'end';
          const escolhida = tocada === f.numero;
          const preenchimento = atual ? 'var(--gold)' : estado === 'percorrida' ? 'var(--gold-soft)' : 'var(--paper)';
          const contorno = atual || estado === 'percorrida' ? 'var(--gold-deep)' : 'var(--muted)';
          const escolher = () => setTocada(f.numero);
          return (
            <g key={f.numero} className="panorama-estacao" role="button" tabIndex={0}
               aria-label={rotuloEtapa(f.numero, fase)}
               aria-current={atual ? 'step' : undefined}
               aria-pressed={selecionada === f.numero}
               onClick={escolher}
               onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); } }}>
              {/* área de toque maior que o círculo, invisível */}
              <rect x={esquerda ? x - 34 : x - 190} y={y - 34} width={224} height={atual ? 84 : 68} fill="transparent" />
              <circle className="panorama-foco" cx={x} cy={y} r={r + 11} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 3" />
              {atual && <circle className="panorama-anel-atual" cx={x} cy={y} r={r + 7} fill="none" stroke="var(--gold)" strokeWidth="3" />}
              <circle cx={x} cy={y} r={r} fill={preenchimento} stroke={contorno} strokeWidth={escolhida ? 3 : 1.5} />
              <text x={x} y={y + 6} textAnchor="middle" fontFamily="var(--font-serif)" fontSize={atual ? 23 : 20}
                    fontWeight="600" fill="var(--ink)">{f.numero}</text>
              {f.linhas.map((l, k) => (
                <text key={k} x={tx} y={y - 4 + k * 20} textAnchor={anchor} fontFamily="var(--font-serif)"
                      fontSize="18" fontWeight={atual ? 700 : 500} fill="var(--ink)">{l}</text>
              ))}
              {atual && (
                <text x={tx} y={y + 39} textAnchor={anchor} fontFamily="var(--font-sans)" fontSize="13"
                      fontWeight="600" fill="var(--ink)">Você está aqui</text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="panorama-painel" aria-live="polite">
        <div className="panorama-painel-eyebrow">
          Etapa {sel.numero} de {N}{temFase && sel.numero === fase ? ' · você está aqui' : ''}
        </div>
        <div className="panorama-painel-titulo">{sel.titulo}</div>
        <ul>
          {sel.itens.map(item => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}
