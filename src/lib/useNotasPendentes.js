import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { gravar } from './gravar.js';
import { useSession } from './session.jsx';
import { textoNota, pacientesComConsultaRealizada } from './dadosNotaFiscal.js';
import { mensagemContabilidade, linkWhatsContabilidade, carregarPacientesParaNota } from './contabilidade.js';

/* ============================================================
   NOTAS FISCAIS PENDENTES (últimos 7 dias)
   Vendas marcadas com "Lembrar de emitir a nota fiscal" e pacientes NOVAS com
   nf_emitir, ainda sem nota. Usado pelo cartão da Agenda, pelo aviso na linha
   da 1ª consulta e pelo bloco "Nota fiscal" do perfil da paciente — uma única
   fonte para os três mostrarem o mesmo.
   Paciente nova só entra depois de uma consulta REALIZADA.
   `pacienteId` (opcional) filtra para uma paciente.
   ============================================================ */

const DIAS = 7;

export function useNotasPendentes(nutriId, pacienteId = null) {
  const { profile } = useSession();
  const zap = profile?.contabilidade_whatsapp ?? '';
  const [vendas, setVendas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [realizadas, setRealizadas] = useState(null);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    if (!nutriId) return;
    const desde = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString();
    let qv = supabase.from('vendas')
      .select('id, paciente_id, servico, valor_total, created_at, paciente:pacientes(id, nome)')
      .eq('nutri_id', nutriId).eq('nf_lembrar', true).eq('nf_emitida', false)
      .gte('created_at', desde).order('created_at', { ascending: false });
    let qp = supabase.from('pacientes')
      .select('id, nome, created_at')
      .eq('nutri_id', nutriId).eq('nf_emitir', true)
      .gte('created_at', desde).order('created_at', { ascending: false });
    if (pacienteId) { qv = qv.eq('paciente_id', pacienteId); qp = qp.eq('id', pacienteId); }
    const [v, p] = await Promise.all([qv, qp]);
    setVendas(v.error ? [] : (v.data ?? []));
    const lista = p.error ? [] : (p.data ?? []);
    setPacientes(lista);
    // Em caso de erro fica null e a lista aparece inteira (não esconde nota por falha de rede).
    if (lista.length) {
      const c = await supabase.from('consultas').select('paciente_id')
        .eq('nutri_id', nutriId).eq('status', 'realizada').in('paciente_id', lista.map(x => x.id));
      setRealizadas(c.error ? null : new Set((c.data ?? []).map(x => x.paciente_id)));
    } else {
      setRealizadas(new Set());
    }
  }, [nutriId, pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const { soPacientes, itens } = useMemo(() => {
    const idsComVenda = new Set(vendas.map(v => v.paciente_id).filter(Boolean));
    const so = pacientesComConsultaRealizada(pacientes.filter(p => !idsComVenda.has(p.id)), realizadas);
    return {
      soPacientes: so,
      itens: [
        ...vendas.map(v => ({ pacienteId: v.paciente_id, nome: v.paciente?.nome, venda: v })),
        ...so.map(p => ({ pacienteId: p.id, nome: p.nome, venda: null })),
      ],
    };
  }, [vendas, pacientes, realizadas]);

  const idsPendentes = useMemo(() => new Set(itens.map(i => i.pacienteId).filter(Boolean)), [itens]);

  // A janela abre ANTES do await (Safari barra popup depois).
  async function enviarContabilidade(lista) {
    if (!zap.trim()) { setMsg({ tipo: 'erro', texto: 'Cadastre o WhatsApp da contabilidade em Personalização.' }); return; }
    const janela = window.open('', '_blank');
    const ids = [...new Set(lista.map(i => i.pacienteId).filter(Boolean))];
    const pacs = await carregarPacientesParaNota(supabase, ids);
    const textos = lista.map(i => textoNota({
      paciente: pacs[i.pacienteId] ?? { nome: i.nome }, venda: i.venda ?? null,
    }));
    const url = linkWhatsContabilidade(zap, mensagemContabilidade(textos));
    if (!url) { janela?.close(); setMsg({ tipo: 'erro', texto: 'Número da contabilidade inválido.' }); return; }
    if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener');
    setMsg(null);
  }

  async function emitida(tipo, id) {
    const q = tipo === 'venda'
      ? supabase.from('vendas').update({ nf_emitida: true }).eq('id', id)
      : supabase.from('pacientes').update({ nf_emitir: false }).eq('id', id);
    const r = await gravar(q, { rotulo: 'marcar a nota como emitida' });
    if (!r.ok) { setMsg({ tipo: 'erro', texto: r.msg }); return; }
    setMsg(null);
    carregar();
  }

  return { vendas, soPacientes, itens, idsPendentes, zap, msg, setMsg, enviarContabilidade, emitida, recarregar: carregar, DIAS };
}
