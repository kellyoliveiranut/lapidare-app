import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import DateInput from './DateInput.jsx';
import ModalShell from './ModalShell.jsx';
import {
  brl, dataBR, dataLocalISO,
  gerarParcelas, distribuirTaxa, taxaSugerida, maxParcelas, clampParcelas,
  MAX_PARCELAS_ESSENTIA, FORMAS_PGTO_LIST, FORMAS_COM_TAXA, STATUS_PARCELA_INFO,
} from '../lib/utils.js';
import { criarVendaComParcelas } from '../lib/vendas.js';
import { useSession } from '../lib/session.jsx';

/* ============================================================
   NOVA VENDA — modal

   `pacienteFixo` ({ id, nome, tipo_plano }) é para quando o modal abre de
   dentro do perfil de uma paciente: o seletor vira texto estático e a venda já
   nasce atribuída a ela. Sem a prop, mantém o seletor completo do Financeiro.

   O tipo_plano entra pelas duas portas — no pacienteFixo, ou em cada item de
   `pacientes` — porque o teto de parcelas no cartão depende dele.
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
  const [obs, setObs] = useState('');
  const [taxa, setTaxa] = useState('');
  // false = o campo segue a sugestao dos percentuais; true = a nutri
  // digitou, e o que ela digitou manda.
  const [taxaEditada, setTaxaEditada] = useState(false);
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
  const comTaxa = FORMAS_COM_TAXA.includes(forma);

  // Um valor só para o plano, venha o modal do perfil (pacienteFixo) ou do
  // Financeiro (seletor). Sem paciente — venda avulsa — fica undefined, e o
  // teto cai no padrão de 12.
  const planoPaciente = pacienteFixo
    ? pacienteFixo.tipo_plano
    : pacientes.find(p => p.id === pacienteId)?.tipo_plano;
  const maxN = maxParcelas(forma, planoPaciente);

  // Número de parcelas EFETIVO, extraído porque agora dois cálculos dependem
  // dele: gerarParcelas e a sugestão de taxa. Antes vivia embutido no memo,
  // e duplicá-lo faria a taxa sugerida ser de um parcelamento e as parcelas
  // de outro.
  const nEfetivo = ['pix', 'dinheiro', 'parcelado'].includes(forma) ? nParcelas : 1;

  // A taxa vem SUGERIDA dos percentuais que a nutri configurou no Financeiro,
  // e vira manual assim que ela digita. Enquanto for automática, acompanha
  // valor, forma e número de parcelas; depois de editada, para de se mexer —
  // senão trocar de 3x para 6x apagaria o número copiado do extrato.
  const { profile } = useSession();
  const sugestao = useMemo(
    () => taxaSugerida(profile, forma, valorNum, nEfetivo),
    [profile, forma, valorNum, nEfetivo],
  );
  const taxaMostrada = taxaEditada
    ? taxa
    : (sugestao.valor ? String(sugestao.valor).replace('.', ',') : '');
  const taxaNum = taxaEditada
    ? (Number(String(taxa).replace(',', '.')) || 0)
    : sugestao.valor;

  // Trocar de paciente pode trocar o teto: sair de uma Avulsa em 12x para uma
  // Essentia tem que puxar o número de parcelas de volta para 10.
  function escolherPaciente(id) {
    setPacienteId(id);
    const plano = pacientes.find(p => p.id === id)?.tipo_plano;
    setNParcelas(n => clampParcelas(n, forma, plano));
  }

  function escolherForma(f) {
    setForma(f);
    if (f === 'pix' || f === 'dinheiro') setNParcelas(1);
    // clampParcelas cuida do piso (2) e do teto: 12x escolhido no Pix não pode
    // sobreviver à troca para Parcelado numa Essentia, onde o select só vai a 10.
    else if (f === 'parcelado') setNParcelas(n => clampParcelas(n, f, planoPaciente));
    // Sem isto, uma taxa digitada para cartão sobreviveria à troca para Pix e
    // seria gravada numa venda que não tem taxa nenhuma.
    if (!FORMAS_COM_TAXA.includes(f)) setTaxa('');
    // Trocar de forma devolve o campo ao automático: a taxa de um crédito à
    // vista não tem por que sobreviver a uma venda que virou parcelada.
    setTaxaEditada(false);
  }

  const parcelasPreview = useMemo(() => {
    if (!valorNum || !data) return [];
    return gerarParcelas({
      forma_pgto: forma,
      valor_total: valorNum,
      data_venda: data,
      n_parcelas: nEfetivo,
    });
  }, [forma, valorNum, data, nEfetivo]);

  // Mesma função que criarVendaComParcelas usa para gravar. O que a nutri
  // confere aqui é, centavo a centavo, o que vai para o banco.
  const taxasPreview = useMemo(
    () => distribuirTaxa(taxaNum, parcelasPreview),
    [taxaNum, parcelasPreview],
  );

  async function salvar() {
    setErro(null);
    if (!servico.trim()) return setErro('Informe o serviço.');
    if (!valorNum) return setErro('Informe um valor válido.');
    if (!data) return setErro('Informe a data da venda.');
    // O banco recusa taxa > valor da parcela (parcelas_taxa_menor_que_valor).
    // Barrar aqui dá uma frase em português em vez de erro de constraint.
    if (comTaxa && taxaNum >= valorNum) {
      return setErro('A taxa não pode ser maior ou igual ao valor da venda.');
    }

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
      obs,
      taxaTotal: comTaxa ? taxaNum : 0,
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
        <select value={pacienteId} onChange={e => escolherPaciente(e.target.value)}>
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
            {Array.from({ length: maxN - 1 }, (_, i) => i + 2).map(n => (
              <option key={n} value={n}>{n}x (venc. mensais)</option>
            ))}
          </select>
          {maxN === MAX_PARCELAS_ESSENTIA && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
              Essentia: o contrato prevê até {MAX_PARCELAS_ESSENTIA}x no cartão
            </div>
          )}
        </>
      )}

      {comTaxa && (
        <>
          <label className="form-lbl">Taxa da maquininha (R$, total da venda)</label>
          <input inputMode="decimal" value={taxaMostrada}
            onChange={e => { setTaxa(e.target.value); setTaxaEditada(true); }}
            placeholder="Ex: 500,00 — o que a maquininha desconta no total" />
          {sugestao.valor > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -4, marginBottom: 8 }}>
              sugerido: {brl(sugestao.valor)} ({sugestao.pct.toFixed(2).replace('.', ',')}%)
              {taxaEditada && (
                <button type="button" onClick={() => { setTaxaEditada(false); setTaxa(''); }}
                  style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0,
                           color: 'var(--gold-deep, #a08456)', fontSize: 12, cursor: 'pointer',
                           textDecoration: 'underline', fontFamily: 'var(--font-sans)' }}>
                  recalcular
                </button>
              )}
            </div>
          )}
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

          {/* Três colunas só quando há taxa. Sem taxa, o resumo de uma linha
              acima já diz tudo e a tabela seria ruído. */}
          {taxaNum > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 500, padding: '3px 0' }}>#</th>
                  <th style={{ fontWeight: 500, padding: '3px 0' }}>Bruto</th>
                  <th style={{ fontWeight: 500, padding: '3px 0' }}>Taxa</th>
                  <th style={{ fontWeight: 500, padding: '3px 0' }}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {parcelasPreview.map((p, i) => (
                  <tr key={p.numero} style={{ textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '2px 0' }}>{p.numero}</td>
                    <td style={{ padding: '2px 0' }}>{brl(p.valor)}</td>
                    <td style={{ padding: '2px 0', color: 'var(--red)' }}>−{brl(taxasPreview[i] ?? 0)}</td>
                    <td style={{ padding: '2px 0', fontWeight: 600 }}>{brl(p.valor - (taxasPreview[i] ?? 0))}</td>
                  </tr>
                ))}
                <tr style={{ textAlign: 'right', borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Total</td>
                  <td style={{ padding: '4px 0' }}>{brl(valorNum)}</td>
                  <td style={{ padding: '4px 0', color: 'var(--red)' }}>−{brl(taxaNum)}</td>
                  <td style={{ padding: '4px 0', fontWeight: 700 }}>{brl(valorNum - taxaNum)}</td>
                </tr>
              </tbody>
            </table>
          )}
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
  const [taxaCartao, setTaxaCartao] = useState(String(parcela.taxa_cartao ?? 0));
  const [obs, setObs] = useState(parcela.obs ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const valorEditNum = Number(String(valor).replace(',', '.')) || Number(parcela.valor);
  const taxaNum = Number(String(taxaCartao).replace(',', '.')) || 0;

  async function salvar() {
    setErro(null);
    // Mesmo check do banco, em português. Sem ele o erro chega como violação
    // de constraint, que não diz nada para quem está digitando.
    if (taxaNum > valorEditNum) {
      return setErro('A taxa não pode ser maior que o valor da parcela.');
    }
    setBusy(true);
    const { error } = await supabase
      .from('parcelas')
      .update({
        status,
        data_pgto: status === 'pago' ? dataPgto : null,
        valor: Number(String(valor).replace(',', '.')) || parcela.valor,
        taxa_cartao: taxaNum,
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

      {/* Editável parcela a parcela porque a maquininha desconta valores
          ligeiramente diferentes em cada repasse, e é assim que chega no
          extrato. A distribuição feita na criação é só o ponto de partida. */}
      <label className="form-lbl">Taxa da maquininha (R$)</label>
      <input inputMode="decimal" value={taxaCartao} onChange={e => setTaxaCartao(e.target.value)}
        placeholder="Quanto a maquininha ficou neste repasse" />
      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -4, marginBottom: 8 }}>
        Líquido desta parcela: <strong>{brl(valorEditNum - taxaNum)}</strong>
      </div>

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
