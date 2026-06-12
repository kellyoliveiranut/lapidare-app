import { useState } from 'react';
import { dataBR } from '../lib/utils.js';
import { kcalDoAlimento, kcalEquivalente } from '../lib/taco.js';
import './PlanoView.css';

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
  const [openSubs, setOpenSubs] = useState({});
  const toggleSubs = (key) => setOpenSubs(s => ({ ...s, [key]: !s[key] }));

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

          {(ref.alimentos ?? []).map((al, ai) => (
            <div key={ai}>
              <div className="alimento-row" style={{ background: ai % 2 === 0 ? 'var(--paper)' : 'var(--bg-soft)' }}>
                <div>
                  <div className="alimento-nome">{al.nome}</div>
                  {(al.qty || al.quantidade) && (
                    <div className="alimento-qty">
                      {al.qty ?? al.quantidade}{al.prot_g ? ` · ${al.prot_g}g prot` : ''}
                    </div>
                  )}
                </div>
                {al.kcal && <span className="alimento-kcal">{al.kcal} kcal</span>}
              </div>

              {al.subs?.length > 0 && (
                <>
                  <button className="subs-toggle" onClick={() => toggleSubs(`${ri}-${ai}`)}>
                    <i className={`ti ti-${openSubs[`${ri}-${ai}`] ? 'chevron-up' : 'chevron-down'}`} style={{ fontSize: 12 }} aria-hidden="true"></i>
                    {openSubs[`${ri}-${ai}`] ? 'Fechar substituições' : `Ver ${al.subs.length} substituições`}
                  </button>
                  {openSubs[`${ri}-${ai}`] && (() => {
                    const kcalAlvo = al.kcal ?? kcalDoAlimento(al.nome, al.qty ?? al.quantidade) ?? null;
                    return (
                      <div className="subs-list">
                        {al.subs.map((s, si) => {
                          const nomeS = typeof s === 'object' ? (s.nome ?? '') : String(s);
                          const eq = kcalAlvo ? kcalEquivalente(kcalAlvo, nomeS) : null;
                          let textoEquiv = null;
                          if (eq) {
                            textoEquiv = `≈ ${eq.gramas} g${eq.medida ? ` · ${eq.medida}` : ''}`;
                          } else if (typeof s === 'object' && s.qty_equiv) {
                            textoEquiv = `≈ ${s.qty_equiv}`;
                          }
                          return (
                            <div key={si} className="sub-item">
                              <span>→ {nomeS}</span>
                              {textoEquiv && <span className="sub-equiv">{textoEquiv}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          ))}

          {ref.obs && (
            <div className="refeicao-obs">
              <i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 5, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
              {ref.obs}
            </div>
          )}
        </div>
      ))}

      {/* Substituições globais */}
      {substituicoes.length > 0 && (
        <div className="plano-subs-card">
          <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginBottom: 12 }}>
            Substituições por grupo
          </div>
          {substituicoes.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 0',
              borderBottom: i < substituicoes.length - 1 ? '0.5px solid var(--hair)' : 'none',
              fontSize: 13,
            }}>
              <span style={{ fontWeight: 500, minWidth: 0, flexShrink: 1 }}>{s.original}</span>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>→</span>
              {Array.isArray(s.subs) ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.subs.map((sub, j) => {
                    const nome = typeof sub === 'object' ? (sub.nome ?? '') : String(sub);
                    const qe   = typeof sub === 'object' ? sub.qty_equiv : null;
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--ink)' }}>{nome}</span>
                        {qe && <span className="sub-equiv">≈ {qe}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span style={{ color: 'var(--ink)', flex: 1 }}>{s.subs}</span>
              )}
            </div>
          ))}
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
