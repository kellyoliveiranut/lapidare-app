import { useState } from 'react';
import { importarSeguro } from '../../lib/importarSeguro.js';
import { supabase } from '../../lib/supabase.js';
import { baixarBlob, nomeArquivoPdf } from '../../lib/pdfBase.js';
import { esperar, PAUSA_ENTRE_DOWNLOADS_MS } from '../../lib/baixarEmSequencia.js';

/**
 * Baixa, um atrás do outro, os PDFs do que já está PUBLICADO para a paciente:
 * plano alimentar (último), lista de compras (a última) e prescrição de
 * suplementação (suplementos ativos). Só baixa — não grava nada e não publica
 * nada para a paciente (diferente do botão "Gerar PDF" do editor do plano).
 */
export default function BaixarTodosPdfs({ pacienteId, estilo }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function baixar() {
    if (busy) return;
    setBusy(true); setMsg('Preparando…');
    const feitos = [];
    const faltando = [];
    try {
      const [planoRes, listaRes, supRes, pacRes] = await Promise.all([
        supabase.from('planos').select('dados, publicado_em').eq('paciente_id', pacienteId)
          .order('publicado_em', { ascending: false }).limit(1),
        supabase.from('listas_compras').select('dados, publicado_em').eq('paciente_id', pacienteId)
          .order('publicado_em', { ascending: false }).limit(1),
        supabase.from('suplementos').select('id, nome, dose, horario, obs, foto_url, ativo, data_inicio, manipulado')
          .eq('paciente_id', pacienteId).order('ordem'),
        supabase.from('pacientes').select('nome, telefone').eq('id', pacienteId).maybeSingle(),
      ]);
      if (planoRes.error || listaRes.error || supRes.error || pacRes.error) {
        throw new Error('não consegui ler os dados da paciente');
      }
      const pacienteNome = pacRes.data?.nome ?? '';
      const contato = pacRes.data ?? null;
      const plano = planoRes.data?.[0];
      const lista = listaRes.data?.[0];
      const ativos = (supRes.data ?? []).filter(s => s.ativo);

      if (plano?.dados) {
        setMsg('Plano alimentar…');
        const { gerarPDFPlano } = await importarSeguro(() => import('../../lib/pdfPlano.js'));
        const blob = await gerarPDFPlano({ pacienteNome, contato, dados: plano.dados, publicadoEm: plano.publicado_em });
        baixarBlob(blob, nomeArquivoPdf('plano-alimentar', pacienteNome));
        feitos.push('plano');
        await esperar(PAUSA_ENTRE_DOWNLOADS_MS);
      } else faltando.push('plano alimentar');

      if (lista?.dados) {
        setMsg('Lista de compras…');
        const { gerarPDFListaCompras } = await importarSeguro(() => import('../../lib/pdfListaCompras.js'));
        const blob = await gerarPDFListaCompras({ pacienteNome, contato, dados: lista.dados });
        baixarBlob(blob, nomeArquivoPdf('lista-de-compras', pacienteNome));
        feitos.push('compras');
        await esperar(PAUSA_ENTRE_DOWNLOADS_MS);
      } else faltando.push('lista de compras');

      if (ativos.length) {
        setMsg('Suplementação…');
        const { gerarPDFPrescricao, MODOS_PDF } = await importarSeguro(() => import('./_Suplementacao.jsx'));
        const modo = MODOS_PDF.find(m => m.id === 'ambos');
        await gerarPDFPrescricao({ pacienteNome, contato, suplementosAtivos: ativos.filter(modo.filtro), modo });
        feitos.push('suplementação');
      } else faltando.push('suplementação');

      const partes = [];
      if (feitos.length) partes.push(`Baixados: ${feitos.join(', ')}.`);
      if (faltando.length) partes.push(`Sem ${faltando.join(', ')}.`);
      setMsg(partes.join(' '));
    } catch (e) {
      setMsg(`Não consegui baixar: ${e?.message ?? e}${feitos.length ? ` (já baixados: ${feitos.join(', ')})` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={baixar} disabled={busy}
        title="Baixa os PDFs publicados: plano alimentar, lista de compras e suplementação"
        style={{ ...estilo, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        <i className="ti ti-download" aria-hidden="true" /> {busy ? 'Baixando…' : 'Baixar todos os PDFs'}
      </button>
      {msg && <span role="status" style={{ fontSize: 11, color: 'var(--text3)', flex: '0 0 auto' }}>{msg}</span>}
    </>
  );
}
