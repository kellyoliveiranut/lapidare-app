import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import { validarTemplate, formatarResposta } from '../../lib/checkinDefault.js';
import CheckinForm from '../../components/CheckinForm.jsx';
import DicaJSON from '../../components/DicaJSON.jsx';

export default function Questionarios() {
  const { user } = useSession();
  const [tab, setTab] = useState('modelos');
  const [templates, setTemplates] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editar, setEditar] = useState(null);
  const [verResposta, setVerResposta] = useState(null);
  const [toast, setToast] = useState(null);

  async function carregar() {
    if (!user) return;
    const [tplRes, envRes] = await Promise.all([
      supabase.from('checkin_templates').select('*')
        .eq('nutri_id', user.id).eq('tipo', 'pre_consulta')
        .order('created_at'),
      supabase.from('checkin_envios')
        .select('id, paciente_id, perguntas, enviado_em, respondido_em, respostas, nome, tipo, paciente:pacientes(id, nome)')
        .eq('nutri_id', user.id).eq('tipo', 'pre_consulta')
        .order('enviado_em', { ascending: false }),
    ]);
    setTemplates(tplRes.data ?? []);
    setEnvios(envRes.data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [user]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function excluirTemplate(t) {
    if (!window.confirm(`Excluir modelo "${t.nome}"?`)) return;
    await supabase.from('checkin_templates').delete().eq('id', t.id);
    showToast('Modelo excluído.');
    carregar();
  }

  // Já filtrado por tipo='pre_consulta' na query — só pega os respondidos
  const respondidosPreConsulta = useMemo(() => {
    return envios.filter(e => !!e.respondido_em);
  }, [envios]);

  return (
    <>
      <div className="page-title">Questionários pré-consulta</div>
      <div className="page-sub">
        {tab === 'modelos'
          ? `${templates.length} modelo${templates.length === 1 ? '' : 's'} · enviado automaticamente quando paciente nova se cadastra`
          : `${respondidosPreConsulta.length} questionário${respondidosPreConsulta.length === 1 ? '' : 's'} respondido${respondidosPreConsulta.length === 1 ? '' : 's'}`}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 14, maxWidth: 360,
      }}>
        {[
          { id: 'modelos',    label: `Modelos (${templates.length})` },
          { id: 'respostas',  label: `Respostas (${respondidosPreConsulta.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              boxShadow: tab === t.id ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.05))' : 'none',
              fontFamily: 'var(--font-sans)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* MODELOS */}
      {tab === 'modelos' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="btn" onClick={() => setEditar({ modo: 'novo' })}>
              <i className="ti ti-plus" aria-hidden="true"></i> Novo modelo de pré-consulta
            </button>
          </div>

          {carregando ? (
            <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
          ) : templates.length === 0 ? (
            <div className="card empty-card">
              <i className="ti ti-clipboard-list empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Nenhum modelo de pré-consulta</div>
              <div className="empty-sub">
                Crie um questionário que será enviado automaticamente quando uma paciente nova se cadastrar.
                Otimize sua consulta — chegue na primeira consulta já sabendo histórico, queixas e expectativas.
              </div>
              <button className="btn" onClick={() => setEditar({ modo: 'novo' })}>
                <i className="ti ti-plus" aria-hidden="true"></i> Criar primeiro modelo
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => (
                <div key={t.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                    <i className="ti ti-clipboard-list" style={{ fontSize: 22, color: 'var(--gold-deep, var(--dark))', marginTop: 2 }} aria-hidden="true"></i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {(t.perguntas ?? []).length} pergunta{(t.perguntas ?? []).length === 1 ? '' : 's'}
                        {' · '}criado em {dataBR(t.created_at)}
                      </div>
                    </div>
                    <button onClick={() => setEditar(t)} className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}>
                      <i className="ti ti-edit" aria-hidden="true"></i> Editar
                    </button>
                    <button onClick={() => excluirTemplate(t)}
                      style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '4px 8px',
                        color: 'var(--red)', cursor: 'pointer',
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* RESPOSTAS */}
      {tab === 'respostas' && (
        <>
          {carregando ? (
            <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
          ) : respondidosPreConsulta.length === 0 ? (
            <div className="card empty-card">
              <i className="ti ti-clipboard-text empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Nenhuma resposta ainda</div>
              <div className="empty-sub">
                Quando uma paciente responder o questionário, aparece aqui.
                Cada resposta pode ser baixada em PDF.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {respondidosPreConsulta.map(e => (
                <button key={e.id} className="card" onClick={() => setVerResposta(e)}
                  style={{
                    padding: 14, display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', textAlign: 'left',
                    border: '0.5px solid var(--border)',
                    background: 'var(--white)', fontFamily: 'var(--font-sans)',
                  }}>
                  <i className="ti ti-clipboard-check" style={{ fontSize: 18, color: 'var(--green)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{e.paciente?.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      Respondido em {dataBR(e.respondido_em)} · enviado em {dataBR(e.enviado_em)}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text3)' }} aria-hidden="true"></i>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editar && (
        <EditorPreConsulta template={editar} nutriId={user.id}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); carregar(); showToast('Modelo salvo!'); }} />
      )}

      {verResposta && (
        <RespostaModal envio={verResposta} onClose={() => setVerResposta(null)} />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--dark)', color: '#fff',
          padding: '10px 18px', borderRadius: 8, fontSize: 13,
          zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        }}>{toast}</div>
      )}
    </>
  );
}


/* ──────────────────────────────────────────────────────────────
   EDITOR VISUAL (estilo Google Forms)
   ────────────────────────────────────────────────────────────── */

const TIPOS_PERGUNTA = [
  { id: 'texto',       label: 'Resposta escrita',     icone: 'ti-align-left',     ajuda: 'Campo de texto livre. Bom pra "qual sua queixa principal?"' },
  { id: 'single',      label: 'Escolha única',        icone: 'ti-circle-dot',     ajuda: 'Paciente escolhe UMA opção. Bom pra "como classifica seu sono?"' },
  { id: 'multi',       label: 'Múltipla escolha',     icone: 'ti-checkbox',       ajuda: 'Paciente escolhe VÁRIAS opções. Bom pra "quais doenças tem?"' },
  { id: 'slider',      label: 'Escala numérica',      icone: 'ti-adjustments',    ajuda: 'Slider de 0 a 10. Bom pra "nível de stress (0=nenhum, 10=muito)"' },
  { id: 'emoji_scale', label: 'Escala de emojis',     icone: 'ti-mood-smile',     ajuda: 'Escala visual com 5 emojis. Bom pra "como você se sente hoje?"' },
];

const EMOJIS_PADRAO = [
  { emoji: '😞', label: 'Muito ruim', valor: 1 },
  { emoji: '😕', label: 'Ruim',       valor: 2 },
  { emoji: '😐', label: 'Neutro',     valor: 3 },
  { emoji: '🙂', label: 'Bom',        valor: 4 },
  { emoji: '😄', label: 'Excelente',  valor: 5 },
];

function novaPergunta(tipo = 'texto') {
  const base = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    secao: '',
    pergunta: '',
    tipo,
  };
  if (tipo === 'single' || tipo === 'multi') base.opcoes = ['Opção 1', 'Opção 2'];
  if (tipo === 'slider') Object.assign(base, { min: 0, max: 10, default: 5 });
  if (tipo === 'emoji_scale') base.opcoes = EMOJIS_PADRAO;
  if (tipo === 'texto') base.rows = 3;
  return base;
}

function EditorPreConsulta({ template, nutriId, onClose, onSaved }) {
  const isNovo = template?.modo === 'novo';
  const isEdit = !isNovo && template?.id;

  const [nome, setNome] = useState(isEdit ? template.nome : 'Questionário pré-consulta');
  const [perguntas, setPerguntas] = useState(isEdit ? (template.perguntas ?? []) : []);
  const [modo, setModo] = useState('visual');           // 'visual' | 'json'
  const [jsonText, setJsonText] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  // Trocar de modo: ao entrar no JSON, serializa as perguntas atuais.
  // Ao voltar pro visual, tenta parsear de volta (com validação).
  function trocarModo(novoModo) {
    setErro(null);
    if (novoModo === 'json') {
      setJsonText(JSON.stringify({ nome, perguntas }, null, 2));
      setModo('json');
    } else {
      // voltando pro visual — valida o JSON antes
      try {
        const obj = JSON.parse(jsonText);
        const v = validarTemplate(obj);
        if (!v.ok) {
          setErro('Não foi possível voltar pro modo visual: ' + v.erro);
          return;
        }
        if (obj.nome) setNome(obj.nome);
        setPerguntas(obj.perguntas);
        setModo('visual');
      } catch (e) {
        setErro('JSON inválido: ' + e.message);
      }
    }
  }

  function adicionarPergunta(tipo) {
    setPerguntas(arr => [...arr, novaPergunta(tipo)]);
  }
  function atualizarPergunta(idx, mudancas) {
    setPerguntas(arr => arr.map((p, i) => i === idx ? { ...p, ...mudancas } : p));
  }
  function moverPergunta(idx, delta) {
    setPerguntas(arr => {
      const novo = [...arr];
      const novoIdx = idx + delta;
      if (novoIdx < 0 || novoIdx >= novo.length) return arr;
      [novo[idx], novo[novoIdx]] = [novo[novoIdx], novo[idx]];
      return novo;
    });
  }
  function excluirPergunta(idx) {
    if (!window.confirm('Excluir essa pergunta?')) return;
    setPerguntas(arr => arr.filter((_, i) => i !== idx));
  }
  function duplicarPergunta(idx) {
    setPerguntas(arr => {
      const original = arr[idx];
      const copia = { ...original, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      const novo = [...arr];
      novo.splice(idx + 1, 0, copia);
      return novo;
    });
  }

  async function salvar() {
    setErro(null);

    // Se está em modo JSON, parseia primeiro
    let perguntasFinais = perguntas;
    let nomeFinal = nome.trim();
    if (modo === 'json') {
      try {
        const obj = JSON.parse(jsonText);
        const v = validarTemplate(obj);
        if (!v.ok) return setErro(v.erro);
        perguntasFinais = obj.perguntas;
        nomeFinal = (obj.nome ?? '').trim() || nomeFinal;
      } catch (e) {
        return setErro('JSON inválido: ' + e.message);
      }
    } else {
      if (!nomeFinal) return setErro('Informe o nome do modelo.');
      if (perguntasFinais.length === 0) return setErro('Adicione pelo menos uma pergunta.');
      const v = validarTemplate({ nome: nomeFinal, perguntas: perguntasFinais });
      if (!v.ok) return setErro(v.erro);
    }

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      paciente_id: null,
      nome: nomeFinal,
      perguntas: perguntasFinais,
      tipo: 'pre_consulta',
      updated_at: new Date().toISOString(),
    };
    const { error } = isEdit
      ? await supabase.from('checkin_templates').update(payload).eq('id', template.id)
      : await supabase.from('checkin_templates').insert(payload);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <ModalShell large title={isEdit ? `Editar "${template.nome}"` : 'Novo modelo de pré-consulta'}
      subtitle="Monte o questionário do jeito que quiser — sem código"
      onClose={onClose}>

      {/* Toggle de modo */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 8, padding: 3, marginBottom: 14, maxWidth: 320,
      }}>
        {[
          { id: 'visual', label: 'Editor visual', icone: 'ti-layout-grid' },
          { id: 'json',   label: 'Importar JSON', icone: 'ti-code' },
        ].map(m => (
          <button key={m.id} type="button" onClick={() => trocarModo(m.id)}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: 'none', cursor: 'pointer',
              color: modo === m.id ? 'var(--dark)' : 'var(--text3)',
              background: modo === m.id ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className={`ti ${m.icone}`} aria-hidden="true"></i> {m.label}
          </button>
        ))}
      </div>

      <label className="form-lbl" style={{ marginTop: 0 }}>Nome do modelo</label>
      <input value={nome} onChange={e => setNome(e.target.value)}
        placeholder="Ex: Anamnese inicial" />

      {modo === 'json' ? (
        <>
          <label className="form-lbl">JSON do questionário</label>
          <textarea rows={16} value={jsonText} onChange={e => setJsonText(e.target.value)}
            placeholder='{"nome": "...", "perguntas": [...]}'
            style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical', width: '100%' }} />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Cada pergunta precisa de: <code>id</code>, <code>secao</code>, <code>tipo</code>, <code>pergunta</code>.
            Tipos válidos: <code>emoji_scale</code>, <code>slider</code>, <code>single</code>, <code>multi</code>, <code>habitos</code>, <code>texto</code>.
          </div>
          <DicaJSON
            alvoVisual="Editor visual"
            exemploPrompt='gera um JSON de anamnese pré-consulta pra nutricionista, com perguntas de queixa principal, histórico clínico, hábitos alimentares, exames recentes, expectativas. Use os tipos: texto (resposta aberta), single (escolha única), multi (múltipla escolha), slider (0-10). Cada pergunta tem: id, secao, tipo, pergunta. Para single/multi inclua "opcoes": ["..."]. Retorna { "nome": "...", "perguntas": [...] }' />
        </>
      ) : (
        <>
          <div style={{
            fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, margin: '18px 0 10px',
          }}>
            Perguntas ({perguntas.length})
          </div>

          {/* Lista de perguntas */}
          {perguntas.length === 0 ? (
        <div style={{
          padding: 24, background: 'var(--bg2)', borderRadius: 10,
          textAlign: 'center', color: 'var(--text3)', fontSize: 13,
        }}>
          Nenhuma pergunta ainda. Clica em um botão abaixo pra adicionar a primeira.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {perguntas.map((p, idx) => (
            <CardPergunta key={p.id ?? idx}
              pergunta={p} idx={idx} total={perguntas.length}
              onChange={(mudancas) => atualizarPergunta(idx, mudancas)}
              onMover={(d) => moverPergunta(idx, d)}
              onDuplicar={() => duplicarPergunta(idx)}
              onExcluir={() => excluirPergunta(idx)}
            />
          ))}
        </div>
      )}

      {/* Adicionar pergunta */}
      <div style={{
        marginTop: 14, padding: 12,
        background: 'var(--bg2)', borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, fontWeight: 500 }}>
          + ADICIONAR PERGUNTA
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIPOS_PERGUNTA.map(t => (
            <button key={t.id} type="button" onClick={() => adicionarPergunta(t.id)}
              title={t.ajuda}
              style={{
                fontSize: 12, padding: '6px 12px',
                background: 'var(--white)',
                border: '0.5px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--text2)',
              }}>
              <i className={`ti ${t.icone}`} aria-hidden="true"></i> {t.label}
            </button>
          ))}
        </div>
      </div>
        </>
      )}

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
        <button className="btn-outline" onClick={() => setPreviewOpen(true)}
          disabled={modo === 'visual' ? perguntas.length === 0 : !jsonText.trim()}>
          <i className="ti ti-eye" aria-hidden="true"></i> Preview
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar modelo'}
          </button>
        </div>
      </div>

      {previewOpen && (() => {
        // No modo JSON, parseia pra mostrar
        let perguntasPreview = perguntas;
        if (modo === 'json') {
          try {
            const obj = JSON.parse(jsonText);
            if (Array.isArray(obj.perguntas)) perguntasPreview = obj.perguntas;
          } catch { perguntasPreview = []; }
        }
        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(28,23,18,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110,
          }} onClick={() => setPreviewOpen(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--white)', borderRadius: 12, padding: 22,
              width: 540, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
              border: '0.5px solid var(--border)',
            }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>Preview</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>É assim que a paciente vai ver.</div>
              <div style={{ background: '#f7f3ee', borderRadius: 12, padding: '8px 0' }}>
                <CheckinForm perguntas={perguntasPreview} valores={{}} onChange={() => {}} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn-outline" onClick={() => setPreviewOpen(false)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </ModalShell>
  );
}


/* ──────────────────────────────────────────────────────────────
   CARD INDIVIDUAL DE PERGUNTA (editor visual)
   ────────────────────────────────────────────────────────────── */
function CardPergunta({ pergunta, idx, total, onChange, onMover, onDuplicar, onExcluir }) {
  const tipoInfo = TIPOS_PERGUNTA.find(t => t.id === pergunta.tipo);

  function mudarTipo(novoTipo) {
    if (novoTipo === pergunta.tipo) return;
    // Reseta opções/specs do tipo, mas mantém id, secao e pergunta
    const nova = novaPergunta(novoTipo);
    onChange({
      ...nova,
      id: pergunta.id,
      secao: pergunta.secao,
      pergunta: pergunta.pergunta,
    });
  }

  return (
    <div style={{
      border: '0.5px solid var(--border)', borderRadius: 10,
      background: 'var(--white)', padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'var(--bg2)', color: 'var(--text3)',
          fontWeight: 500,
        }}>#{idx + 1}</span>
        {tipoInfo && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 999,
            background: 'var(--amber-bg, var(--bg2))', color: 'var(--gold-deep, var(--dark))',
            fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <i className={`ti ${tipoInfo.icone}`} aria-hidden="true"></i> {tipoInfo.label}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => onMover(-1)} disabled={idx === 0}
          title="Mover pra cima"
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--text3)', opacity: idx === 0 ? 0.3 : 1,
          }}>
          <i className="ti ti-arrow-up" aria-hidden="true"></i>
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={idx === total - 1}
          title="Mover pra baixo"
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--text3)', opacity: idx === total - 1 ? 0.3 : 1,
          }}>
          <i className="ti ti-arrow-down" aria-hidden="true"></i>
        </button>
        <button type="button" onClick={onDuplicar} title="Duplicar"
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--text3)',
          }}>
          <i className="ti ti-copy" aria-hidden="true"></i>
        </button>
        <button type="button" onClick={onExcluir} title="Excluir"
          style={{
            background: 'none', border: '0.5px solid var(--red)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--red)',
          }}>
          <i className="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Seção</label>
          <input value={pergunta.secao ?? ''}
            onChange={e => onChange({ secao: e.target.value })}
            placeholder="Ex: Histórico clínico"
            style={{ fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Tipo</label>
          <select value={pergunta.tipo} onChange={e => mudarTipo(e.target.value)}
            style={{ fontSize: 13 }}>
            {TIPOS_PERGUNTA.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Pergunta</label>
      <input value={pergunta.pergunta ?? ''}
        onChange={e => onChange({ pergunta: e.target.value })}
        placeholder="Ex: Qual sua queixa principal?"
        style={{ fontSize: 13, fontWeight: 500 }} />

      {/* Specs específicos por tipo */}
      {(pergunta.tipo === 'single' || pergunta.tipo === 'multi') && (
        <EditorOpcoes
          opcoes={pergunta.opcoes ?? []}
          onChange={(opcoes) => onChange({ opcoes })}
        />
      )}

      {pergunta.tipo === 'slider' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Mínimo</label>
            <input type="number" value={pergunta.min ?? 0}
              onChange={e => onChange({ min: Number(e.target.value) })}
              style={{ fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Máximo</label>
            <input type="number" value={pergunta.max ?? 10}
              onChange={e => onChange({ max: Number(e.target.value) })}
              style={{ fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Padrão</label>
            <input type="number" value={pergunta.default ?? 5}
              onChange={e => onChange({ default: Number(e.target.value) })}
              style={{ fontSize: 13 }} />
          </div>
        </div>
      )}

      {pergunta.tipo === 'emoji_scale' && (
        <div style={{
          marginTop: 8, padding: 8, borderRadius: 8,
          background: 'var(--bg2)', fontSize: 11, color: 'var(--text3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>Escala padrão:</span>
          {EMOJIS_PADRAO.map(o => (
            <span key={o.valor} title={o.label} style={{ fontSize: 18 }}>{o.emoji}</span>
          ))}
        </div>
      )}

      {pergunta.tipo === 'texto' && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
            Placeholder (opcional)
          </label>
          <input value={pergunta.placeholder ?? ''}
            onChange={e => onChange({ placeholder: e.target.value })}
            placeholder="Ex: Conte um pouco sobre..."
            style={{ fontSize: 13 }} />
        </div>
      )}
    </div>
  );
}


function EditorOpcoes({ opcoes, onChange }) {
  function atualizarOpcao(i, valor) {
    const novo = [...opcoes];
    novo[i] = valor;
    onChange(novo);
  }
  function adicionarOpcao() {
    onChange([...opcoes, `Opção ${opcoes.length + 1}`]);
  }
  function removerOpcao(i) {
    onChange(opcoes.filter((_, j) => j !== i));
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
        Opções de resposta
      </label>
      {opcoes.map((op, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input value={typeof op === 'string' ? op : op.label ?? ''}
            onChange={e => atualizarOpcao(i, e.target.value)}
            placeholder={`Opção ${i + 1}`}
            style={{ fontSize: 13, flex: 1 }} />
          <button type="button" onClick={() => removerOpcao(i)}
            disabled={opcoes.length <= 2}
            title={opcoes.length <= 2 ? 'Precisa de pelo menos 2 opções' : 'Remover'}
            style={{
              background: 'none', border: '0.5px solid var(--border)',
              borderRadius: 6, padding: '4px 8px',
              color: 'var(--text3)', cursor: 'pointer',
              opacity: opcoes.length <= 2 ? 0.3 : 1,
            }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      ))}
      <button type="button" onClick={adicionarOpcao}
        style={{
          fontSize: 12, padding: '5px 10px',
          background: 'none', border: '0.5px dashed var(--border)',
          borderRadius: 6, color: 'var(--text3)', cursor: 'pointer',
          marginTop: 4, fontFamily: 'var(--font-sans)',
        }}>
        <i className="ti ti-plus" aria-hidden="true"></i> Adicionar opção
      </button>
    </div>
  );
}


/* ──────────────────────────────────────────────────────────────
   MODAL DE RESPOSTA (com download PDF)
   ────────────────────────────────────────────────────────────── */
function RespostaModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  const pacienteNome = envio.paciente?.nome ?? '—';

  function baixarPDF() {
    const linhas = (envio.perguntas ?? []).map(p => `
      <div style="padding: 12px 0; border-bottom: 1px solid #e3dcce;">
        <div style="font-size: 10px; letter-spacing: 1px; color: #888; text-transform: uppercase; margin-bottom: 4px;">
          ${escapeHtml(p.secao || '')}
        </div>
        <div style="font-size: 14px; color: #2b2b2b; font-weight: 500; margin-bottom: 6px;">
          ${escapeHtml(p.pergunta || '')}
        </div>
        <div style="font-size: 14px; color: #4a3828; background: #faf7f2; padding: 8px 12px; border-radius: 6px;">
          ${escapeHtml(formatarResposta(p, respostas[p.id]))}
        </div>
      </div>`).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Questionário pré-consulta · ${escapeHtml(pacienteNome)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           color: #2b2b2b; max-width: 720px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    .header { border-bottom: 2px solid #c9a96e; padding-bottom: 12px; margin-bottom: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Questionário pré-consulta</h1>
    <div class="meta">
      Paciente: <strong>${escapeHtml(pacienteNome)}</strong><br>
      Respondido em ${escapeHtml(dataBR(envio.respondido_em))}
      · Enviado em ${escapeHtml(dataBR(envio.enviado_em))}
    </div>
  </div>
  ${linhas}
  <div style="margin-top: 30px; font-size: 10px; color: #aaa; text-align: center;">
    Gerado pela Essentia
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups pra gerar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <ModalShell large title="Resposta do questionário"
      subtitle={`${pacienteNome} · respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose}>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12, marginTop: 8 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 14, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
        <button className="btn" onClick={baixarPDF}>
          <i className="ti ti-download" aria-hidden="true"></i> Baixar PDF
        </button>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}


/* ──────────────────────────────────────────────────────────────
   SHELL DO MODAL + ESCAPE
   ────────────────────────────────────────────────────────────── */
function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 600 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
