import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { brl } from '../../lib/utils.js';
import { useSession } from '../../lib/session.jsx';
import { textoNota } from '../../lib/dadosNotaFiscal.js';
import { mensagemContabilidade, linkWhatsContabilidade, carregarPacientesParaNota } from '../../lib/contabilidade.js';

/* ============================================================
   NOTAS FISCAIS DA SEMANA (topo da Agenda)
   Lembrete de emitir a nota das vendas e das pacientes NOVAS dos últimos 7
   dias, marcadas com "Lembrar de emitir a nota fiscal" na criação.
   "Nota emitida" tira o item daqui (vendas.nf_emitida / pacientes.nf_emitir).
   As colunas vêm da migration 2026-11-05b: sem ela as consultas falham e o
   cartão simplesmente não aparece.
   ============================================================ */

const DIAS = 7;

export default function NotasDaSemana({ nutriId }) {
  const navigate = useNavigate();
  const { profile } = useSession();
  const zap = profile?.contabilidade_whatsapp ?? '';
  const [vendas, setVendas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [msg, setMsg] = useState(null);
  const [aberto, setAberto] = useState(true);

  const carregar = useCallback(async () => {
    if (!nutriId) return;
    const desde = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString();
    const [v, p] = await Promise.all([
      supabase.from('vendas')
        .select('id, paciente_id, servico, valor_total, created_at, paciente:pacientes(id, nome)')
        .eq('nutri_id', nutriId).eq('nf_lembrar', true).eq('nf_emitida', false)
        .gte('created_at', desde).order('created_at', { ascending: false }),
      supabase.from('pacientes')
        .select('id, nome, created_at')
        .eq('nutri_id', nutriId).eq('nf_emitir', true)
        .gte('created_at', desde).order('created_at', { ascending: false }),
    ]);
    setVendas(v.error ? [] : (v.data ?? []));
    setPacientes(p.error ? [] : (p.data ?? []));
  }, [nutriId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Paciente que já tem venda na lista não aparece duas vezes.
  const idsComVenda = new Set(vendas.map(v => v.paciente_id).filter(Boolean));
  const soPacientes = pacientes.filter(p => !idsComVenda.has(p.id));
  const total = vendas.length + soPacientes.length;
  if (total === 0 && !msg) return null;

  // Abre o WhatsApp da contabilidade com os dados de uma ou de todas as notas.
  // A janela abre ANTES do await (Safari barra popup depois), como no envio de acesso.
  async function enviarContabilidade(itens) {
    if (!zap.trim()) { setMsg({ tipo: 'erro', texto: 'Cadastre o WhatsApp da contabilidade em Personalização.' }); return; }
    const janela = window.open('', '_blank');
    const ids = [...new Set(itens.map(i => i.pacienteId).filter(Boolean))];
    const pacs = await carregarPacientesParaNota(supabase, ids);
    const textos = itens.map(i => textoNota({
      paciente: pacs[i.pacienteId] ?? { nome: i.nome }, venda: i.venda ?? null,
    }));
    const url = linkWhatsContabilidade(zap, mensagemContabilidade(textos));
    if (!url) { janela?.close(); setMsg({ tipo: 'erro', texto: 'Número da contabilidade inválido.' }); return; }
    if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener');
    setMsg(null);
  }
  const itensDaSemana = [
    ...vendas.map(v => ({ pacienteId: v.paciente_id, nome: v.paciente?.nome, venda: v })),
    ...soPacientes.map(p => ({ pacienteId: p.id, nome: p.nome, venda: null })),
  ];

  async function emitida(tipo, id) {
    const q = tipo === 'venda'
      ? supabase.from('vendas').update({ nf_emitida: true }).eq('id', id)
      : supabase.from('pacientes').update({ nf_emitir: false }).eq('id', id);
    const r = await gravar(q, { rotulo: 'marcar a nota como emitida' });
    if (!r.ok) { setMsg({ tipo: 'erro', texto: r.msg }); return; }
    setMsg(null);
    carregar();
  }

  const linha = (chave, nome, detalhe, tipo, id, pacienteId, item) => (
    <div key={chave} style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 12px',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{nome}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{detalhe}</div>
      </div>
      {pacienteId && (
        <button className="btn-outline" style={{ fontSize: 12 }}
          onClick={() => navigate(`/nutri/pacientes/${pacienteId}`, { state: { from: '/nutri/agenda', label: 'Agenda' } })}>
          <i className="ti ti-file-invoice" aria-hidden="true" /> Dados da nota
        </button>
      )}
      <button className="btn-outline" style={{ fontSize: 12, color: '#25D366' }} disabled={!zap.trim()}
        title={zap.trim() ? 'Abre o WhatsApp da contabilidade com os dados desta nota' : 'Cadastre o WhatsApp da contabilidade em Personalização'}
        onClick={() => enviarContabilidade([item])}>
        <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar à contabilidade
      </button>
      <button className="btn" style={{ fontSize: 12 }} onClick={() => emitida(tipo, id)}>
        <i className="ti ti-check" aria-hidden="true" /> Nota emitida
      </button>
    </div>
  );

  return (
    <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--gold-deep, #a08456)', background: '#faf5ea', overflow: 'hidden' }}>
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '12px 16px',
        background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
      }}>
        <i className="ti ti-file-invoice" style={{ fontSize: 16, color: 'var(--gold-deep, #a08456)' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold-deep, #8a6d3b)' }}>Emitir nota fiscal</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {total} nota{total === 1 ? '' : 's'} a emitir · vendas e pacientes novas dos últimos {DIAS} dias
          </div>
        </div>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {aberto && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msg && <div style={{ fontSize: 12, color: 'var(--red)' }}>{msg.texto}</div>}
          {itensDaSemana.length > 1 && (
            <button className="btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} disabled={!zap.trim()}
              title={zap.trim() ? undefined : 'Cadastre o WhatsApp da contabilidade em Personalização'}
              onClick={() => enviarContabilidade(itensDaSemana)}>
              <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Enviar todas à contabilidade ({itensDaSemana.length})
            </button>
          )}
          {vendas.map(v => linha('v' + v.id, v.paciente?.nome ?? 'Venda avulsa',
            `${v.servico} · ${brl(v.valor_total)}`, 'venda', v.id, v.paciente_id,
            { pacienteId: v.paciente_id, nome: v.paciente?.nome, venda: v }))}
          {soPacientes.map(p => linha('p' + p.id, p.nome, 'Paciente nova', 'paciente', p.id, p.id,
            { pacienteId: p.id, nome: p.nome, venda: null }))}
        </div>
      )}
    </div>
  );
}
