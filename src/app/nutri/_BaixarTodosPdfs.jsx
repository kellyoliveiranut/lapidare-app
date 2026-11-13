import { useRef, useState } from 'react';
import { importarSeguro } from '../../lib/importarSeguro.js';
import { supabase } from '../../lib/supabase.js';
import { baixarBlob, nomeArquivoPdf } from '../../lib/pdfBase.js';
import { esperar, PAUSA_ENTRE_DOWNLOADS_MS } from '../../lib/baixarEmSequencia.js';
import { montarArquivos, podeCompartilharArquivos, compartilharArquivos } from '../../lib/compartilharArquivos.js';
import { blobParaBase64, cabeNoEmail, textoConfirmacaoEmail, emailPlausivel } from '../../lib/emailPdfs.js';
import { confirmar, avisar } from '../../lib/dialogos.js';

/**
 * Baixa, um atrás do outro, os PDFs do que já está PUBLICADO para a paciente:
 * plano alimentar (último), lista de compras (a última) e prescrição de
 * suplementação (suplementos ativos). Só baixa — não grava nada e não publica
 * nada para a paciente (diferente do botão "Gerar PDF" do editor do plano).
 */
export default function BaixarTodosPdfs({ pacienteId, estilo }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // PDFs prontos para a folha de compartilhar. Dois toques de propósito: o
  // Safari só abre o compartilhamento direto de um toque, e gerar os PDFs
  // demora (rede + desenho). Toque 1 prepara, toque 2 compartilha.
  const [prontos, setProntos] = useState(null);
  // E-mail do cadastro da paciente, lido junto com os dados dos PDFs.
  const emailPacienteRef = useRef('');

  // Gera os PDFs publicados e entrega cada um a `entregar({ blob, nome, rotulo })`.
  // Devolve { feitos, faltando }.
  async function gerarTodos(entregar) {
    const feitos = [];
    const faltando = [];
    const [planoRes, listaRes, supRes, pacRes] = await Promise.all([
      supabase.from('planos').select('dados, publicado_em').eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false }).limit(1),
      supabase.from('listas_compras').select('dados, publicado_em').eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false }).limit(1),
      supabase.from('suplementos').select('id, nome, dose, horario, obs, foto_url, ativo, data_inicio, manipulado')
        .eq('paciente_id', pacienteId).order('ordem'),
      supabase.from('pacientes').select('nome, telefone, email').eq('id', pacienteId).maybeSingle(),
    ]);
    if (planoRes.error || listaRes.error || supRes.error || pacRes.error) {
      throw new Error('não consegui ler os dados da paciente');
    }
    const pacienteNome = pacRes.data?.nome ?? '';
    const contato = pacRes.data ?? null;
    emailPacienteRef.current = String(pacRes.data?.email ?? '').trim();
    const plano = planoRes.data?.[0];
    const lista = listaRes.data?.[0];
    const ativos = (supRes.data ?? []).filter(s => s.ativo);

    if (plano?.dados) {
      setMsg('Plano alimentar…');
      const { gerarPDFPlano } = await importarSeguro(() => import('../../lib/pdfPlano.js'));
      const blob = await gerarPDFPlano({ pacienteNome, contato, dados: plano.dados, publicadoEm: plano.publicado_em });
      await entregar({ blob, nome: nomeArquivoPdf('plano-alimentar', pacienteNome) });
      feitos.push('plano');
    } else faltando.push('plano alimentar');

    if (lista?.dados) {
      setMsg('Lista de compras…');
      const { gerarPDFListaCompras } = await importarSeguro(() => import('../../lib/pdfListaCompras.js'));
      const blob = await gerarPDFListaCompras({ pacienteNome, contato, dados: lista.dados });
      await entregar({ blob, nome: nomeArquivoPdf('lista-de-compras', pacienteNome) });
      feitos.push('compras');
    } else faltando.push('lista de compras');

    if (ativos.length) {
      setMsg('Suplementação…');
      const { gerarPDFPrescricao, MODOS_PDF } = await importarSeguro(() => import('./_Suplementacao.jsx'));
      const modo = MODOS_PDF.find(m => m.id === 'ambos');
      const arq = await gerarPDFPrescricao({
        pacienteNome, contato, suplementosAtivos: ativos.filter(modo.filtro), modo, retornarArquivo: true,
      });
      await entregar(arq);
      feitos.push('suplementação');
    } else faltando.push('suplementação');

    return { feitos, faltando };
  }

  async function baixar() {
    if (busy) return;
    setBusy(true); setMsg('Preparando…'); setProntos(null);
    const feitos = [];
    try {
      const r = await gerarTodos(async ({ blob, nome }) => {
        baixarBlob(blob, nome);
        feitos.push(nome);
        await esperar(PAUSA_ENTRE_DOWNLOADS_MS);
      });
      const partes = [];
      if (r.feitos.length) partes.push(`Baixados: ${r.feitos.join(', ')}.`);
      if (r.faltando.length) partes.push(`Sem ${r.faltando.join(', ')}.`);
      setMsg(partes.join(' '));
    } catch (e) {
      setMsg(`Não consegui baixar: ${e?.message ?? e}${feitos.length ? ` (já baixados: ${feitos.length})` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  // Envia os PDFs por e-mail para a paciente. O endereço mostrado na confirmação
  // é o do cadastro; o servidor resolve o destino de novo (não confia na tela).
  async function enviarEmail() {
    if (busy) return;
    setBusy(true); setMsg('Preparando…'); setProntos(null);
    const itens = [];
    try {
      const r = await gerarTodos(async (item) => { itens.push(item); });
      if (!itens.length) {
        setMsg(r.faltando.length ? `Sem ${r.faltando.join(', ')}.` : 'Nada para enviar.');
        return;
      }
      const email = emailPacienteRef.current;
      if (!emailPlausivel(email)) {
        setMsg('');
        await avisar('A paciente não tem e-mail válido cadastrado. Cadastre o e-mail na ficha e tente de novo.');
        return;
      }
      const { cabe } = cabeNoEmail(itens);
      if (!cabe) {
        setMsg('');
        await avisar('Os PDFs juntos são grandes demais para um e-mail. Use "Baixar todos os PDFs" ou o WhatsApp.');
        return;
      }
      setMsg('');
      const ok = await confirmar(textoConfirmacaoEmail(email, itens.map(i => i.nome)), { confirmarRotulo: 'Enviar' });
      if (!ok) return;
      setMsg('Enviando…');
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada. Recarregue a página.');
      const arquivos = [];
      for (const i of itens) arquivos.push({ nome: i.nome, base64: await blobParaBase64(i.blob) });
      const resp = await fetch('/.netlify/functions/enviar-pdfs-paciente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ paciente_id: pacienteId, arquivos }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Falha ao enviar.');
      setMsg(`Enviado para ${data.para ?? email}.`);
    } catch (e) {
      setMsg('');
      await avisar(`Não consegui enviar o e-mail: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setBusy(false);
    }
  }

  // Toque 1: gera os PDFs e guarda; não baixa nada.
  async function preparar() {
    if (busy) return;
    setBusy(true); setMsg('Preparando…'); setProntos(null);
    const itens = [];
    try {
      const r = await gerarTodos(async (item) => { itens.push(item); });
      const arquivos = montarArquivos(itens);
      if (!arquivos.length) {
        setMsg(r.faltando.length ? `Sem ${r.faltando.join(', ')}.` : 'Nada para compartilhar.');
      } else if (!podeCompartilharArquivos(arquivos)) {
        setMsg('Este aparelho não compartilha arquivos por aqui. Use "Baixar todos os PDFs".');
      } else {
        setProntos(arquivos);
        setMsg(r.faltando.length ? `Sem ${r.faltando.join(', ')}.` : '');
      }
    } catch (e) {
      setMsg(`Não consegui preparar: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  // Toque 2: direto do toque, sem await antes. Só os arquivos, sem endereço.
  async function compartilhar() {
    if (!prontos) return;
    const r = await compartilharArquivos(prontos);
    if (r.ok) { setProntos(null); setMsg('Compartilhado.'); }
    else if (!r.cancelado) setMsg(r.msg);
  }

  // O botão de compartilhar só existe onde há folha de compartilhar de arquivos
  // (iPad, iPhone, Android). No computador comum fica só o "Baixar".
  const temCompartilhar = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  return (
    <>
      <button type="button" onClick={baixar} disabled={busy}
        title="Baixa os PDFs publicados: plano alimentar, lista de compras e suplementação"
        style={{ ...estilo, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        <i className="ti ti-download" aria-hidden="true" /> {busy ? 'Aguarde…' : 'Baixar todos os PDFs'}
      </button>
      <button type="button" onClick={enviarEmail} disabled={busy}
        title="Envia por e-mail para a paciente o plano, a lista de compras e a suplementação (você confere o endereço antes)"
        style={{ ...estilo, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        <i className="ti ti-mail" aria-hidden="true" /> Enviar por e-mail
      </button>
      {temCompartilhar && !prontos && (
        <button type="button" onClick={preparar} disabled={busy}
          title="Prepara os PDFs para enviar pelo WhatsApp, sem o endereço do arquivo na mensagem"
          style={{ ...estilo, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
          <i className="ti ti-share" aria-hidden="true" /> Compartilhar PDFs
        </button>
      )}
      {temCompartilhar && prontos && (
        <button type="button" onClick={compartilhar}
          title="Abre a folha de compartilhar com os PDFs prontos"
          style={{ ...estilo, cursor: 'pointer', fontWeight: 600 }}>
          <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar {prontos.length} PDF{prontos.length > 1 ? 's' : ''}
        </button>
      )}
      {msg && <span role="status" style={{ fontSize: 11, color: 'var(--text3)', flex: '0 0 auto' }}>{msg}</span>}
    </>
  );
}
