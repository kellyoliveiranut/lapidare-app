import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

// Duplicado do _Treinos.jsx de propósito: exportar a constante de lá faria o
// arquivo exportar algo que não é componente, que é exatamente o
// react-refresh/only-export-components que o lint já acusa em session.jsx e
// theme.jsx. Sete strings não valem a regressão.
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const exercicio0 = chave => ({
  _k: chave, id: null,
  nome: '', series: '', repeticoes: '', intensidade: '', intervalo: '', observacao: '',
});

const dia0 = (chave, n) => ({
  _k: chave, id: null,
  nome: `Treino ${String.fromCharCode(65 + n)}`,   // A, B, C...
  dias_semana: [],
  exercicios: [],
});

// Move um item do array uma posição para cima/baixo. Devolve o mesmo array
// (por referência) quando o movimento não é possível, para o setState virar
// no-op em vez de re-renderizar à toa.
function mover(lista, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

export default function TreinoDias({ treino, rascunhoInicial = null, onClose, onSaved }) {
  // Chave local só para o React: o id do banco é null enquanto a linha não foi
  // gravada, e index como key quebraria a reordenação (o input perderia foco e
  // o valor iria para a linha errada).
  const chaveRef = useRef(0);
  const novaChave = () => `k${++chaveRef.current}`;

  // Semeado pelo import por PDF. É estado INICIAL, não efeito: o rascunho já
  // está em memória quando o modal monta, e semear dentro do useEffect seria
  // um setState síncrono em efeito — cascata de render, e o lint acusa.
  //
  // Só é passado para um treino RECÉM-PUBLICADO, que por definição ainda não
  // tem dias gravados — daí todos os ids nascerem null e o salvar() tratar
  // tudo como insert, pelo caminho de sempre. Passar isto num plano que JÁ tem
  // dias duplicaria tudo, porque o rascunho semeado não conhece os ids que
  // estão lá; por isso o _Treinos.jsx zera o rascunho ao fechar o editor.
  // As chaves da semeadura saem do índice, com prefixo `s`, em vez do
  // novaChave(): ler chaveRef.current durante o render é acesso a ref em
  // render, que o lint proíbe. O prefixo garante que nunca colidem com as
  // chaves `k…` que addDia/addEx criam depois.
  const [dias, setDias] = useState(() => rascunhoInicial
    ? rascunhoInicial.map((d, i) => ({
        _k: `s${i}`, id: null,
        nome: d.nome ?? '',
        dias_semana: d.dias_semana ?? [],
        exercicios: (d.exercicios ?? []).map((e, j) => ({
          _k: `s${i}e${j}`, id: null,
          nome: e.nome ?? '',
          series: e.series ?? '',
          repeticoes: e.repeticoes ?? '',
          intensidade: e.intensidade ?? '',
          intervalo: e.intervalo ?? '',
          observacao: e.observacao ?? '',
        })),
      }))
    : null);                                       // null = carregando
  const [diasRemovidos, setDiasRemovidos] = useState([]);
  const [exRemovidos, setExRemovidos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let active = true;
    // Semeado pelo PDF já veio pronto do useState acima — não há o que buscar.
    if (rascunhoInicial) return;

    async function carregar() {
      const { data, error } = await supabase
        .from('treinos_dias')
        .select('id, nome, dias_semana, ordem, treinos_exercicios(id, nome, series, repeticoes, intensidade, intervalo, observacao, ordem)')
        .eq('treino_id', treino.id)
        .order('ordem');
      if (!active) return;
      if (error) { setErro('Não consegui carregar os dias: ' + error.message); setDias([]); return; }
      // A ordem dos exercícios é resolvida aqui, no cliente: ordenar tabela
      // aninhada pelo PostgREST mudou de nome entre versões do supabase-js
      // (foreignTable → referencedTable) e não vale a dependência.
      setDias((data ?? []).map(d => ({
        _k: novaChave(),
        id: d.id,
        nome: d.nome ?? '',
        dias_semana: d.dias_semana ?? [],
        exercicios: [...(d.treinos_exercicios ?? [])]
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          .map(e => ({
            _k: novaChave(), id: e.id,
            nome: e.nome ?? '',
            series: e.series ?? '',
            repeticoes: e.repeticoes ?? '',
            intensidade: e.intensidade ?? '',
            intervalo: e.intervalo ?? '',
            observacao: e.observacao ?? '',
          })),
      })));
    }
    carregar();
    return () => { active = false; };
  }, [treino.id, rascunhoInicial]);

  // ─── Edição do rascunho (nada toca o banco até o Salvar) ───

  const patchDia = (i, patch) =>
    setDias(ds => ds.map((d, k) => k === i ? { ...d, ...patch } : d));

  const patchEx = (i, j, patch) =>
    setDias(ds => ds.map((d, k) => k !== i ? d : {
      ...d,
      exercicios: d.exercicios.map((e, m) => m === j ? { ...e, ...patch } : e),
    }));

  const addDia = () => setDias(ds => [...ds, dia0(novaChave(), ds.length)]);

  // Só entra na lista de remoção o que TEM id — o que nunca foi gravado
  // some do rascunho e acabou.
  function removerDia(i) {
    const d = dias[i];
    if (d.id && !window.confirm(`Remover "${d.nome}" e os exercícios dele?`)) return;
    if (d.id) setDiasRemovidos(r => [...r, d.id]);
    setDias(ds => ds.filter((_, k) => k !== i));
  }

  const addEx = i => setDias(ds => ds.map((d, k) => k === i
    ? { ...d, exercicios: [...d.exercicios, exercicio0(novaChave())] }
    : d));

  function removerEx(i, j) {
    const e = dias[i].exercicios[j];
    if (e.id) setExRemovidos(r => [...r, e.id]);
    setDias(ds => ds.map((d, k) => k !== i
      ? d
      : { ...d, exercicios: d.exercicios.filter((_, m) => m !== j) }));
  }

  const moverDia = (i, delta) => setDias(ds => mover(ds, i, delta));
  const moverEx = (i, j, delta) => setDias(ds => ds.map((d, k) => k === i
    ? { ...d, exercicios: mover(d.exercicios, j, delta) }
    : d));

  const toggleDiaSemana = (i, dia) => setDias(ds => ds.map((d, k) => k !== i ? d : {
    ...d,
    dias_semana: d.dias_semana.includes(dia)
      ? d.dias_semana.filter(x => x !== dia)
      : [...d.dias_semana, dia],
  }));

  // ─── Gravação ───

  // POR QUE DIFF E NÃO delete-tudo-e-recria: a FK treinos_registros.dia_id é
  // ON DELETE SET NULL. Apagar um dia para recriá-lo com outro nome apagaria o
  // rótulo de qual dia a paciente fez em TODO o histórico dela — exatamente a
  // informação que a coluna existe para guardar. Linha existente é UPDATE,
  // sempre.
  //
  // Sem transação: o PostgREST não tem uma. Se algo falhar no meio, parte já
  // gravou. Por isso o erro pede para reabrir — reabrir relê do banco e mostra
  // o que de fato ficou lá, em vez de deixar o rascunho fingir que nada foi.
  async function salvar() {
    setErro(null);
    if (dias.some(d => !d.nome.trim())) { setErro('Todo dia precisa de um nome.'); return; }
    if (dias.some(d => d.exercicios.some(e => !e.nome.trim()))) {
      setErro('Todo exercício precisa de um nome.');
      return;
    }

    setBusy(true);
    try {
      // Deletes primeiro. O delete do dia leva os exercícios dele por CASCADE,
      // então um id que apareça nas duas listas some duas vezes — inofensivo.
      if (exRemovidos.length) {
        const { error } = await supabase.from('treinos_exercicios').delete().in('id', exRemovidos);
        if (error) throw error;
      }
      if (diasRemovidos.length) {
        const { error } = await supabase.from('treinos_dias').delete().in('id', diasRemovidos);
        if (error) throw error;
      }

      // `ordem` sai do índice do array: reordenar é só um UPDATE de ordem,
      // nunca delete + insert.
      for (const [i, d] of dias.entries()) {
        const payloadDia = {
          nome: d.nome.trim(),
          dias_semana: d.dias_semana.length ? d.dias_semana : null,
          ordem: i,
        };
        let diaId = d.id;
        if (diaId) {
          const { error } = await supabase.from('treinos_dias').update(payloadDia).eq('id', diaId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('treinos_dias')
            .insert({ ...payloadDia, treino_id: treino.id })
            .select('id').single();
          if (error) throw error;
          diaId = data.id;   // exercício de dia novo só existe depois disto
        }

        for (const [j, e] of d.exercicios.entries()) {
          const payloadEx = {
            nome: e.nome.trim(),
            series: e.series.trim() || null,
            repeticoes: e.repeticoes.trim() || null,
            intensidade: e.intensidade.trim() || null,
            intervalo: e.intervalo.trim() || null,
            observacao: e.observacao.trim() || null,
            ordem: j,
          };
          if (e.id) {
            const { error } = await supabase.from('treinos_exercicios').update(payloadEx).eq('id', e.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('treinos_exercicios').insert({ ...payloadEx, dia_id: diaId });
            if (error) throw error;
          }
        }
      }
      onSaved();
    } catch (err) {
      setErro('Erro ao salvar: ' + (err?.message ?? 'tente novamente') + ' — reabra o editor para ver o que foi gravado.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Tela ───

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8,
    border: '1px solid var(--hair)', fontSize: 13, background: 'var(--white)',
    fontFamily: 'var(--font-sans)',
  };
  const microLabel = {
    fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '.06em', fontWeight: 500, marginBottom: 3, display: 'block',
  };
  const btnSeta = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text3)', padding: 2, lineHeight: 1,
  };

  const totalEx = (dias ?? []).reduce((n, d) => n + d.exercicios.length, 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,.45)', display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{
        background: 'var(--paper, #faf7f2)', borderRadius: '20px 20px 0 0',
        padding: '20px 18px 28px', width: '100%', maxWidth: 720,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 -4px 30px rgba(0,0,0,.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink)' }}>
            Dias e exercícios
          </span>
          <button
            onClick={() => { if (!busy) onClose(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', padding: 4 }}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          {treino.tipo} · publicado em {dataBR(treino.created_at)}
          {dias !== null && dias.length > 0 && ` · ${dias.length} dia${dias.length > 1 ? 's' : ''}, ${totalEx} exercício${totalEx === 1 ? '' : 's'}`}
        </div>

        {erro && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12,
            background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)',
            border: '1px solid var(--red, #dc2626)',
          }}>{erro}</div>
        )}

        {dias === null ? (
          <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
        ) : (
          <>
            {dias.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
                Este plano ainda não tem dias. Adicione um para dividir o treino
                (Treino A, Treino B) — a paciente vai escolher qual fez ao
                registrar a sessão.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {dias.map((d, i) => (
                <div key={d._k} style={{
                  padding: 12, borderRadius: 10,
                  border: '1px solid var(--hair)', background: 'var(--white)',
                }}>
                  {/* Cabeçalho do dia */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                      <button onClick={() => moverDia(i, -1)} disabled={i === 0} title="Subir"
                        style={{ ...btnSeta, opacity: i === 0 ? .25 : 1 }}>
                        <i className="ti ti-chevron-up" style={{ fontSize: 14 }} aria-hidden="true" />
                      </button>
                      <button onClick={() => moverDia(i, 1)} disabled={i === dias.length - 1} title="Descer"
                        style={{ ...btnSeta, opacity: i === dias.length - 1 ? .25 : 1 }}>
                        <i className="ti ti-chevron-down" style={{ fontSize: 14 }} aria-hidden="true" />
                      </button>
                    </div>
                    <input
                      value={d.nome}
                      onChange={e => patchDia(i, { nome: e.target.value })}
                      placeholder="Nome do dia (ex: Treino A)"
                      style={{ ...inputStyle, fontWeight: 600 }}
                    />
                    <button onClick={() => removerDia(i)} title="Remover dia"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, flexShrink: 0 }}>
                      <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Dias da semana deste dia */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                    {DIAS.map(dia => {
                      const on = d.dias_semana.includes(dia);
                      return (
                        <button key={dia} type="button" onClick={() => toggleDiaSemana(i, dia)}
                          style={{
                            padding: '4px 9px', borderRadius: 6, fontSize: 11,
                            fontFamily: 'var(--font-sans)', cursor: 'pointer',
                            border: on ? 'none' : '0.5px solid var(--border)',
                            background: on ? 'var(--dark)' : 'var(--bg2)',
                            color: on ? 'var(--white)' : 'var(--text2)',
                            fontWeight: on ? 600 : 400,
                          }}>{dia}</button>
                      );
                    })}
                  </div>

                  {/* Exercícios */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {d.exercicios.map((e, j) => (
                      <div key={e._k} style={{
                        padding: 10, borderRadius: 8,
                        background: 'var(--bg2)', border: '0.5px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                            <button onClick={() => moverEx(i, j, -1)} disabled={j === 0} title="Subir"
                              style={{ ...btnSeta, opacity: j === 0 ? .25 : 1 }}>
                              <i className="ti ti-chevron-up" style={{ fontSize: 13 }} aria-hidden="true" />
                            </button>
                            <button onClick={() => moverEx(i, j, 1)} disabled={j === d.exercicios.length - 1} title="Descer"
                              style={{ ...btnSeta, opacity: j === d.exercicios.length - 1 ? .25 : 1 }}>
                              <i className="ti ti-chevron-down" style={{ fontSize: 13 }} aria-hidden="true" />
                            </button>
                          </div>
                          <input
                            value={e.nome}
                            onChange={ev => patchEx(i, j, { nome: ev.target.value })}
                            placeholder="Nome do exercício"
                            style={inputStyle}
                          />
                          <button onClick={() => removerEx(i, j)} title="Remover exercício"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, flexShrink: 0 }}>
                            <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={microLabel}>Séries</label>
                            <input value={e.series} onChange={ev => patchEx(i, j, { series: ev.target.value })}
                              placeholder="3" style={inputStyle} />
                          </div>
                          <div>
                            <label style={microLabel}>Repetições</label>
                            <input value={e.repeticoes} onChange={ev => patchEx(i, j, { repeticoes: ev.target.value })}
                              placeholder="12/10/8" style={inputStyle} />
                          </div>
                          <div>
                            <label style={microLabel}>Carga/Intensidade</label>
                            <input value={e.intensidade} onChange={ev => patchEx(i, j, { intensidade: ev.target.value })}
                              placeholder="12kg, RPE 7" style={inputStyle} />
                          </div>
                          <div>
                            <label style={microLabel}>Intervalo</label>
                            <input value={e.intervalo} onChange={ev => patchEx(i, j, { intervalo: ev.target.value })}
                              placeholder="60s" style={inputStyle} />
                          </div>
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <label style={microLabel}>Observação</label>
                          <input value={e.observacao} onChange={ev => patchEx(i, j, { observacao: ev.target.value })}
                            placeholder="ex: amplitude parcial, sem dor" style={inputStyle} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="btn-outline" onClick={() => addEx(i)}
                    style={{ marginTop: 10, fontSize: 12, minHeight: 36, justifyContent: 'center', width: '100%' }}>
                    <i className="ti ti-plus" aria-hidden="true" /> Adicionar exercício
                  </button>
                </div>
              ))}
            </div>

            <button className="btn-outline" onClick={addDia}
              style={{ marginTop: 14, fontSize: 13, minHeight: 40, justifyContent: 'center', width: '100%' }}>
              <i className="ti ti-plus" aria-hidden="true" /> Adicionar dia
            </button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn" onClick={salvar} disabled={busy}>
                <i className="ti ti-check" aria-hidden="true" />
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
