import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import DateInput from '../../components/DateInput.jsx';
import ModalShell from '../../components/ModalShell.jsx';
import { gravar } from '../../lib/gravar.js';
import { confirmar } from '../../lib/dialogos.js';
import { verificarAgenda, gradeDoLocal } from '../../lib/agendaConflitos.js';
import { dataLocalISO, dataConsultaBR, partesLocaisISO, montarDataHoraISO, dataBR, HORARIOS_CONSULTA } from '../../lib/utils.js';
import { semanaQueVem, consultasDoPeriodo, conflitosEntreSi, mensagemReagendamento } from '../../lib/reagendarLote.js';
import { telefoneWhatsapp } from '../../lib/painelNotificacoes.js';

/* ============================================================
   REAGENDAR EM LOTE (Agenda)
   1. Escolhe o período (padrão: semana que vem).
   2. Para cada consulta: marca, e define a nova data e horário — ou deixa a
      data vazia para mandar para "A definir".
   3. Confere tudo junto (fim de semana, bloqueio, feriado, conflito) e grava.
   4. Mostra um botão de WhatsApp por paciente, com a mensagem pronta.
   Cada consulta guarda a data de antes em `remarcada_de`, como o Remarcar.
   ============================================================ */

const ROTULO_CAMPO = { fontSize: 11, color: 'var(--text3)', marginBottom: 2 };

export default function ReagendarLote({ consultas, locais, nutriId, onClose, onSaved }) {
  const semana = useMemo(() => semanaQueVem(dataLocalISO(0)), []);
  const [de, setDe] = useState(semana.de);
  const [ate, setAte] = useState(semana.ate);
  const [linhas, setLinhas] = useState({});      // id -> { marcada, data, hora }
  const [erros, setErros] = useState([]);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null); // { feitas: [...], falhas: [...] }

  const lista = useMemo(() => consultasDoPeriodo(consultas, de, ate), [consultas, de, ate]);

  // Linha nova entra marcada, sem data (= "A definir") até a Kelly escolher.
  const linha = (id) => linhas[id] ?? { marcada: true, data: '', hora: '' };
  const mudar = (id, patch) => setLinhas(prev => ({ ...prev, [id]: { ...linha(id), ...patch } }));

  const marcadas = lista.filter(c => linha(c.id).marcada);

  function gradeDe(c) {
    const local = c.local_id ? (locais ?? []).find(l => l.id === c.local_id) : null;
    return gradeDoLocal(local, HORARIOS_CONSULTA);
  }

  async function aplicar() {
    setErros([]);
    if (!marcadas.length) { setErros(['Marque ao menos uma consulta.']); return; }

    const itens = marcadas.map(c => {
      const l = linha(c.id);
      return { c, data: l.data, hora: l.hora, nome: c.paciente?.nome ?? 'Paciente', duracaoMin: c.duracao_min ?? 30 };
    });
    const faltaHora = itens.filter(i => i.data && !i.hora);
    if (faltaHora.length) {
      setErros(faltaHora.map(i => `${i.nome}: escolha o horário (ou apague a data para mandar para "A definir").`));
      return;
    }

    setBusy(true);
    try {
      const problemas = [...conflitosEntreSi(itens)];
      const avisos = [];
      const ignorarIds = itens.map(i => i.c.id);
      for (const it of itens.filter(i => i.data)) {
        const { impedimentos, avisos: av } = await verificarAgenda(supabase, {
          nutriId,
          pacienteId: it.c.paciente?.id ?? null,
          itens: [{ data: it.data, hora: it.hora, duracaoMin: it.duracaoMin }],
          ignorarIds,
        });
        impedimentos.forEach(x => problemas.push(`${it.nome}: ${x.texto}`));
        av.forEach(x => avisos.push(`${it.nome}: ${x.texto}`));
      }
      if (problemas.length) { setErros(problemas); return; }

      const nDefinir = itens.filter(i => !i.data).length;
      const resumo = `Reagendar ${itens.length} consulta${itens.length === 1 ? '' : 's'}`
        + (nDefinir ? ` (${nDefinir} para "A definir")` : '') + '?\n\n'
        + 'A confirmação de presença e o lembrete de cada uma serão zerados, e a data de antes fica registrada.'
        + (avisos.length ? `\n\nAtenção:\n${avisos.map(a => `• ${a}`).join('\n')}` : '');
      if (!await confirmar(resumo, { confirmarRotulo: 'Reagendar' })) return;

      const feitas = [];
      const falhas = [];
      for (const it of itens) {
        const novaISO = it.data ? montarDataHoraISO(it.data, it.hora) : null;
        // Mesmo horário de antes: nada a gravar.
        if (novaISO && new Date(novaISO).getTime() === new Date(it.c.data_hora).getTime()) continue;
        const r = await gravar(
          supabase.from('consultas').update({ data_hora: novaISO, remarcada_de: it.c.data_hora }).eq('id', it.c.id),
          { rotulo: `reagendar a consulta de ${it.nome}` },
        );
        if (r.ok) feitas.push(it); else falhas.push(`${it.nome}: ${r.msg}`);
      }

      // Telefones para os botões de WhatsApp (a Agenda não os carrega).
      const ids = [...new Set(feitas.map(i => i.c.paciente?.id).filter(Boolean))];
      let tels = {};
      if (ids.length) {
        const { data } = await supabase.from('pacientes').select('id, telefone').in('id', ids);
        tels = Object.fromEntries((data ?? []).map(p => [p.id, p.telefone]));
      }
      setResultado({
        feitas: feitas.map(i => {
          const antes = partesLocaisISO(i.c.data_hora);
          const depois = i.data ? { data: i.data, hora: i.hora } : null;
          const tel = telefoneWhatsapp(tels[i.c.paciente?.id]);
          const texto = mensagemReagendamento({ nome: i.nome, antes, depois });
          return {
            id: i.c.id, nome: i.nome, depois, antes,
            href: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null,
          };
        }),
        falhas,
      });
      onSaved?.();
    } catch (err) {
      setErros([err?.message || 'Não foi possível reagendar agora.']);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [busy, onClose]);

  if (resultado) {
    return (
      <ModalShell title="Reagendamento concluído"
        subtitle={`${resultado.feitas.length} consulta${resultado.feitas.length === 1 ? '' : 's'} atualizada${resultado.feitas.length === 1 ? '' : 's'}.`}
        onClose={onClose}>
        {resultado.falhas.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            Não deu certo para: {resultado.falhas.join(' · ')}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
          Avise cada paciente pelo WhatsApp (a mensagem já vai pronta):
        </div>
        {resultado.feitas.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '0.5px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{f.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                {dataBR(f.antes.data)} {f.antes.hora} → {f.depois ? `${dataBR(f.depois.data)} ${f.depois.hora}` : 'A definir'}
              </div>
            </div>
            {f.href ? (
              <a href={f.href} target="_blank" rel="noopener noreferrer" className="btn-outline"
                style={{ fontSize: 12, padding: '5px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Avisar
              </a>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>sem telefone</span>
            )}
          </div>
        ))}
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={onClose}>Fechar</button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Reagendar em lote"
      subtitle="Escolha o período, defina a nova data de cada consulta e confirme. Sem data, a consulta vai para “A definir”."
      onClose={busy ? () => {} : onClose}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={ROTULO_CAMPO}>De</div>
          <DateInput value={de} onChange={e => setDe(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={ROTULO_CAMPO}>Até</div>
          <DateInput value={ate} onChange={e => setAte(e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      {lista.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Nenhuma consulta agendada neste período.</div>
      ) : (
        <div style={{ maxHeight: '48vh', overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          {lista.map(c => {
            const l = linha(c.id);
            return (
              <div key={c.id} style={{ borderTop: '0.5px solid var(--border)', padding: '9px 0', opacity: l.marcada ? 1 : .55 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={l.marcada} onChange={e => mudar(c.id, { marcada: e.target.checked })} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13 }}>{c.paciente?.nome ?? 'Paciente sem nome'}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)' }}>Hoje: {dataConsultaBR(c.data_hora)}</span>
                  </span>
                </label>
                {l.marcada && (
                  <div style={{ display: 'flex', gap: 8, margin: '6px 0 0 24px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1.4 }}>
                      <div style={ROTULO_CAMPO}>Nova data</div>
                      <DateInput value={l.data} onChange={e => mudar(c.id, { data: e.target.value, hora: e.target.value ? l.hora : '' })} style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={ROTULO_CAMPO}>Horário</div>
                      <select value={l.hora} disabled={!l.data} onChange={e => mudar(c.id, { hora: e.target.value })} style={{ width: '100%' }}>
                        <option value="">{l.data ? 'Escolha' : '—'}</option>
                        {gradeDe(c).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {l.marcada && !l.data && (
                  <div style={{ fontSize: 11.5, color: 'var(--gold-deep, #a08456)', margin: '4px 0 0 24px' }}>Sem data: vai para “A definir”.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {erros.length > 0 && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', borderRadius: 8, padding: '8px 10px', margin: '10px 0 0' }}>
          {erros.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose} disabled={busy}>Fechar</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={aplicar} disabled={busy || !marcadas.length}>
          {busy ? 'Reagendando…' : `Reagendar ${marcadas.length || ''}`.trim()}
        </button>
      </div>
    </ModalShell>
  );
}
