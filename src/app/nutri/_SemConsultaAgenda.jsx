import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { pacientesSemConsulta, linhaSemConsulta } from '../../lib/semConsultaAgenda.js';

const TZ = 'America/Belem';
const PAGINA = 1000; // teto de linhas por consulta do Supabase

/**
 * "Sem consulta há 30 dias ou mais" — cartão recolhível no topo da Agenda.
 * Só leitura: não gera aviso, selo, push nem agendamento; cada linha leva à
 * ficha da paciente. Lista vazia ou erro de carga: o cartão não aparece.
 *
 * Busca própria e enxuta (a Agenda carrega pacientes sem status/plano/cadastro
 * e as consultas num select só, sem paginar): pacientes ativas da nutri e as
 * consultas 'agendada'/'realizada' delas, paginadas de 1000 em 1000.
 */
export default function SemConsultaAgenda({ nutriId }) {
  const [lista, setLista] = useState(null);   // null = carregando ou erro
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!nutriId) return;
    let vivo = true;
    (async () => {
      try {
        const { data: pacs, error: e1 } = await supabase
          .from('pacientes')
          .select('id, nome, status_paciente, tipo_plano, created_at')
          .eq('nutri_id', nutriId)
          .eq('status_paciente', 'ativo');
        if (e1) throw e1;
        const ids = (pacs ?? []).map(p => p.id);
        const consultas = [];
        for (let de = 0; ids.length; de += PAGINA) {
          const { data, error } = await supabase
            .from('consultas')
            .select('paciente_id, data_hora, status')
            .eq('nutri_id', nutriId)
            .in('paciente_id', ids)
            .in('status', ['agendada', 'realizada'])
            .order('id')
            .range(de, de + PAGINA - 1);
          if (error) throw error;
          consultas.push(...(data ?? []));
          if ((data ?? []).length < PAGINA) break;
        }
        if (vivo) setLista(pacientesSemConsulta({ pacientes: pacs, consultas, agora: new Date(), tz: TZ }));
      } catch {
        if (vivo) setLista(null);   // sem cartão, sem erro na Agenda
      }
    })();
    return () => { vivo = false; };
  }, [nutriId]);

  if (!lista || lista.length === 0) return null;

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
      <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: 0,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--dark)',
        }}>
        <i className="ti ti-calendar-off" style={{ fontSize: 16, color: 'var(--amber)' }} aria-hidden="true" />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
          Sem consulta há 30 dias ou mais <span style={{ fontWeight: 400, color: 'var(--text3)' }}>({lista.length} paciente{lista.length === 1 ? '' : 's'})</span>
        </span>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true" />
      </button>
      {aberto && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
            Não entram aqui as pacientes com consulta passada ainda sem registro nos últimos 30 dias.
          </div>
          {lista.map((p, i) => (
            <div key={p.pacienteId} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0',
              borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>{p.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{linhaSemConsulta(p, TZ)}</div>
              </div>
              <Link to={`/nutri/pacientes/${p.pacienteId}`} className="btn-outline" style={{ textDecoration: 'none' }}>
                Abrir ficha
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
