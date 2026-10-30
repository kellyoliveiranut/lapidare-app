import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataLocalISO } from '../../lib/utils.js';
import { baixarBlob } from '../../lib/pdfBase.js';
import { lerDadosPaciente, nomeArquivoDados } from '../../lib/exportarDadosPaciente.js';

/**
 * Baixa um arquivo com todos os dados da paciente (backup / direito de acesso da LGPD).
 * Só a nutri enxerga o botão; o que vem do banco já respeita as permissões dela.
 */
export default function BaixarDadosPaciente({ pacienteId, pacienteNome, estilo }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function baixar() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const dados = await lerDadosPaciente(supabase, pacienteId, (feitas, total) => setMsg(`Lendo… ${feitas}/${total}`));
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      baixarBlob(blob, nomeArquivoDados(pacienteNome, dataLocalISO()));
      setMsg(dados.avisos.length ? `Baixado, com ${dados.avisos.length} aviso(s) dentro do arquivo.` : 'Dados baixados.');
    } catch (e) {
      setMsg(`Não consegui baixar: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={baixar} disabled={busy} title="Baixa um arquivo com todos os dados desta paciente"
      style={{
        background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
        fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', gap: 5, opacity: busy ? 0.6 : 1, ...estilo,
      }}>
      <i className="ti ti-download" style={{ fontSize: 13 }} aria-hidden="true" />
      {busy || msg ? (msg || 'Lendo…') : 'Baixar dados da paciente'}
    </button>
  );
}
