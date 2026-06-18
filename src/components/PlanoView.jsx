import { useState } from 'react';
import { dataBR } from '../lib/utils.js';
import { buscarAlimento, medidaCaseira, parseGramas, useTacoReady } from '../lib/taco.js';
import './PlanoView.css';

// Normaliza s.subs (string csv | array de strings | array de objetos) para [{nome, gramas, liquido}]
function parseSubs(subs) {
  if (!subs) return [];
  const parseOne = (txt) => {
    const nome = txt.replace(/\s*\(≈[^)]*\)/, '').trim();
    const m = txt.match(/≈\s*([\d.,]+)\s*(g|ml)/);
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

/**
 * Renderiza o conteúdo de um plano alimentar publicado.
 * Props:
 *   dados    — objeto { macros, refeicoes, substituicoes, obs }
 *   validade — string ISO ou null
 *   readOnly — se true, omite a barra de progresso (padrão: false)
 *
 * CSS isolado sob .plano-view-scope — não vaza para o painel da nutri.
 */
export default function PlanoView({ dados, validade, readOnly = false }) {
  // Força re-render quando taco_app.json termina de carregar.
  // medidaSalva (al.medida etc.) aparece imediatamente; medidaTaco preenche logo depois.
  useTacoReady();
  const [openSubs, setOpenSubs] = useState({});

  const macros = dados?.macros ?? {};
  const refeicoes = dados?.refeicoes ?? [];
  const substituicoes = dados?.substituicoes ?? [];

  const totalFeitos = !readOnly ? refeicoes.filter(r => r.feita).length : 0;
  const total = refeicoes.length;

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
      {refeicoes.map((ref, ri) => (
        <div key={ri} className="refeicao-card">
          <div className="refeicao-header">
            <div>
              <div className="refeicao-titulo">{ref.emoji} {ref.nome}</div>
              {ref.horario && <div className="refeicao-horario">{ref.horario}</div>}
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
                  {al.kcal && <span className="alimento-kcal">{al.kcal} kcal</span>}
                </div>
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
      ))}

      {/* Substituições globais — sanfona */}
      {substituicoes.length > 0 && (
        <div className="plano-subs-card">
          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 10 }}>
            Substituições por grupo
          </div>
          {substituicoes.map((s, i) => {
            const isOpen = !!openSubs[i];
            const subsItems = parseSubs(s.subs);
            return (
              <div key={i} style={{ borderBottom: i < substituicoes.length - 1 ? '0.5px solid var(--hair)' : 'none' }}>
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
                    {subsItems.map((sub, j) => {
                      const alTaco = buscarAlimento(sub.nome);
                      const medida = (sub.gramas && alTaco) ? medidaCaseira(sub.gramas, alTaco) : null;
                      return (
                        <div key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 13 }}>
                          <span style={{ color: 'var(--gold-deep)', fontSize: 11, flexShrink: 0 }}>→</span>
                          <span style={{ color: 'var(--ink)' }}>
                            {sub.nome}
                            {(medida || sub.gramas) && (
                              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                                {medida ? ` · ${medida}` : ''}{sub.gramas ? ` (≈ ${sub.gramas} ${sub.liquido ? 'ml' : 'g'})` : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
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
