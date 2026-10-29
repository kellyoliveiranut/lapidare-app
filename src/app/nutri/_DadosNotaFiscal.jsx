import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { formatarCep, faltandoParaNota, montarPayloadNota } from '../../lib/dadosNotaFiscal.js';

/* ============================================================
   DADOS PARA A NOTA FISCAL (aba Financeiro do perfil)
   CPF e endereço completo da paciente, em campos separados. Os campos podem
   ficar em branco (a paciente pode ainda não ter passado os dados); o aviso
   no topo do perfil lembra o que falta. O endereço em texto livre do cadastro
   antigo (pacientes.endereco) aparece só como referência.
   ============================================================ */

const CAMPOS_INICIAIS = (p) => ({
  cpf: p.cpf ?? '',
  end_cep: formatarCep(p.end_cep ?? ''),
  end_logradouro: p.end_logradouro ?? '',
  end_numero: p.end_numero ?? '',
  end_complemento: p.end_complemento ?? '',
  end_bairro: p.end_bairro ?? '',
  end_cidade: p.end_cidade ?? '',
  end_uf: p.end_uf ?? '',
});

export default function DadosNotaFiscal({ paciente, onSalvo }) {
  const [aberto, setAberto] = useState(() => faltandoParaNota(paciente).length > 0);
  const [f, setF] = useState(() => CAMPOS_INICIAIS(paciente));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const faltando = faltandoParaNota(paciente);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  async function salvar() {
    setMsg(null);
    const r0 = montarPayloadNota(f);
    if (r0.erro) { setMsg({ tipo: 'erro', texto: r0.erro }); return; }
    setBusy(true);
    const r = await gravar(
      supabase.from('pacientes').update(r0.payload).eq('id', paciente.id),
      { rotulo: 'salvar os dados da nota fiscal' },
    );
    setBusy(false);
    if (!r.ok) { setMsg({ tipo: 'erro', texto: r.msg }); return; }
    setMsg({ tipo: 'ok', texto: 'Dados salvos.' });
    onSalvo?.();
  }

  const campo = (rotulo, k, extra = {}) => (
    <div style={{ flex: extra.flex ?? 1, minWidth: extra.min ?? 120 }}>
      <label className="field-label">{rotulo}</label>
      <input type="text" value={f[k]} onChange={set(k)} {...(extra.input ?? {})} />
    </div>
  );

  return (
    <div style={{
      background: 'var(--white)', border: '0.5px solid var(--border)', borderRadius: 12,
      padding: '12px 16px', marginBottom: 14,
    }}>
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'none',
        border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
      }}>
        <i className="ti ti-file-invoice" style={{ fontSize: 18, color: 'var(--gold-deep, #a08456)' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>Dados para a nota fiscal</div>
          <div style={{ fontSize: 12, color: faltando.length ? 'var(--orange, #e67e22)' : 'var(--green, #3a7a46)' }}>
            {faltando.length ? `Falta: ${faltando.join(', ')}` : 'Completo'}
          </div>
        </div>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {aberto && (
        <div style={{ marginTop: 12 }}>
          {paciente.endereco?.trim() && (
            <div style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
              Endereço escrito no cadastro: {paciente.endereco}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {campo('CPF', 'cpf', { min: 150, input: { inputMode: 'numeric', placeholder: '000.000.000-00' } })}
            {campo('CEP', 'end_cep', { min: 120, input: { inputMode: 'numeric', placeholder: '00000-000', onChange: (e) => setF(prev => ({ ...prev, end_cep: formatarCep(e.target.value) })) } })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {campo('Rua / avenida', 'end_logradouro', { flex: 3, min: 200 })}
            {campo('Número', 'end_numero', { flex: 1, min: 80 })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {campo('Complemento', 'end_complemento', { flex: 2, min: 140 })}
            {campo('Bairro', 'end_bairro', { flex: 2, min: 140 })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {campo('Cidade', 'end_cidade', { flex: 3, min: 160 })}
            {campo('UF', 'end_uf', { flex: 1, min: 70, input: { maxLength: 2, placeholder: 'PA', style: { textTransform: 'uppercase' } } })}
          </div>
          {msg && (
            <div style={{ fontSize: 12, marginBottom: 10, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.texto}</div>
          )}
          <button className="btn" onClick={salvar} disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados'}</button>
        </div>
      )}
    </div>
  );
}
