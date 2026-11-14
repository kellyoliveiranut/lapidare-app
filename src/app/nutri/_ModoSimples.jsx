import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { confirmar, avisar } from '../../lib/dialogos.js';

/**
 * Interruptor do Modo simples (pacientes.modo_simples): menu enxuto, letra
 * maior e 4 botões grandes no app da paciente. Só a nutri liga/desliga.
 */
export default function ModoSimples({ paciente, estilo, aoMudar }) {
  const [busy, setBusy] = useState(false);
  const ligado = !!paciente.modo_simples;
  const primeiro = (paciente.nome || '').split(' ')[0];

  async function alternar() {
    const ligar = !ligado;
    const ok = await confirmar(ligar
      ? `Ligar o Modo simples para ${primeiro}?\n\nO app dela fica com letra maior e só 4 botões na tela inicial (plano, compras, suplementos e falar com você). O resto fica em "Mais opções".`
      : `Voltar ${primeiro} para o app completo?`,
      { confirmarRotulo: ligar ? 'Ligar' : 'Desligar' });
    if (!ok) return;
    setBusy(true);
    const r = await gravar(
      supabase.from('pacientes').update({ modo_simples: ligar }).eq('id', paciente.id),
      { rotulo: 'mudar o Modo simples' });
    setBusy(false);
    if (!r.ok) {
      const faltaColuna = /modo_simples/.test(r.msg);
      avisar(faltaColuna ? 'O Modo simples ainda não foi ativado no banco (falta rodar o SQL).' : r.msg);
      return;
    }
    aoMudar?.();
  }

  return (
    <button type="button" disabled={busy} onClick={alternar}
      title="Letra maior e menu com 4 botões no app da paciente"
      style={{ ...estilo, ...(ligado ? { background: 'var(--ink, #3a2a1a)', color: '#fff' } : {}) }}>
      {busy ? 'Salvando…' : `Modo simples: ${ligado ? 'ligado' : 'desligado'}`}
    </button>
  );
}
