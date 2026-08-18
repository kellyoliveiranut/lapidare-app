import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import DateInput from './DateInput.jsx';
import ModalShell from './ModalShell.jsx';
import {
  brl, dataBR, dataLocalISO,
  gerarParcelas, FORMAS_PGTO_LIST, STATUS_PARCELA_INFO,
} from '../lib/utils.js';
import { criarVendaComParcelas } from '../lib/vendas.js';

/* ============================================================
   NOVA VENDA — modal

   `pacienteFixo` ({ id, nome }) é para quando o modal abre de dentro do
   perfil de uma paciente: o seletor vira texto estático e a venda já nasce
   atribuída a ela. Sem a prop, mantém o seletor completo do Financeiro.
   ============================================================ */
export function NovaVendaModal({ pacientes = [], servicos, nutriId, pacienteFixo, onClose, onSaved }) {
  const hoje = dataLocalISO();
  const [pacienteId, setPacienteId] = useState(pacienteFixo?.id ?? '');
  const [servicoId, setServicoId] = useState('');  // '' = manual/custom
  const [servico, setServico] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState('pix');
  const [nParcelas, setNParcelas] = useState(3);
  const [nMeses, setNMeses] = useState(3);
  const [diaVenc, setDiaVenc] = useState(15);
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  // Ao escolher um serviço do catálogo, popula nome e valor automaticamente
  function escolherServico(id) {
    setServicoId(id);
    if (!id) {
      // modo "outro" — limpa para a nutri preencher manualmente
      setServico('');
      setValor('');
      return;
    }
    const s = servicos.find(x => x.id === id);
    if (s) {
      setServico(s.nome);
      setValor(String(s.ticket).replace('.', ','));
    }
  }

  const valorNum = Number(String(valor).replace(',', '.')) || 0;

  function escolherForma(f) {
    setForma(f);
    if (f === 'pix' || f === 'dinheiro') setNParcelas(1);
    else if (f === 'parcelado' && nParcelas < 2) setNParcelas(2);
  }

  const parcelasPreview = useMemo(() => {
    if (!valorNum || !data) return [];
    return gerarParcelas({
      forma_pgto: forma,
      valor_total: valorNum,
      data_venda: data,
      n_parcelas: forma === 'asaas' ? nMeses
                : ['pix', 'dinheiro', 'parcelado'].includes(forma) ? nParcelas
                : 1,
      dia_venc: diaVenc,
    });
  }, [forma, valorNum, data, nParcelas, nMeses, diaVenc]);

  async function salvar() {
    setErro(null);
    if (!servico.trim()) return setErro('Informe o serviço.');
    if (!valorNum) return setErro('Informe um valor válido.');
    if (!data) return setErro('Informe a data da venda.');

    setBusy(true);
    const { error } = await criarVendaComParcelas(supabase, {
      nutriId,
      pacienteId,
      servicoId,
      servico,
      valorTotal: valorNum,
      forma,
      dataVenda: data,
      nParcelas,
      nMeses,
      diaVenc,
      obs,
    });
    setBusy(false);
    if (error) return setErro(error);
    onSaved();
  }

  return (
    <ModalShell title="Nova venda" subtitle="Registre a venda e o parcelamento" onClose={onClose}>
      <label className="form-lbl">Paciente</label>
      {pacienteFixo ? (
        <div style={{
          background: 'var(--bg2)', borderRadius: 7, padding: '9px 12px',
          fontSize: 14, color: 'var(--text2)', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <i className="ti ti-user" style={{ fontSize: 15, color: 'var(--text3)' }} aria-hidden="true"></i>
          {pacienteFixo.nome}
        </div>
      ) : (
        <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}>
          <option value="">— Avulso / não atribuir —</option>
          {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      )}

      <label className="form-lbl">Serviço</label>
      {servicos.length > 0 ? (
        <select value={servicoId} onChange={e => escolherServico(e.target.value)}>
          <option value="">— Outro (digitar manualmente) —</option>
          {servicos.map(s => (
            <option key={s.id} value={s.id}>{s.nome} · {brl(s.ticket)}</option>
          ))}
        </select>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          Cadastre serviços em <strong>Meus serviços</strong> para selecionar com 1 clique.
        </div>
      )}
      {(!servicoId || servicos.length === 0) && (
        <input value={servico} onChange={e => setServico(e.target.value)}
          placeholder="Ex: Acompanhamento trimestral"
          style={{ marginTop: 6 }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Valor total (R$)</label>
          <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
            placeholder="0,00" />
          {servicoId && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
              Pode ajustar se houve desconto ou upgrade
            </div>
          )}
        </div>
        <div>
          <label className="form-lbl">Data da venda</label>
          <DateInput value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <label className="form-lbl">Forma de pagamento</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        {FORMAS_PGTO_LIST.map(f => {
          const ativo = forma === f.id;
          return (
            <button key={f.id} type="button"
              onClick={() => escolherForma(f.id)}
              style={{
                border: ativo ? 'none' : '0.5px solid var(--border)',
                background: ativo ? 'var(--dark)' : 'var(--white)',
                color: ativo ? 'var(--white)' : 'var(--text2)',
                borderRadius: 7, padding: '9px 12px',
                fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                fontFamily: 'var(--font-sans)',
              }}>
              <i className={`ti ti-${f.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
              {f.label}
            </button>
          );
        })}
      </div>

      {['pix', 'dinheiro', 'parcelado'].includes(forma) && (
        <>
          <label className="form-lbl">Número de parcelas</label>
          <select value={nParcelas} onChange={e => setNParcelas(Number(e.target.value))}>
            {(forma === 'pix' || forma === 'dinheiro') && (
              <option value={1}>1x — à vista (entra como recebido)</option>
            )}
            {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
              <option key={n} value={n}>{n}x (venc. mensais)</option>
            ))}
          </select>
        </>
      )}

      {forma === 'asaas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="form-lbl">Número de meses</label>
              <select value={nMeses} onChange={e => setNMeses(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>)}
              </select>
            </div>
            <div>
              <label className="form-lbl">Dia do vencimento</label>
              <select value={diaVenc} onChange={e => setDiaVenc(Number(e.target.value))}>
                {[5, 10, 15, 20, 25, 28].map(d => <option key={d} value={d}>dia {d}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {parcelasPreview.length > 0 && (
        <div style={{
          background: 'var(--bg2)', borderRadius: 6, padding: '8px 10px',
          marginTop: 10, fontSize: 13, color: 'var(--text2)',
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Preview:</div>
          {parcelasPreview.length === 1
            ? `1 parcela única de ${brl(parcelasPreview[0].valor)} no dia ${dataBR(parcelasPreview[0].vencimento)}`
            : `${parcelasPreview.length}x de ${brl(parcelasPreview[0].valor)}${parcelasPreview[0].valor !== parcelasPreview[parcelasPreview.length-1].valor ? ` (última ${brl(parcelasPreview[parcelasPreview.length-1].valor)})` : ''} — primeira ${dataBR(parcelasPreview[0].vencimento)} / última ${dataBR(parcelasPreview[parcelasPreview.length-1].vencimento)}`
          }
        </div>
      )}

      <label className="form-lbl">Observação (opcional)</label>
      <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: paciente adiantou 1 mês, desconto dado..." style={{ resize: 'none' }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Registrar venda'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   EDITAR PARCELA — modal

   `pacienteNome` é fallback para quando a venda vem sem o join de paciente
   (caso da aba do perfil, onde a paciente é conhecida pelo contexto).
   ============================================================ */
export function EditarParcelaModal({ parcela, venda, pacienteNome, onClose, onSaved }) {
  const [status, setStatus] = useState(parcela.status);
  const [dataPgto, setDataPgto] = useState(parcela.data_pgto ?? dataLocalISO());
  const [valor, setValor] = useState(String(parcela.valor));
  const [obs, setObs] = useState(parcela.obs ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    setBusy(true);
    const { error } = await supabase
      .from('parcelas')
      .update({
        status,
        data_pgto: status === 'pago' ? dataPgto : null,
        valor: Number(String(valor).replace(',', '.')) || parcela.valor,
        obs: obs.trim() || null,
      })
      .eq('id', parcela.id);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  async function excluirParcela() {
    if (!window.confirm('Excluir esta parcela?')) return;
    setBusy(true);
    await supabase.from('parcelas').delete().eq('id', parcela.id);
    setBusy(false);
    onSaved();
  }

  return (
    <ModalShell
      title="Editar parcela"
      subtitle={`Parcela ${parcela.numero} · ${venda.paciente?.nome ?? pacienteNome ?? 'Avulso'} · ${venda.servico}`}
      onClose={onClose}>
      <label className="form-lbl">Status</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {['pago', 'pendente', 'atrasado'].map(s => {
          const info = STATUS_PARCELA_INFO[s];
          const ativo = status === s;
          return (
            <button key={s} type="button" onClick={() => setStatus(s)}
              style={{
                border: ativo ? 'none' : '0.5px solid var(--border)',
                background: ativo ? 'var(--dark)' : 'var(--white)',
                color: ativo ? 'var(--white)' : 'var(--text2)',
                borderRadius: 7, padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-sans)',
              }}>
              <i className={`ti ti-${info.icon}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
              {info.label}
            </button>
          );
        })}
      </div>

      {status === 'pago' && (
        <>
          <label className="form-lbl">Data de pagamento</label>
          <DateInput value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </>
      )}

      <label className="form-lbl">Valor recebido (R$)</label>
      <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
        placeholder="Pode diferir se adiantou ou pagou parcial" />

      <label className="form-lbl">Observação</label>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: adiantou 1 mês, pagou parcial..." />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>

      <button onClick={excluirParcela} disabled={busy}
        style={{
          marginTop: 12, width: '100%', padding: '8px 14px',
          background: 'transparent', color: 'var(--red)',
          border: '0.5px solid var(--red)', borderRadius: 6,
          fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        <i className="ti ti-trash" aria-hidden="true"></i> Excluir esta parcela
      </button>
    </ModalShell>
  );
}

/* ============================================================
   EDITAR VENDA — modal
   Edita só os dados "leves" da venda (paciente, serviço, data, obs).
   Pra mudar valor/forma de pagamento, é mais seguro excluir e recriar
   — assim as parcelas são regeradas corretamente.

   `pacienteFixo` esconde o seletor de paciente (aba do perfil), do mesmo
   jeito que no modal de nova venda.
   ============================================================ */
export function EditarVendaModal({ venda, pacientes = [], pacienteFixo, onClose, onSaved }) {
  const [pacienteId, setPacienteId] = useState(venda.paciente_id ?? '');
  const [servico, setServico] = useState(venda.servico ?? '');
  const [data, setData] = useState(venda.data_venda ?? '');
  const [obs, setObs] = useState(venda.obs ?? '');
  const [nfEmitida, setNfEmitida] = useState(!!venda.nf_emitida);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!servico.trim()) return setErro('Informe o serviço.');
    if (!data) return setErro('Informe a data da venda.');

    setBusy(true);
    const { error } = await supabase
      .from('vendas')
      .update({
        paciente_id: pacienteId || null,
        servico: servico.trim(),
        data_venda: data,
        obs: obs.trim() || null,
        nf_emitida: nfEmitida,
      })
      .eq('id', venda.id);
    setBusy(false);
    if (error) return setErro('Erro ao salvar: ' + error.message);
    onSaved();
  }

  return (
    <ModalShell title="Editar venda" subtitle="Ajuste os dados desta venda" onClose={onClose}>
      {!pacienteFixo && (
        <>
          <label className="form-lbl">Paciente</label>
          <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}>
            <option value="">— Avulso / não atribuir —</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </>
      )}

      <label className="form-lbl">Serviço</label>
      <input value={servico} onChange={e => setServico(e.target.value)}
        placeholder="Ex: Acompanhamento trimestral" />

      <label className="form-lbl">Data da venda</label>
      <DateInput value={data} onChange={e => setData(e.target.value)} />

      <label className="form-lbl">Observação</label>
      <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: desconto dado, condição especial..."
        style={{ resize: 'none' }} />

      {/* A emissão acontece fora da app — aqui é só o registro de que já saiu.
          Nota é do serviço vendido, não de cada parcela: 6x geram uma nota. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={nfEmitida}
          onChange={e => setNfEmitida(e.target.checked)} />
        Nota fiscal emitida
      </label>

      <div style={{
        background: 'var(--bg2)', borderRadius: 7, padding: '10px 12px',
        marginTop: 12, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
      }}>
        <strong>Pra mudar valor total ou forma de pagamento</strong>, é melhor
        excluir essa venda e criar uma nova — assim as parcelas são geradas
        corretamente. Pra ajustar valor de uma parcela específica, clique nela
        na lista.
      </div>

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}
