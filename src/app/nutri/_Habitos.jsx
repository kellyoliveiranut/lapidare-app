import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

// Modelos prontos pra nutri adicionar rápido
const MODELOS = [
  { nome: 'Beber água',          emoji: '💧', tipo: 'numero',  meta: 2,    unidade: 'L' },
  { nome: 'Suplementação',       emoji: '💊', tipo: 'boolean' },
  { nome: 'Vegetais e legumes',  emoji: '🥦', tipo: 'numero',  meta: 5,    unidade: 'porções' },
  { nome: 'Atividade física',    emoji: '🏃', tipo: 'numero',  meta: 30,   unidade: 'min' },
  { nome: 'Sono',                emoji: '😴', tipo: 'numero',  meta: 8,    unidade: 'h' },
  { nome: 'Meditação',           emoji: '🧘', tipo: 'boolean' },
  { nome: 'Gratidão',            emoji: '🙏', tipo: 'boolean' },
  { nome: 'Humor do dia',        emoji: '😊', tipo: 'escala' },
  { nome: 'Energia',             emoji: '⚡', tipo: 'escala' },
];

export default function Habitos({ pacienteId, nutriId, pacienteNome }) {
  const [habitos, setHabitos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [editar, setEditar] = useState(null);
  const [busy, setBusy] = useState(false);

  async function carregar(signal = { cancelled: false }) {
    const [hRes, lRes] = await Promise.all([
      supabase.from('habitos').select('id, nome, emoji, tipo, meta, unidade, ativo')
        .eq('paciente_id', pacienteId).order('ordem'),
      supabase.from('habitos_logs').select('habito_id, data, valor')
        .eq('paciente_id', pacienteId)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
    ]);
    if (signal.cancelled) return;
    setHabitos(hRes.data ?? []);
    setLogs(lRes.data ?? []);
  }
  useEffect(() => {
    const signal = { cancelled: false };
    carregar(signal);
    return () => { signal.cancelled = true; };
  }, [pacienteId]);

  async function salvar(h) {
    if (!h.nome?.trim()) { alert('Informe o nome do hábito.'); return; }
    setBusy(true);
    if (h.novo) {
      const ordem = (habitos?.length ?? 0);
      await supabase.from('habitos').insert({
        paciente_id: pacienteId, nutri_id: nutriId,
        nome: h.nome.trim(), emoji: h.emoji?.trim() || null,
        tipo: h.tipo, meta: h.meta ?? null, unidade: h.unidade?.trim() || null,
        ordem, ativo: true,
      });
    } else {
      await supabase.from('habitos').update({
        nome: h.nome.trim(), emoji: h.emoji?.trim() || null,
        tipo: h.tipo, meta: h.meta ?? null, unidade: h.unidade?.trim() || null,
        ativo: h.ativo, updated_at: new Date().toISOString(),
      }).eq('id', h.id);
    }
    setBusy(false);
    setEditar(null);
    carregar();
  }

  async function adicionarModelo(m) {
    setBusy(true);
    await supabase.from('habitos').insert({
      paciente_id: pacienteId, nutri_id: nutriId,
      nome: m.nome, emoji: m.emoji,
      tipo: m.tipo, meta: m.meta ?? null, unidade: m.unidade ?? null,
      ordem: (habitos?.length ?? 0), ativo: true,
    });
    setBusy(false);
    carregar();
  }

  async function excluir(h) {
    if (!window.confirm(`Excluir "${h.nome}"? Os registros da paciente também serão removidos.`)) return;
    await supabase.from('habitos').delete().eq('id', h.id);
    carregar();
  }

  // Aderência últimos 7 dias por hábito
  const aderenciaPorHabito = useMemo(() => {
    const mapa = {};
    const dias7 = [];
    for (let i = 0; i < 7; i++) {
      dias7.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    }
    for (const h of habitos ?? []) {
      const logsH = logs.filter(l => l.habito_id === h.id && dias7.includes(l.data));
      let cumpridos = 0;
      for (const dia of dias7) {
        const log = logsH.find(l => l.data === dia);
        if (!log) continue;
        if (h.tipo === 'boolean' && log.valor >= 1) cumpridos++;
        else if (h.tipo === 'numero' && h.meta && log.valor >= h.meta) cumpridos++;
        else if (h.tipo === 'numero' && !h.meta && log.valor > 0) cumpridos++;
        else if (h.tipo === 'escala' && log.valor >= 4) cumpridos++;
      }
      mapa[h.id] = Math.round((cumpridos / 7) * 100);
    }
    return mapa;
  }, [habitos, logs]);

  const jaExistentes = new Set((habitos ?? []).map(h => h.nome.toLowerCase()));
  const modelosDisponiveis = MODELOS.filter(m => !jaExistentes.has(m.nome.toLowerCase()));

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Hábitos de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">Personalize o tracker diário pra essa paciente</div>
          </div>
          <button className="btn" onClick={() => setEditar({ novo: true, nome: '', emoji: '✨', tipo: 'boolean' })}>
            <i className="ti ti-plus" aria-hidden="true"></i> Novo hábito
          </button>
        </div>

        <div className="card-body">
          {/* Lista de hábitos */}
          {habitos === null ? (
            <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : habitos.length === 0 ? (
            <div style={{ marginBottom: 14 }}>
              {/* Cards de exemplo */}
              {[
                { emoji: '💧', nome: 'Hidratação', sub: 'Meta: 1,5 L/dia', pct: 71 },
                { emoji: '😴', nome: 'Sono',       sub: '6h por noite',    pct: 57 },
                { emoji: '🏃', nome: 'Atividade física', sub: 'Caminhada 3×/semana', pct: 43 },
                { emoji: '💩', nome: 'Intestino',  sub: 'Evacuação diária', pct: 86 },
              ].map(ex => (
                <div key={ex.nome} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: 12, borderRadius: 8, marginBottom: 6,
                  background: 'var(--bg2)', border: '0.5px dashed var(--border)',
                  opacity: 0.55, pointerEvents: 'none', userSelect: 'none',
                }}>
                  <span style={{ fontSize: 22 }}>{ex.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{ex.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ex.sub}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: ex.pct >= 70 ? 'var(--green)' : ex.pct >= 40 ? 'var(--orange)' : 'var(--red)' }}>{ex.pct}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>últ. 7 dias</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                Exemplo de tracker — adicione um modelo abaixo ou crie um hábito custom.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {habitos.map(h => {
                const pct = aderenciaPorHabito[h.id] ?? 0;
                const corPct = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--orange)' : 'var(--red)';
                return (
                  <div key={h.id} style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    padding: 12, borderRadius: 8,
                    background: h.ativo ? 'var(--white)' : 'var(--bg2)',
                    border: '0.5px solid var(--border)',
                    opacity: h.ativo ? 1 : 0.6,
                  }}>
                    <span style={{ fontSize: 22 }}>{h.emoji ?? '✨'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {h.nome}
                        {!h.ativo && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(pausado)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {h.tipo === 'boolean' && 'Sim/não'}
                        {h.tipo === 'numero' && (h.meta ? `Meta: ${h.meta} ${h.unidade ?? ''}` : 'Quantidade livre')}
                        {h.tipo === 'escala' && 'Escala 1-5'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: corPct }}>{pct}%</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>últ. 7 dias</div>
                    </div>
                    <button onClick={() => setEditar({ ...h, novo: false })}
                      className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                      <i className="ti ti-edit" aria-hidden="true"></i>
                    </button>
                    <button onClick={() => excluir(h)}
                      style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modelos prontos */}
          {modelosDisponiveis.length > 0 && (
            <>
              <div style={{
                fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
              }}>
                Adicionar modelo pronto
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {modelosDisponiveis.map(m => (
                  <button key={m.nome} onClick={() => adicionarModelo(m)}
                    disabled={busy}
                    className="btn-outline"
                    style={{ fontSize: 12, padding: '5px 10px' }}>
                    {m.emoji} {m.nome}
                    {m.meta && <span style={{ color: 'var(--text3)', marginLeft: 4 }}>({m.meta}{m.unidade})</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {editar && (
        <ModalHabito h={editar} onClose={() => setEditar(null)} onSave={salvar} busy={busy} />
      )}
    </>
  );
}


function ModalHabito({ h, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    ...h,
    meta: h.meta ?? '',
    unidade: h.unidade ?? '',
    emoji: h.emoji ?? '✨',
  });

  const payload = {
    ...form,
    meta: form.tipo === 'numero' && form.meta !== '' ? Number(form.meta) : null,
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 460, width: '100%', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {h.novo ? 'Novo hábito' : 'Editar hábito'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label className="form-lbl">Emoji</label>
            <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
              style={{ fontSize: 18, textAlign: 'center' }} maxLength={2} />
          </div>
          <div>
            <label className="form-lbl">Nome do hábito</label>
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Beber água, Suplementos, Atividade física" autoFocus />
          </div>
        </div>

        <label className="form-lbl">Tipo de medição</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { id: 'boolean', label: '✅ Sim/não',     desc: 'Fez ou não fez' },
            { id: 'numero',  label: '🔢 Quantidade',  desc: 'Com meta numérica' },
            { id: 'escala',  label: '⭐ Escala 1-5',  desc: 'Avaliação subjetiva' },
          ].map(t => (
            <button key={t.id} type="button"
              onClick={() => setForm(f => ({ ...f, tipo: t.id }))}
              style={{
                flex: 1, padding: '8px 10px', fontSize: 12,
                background: form.tipo === t.id ? 'var(--dark)' : 'var(--bg2)',
                color: form.tipo === t.id ? '#fff' : 'var(--text2)',
                border: form.tipo === t.id ? 'none' : '0.5px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', textAlign: 'left',
              }}>
              <div style={{ fontWeight: 500 }}>{t.label}</div>
              <div style={{ fontSize: 10, opacity: .8, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {form.tipo === 'numero' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-lbl">Meta diária</label>
              <input type="number" step="0.5" value={form.meta}
                onChange={e => setForm(f => ({ ...f, meta: e.target.value }))}
                placeholder="2" />
            </div>
            <div>
              <label className="form-lbl">Unidade</label>
              <input value={form.unidade}
                onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                placeholder="L, copos, porções, min, h" />
            </div>
          </div>
        )}

        {!h.novo && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 8, fontSize: 13, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={!form.ativo}
              onChange={e => setForm(f => ({ ...f, ativo: !e.target.checked }))} />
            Pausar (paciente não vê na lista do dia)
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onSave(payload)} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
