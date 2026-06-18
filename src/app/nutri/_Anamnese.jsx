import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { ANAMNESE_LAPIDARE, QFA_LAPIDARE, RECORDATORIO_LAPIDARE, formatarRespostaAnamnese } from '../../lib/anamneseDefault.js';
import DicaJSON from '../../components/DicaJSON.jsx';
import DateInput from '../../components/DateInput.jsx';

export default function Anamnese({ pacienteId, nutriId, pacienteNome }) {
  const [anamneses, setAnamneses] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [editar, setEditar] = useState(null);
  const [verResposta, setVerResposta] = useState(null);
  const [criarModelo, setCriarModelo] = useState(null);  // { modo: 'novo' | template }

  async function carregar() {
    const [aRes, tRes] = await Promise.all([
      supabase.from('anamneses').select('id, titulo, data, estrutura, respostas, template_id')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('anamnese_templates').select('id, nome, descricao, estrutura')
        .eq('nutri_id', nutriId).order('created_at'),
    ]);
    setAnamneses(aRes.data ?? []);
    setTemplates(tRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function excluir(a) {
    if (!window.confirm(`Excluir anamnese "${a.titulo}"?`)) return;
    await supabase.from('anamneses').delete().eq('id', a.id);
    carregar();
  }

  function novaDoLapidare() {
    setEditar({
      novo: true,
      titulo: ANAMNESE_LAPIDARE.nome,
      estrutura: ANAMNESE_LAPIDARE.estrutura,
      respostas: {},
      data: new Date().toISOString().slice(0, 10),
      template_id: null,
    });
  }
  function novaDoQFA() {
    setEditar({
      novo: true,
      titulo: QFA_LAPIDARE.nome,
      estrutura: QFA_LAPIDARE.estrutura,
      respostas: {},
      data: new Date().toISOString().slice(0, 10),
      template_id: null,
    });
  }
  function novaDoRecordatorio() {
    setEditar({
      novo: true,
      titulo: RECORDATORIO_LAPIDARE.nome,
      estrutura: RECORDATORIO_LAPIDARE.estrutura,
      respostas: {},
      data: new Date().toISOString().slice(0, 10),
      template_id: null,
    });
  }
  function novaDoTemplate(t) {
    setEditar({
      novo: true,
      titulo: t.nome,
      estrutura: t.estrutura,
      respostas: {},
      data: new Date().toISOString().slice(0, 10),
      template_id: t.id,
    });
  }
  function novaEmBranco() {
    setEditar({
      novo: true,
      titulo: 'Anamnese',
      estrutura: { secoes: [{ id: 's1', titulo: 'Seção 1', perguntas: [] }] },
      respostas: {},
      data: new Date().toISOString().slice(0, 10),
      template_id: null,
    });
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Anamnese de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">Registro clínico — só você vê (paciente não acessa). Baixe em PDF quando quiser.</div>
          </div>
        </div>

        <div className="card-body">
          {/* Modelos prontos */}
          <div style={{
            padding: 12, borderRadius: 8, background: 'var(--bg2)', marginBottom: 10,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
              color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
            }}>
              Começar nova com
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button className="btn" onClick={novaDoLapidare}>
                <i className="ti ti-clipboard-text" aria-hidden="true"></i> Anamnese Essentia
              </button>
              <button className="btn" onClick={novaDoQFA}>
                <i className="ti ti-list-check" aria-hidden="true"></i> QFA — Freq. Alimentar
              </button>
              <button className="btn" onClick={novaDoRecordatorio}>
                <i className="ti ti-clock-hour-4" aria-hidden="true"></i> Recordatório 24h
              </button>
              {templates.map(t => (
                <button key={t.id} className="btn-outline"
                  onClick={() => novaDoTemplate(t)}
                  style={{ fontSize: 12 }}>
                  <i className="ti ti-file-plus" aria-hidden="true"></i> {t.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Gerenciar modelos próprios */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14,
            justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn-outline" onClick={() => setCriarModelo({ modo: 'novo' })}>
                <i className="ti ti-layout-grid-add" aria-hidden="true"></i> Criar modelo próprio
              </button>
              <button className="btn-outline" onClick={() => setCriarModelo({ modo: 'json' })}>
                <i className="ti ti-code" aria-hidden="true"></i> Importar JSON
              </button>
            </div>
            {templates.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {templates.length} modelo{templates.length === 1 ? '' : 's'} próprio{templates.length === 1 ? '' : 's'}
                {' · '}
                <button onClick={() => setCriarModelo({ modo: 'lista' })}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--gold-deep)', textDecoration: 'underline',
                    fontSize: 11, padding: 0,
                  }}>
                  gerenciar
                </button>
              </div>
            )}
          </div>

          {/* Histórico */}
          {anamneses === null ? (
            <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : anamneses.length === 0 ? (
            <div className="empty-card" style={{ padding: 24 }}>
              <i className="ti ti-clipboard-text empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Nenhuma anamnese ainda</div>
              <div className="empty-sub">
                Escolha um modelo pronto acima (Anamnese Essentia ou QFA) ou comece do zero.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {anamneses.map(a => (
                <div key={a.id} className="card" style={{
                  padding: 14, display: 'flex', alignItems: 'center', gap: 12,
                  border: '0.5px solid var(--border)', background: 'var(--white)',
                  margin: 0,
                }}>
                  <i className="ti ti-clipboard-check" style={{ fontSize: 18, color: 'var(--green)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.titulo}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      Preenchida em {dataBR(a.data)}
                    </div>
                  </div>
                  <button onClick={() => setVerResposta(a)}
                    className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Ver / baixar
                  </button>
                  <button onClick={() => setEditar({ ...a, novo: false })}
                    className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                    <i className="ti ti-edit" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => excluir(a)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '4px 8px',
                      color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editar && (
        <ModalEditar a={editar}
          pacienteId={pacienteId} nutriId={nutriId} pacienteNome={pacienteNome}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); carregar(); }}
        />
      )}

      {verResposta && (
        <ModalVer a={verResposta} pacienteNome={pacienteNome}
          onClose={() => setVerResposta(null)} />
      )}

      {criarModelo && (
        <ModalCriarModelo
          contexto={criarModelo}
          templates={templates}
          nutriId={nutriId}
          onClose={() => setCriarModelo(null)}
          onSaved={() => { setCriarModelo(null); carregar(); }}
        />
      )}
    </>
  );
}


/* ──────────────────────────────────────────────────────────────
   EDITOR — Preenche/edita uma anamnese
   ────────────────────────────────────────────────────────────── */
function ModalEditar({ a, pacienteId, nutriId, pacienteNome, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(a.titulo);
  const [data, setData] = useState(a.data);
  const [respostas, setRespostas] = useState(a.respostas ?? {});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function setResp(id, valor) {
    setRespostas(r => ({ ...r, [id]: valor }));
  }
  function toggleMulti(id, opcao) {
    setRespostas(r => {
      const atual = Array.isArray(r[id]) ? r[id] : [];
      const novo = atual.includes(opcao) ? atual.filter(o => o !== opcao) : [...atual, opcao];
      return { ...r, [id]: novo };
    });
  }

  async function salvar() {
    setErro(null);
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    if (a.novo) {
      const { error } = await supabase.from('anamneses').insert({
        paciente_id: pacienteId, nutri_id: nutriId,
        titulo: titulo.trim(),
        estrutura: a.estrutura, respostas, data,
        template_id: a.template_id ?? null,
      });
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    } else {
      const { error } = await supabase.from('anamneses').update({
        titulo: titulo.trim(), respostas, data,
        updated_at: new Date().toISOString(),
      }).eq('id', a.id);
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    }
    setBusy(false);
    onSaved();
  }

  async function salvarComoModelo() {
    const nome = window.prompt('Nome do modelo:', titulo);
    if (!nome?.trim()) return;
    const { error } = await supabase.from('anamnese_templates').insert({
      nutri_id: nutriId,
      nome: nome.trim(),
      estrutura: a.estrutura,
    });
    if (error) alert('Erro: ' + error.message);
    else alert('Modelo salvo! Aparece na lista quando criar uma nova anamnese.');
  }

  return (
    <ModalShell large title={a.novo ? 'Nova anamnese' : `Editar: ${a.titulo}`}
      subtitle={`Paciente: ${pacienteNome}`}
      onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label className="form-lbl">Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>
        <div>
          <label className="form-lbl">Data</label>
          <DateInput value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      {/* Seções e perguntas */}
      {a.estrutura?.secoes?.map(s => (
        <div key={s.id} style={{
          marginBottom: 14, padding: 14, borderRadius: 10,
          background: 'var(--bg2)', border: '0.5px solid var(--border)',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--gold-deep)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
          }}>{s.titulo}</div>

          {s.perguntas?.map(p => (
            <div key={p.id} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--dark)', display: 'block', marginBottom: 4 }}>
                {p.pergunta}
              </label>

              {p.tipo === 'texto' && (
                <textarea value={respostas[p.id] ?? ''}
                  onChange={e => setResp(p.id, e.target.value)}
                  rows={p.rows ?? 2}
                  placeholder={p.placeholder ?? ''}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
              )}

              {p.tipo === 'numero' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" step="0.01" value={respostas[p.id] ?? ''}
                    onChange={e => setResp(p.id, e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ fontSize: 13, width: 140 }} />
                  {p.unidade && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{p.unidade}</span>}
                </div>
              )}

              {p.tipo === 'single' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.opcoes?.map(op => {
                    const ativo = respostas[p.id] === op;
                    return (
                      <button key={op} type="button" onClick={() => setResp(p.id, op)}
                        style={{
                          padding: '6px 12px', fontSize: 12,
                          background: ativo ? 'var(--dark)' : 'var(--white)',
                          color: ativo ? '#fff' : 'var(--text2)',
                          border: `0.5px solid ${ativo ? 'var(--dark)' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                        }}>
                        {op}
                      </button>
                    );
                  })}
                </div>
              )}

              {p.tipo === 'multi' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.opcoes?.map(op => {
                    const arr = Array.isArray(respostas[p.id]) ? respostas[p.id] : [];
                    const ativo = arr.includes(op);
                    return (
                      <button key={op} type="button" onClick={() => toggleMulti(p.id, op)}
                        style={{
                          padding: '6px 12px', fontSize: 12,
                          background: ativo ? 'var(--green-bg, var(--bg2))' : 'var(--white)',
                          color: ativo ? 'var(--green, var(--dark))' : 'var(--text2)',
                          border: `0.5px solid ${ativo ? 'var(--green, var(--border))' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: ativo ? 500 : 400,
                        }}>
                        {ativo ? '✓ ' : ''}{op}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
        {a.novo && (
          <button className="btn-outline" onClick={salvarComoModelo}>
            <i className="ti ti-template" aria-hidden="true"></i> Salvar estrutura como modelo
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar anamnese'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


/* ──────────────────────────────────────────────────────────────
   VER + BAIXAR PDF
   ────────────────────────────────────────────────────────────── */
function ModalVer({ a, pacienteNome, onClose }) {
  const respostas = a.respostas ?? {};

  function baixarPDF() {
    const secoesHtml = (a.estrutura?.secoes ?? []).map(s => {
      const perguntasHtml = (s.perguntas ?? []).map(p => `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #2b2b2b; font-weight: 500; margin-bottom: 4px;">
            ${escapeHtml(p.pergunta)}
          </div>
          <div style="font-size: 13px; color: #4a3828; background: #faf7f2; padding: 8px 12px; border-radius: 4px;">
            ${escapeHtml(formatarRespostaAnamnese(p, respostas[p.id]))}
          </div>
        </div>`).join('');
      return `
        <div style="margin-bottom: 22px; page-break-inside: avoid;">
          <h2 style="font-size: 13px; color: #a08456; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e3dcce; padding-bottom: 6px; margin-bottom: 12px;">
            ${escapeHtml(s.titulo)}
          </h2>
          ${perguntasHtml}
        </div>`;
    }).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Anamnese · ${escapeHtml(pacienteNome ?? '—')}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           color: #2b2b2b; max-width: 720px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    .header { border-bottom: 2px solid #c9a96e; padding-bottom: 12px; margin-bottom: 22px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(a.titulo)}</h1>
    <div class="meta">
      Paciente: <strong>${escapeHtml(pacienteNome ?? '—')}</strong><br>
      Data: ${escapeHtml(dataBR(a.data))}
    </div>
  </div>
  ${secoesHtml}
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
    <ModalShell large title={a.titulo}
      subtitle={`${pacienteNome} · ${dataBR(a.data)}`}
      onClose={onClose}>
      {(a.estrutura?.secoes ?? []).map(s => (
        <div key={s.id} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--gold-deep)', fontWeight: 600, marginBottom: 8,
            borderBottom: '0.5px solid var(--border)', paddingBottom: 4,
          }}>{s.titulo}</div>
          {(s.perguntas ?? []).map(p => (
            <div key={p.id} style={{
              padding: '8px 0', borderBottom: '0.5px solid #e3dcce',
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--dark)', marginBottom: 3 }}>
                {p.pergunta}
              </div>
              <div style={{
                fontSize: 13, color: 'var(--ink-soft, #4a3828)',
                background: 'var(--bg2)', padding: '6px 10px', borderRadius: 4,
              }}>
                {formatarRespostaAnamnese(p, respostas[p.id])}
              </div>
            </div>
          ))}
        </div>
      ))}

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
   SHELL + HELPERS
   ────────────────────────────────────────────────────────────── */
function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 720 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/* ──────────────────────────────────────────────────────────────
   CONSTRUTOR DE MODELO (visual + JSON + gerenciar)
   ────────────────────────────────────────────────────────────── */

const TIPOS_PERGUNTA = [
  { id: 'texto',  label: 'Resposta escrita', icone: 'ti-align-left' },
  { id: 'numero', label: 'Número',           icone: 'ti-numbers' },
  { id: 'single', label: 'Escolha única',    icone: 'ti-circle-dot' },
  { id: 'multi',  label: 'Múltipla escolha', icone: 'ti-checkbox' },
];

function novoIdLocal(prefix = 'i') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function novaPergunta(tipo = 'texto') {
  const p = { id: novoIdLocal('p'), pergunta: '', tipo };
  if (tipo === 'single' || tipo === 'multi') p.opcoes = ['Opção 1', 'Opção 2'];
  if (tipo === 'numero') p.unidade = '';
  if (tipo === 'texto')  p.rows = 2;
  return p;
}
function novaSecao() {
  return { id: novoIdLocal('s'), titulo: 'Nova seção', perguntas: [] };
}
function validarEstrutura(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'Estrutura inválida' };
  if (!Array.isArray(obj.secoes) || obj.secoes.length === 0)
    return { ok: false, erro: 'Adicione pelo menos uma seção' };
  for (const s of obj.secoes) {
    if (!s.id || !s.titulo) return { ok: false, erro: 'Seção sem id ou título' };
    if (!Array.isArray(s.perguntas)) return { ok: false, erro: `Seção "${s.titulo}" sem perguntas` };
    for (const p of s.perguntas) {
      if (!p.id || !p.pergunta || !p.tipo) return { ok: false, erro: `Pergunta inválida em "${s.titulo}"` };
      if (!['texto','numero','single','multi'].includes(p.tipo))
        return { ok: false, erro: `Tipo "${p.tipo}" inválido` };
      if ((p.tipo === 'single' || p.tipo === 'multi') && (!Array.isArray(p.opcoes) || p.opcoes.length === 0))
        return { ok: false, erro: `Pergunta "${p.pergunta}" sem opções` };
    }
  }
  return { ok: true };
}


function ModalCriarModelo({ contexto, templates, nutriId, onClose, onSaved }) {
  // contexto.modo = 'novo' | 'json' | 'lista' | template existente
  const editandoExistente = contexto?.id;
  const inicialJson = contexto.modo === 'json' || editandoExistente;

  const [tab, setTab] = useState(
    contexto.modo === 'lista' ? 'lista' : (inicialJson ? 'json' : 'visual')
  );
  const [nome, setNome]       = useState(editandoExistente ? contexto.nome : '');
  const [descricao, setDesc]  = useState(editandoExistente ? (contexto.descricao ?? '') : '');
  const [secoes, setSecoes]   = useState(editandoExistente ? (contexto.estrutura?.secoes ?? []) : []);
  const [jsonText, setJson]   = useState(editandoExistente
    ? JSON.stringify({ nome: contexto.nome, descricao: contexto.descricao, estrutura: contexto.estrutura }, null, 2)
    : '');
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  function trocarTab(novo) {
    setErro(null);
    if (novo === tab) return;
    // Visual → JSON: serializa
    if (tab === 'visual' && novo === 'json') {
      setJson(JSON.stringify({ nome, descricao: descricao || undefined, estrutura: { secoes } }, null, 2));
    }
    // JSON → Visual: parseia
    if (tab === 'json' && novo === 'visual') {
      try {
        const obj = JSON.parse(jsonText);
        const v = validarEstrutura(obj.estrutura);
        if (!v.ok) { setErro('JSON inválido: ' + v.erro); return; }
        setNome(obj.nome ?? '');
        setDesc(obj.descricao ?? '');
        setSecoes(obj.estrutura.secoes);
      } catch (e) { setErro('JSON inválido: ' + e.message); return; }
    }
    setTab(novo);
  }

  async function salvar() {
    setErro(null);
    let payload;
    if (tab === 'json') {
      try {
        const obj = JSON.parse(jsonText);
        const v = validarEstrutura(obj.estrutura);
        if (!v.ok) return setErro(v.erro);
        if (!obj.nome?.trim()) return setErro('Informe um nome.');
        payload = { nome: obj.nome.trim(), descricao: obj.descricao ?? null, estrutura: obj.estrutura };
      } catch (e) { return setErro('JSON inválido: ' + e.message); }
    } else {
      if (!nome.trim()) return setErro('Informe um nome.');
      const v = validarEstrutura({ secoes });
      if (!v.ok) return setErro(v.erro);
      payload = { nome: nome.trim(), descricao: descricao.trim() || null, estrutura: { secoes } };
    }

    setBusy(true);
    if (editandoExistente) {
      const { error } = await supabase.from('anamnese_templates')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', contexto.id);
      if (error) { setBusy(false); return setErro(error.message); }
    } else {
      const { error } = await supabase.from('anamnese_templates')
        .insert({ ...payload, nutri_id: nutriId });
      if (error) { setBusy(false); return setErro(error.message); }
    }
    setBusy(false);
    onSaved();
  }

  async function excluirTemplate(t) {
    if (!window.confirm(`Excluir modelo "${t.nome}"?`)) return;
    await supabase.from('anamnese_templates').delete().eq('id', t.id);
    onSaved();
  }

  // ─── Gerenciar lista ───
  if (tab === 'lista') {
    return (
      <ModalShell large title="Seus modelos de anamnese" onClose={onClose}>
        {templates.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
            Nenhum modelo próprio ainda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 12, borderRadius: 8,
                border: '0.5px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{t.nome}</div>
                  {t.descricao && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.descricao}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {t.estrutura?.secoes?.length ?? 0} seções
                  </div>
                </div>
                <button onClick={() => {
                  // troca pro modo edit
                  Object.assign(contexto, { ...t, modo: undefined });
                  setTab('visual');
                  setNome(t.nome);
                  setDesc(t.descricao ?? '');
                  setSecoes(t.estrutura?.secoes ?? []);
                }} className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
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
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn-outline" onClick={onClose}>Fechar</button>
        </div>
      </ModalShell>
    );
  }

  // ─── Editor (visual ou JSON) ───
  return (
    <ModalShell large
      title={editandoExistente ? `Editar modelo: ${contexto.nome}` : 'Criar modelo próprio'}
      subtitle="Defina seções e perguntas. Depois fica disponível pra usar em qualquer paciente."
      onClose={onClose}>

      {/* Toggle visual/json */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 8, padding: 3, marginBottom: 14, maxWidth: 320,
      }}>
        {[
          { id: 'visual', label: 'Editor visual', icone: 'ti-layout-grid' },
          { id: 'json',   label: 'Importar JSON', icone: 'ti-code' },
        ].map(m => (
          <button key={m.id} type="button" onClick={() => trocarTab(m.id)}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: 'none', cursor: 'pointer',
              color: tab === m.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === m.id ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className={`ti ${m.icone}`} aria-hidden="true"></i> {m.label}
          </button>
        ))}
      </div>

      {tab === 'json' ? (
        <>
          <label className="form-lbl">JSON do modelo</label>
          <textarea rows={18} value={jsonText} onChange={e => setJson(e.target.value)}
            placeholder='{"nome": "...", "estrutura": {"secoes": [...]}}'
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Estrutura: <code>{`{ nome, estrutura: { secoes: [{ id, titulo, perguntas: [{ id, tipo, pergunta, opcoes? }] }] } }`}</code>
            <br />Tipos válidos: <code>texto, numero, single, multi</code>
          </div>
          <DicaJSON
            alvoVisual="Editor visual"
            exemploPrompt='gera um JSON de anamnese pediátrica pra nutricionista, com seções (História gestacional, Aleitamento, Alimentação atual, Hábitos, Exames). Estrutura: { "nome": "Anamnese pediátrica", "estrutura": { "secoes": [{ "id": "...", "titulo": "...", "perguntas": [{ "id": "...", "tipo": "texto|numero|single|multi", "pergunta": "...", "opcoes": ["..."] }] }] } }' />
        </>
      ) : (
        <>
          <label className="form-lbl">Nome do modelo</label>
          <input value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Ex: Anamnese pediátrica, Anamnese esportiva, etc." />

          <label className="form-lbl" style={{ marginTop: 10 }}>Descrição (opcional)</label>
          <input value={descricao} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Pra pacientes de 0 a 12 anos" />

          {/* Seções */}
          <div style={{
            fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, margin: '18px 0 10px',
          }}>Seções ({secoes.length})</div>

          {secoes.length === 0 ? (
            <div style={{
              padding: 20, background: 'var(--bg2)', borderRadius: 8,
              textAlign: 'center', color: 'var(--text3)', fontSize: 13,
            }}>
              Nenhuma seção ainda. Clica em "+ Nova seção" abaixo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {secoes.map((s, sIdx) => (
                <SecaoEditor key={s.id} secao={s} idx={sIdx} total={secoes.length}
                  onChange={mudancas => setSecoes(arr => arr.map((x, i) => i === sIdx ? { ...x, ...mudancas } : x))}
                  onMover={delta => setSecoes(arr => {
                    const novo = [...arr]; const i2 = sIdx + delta;
                    if (i2 < 0 || i2 >= novo.length) return arr;
                    [novo[sIdx], novo[i2]] = [novo[i2], novo[sIdx]];
                    return novo;
                  })}
                  onExcluir={() => {
                    if (!window.confirm(`Excluir seção "${s.titulo}" com ${s.perguntas?.length ?? 0} perguntas?`)) return;
                    setSecoes(arr => arr.filter((_, i) => i !== sIdx));
                  }}
                />
              ))}
            </div>
          )}

          <button type="button" onClick={() => setSecoes(arr => [...arr, novaSecao()])}
            style={{
              marginTop: 10, padding: '8px 14px',
              background: 'none', border: '0.5px dashed var(--border)',
              borderRadius: 8, cursor: 'pointer', fontSize: 13,
              color: 'var(--text2)', fontFamily: 'var(--font-sans)',
            }}>
            <i className="ti ti-plus" aria-hidden="true"></i> Nova seção
          </button>
        </>
      )}

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar modelo'}
        </button>
      </div>
    </ModalShell>
  );
}


function SecaoEditor({ secao, idx, total, onChange, onMover, onExcluir }) {
  function addPergunta(tipo) {
    onChange({ perguntas: [...(secao.perguntas ?? []), novaPergunta(tipo)] });
  }
  function atualizarPergunta(pIdx, mudancas) {
    onChange({
      perguntas: secao.perguntas.map((p, i) => i === pIdx ? { ...p, ...mudancas } : p),
    });
  }
  function moverPergunta(pIdx, delta) {
    const novo = [...secao.perguntas];
    const i2 = pIdx + delta;
    if (i2 < 0 || i2 >= novo.length) return;
    [novo[pIdx], novo[i2]] = [novo[i2], novo[pIdx]];
    onChange({ perguntas: novo });
  }
  function removerPergunta(pIdx) {
    onChange({ perguntas: secao.perguntas.filter((_, i) => i !== pIdx) });
  }
  function mudarTipoPergunta(pIdx, novoTipo) {
    const original = secao.perguntas[pIdx];
    if (novoTipo === original.tipo) return;
    const nova = novaPergunta(novoTipo);
    atualizarPergunta(pIdx, { ...nova, id: original.id, pergunta: original.pergunta });
  }

  return (
    <div style={{
      border: '0.5px solid var(--border)', borderRadius: 10,
      background: 'var(--white)', padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 500,
        }}>Seção {idx + 1}</span>
        <input value={secao.titulo}
          onChange={e => onChange({ titulo: e.target.value })}
          placeholder="Título da seção"
          style={{ flex: 1, fontSize: 13, fontWeight: 500, margin: 0 }} />
        <button type="button" onClick={() => onMover(-1)} disabled={idx === 0}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--text3)', opacity: idx === 0 ? 0.3 : 1,
          }}>
          <i className="ti ti-arrow-up" aria-hidden="true"></i>
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={idx === total - 1}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
            color: 'var(--text3)', opacity: idx === total - 1 ? 0.3 : 1,
          }}>
          <i className="ti ti-arrow-down" aria-hidden="true"></i>
        </button>
        <button type="button" onClick={onExcluir}
          style={{
            background: 'none', border: '0.5px solid var(--red)',
            borderRadius: 6, padding: '3px 6px', color: 'var(--red)', cursor: 'pointer',
          }}>
          <i className="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>

      {/* Perguntas */}
      {secao.perguntas?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {secao.perguntas.map((p, pIdx) => {
            const tInfo = TIPOS_PERGUNTA.find(t => t.id === p.tipo);
            return (
              <div key={p.id ?? pIdx} style={{
                padding: 10, borderRadius: 8,
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <select value={p.tipo} onChange={e => mudarTipoPergunta(pIdx, e.target.value)}
                    style={{ fontSize: 11, width: 'auto', margin: 0, padding: '3px 6px' }}>
                    {TIPOS_PERGUNTA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => moverPergunta(pIdx, -1)} disabled={pIdx === 0}
                    style={{
                      background: 'none', border: '0.5px solid var(--border)',
                      borderRadius: 4, padding: '2px 5px', cursor: 'pointer',
                      color: 'var(--text3)', opacity: pIdx === 0 ? 0.3 : 1, fontSize: 11,
                    }}>
                    <i className="ti ti-arrow-up" aria-hidden="true"></i>
                  </button>
                  <button type="button" onClick={() => moverPergunta(pIdx, 1)}
                    disabled={pIdx === secao.perguntas.length - 1}
                    style={{
                      background: 'none', border: '0.5px solid var(--border)',
                      borderRadius: 4, padding: '2px 5px', cursor: 'pointer',
                      color: 'var(--text3)', opacity: pIdx === secao.perguntas.length - 1 ? 0.3 : 1, fontSize: 11,
                    }}>
                    <i className="ti ti-arrow-down" aria-hidden="true"></i>
                  </button>
                  <button type="button" onClick={() => removerPergunta(pIdx)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 4, padding: '2px 5px', color: 'var(--red)', cursor: 'pointer', fontSize: 11,
                    }}>
                    <i className="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>

                <input value={p.pergunta ?? ''}
                  onChange={e => atualizarPergunta(pIdx, { pergunta: e.target.value })}
                  placeholder="Texto da pergunta"
                  style={{ fontSize: 13, margin: 0 }} />

                {(p.tipo === 'single' || p.tipo === 'multi') && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Opções de resposta</div>
                    {(p.opcoes ?? []).map((op, opIdx) => (
                      <div key={opIdx} style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                        <input value={op} onChange={e => {
                          const novo = [...p.opcoes]; novo[opIdx] = e.target.value;
                          atualizarPergunta(pIdx, { opcoes: novo });
                        }} style={{ fontSize: 12, flex: 1, margin: 0 }} />
                        <button type="button" disabled={p.opcoes.length <= 2}
                          onClick={() => atualizarPergunta(pIdx, { opcoes: p.opcoes.filter((_, i) => i !== opIdx) })}
                          style={{
                            background: 'none', border: '0.5px solid var(--border)',
                            borderRadius: 4, padding: '2px 6px',
                            color: 'var(--text3)', cursor: 'pointer',
                            opacity: p.opcoes.length <= 2 ? 0.3 : 1, fontSize: 11,
                          }}>
                          <i className="ti ti-x" aria-hidden="true"></i>
                        </button>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => atualizarPergunta(pIdx, { opcoes: [...(p.opcoes ?? []), `Opção ${(p.opcoes?.length ?? 0) + 1}`] })}
                      style={{
                        fontSize: 11, padding: '3px 8px',
                        background: 'none', border: '0.5px dashed var(--border)',
                        borderRadius: 4, color: 'var(--text3)', cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}>
                      <i className="ti ti-plus" aria-hidden="true"></i> opção
                    </button>
                  </div>
                )}

                {p.tipo === 'numero' && (
                  <input value={p.unidade ?? ''}
                    onChange={e => atualizarPergunta(pIdx, { unidade: e.target.value })}
                    placeholder="Unidade (ex: kg, L, anos)"
                    style={{ fontSize: 12, marginTop: 6 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Botões de adicionar pergunta */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TIPOS_PERGUNTA.map(t => (
          <button key={t.id} type="button" onClick={() => addPergunta(t.id)}
            style={{
              fontSize: 11, padding: '4px 8px',
              background: 'var(--white)', border: '0.5px solid var(--border)',
              borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              color: 'var(--text2)',
            }}>
            <i className={`ti ${t.icone}`} aria-hidden="true"></i> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
