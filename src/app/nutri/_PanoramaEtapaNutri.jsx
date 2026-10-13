import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { FASES_PANORAMA, faseValida } from '../../lib/panoramaFases.js';

/**
 * Etapa do "Panorama do tratamento" da paciente (panorama_fases), aba
 * Oncologia do perfil. Só a nutri muda; a etapa nunca avança sozinha.
 * "Não definida" apaga a linha: a paciente vê a estrada sem destaque.
 *
 * Antes do SQL (tabela inexistente) a leitura falha: o seletor fica em
 * "Não definida" com um aviso curto, e salvar mostra o erro curto.
 */
export default function PanoramaEtapaNutri({ pacienteId, nutriId }) {
  const [valor, setValor] = useState('');        // '' = Não definida
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);          // { ok: bool, texto }

  useEffect(() => {
    let vivo = true;
    supabase.from('panorama_fases').select('fase').eq('paciente_id', pacienteId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        setErroCarga(!!error);
        setValor(!error && faseValida(data?.fase) ? String(data.fase) : '');
        setCarregando(false);
      }, () => { if (vivo) { setErroCarga(true); setCarregando(false); } });
    return () => { vivo = false; };
  }, [pacienteId]);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const fase = Number(valor);
    const { error } = faseValida(fase)
      ? await supabase.from('panorama_fases')
          .upsert({ paciente_id: pacienteId, nutri_id: nutriId, fase }, { onConflict: 'paciente_id' })
      : await supabase.from('panorama_fases').delete().eq('paciente_id', pacienteId);
    setSalvando(false);
    if (error) { setMsg({ ok: false, texto: 'Não foi possível salvar a etapa agora. Tente de novo.' }); return; }
    setErroCarga(false);
    setMsg({ ok: true, texto: faseValida(fase) ? 'Etapa salva.' : 'Etapa removida.' });
  }

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        <i className="ti ti-road" style={{ color: 'var(--gold-deep)', marginRight: 6 }} aria-hidden="true" />
        Fase da jornada
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
        A paciente vê esta fase destacada na estrada da Minha jornada. Ela não muda sozinha.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={valor} disabled={carregando || salvando} onChange={e => { setValor(e.target.value); setMsg(null); }}
                aria-label="Fase da jornada" style={{ flex: '1 1 240px', minWidth: 0 }}>
          <option value="">Não definida</option>
          {FASES_PANORAMA.map(f => <option key={f.numero} value={String(f.numero)}>{f.numero}. {f.titulo}</option>)}
        </select>
        <button className="btn" onClick={salvar} disabled={carregando || salvando}>
          {salvando ? 'Salvando…' : 'Salvar etapa'}
        </button>
      </div>
      {erroCarga && !msg && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Não foi possível ler a etapa salva agora.</div>
      )}
      {msg && (
        <div role="status" style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.texto}</div>
      )}
    </div>
  );
}
