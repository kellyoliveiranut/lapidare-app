import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

const CAMPOS = [
  { key: 'hemoglobina', label: 'Hemoglobina', unidade: 'g/dL',  dec: 1 },
  { key: 'leucocitos',  label: 'Leucócitos',  unidade: '/mm³',  dec: 0 },
  { key: 'neutrofilos', label: 'Neutrófilos', unidade: '',      dec: 0 },
  { key: 'linfocitos',  label: 'Linfócitos',  unidade: '',      dec: 0 },
  { key: 'plaquetas',   label: 'Plaquetas',   unidade: '/mm³',  dec: 0 },
  { key: 'pcr',         label: 'PCR',         unidade: 'mg/L',  dec: 1 },
  { key: 'albumina',    label: 'Albumina',    unidade: 'g/dL',  dec: 1 },
  { key: 'glicemia',    label: 'Glicemia',    unidade: 'mg/dL', dec: 0 },
];

function fmtNum(v, dec) {
  if (v == null) return null;
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// Resultados de exames laboratoriais (somente leitura). A RLS já restringe as
// linhas à própria paciente; o filtro por paciente_id abaixo é defesa em
// profundidade, não a única barreira.
export default function ExamesLaboratoriais({ pacienteId }) {
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
          const valores = CAMPOS.filter(c => ex[c.key] != null);
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
                      fontSize: 13,
                    }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>
                      <span style={{ fontWeight: 500, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(ex[c.key], c.dec)}{' '}
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{c.unidade}</span>
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
    </div>
  );
}
