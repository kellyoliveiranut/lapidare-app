import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataLocalISO } from '../../lib/utils.js';
import { baixarBlob } from '../../lib/pdfBase.js';
import { lerDadosPaciente } from '../../lib/exportarDadosPaciente.js';

/**
 * Backup: um arquivo só com os dados de todas as pacientes da lista. Lê uma paciente por vez
 * (devagar de propósito, para não sobrecarregar o banco) e mostra o andamento.
 */
export default function BaixarBackup({ pacientes }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function baixar() {
    const lista = pacientes ?? [];
    if (busy || lista.length === 0) return;
    setBusy(true); setMsg('');
    try {
      const todas = [];
      for (let i = 0; i < lista.length; i++) {
        setMsg(`Lendo ${i + 1}/${lista.length}…`);
        todas.push(await lerDadosPaciente(supabase, lista[i].id));
      }
      const corpo = {
        _leia_me: 'Backup dos dados das pacientes no Essentia. Contém dados de saúde: guarde com sigilo (LGPD).',
        gerado_em: new Date().toISOString(), total: todas.length, pacientes: todas,
      };
      baixarBlob(new Blob([JSON.stringify(corpo)], { type: 'application/json' }), `backup-essentia-${dataLocalISO()}.json`);
      setMsg(`Backup baixado (${todas.length} pacientes).`);
    } catch (e) {
      setMsg(`Não consegui concluir: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-outline" onClick={baixar} disabled={busy || !pacientes?.length} title="Baixa os dados de todas as pacientes em um arquivo">
      <i className="ti ti-database-export" aria-hidden="true"></i> {msg || 'Baixar backup'}
    </button>
  );
}
