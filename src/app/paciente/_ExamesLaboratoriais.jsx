import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { CAMPOS_EXAME } from '../../data/exames_referencia.js';
import ValorExame, { LegendaExames } from '../../components/ValorExame.jsx';
import GraficosExames from '../../components/GraficosExames.jsx';

// Resultados de exames laboratoriais (somente leitura). A RLS já restringe as
// linhas à própria paciente; o filtro por paciente_id abaixo é defesa em
// profundidade, não a única barreira.
//
// A lista dos 8 campos não vive mais aqui: veio para src/data/exames_referencia.js,
// que a tela da nutri também usa. Era a terceira cópia da mesma lista.
//
// A COR AQUI NUNCA APARECE SOZINHA. Toda linha colorida traz a faixa de
// referência ao lado, e o bloco tem legenda: em oncologia, um número vermelho
// sem explicação, lido no celular sem a nutri por perto, assusta sem informar.
// Vermelho aqui quer dizer "fora de 12–16", e a paciente consegue ler isso.
export default function ExamesLaboratoriais({ pacienteId, sexo }) {
  const [exames, setExames] = useState(undefined);

  useEffect(() => {
    let active = true;
    async function carregar() {
      if (!pacienteId) return;
      const { data } = await supabase
        .from('exames_laboratoriais')
        .select('id, data_exame, hemoglobina, leucocitos, neutrofilos, linfocitos, plaquetas, pcr, albumina, glicemia, obs')
        .eq('paciente_id', pacienteId)
        .order('data_exame', { ascending: false });
      if (!active) return;
      setExames(data ?? []);
    }
    carregar();
    return () => { active = false; };
  }, [pacienteId]);

  // Sem exame nenhum o bloco não ocupa espaço — a tela Tratamento já tem
  // conteúdo próprio e um vazio permanente só atrapalharia.
  if (!exames || exames.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        color: 'var(--muted)', fontWeight: 500, marginBottom: 10,
      }}>
        Resultados de exames
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {exames.map(ex => {
          const valores = CAMPOS_EXAME.filter(c => ex[c.key] != null);
          return (
            <div key={ex.id} className="card" style={{
              padding: 0, overflow: 'hidden',
              borderLeft: '3px solid #9A7B3F',
            }}>
              {/* Cabeçalho com data */}
              <div style={{
                padding: '9px 14px 8px',
                borderBottom: valores.length > 0 || ex.obs ? '0.5px solid var(--hair-soft)' : 'none',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className="ti ti-flask" style={{ fontSize: 14, color: '#9A7B3F' }} aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2C3A30' }}>
                  {dataBR(ex.data_exame)}
                </span>
              </div>

              {/* Valores */}
              {valores.length > 0 && (
                <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {valores.map(c => (
                    <div key={c.key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      gap: 10, fontSize: 13,
                    }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>
                      <span style={{ textAlign: 'right', color: 'var(--ink)' }}>
                        <ValorExame campo={c} valor={ex[c.key]} sexo={sexo} mostrarRef mostrarUnidade />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Observação */}
              {ex.obs && (
                <div style={{
                  padding: '6px 14px 10px',
                  fontSize: 11, color: 'var(--muted)',
                  borderTop: valores.length > 0 ? '0.5px solid var(--hair-soft)' : 'none',
                  lineHeight: 1.5,
                }}>
                  <i className="ti ti-note" style={{ fontSize: 11, marginRight: 4 }} aria-hidden="true" />
                  {ex.obs}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <LegendaExames style={{ marginTop: 10, color: 'var(--muted)' }} />

      <GraficosExames exames={exames} sexo={sexo} />
    </div>
  );
}
