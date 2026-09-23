import { useEffect, useState } from 'react';
import { dataBR } from '../lib/utils.js';
import { buscarAlimento, medidaCaseira, parseGramas, useTacoReady } from '../lib/taco.js';
import './PlanoView.css';

// Normaliza s.subs (string csv | array de strings | array de objetos) para [{nome, gramas, liquido}]
function parseSubs(subs) {
  if (!subs) return [];
  const parseOne = (txt) => {
    // Planos antigos gravaram "≈"; os novos gravam "~". Ler os dois.
    const nome = txt.replace(/\s*\([≈~][^)]*\)/, '').trim();
    const m = txt.match(/[≈~]\s*([\d.,]+)\s*(g|ml)/);
    return { nome, gramas: m ? parseFloat(m[1].replace(',', '.')) : null, liquido: m ? m[2] === 'ml' : false };
  };
  if (Array.isArray(subs)) {
    return subs.map(sub => {
      if (typeof sub === 'object') {
        const raw = String(sub.qty_equiv ?? '');
        const m = raw.match(/([\d.,]+)\s*(g|ml)/);
        return { nome: (sub.nome ?? '').trim(), gramas: m ? parseFloat(m[1].replace(',', '.')) : null, liquido: m ? m[2] === 'ml' : false };
      }
      return parseOne(String(sub));
    }).filter(s => s.nome);
  }
  if (typeof subs !== 'string' || !subs.trim()) return [];
  const items = [];
  let depth = 0, cur = '';
  for (const ch of subs) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { if (cur.trim()) items.push(parseOne(cur.trim())); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(parseOne(cur.trim()));
  return items.filter(s => s.nome);
}

// Chave para casar o nome do alimento com o "original" da substituição global.
// Mesma normalização da conferência de 2026-09-23 (caixa e espaços), por
// IGUALDADE — nunca por inclusão: "Arroz" não pode puxar as trocas de "Arroz integral".
// Acento NÃO é ignorado, de propósito (decisão de 2026-09-23).
function chaveAlimento(txt) {
  return String(txt ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Tipo da refeição pelo nome, só para decoração (ícone e cor). Aqui inclusão é
// aceitável: errar a classificação troca uma cor, não um dado. A ordem importa —
// "Lanche da manhã" e "Café da tarde" são lanche, não café.
// A ceia é neutra de propósito: não usa --gold/--gold-deep, que o theme.jsx
// troca pela cor da nutri e deixariam o par sem garantia de contraste.
const TIPO_NEUTRO = { icone: 'ti-tools-kitchen-2', cor: 'var(--muted)', soft: 'var(--bg-soft)' };
const TIPOS_REFEICAO = [
  { teste: /ceia/,                       icone: 'ti-moon',   cor: TIPO_NEUTRO.cor,   soft: TIPO_NEUTRO.soft },
  { teste: /lanche|cola[cç][aã]o|tarde/, icone: 'ti-apple',  cor: 'var(--green)',    soft: 'var(--green-soft)' },
  { teste: /caf[eé]|desjejum|manh[aã]/,  icone: 'ti-coffee', cor: 'var(--orange)',   soft: 'var(--orange-soft)' },
  { teste: /almo[cç]o/,                  icone: 'ti-salad',  cor: 'var(--red)',      soft: 'var(--red-soft)' },
  { teste: /jant/,                       icone: 'ti-soup',   cor: 'var(--blue)',     soft: 'var(--blue-soft)' },
];

function tipoRefeicao(nome) {
  const n = String(nome ?? '').toLowerCase();
  return TIPOS_REFEICAO.find(t => t.teste.test(n)) ?? TIPO_NEUTRO;
}

// Horário é texto livre ("07:00", "7h", "07h30"). Devolve minutos desde 0h, ou
// null quando não dá para ler — refeição sem horário legível nunca é destacada.
function minutosDoHorario(txt) {
  const m = String(txt ?? '').match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

// Índice da refeição do momento: a última cujo horário é até agora + 30 min.
// Antes da primeira refeição do dia, nenhuma.
function indiceDoMomento(refeicoes, agora) {
  const limite = agora.getHours() * 60 + agora.getMinutes() + 30;
  let melhor = null, melhorMin = -1;
  refeicoes.forEach((r, i) => {
    const min = minutosDoHorario(r.horario);
    if (min !== null && min <= limite && min > melhorMin) { melhor = i; melhorMin = min; }
  });
  return melhor;
}

// Uma opção de substituição. É a linha da seção global de antes, extraída sem
// mudar o desenho, para que a troca inline e a seção do fim sejam iguais.
function LinhaSub({ sub }) {
  const alTaco = buscarAlimento(sub.nome);
  const medida = (sub.gramas && alTaco) ? medidaCaseira(sub.gramas, alTaco) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--gold-deep)', fontSize: 11, flexShrink: 0 }}>→</span>
      <span style={{ color: 'var(--ink)' }}>
        {sub.nome}
        {(medida || sub.gramas) && (
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>
            {medida ? ` · ${medida}` : ''}{sub.gramas ? ` (~ ${sub.gramas} ${sub.liquido ? 'ml' : 'g'})` : ''}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Renderiza o conteúdo de um plano alimentar publicado.
 * Props:
 *   dados    — objeto { macros, refeicoes, substituicoes, obs }
 *   validade — string ISO ou null
 *   readOnly — se true (tela da nutri), omite a barra de progresso e o
 *              destaque da refeição do momento (padrão: false)
 *
 * CSS isolado sob .plano-view-scope — não vaza para o painel da nutri.
 * A impressão NÃO passa por aqui: é o .print-doc do Plano.jsx.
 */
export default function PlanoView({ dados, validade, readOnly = false }) {
  // Força re-render quando taco_app.json termina de carregar.
  // medidaSalva (al.medida etc.) aparece imediatamente; medidaTaco preenche logo depois.
  useTacoReady();
  const [openSubs, setOpenSubs] = useState({});
  const [openTroca, setOpenTroca] = useState({});
  const [agora, setAgora] = useState(() => new Date());

  // Reavalia a refeição do momento com a tela aberta. Só no portal.
  useEffect(() => {
    if (readOnly) return;
    const id = setInterval(() => setAgora(new Date()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [readOnly]);

  const macros = dados?.macros ?? {};
  const refeicoes = dados?.refeicoes ?? [];
  const substituicoes = dados?.substituicoes ?? [];

  const totalFeitos = !readOnly ? refeicoes.filter(r => r.feita).length : 0;
  const total = refeicoes.length;
  const iMomento = readOnly ? null : indiceDoMomento(refeicoes, agora);

  // Substituições globais por chave. Só entram as que têm opção legível; as
  // outras ficam para a seção do fim, que mostra o texto cru como antes.
  const globaisPorChave = new Map();
  for (const s of substituicoes) {
    if (parseSubs(s.subs).length === 0) continue;
    const k = chaveAlimento(s.original);
    if (!k) continue;
    globaisPorChave.set(k, [...(globaisPorChave.get(k) ?? []), s]);
  }

  // Opções de um alimento: as dele (al.subs) e as globais do mesmo nome, sem repetir.
  function opcoesDoAlimento(al) {
    const globais = (globaisPorChave.get(chaveAlimento(al.nome)) ?? []).flatMap(s => parseSubs(s.subs));
    const vistos = new Set();
    return [...parseSubs(al.subs), ...globais].filter(o => {
      const k = chaveAlimento(o.nome);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }

  // Globais que casaram com algum alimento já aparecem inline; a seção do fim
  // fica só com as que sobraram.
  const chavesUsadas = new Set();
  for (const r of refeicoes) {
    for (const al of r.alimentos ?? []) {
      const k = chaveAlimento(al.nome);
      if (globaisPorChave.has(k)) chavesUsadas.add(k);
    }
  }
  const orfas = substituicoes.filter(s => !chavesUsadas.has(chaveAlimento(s.original)));

  return (
    <div className="plano-view-scope">
      {/* Macros */}
      <div className="plano-macros-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
            Macros do dia
          </span>
          <span className="pill ghost" style={{ fontSize: 10 }}>{macros.kcal} kcal</span>
        </div>
        {[
          { label: 'Proteína',    v: macros.prot_g    ?? macros.proteinas_g, color: 'var(--red)' },
          { label: 'Carboidrato', v: macros.cho_g     ?? macros.carbo_g,     color: 'var(--gold)' },
          { label: 'Gordura',     v: macros.lip_g     ?? macros.gorduras_g,  color: 'var(--green)' },
        ].map((m, i) => (
          <div key={i} className="macro-row">
            <div className="macro-label">
              <span>{m.label}</span>
              <span>{m.v ?? '—'}g</span>
            </div>
            <div className="bar"><i style={{ width: '70%', background: m.color }}></i></div>
          </div>
        ))}
        {(macros.agua_l || macros.fibras_g) && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            💧 Meta: {macros.agua_l}L{macros.fibras_g ? ` · 🌾 Fibras: ${macros.fibras_g}g` : ''}
          </div>
        )}
      </div>

      {/* Progresso — apenas no portal da paciente */}
      {!readOnly && total > 0 && (
        <div style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="bar" style={{ flex: 1 }}>
            <i style={{ width: `${(totalFeitos / total) * 100}%`, background: 'var(--green)' }}></i>
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {totalFeitos}/{total} refeições
          </span>
        </div>
      )}

      {/* Refeições */}
      {refeicoes.map((ref, ri) => {
        const tipo = tipoRefeicao(ref.nome);
        const doMomento = ri === iMomento;
        return (
          <div
            key={ri}
            className={`refeicao-card${doMomento ? ' is-momento' : ''}`}
            style={{ '--ref-cor': tipo.cor, '--ref-soft': tipo.soft }}
          >
            <div className="refeicao-header">
              <span className="refeicao-icone" aria-hidden="true">
                {ref.emoji ? ref.emoji : <i className={`ti ${tipo.icone}`} />}
              </span>
              <div className="refeicao-info">
                <div className="refeicao-titulo">{ref.nome}</div>
                {(ref.horario || doMomento) && (
                  <div className="refeicao-meta">
                    {ref.horario && (
                      <span className="refeicao-etiqueta">
                        <i className="ti ti-clock" aria-hidden="true" /> {ref.horario}
                      </span>
                    )}
                    {doMomento && <span className="refeicao-agora">Agora</span>}
                  </div>
                )}
              </div>
              {ref.kcal && <span className="refeicao-kcal">{ref.kcal} kcal</span>}
            </div>

            {(ref.alimentos ?? []).map((al, ai) => {
              const qtyStr = al.qty ?? al.quantidade ?? '';
              const medidaSalva = al.medida || al.medida_caseira || al.medidaCaseira || al.medidaCasaira || al.casa || null;
              const medidaTaco = (!medidaSalva && qtyStr)
                ? medidaCaseira(parseGramas(qtyStr), buscarAlimento(al.nome))
                : null;
              const medidaExibir = medidaSalva ?? medidaTaco;
              const opcoes = opcoesDoAlimento(al);
              const chave = `${ri}-${ai}`;
              const aberto = !!openTroca[chave];
              return (
                <div key={ai}>
                  <div className="alimento-row" style={{ background: ai % 2 === 0 ? 'var(--paper)' : 'var(--bg-soft)' }}>
                    <div>
                      <div className="alimento-nome">{al.nome}</div>
                      {qtyStr && (
                        <div className="alimento-qty">
                          {qtyStr}{medidaExibir ? ` · ${medidaExibir}` : ''}{al.prot_g ? ` · ${al.prot_g}g prot` : ''}
                        </div>
                      )}
                    </div>
                    <div className="alimento-lado">
                      {al.kcal && <span className="alimento-kcal">{al.kcal} kcal</span>}
                      {opcoes.length > 0 && (
                        <button
                          type="button"
                          className={`alimento-troca${aberto ? ' is-aberto' : ''}`}
                          aria-expanded={aberto}
                          aria-label={`Substituições de ${al.nome}`}
                          onClick={() => setOpenTroca(prev => ({ ...prev, [chave]: !prev[chave] }))}
                        >
                          <i className="ti ti-arrows-exchange" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {aberto && (
                    <div className="alimento-subs">
                      {opcoes.map((sub, j) => <LinhaSub key={j} sub={sub} />)}
                    </div>
                  )}
                </div>
              );
            })}

            {ref.obs && (
              <div className="refeicao-obs">
                <i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 5, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
                {ref.obs}
              </div>
            )}
          </div>
        );
      })}

      {/* Substituições que não casaram com nenhum alimento — sanfona, mesmo visual de antes */}
      {orfas.length > 0 && (
        <div className="plano-subs-card">
          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 10 }}>
            Substituições por grupo
          </div>
          {orfas.map((s, i) => {
            const isOpen = !!openSubs[i];
            const subsItems = parseSubs(s.subs);
            return (
              <div key={i} style={{ borderBottom: i < orfas.length - 1 ? '0.5px solid var(--hair)' : 'none' }}>
                <button
                  aria-expanded={isOpen}
                  onClick={() => setOpenSubs(prev => ({ ...prev, [i]: !prev[i] }))}
                  style={{
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', textAlign: 'left', gap: 8, fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink)', fontWeight: 500, flex: 1, minWidth: 0 }}>
                    {s.original}
                  </span>
                  <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`}
                    style={{ fontSize: 13, color: 'var(--gold-deep)', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div style={{ paddingBottom: 10 }}>
                    {subsItems.map((sub, j) => <LinhaSub key={j} sub={sub} />)}
                    {subsItems.length === 0 && s.subs && (
                      <span style={{ fontSize: 13, color: 'var(--ink)', paddingLeft: 2 }}>{String(s.subs)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Validade */}
      {validade && (
        <div className="plano-validade">
          Válido até {dataBR(validade)}
        </div>
      )}
    </div>
  );
}
