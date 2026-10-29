import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { brl, dataBR } from '../../lib/utils.js';
import { copiarTexto } from '../../lib/copiarTexto.js';
import { faltandoParaNota, textoNota, vendasSemNota } from '../../lib/dadosNotaFiscal.js';

/* ============================================================
   NOTAS FISCAIS A EMITIR (Financeiro real)
   Vendas de paciente com ao menos uma parcela paga e sem nota emitida, com o
   que falta nos dados da paciente. "Copiar dados" monta o texto para colar no
   sistema de emissão; "Nota emitida" marca a venda (o mesmo campo nf_emitida
   da edição da venda). Se falhar, mostra um aviso e o resto da tela segue.
   ============================================================ */

const COLUNAS_BASE = 'id, nome, email, telefone, cpf, endereco';
const COLUNAS_END = ', end_cep, end_logradouro, end_numero, end_complemento, end_bairro, end_cidade, end_uf';

export default function NotasAEmitir({ vendas, parcelasPorVenda, onMudou }) {
  const [aberto, setAberto] = useState(false);
  const [pacientes, setPacientes] = useState({});
  const [msg, setMsg] = useState(null);
  const [ocupada, setOcupada] = useState(null);

  const pendentes = useMemo(() => vendasSemNota(vendas, parcelasPorVenda), [vendas, parcelasPorVenda]);
  const idsChave = useMemo(() => [...new Set(pendentes.map(v => v.paciente_id))].sort().join(','), [pendentes]);

  useEffect(() => {
    if (!idsChave) { setPacientes({}); return undefined; }
    let vivo = true;
    (async () => {
      const ids = idsChave.split(',');
      // Sem as colunas novas de endereço (SQL ainda não rodado), repete sem elas.
      let r = await supabase.from('pacientes').select(COLUNAS_BASE + COLUNAS_END).in('id', ids);
      if (r.error) r = await supabase.from('pacientes').select(COLUNAS_BASE).in('id', ids);
      if (!vivo || r.error) return;
      setPacientes(Object.fromEntries((r.data ?? []).map(p => [p.id, p])));
    })();
    return () => { vivo = false; };
  }, [idsChave]);

  if (pendentes.length === 0) return null;

  async function copiar(v) {
    const p = pacientes[v.paciente_id];
    if (!p) { setMsg({ tipo: 'erro', texto: 'Os dados da paciente ainda estão carregando. Tente de novo.' }); return; }
    const ok = await copiarTexto(textoNota({ paciente: p, venda: v }));
    setMsg(ok
      ? { tipo: 'ok', texto: `Dados de ${p.nome} copiados.` }
      : { tipo: 'erro', texto: 'Não consegui copiar. Selecione e copie manualmente.' });
  }

  async function marcarEmitida(v) {
    setOcupada(v.id);
    const r = await gravar(supabase.from('vendas').update({ nf_emitida: true }).eq('id', v.id),
      { rotulo: 'marcar a nota como emitida' });
    setOcupada(null);
    if (!r.ok) { setMsg({ tipo: 'erro', texto: r.msg }); return; }
    setMsg(null);
    onMudou?.();
  }

  const incompletas = pendentes.filter(v => pacientes[v.paciente_id] && faltandoParaNota(pacientes[v.paciente_id]).length > 0).length;

  return (
    <div style={{
      background: 'var(--white)', border: '0.5px solid var(--border)', borderRadius: 12,
      padding: '12px 16px', marginBottom: 16,
    }}>
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'none',
        border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
      }}>
        <i className="ti ti-file-invoice" style={{ fontSize: 18, color: 'var(--gold-deep, #a08456)' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>Notas fiscais a emitir</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {pendentes.length} venda{pendentes.length === 1 ? '' : 's'} paga{pendentes.length === 1 ? '' : 's'} sem nota
            {incompletas > 0 && ` · ${incompletas} com dados da paciente incompletos`}
          </div>
        </div>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {aberto && (
        <div style={{ marginTop: 10 }}>
          {msg && (
            <div style={{ fontSize: 12, marginBottom: 8, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.texto}</div>
          )}
          {pendentes.map(v => {
            const p = pacientes[v.paciente_id];
            const falta = p ? faltandoParaNota(p) : null;
            return (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 0', borderTop: '0.5px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13 }}>{v.paciente?.nome ?? 'Paciente'} · {v.servico}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                    {brl(Number(v.valor_total))} · {dataBR(v.data_venda)}
                  </div>
                  {falta && (
                    <div style={{ fontSize: 11.5, color: falta.length ? 'var(--orange, #e67e22)' : 'var(--green, #3a7a46)' }}>
                      {falta.length ? `Falta: ${falta.join(', ')}` : 'Dados completos'}
                    </div>
                  )}
                </div>
                <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => copiar(v)}>
                  <i className="ti ti-copy" aria-hidden="true" /> Copiar dados
                </button>
                <button className="btn" style={{ fontSize: 12 }} disabled={ocupada === v.id} onClick={() => marcarEmitida(v)}>
                  {ocupada === v.id ? '…' : 'Nota emitida'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
