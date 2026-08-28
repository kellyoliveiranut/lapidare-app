import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { callAnthropicComRetry, lerPdfBase64 } from '../../lib/anthropic.js';
import { dataBR } from '../../lib/utils.js';
import TreinoDias from './_TreinoDias.jsx';

const TIPOS = [
  'Aeróbico (caminhada, bicicleta ergométrica)',
  'Força/Resistência (musculação leve, faixas elásticas)',
  'Flexibilidade (alongamento, yoga, pilates)',
  'Mobilidade articular',
  'Respiratório',
  'Combinado (aeróbico + força)',
];
const INTENSIDADES = ['Leve', 'Moderada', 'Moderada-alta'];
const FREQUENCIAS  = [1, 2, 3, 4, 5];
const DURACOES     = [10, 15, 20, 30, 45, 60];
const FASES = [
  'Durante quimioterapia',
  'Durante radioterapia',
  'Pré-cirúrgico',
  'Pós-cirúrgico',
  'Pós-tratamento / Sobrevivente',
];
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const VIDEOS_SUGERIDOS = [
  { label: 'Alongamento oncologia',      url: 'https://www.youtube.com/results?search_query=alongamento+pacientes+cancer+oncologia+portugues' },
  { label: 'Caminhada e exercício leve', url: 'https://www.youtube.com/results?search_query=exercicio+leve+pacientes+oncologicos+portugues' },
  { label: 'Yoga oncológico',            url: 'https://www.youtube.com/results?search_query=yoga+pacientes+oncologicos+portugues' },
  { label: 'Faixa elástica força',       url: 'https://www.youtube.com/results?search_query=exercicios+faixa+elastica+cancer+reabilitacao' },
  { label: 'Exercícios respiratórios',   url: 'https://www.youtube.com/results?search_query=exercicios+respiratorios+oncologia+portugues' },
];

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/* ── Import de plano por PDF: leitura por IA ── */

const PROMPT_TREINO_PDF = `Você vai analisar um PDF de plano de treino (prescrição de educador físico ou personal) e extrair o cabeçalho do plano e a divisão em dias com os exercícios de cada um.

Retorne um OBJETO JSON puro (sem nenhum texto fora do objeto).

═══ REGRA GERAL ═══
- Se um valor não estiver no documento, OMITA a chave — NÃO invente e NÃO escreva null.
- Copie séries, repetições, carga e intervalo LITERALMENTE como estão escritos ("3", "3-4", "12/10/8", "até a falha", "30s", "RPE 7"). NÃO converta para número, NÃO padronize, NÃO arredonde.

═══ FORMATO ═══
{
  plano: {
    tipo: ESCOLHA EXATAMENTE UM desta lista:
      ${TIPOS.map(t => `"${t}"`).join('\n      ')}
    intensidade: "Leve" | "Moderada" | "Moderada-alta"
    frequencia_semanal: 1|2|3|4|5
    duracao_minutos: 10|15|20|30|45|60 (o mais próximo do documento)
    fase_tratamento: EXATAMENTE UM desta lista:
      ${FASES.map(f => `"${f}"`).join('\n      ')}
    divisao: string (ex: "A/B", "ABC", "Full body")
    contexto_clinico: string (situação clínica que o plano assume, no máximo 2 frases)
    local_equipamentos: string (onde treina e com o quê, no máximo 1 frase)
    objetivo_treino: string (no máximo 1 frase)
    precaucoes: string (no máximo 2 frases)
    progressao: string (no máximo 2 frases)
    observacoes: string (no máximo 2 frases)
  },
  dias: [
    {
      nome: string (rótulo do documento: "Treino A", "Superiores"...)
      dias_semana: array de strings — SOMENTE destes valores, com o acento exato: ${DIAS.map(d => `"${d}"`).join(' ')}
      exercicios: [ ARRAY DE ARRAYS — veja abaixo ]
    }
  ]
}

═══ ECONOMIA DE SAÍDA — SIGA À RISCA ═══
1. OMITA a chave inteira quando não houver valor. NÃO escreva "campo": null
   nem "campo": "". Chave ausente já significa "não informado".
2. Cada exercício é um ARRAY DE STRINGS, nesta ordem exata, NUNCA um objeto:
      [nome, series, repeticoes, carga_ou_intensidade, intervalo, observacao]
   Exemplo: ["Agachamento livre", "3", "12/10/8", "20kg", "60s"]
   PODE ENCURTAR o array quando os últimos campos não existirem — o exemplo
   acima tem 5 posições porque não havia observação. Um exercício só com nome
   e séries é ["Remada baixa", "3"].
   Posição intermediária vazia usa "" para não desalinhar as seguintes:
   ["Prancha", "", "30s"] = sem séries, 30s de repetição/tempo.

Se o plano não tiver divisão em dias, devolva dias: [] — não invente "Treino A".

Retorne SOMENTE o objeto JSON.`;

// Haiku 4.5 SÓ aqui: esta chamada estourava o timeout da Netlify (32,2s, 504)
// e a geração é a fatia cara — a leitura do PDF mede 3,8s. As outras cinco
// telas omitem `model` e seguem no padrão do servidor.
async function chamarTreinoPdf(base64) {
  const text = await callAnthropicComRetry([
    {
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: PROMPT_TREINO_PDF },
      ],
    },
  ], { maxTokens: 8192, model: 'claude-haiku-4-5' });
  // A IA às vezes cerca a resposta em bloco de código — mesmo tratamento do
  // chamarShaped em PacientePerfil.jsx.
  const parsed = JSON.parse(text.replace(/```(?:json)?\n?/g, '').trim());
  return {
    plano: parsed?.plano ?? {},
    dias: Array.isArray(parsed?.dias) ? parsed.dias.filter(Boolean) : [],
  };
}

// Um <select> com value fora das <option> renderiza VAZIO — mesmo modo de
// falha documentado no Agenda.jsx. Enumerar a lista no prompt não é garantia:
// estas duas funções é que garantem.
const naLista = (v, lista, padrao) => lista.includes(v) ? v : padrao;
const maisProximo = (v, lista, padrao) => Number.isFinite(Number(v))
  ? lista.reduce((a, b) => Math.abs(b - Number(v)) < Math.abs(a - Number(v)) ? b : a)
  : padrao;

// Devolve só as chaves do form que dá para preencher; o resto fica como está.
function mapPlanoParaForm(p = {}) {
  const txt = v => (typeof v === 'string' && v.trim()) ? v.trim() : '';
  return {
    tipo:               naLista(p.tipo, TIPOS, TIPOS[0]),
    intensidade:        naLista(p.intensidade, INTENSIDADES, 'Leve'),
    frequencia_semanal: maisProximo(p.frequencia_semanal, FREQUENCIAS, 3),
    duracao_minutos:    maisProximo(p.duracao_minutos, DURACOES, 30),
    fase_tratamento:    naLista(p.fase_tratamento, FASES, ''),
    objetivo_treino:    txt(p.objetivo_treino),
    precaucoes:         txt(p.precaucoes),
    progressao:         txt(p.progressao),
    observacoes:        txt(p.observacoes),
    contexto_clinico:   txt(p.contexto_clinico),
    local_equipamentos: txt(p.local_equipamentos),
    divisao:            txt(p.divisao),
  };
}

// O prompt pede o exercício como ARRAY POSICIONAL — seis nomes de chave por
// exercício era a maior fatia da saída, e a saída é o que dita a latência (a
// chamada de 32,2s estourou o timeout da Netlify). A ordem das posições é a
// mesma declarada no prompt, e o array pode vir CURTO quando os últimos campos
// não existem.
//
// O ramo do objeto continua aceito de propósito: se o modelo escorregar para o
// formato antigo, a importação degrada em vez de quebrar.
const ORDEM_EX = ['nome', 'series', 'repeticoes', 'intensidade', 'intervalo', 'observacao'];

function normalizarExercicio(e) {
  const bruto = Array.isArray(e)
    ? Object.fromEntries(ORDEM_EX.map((k, i) => [k, e[i]]))
    : (e ?? {});
  const txt = v => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  return {
    nome: txt(bruto.nome),
    series: txt(bruto.series),
    repeticoes: txt(bruto.repeticoes),
    intensidade: txt(bruto.intensidade),
    intervalo: txt(bruto.intervalo),
    observacao: txt(bruto.observacao),
  };
}

// Os dias_semana da IA passam pelo mesmo crivo: sigla fora da lista é
// descartada em vez de virar chip fantasma no editor.
function normalizarDias(dias) {
  return (dias ?? []).map(d => ({
    nome: (d?.nome ?? '').trim() || 'Treino',
    dias_semana: (Array.isArray(d?.dias_semana) ? d.dias_semana : []).filter(x => DIAS.includes(x)),
    exercicios: (Array.isArray(d?.exercicios) ? d.exercicios : [])
      .map(normalizarExercicio)
      .filter(e => e.nome),   // exercício sem nome não tem o que conferir
  }));
}

const form0 = () => ({
  tipo: TIPOS[0],
  intensidade: 'Leve',
  frequencia_semanal: 3,
  duracao_minutos: 30,
  fase_tratamento: '',
  dias_semana: [],
  // As três da migration 2026-08-25. O PDF costuma trazer as três no
  // cabeçalho; sem campo no form, o que a IA lê se perderia em silêncio.
  contexto_clinico: '',
  local_equipamentos: '',
  divisao: '',
  objetivo_treino: '',
  precaucoes: '',
  progressao: '',
  observacoes: '',
  video_url: '',
  data_liberacao_video: '',
});

export default function Treinos({ pacienteId, nutriId, pacienteNome }) {
  const [treinos, setTreinos] = useState(null);
  const [form, setForm] = useState(form0());
  const [busy, setBusy] = useState(false);
  // `feedback` é do PUBLICAR e mora no rodapé, ao lado do botão dele.
  // `feedbackPdf` é do IMPORTAR e mora junto do botão de importar, lá em cima:
  // a leitura do PDF pode levar meia dúzia de segundos, e o retorno aparecia
  // a ~220 linhas de JSX de distância, provavelmente fora da tela.
  const [feedback, setFeedback] = useState(null);
  const [feedbackPdf, setFeedbackPdf] = useState(null);
  const [ascoOpen, setAscoOpen] = useState(false);
  const [erroLista, setErroLista] = useState(null);
  // Treino cujo editor de dias/exercícios está aberto. Recebe o treino inteiro
  // (não só o id) porque o modal mostra tipo e data no cabeçalho.
  const [editorTreino, setEditorTreino] = useState(null);
  // Dias vindos do PDF, semeados no editor quando ele abrir. Null em qualquer
  // outro caminho — e é isso que faz o editor ler do banco no caso normal.
  const [editorRascunho, setEditorRascunho] = useState(null);
  // Segura os dias lidos do PDF entre o import e o Publicar. Some depois, para
  // um PDF alimentar UMA publicação.
  const [rascunhoPdf, setRascunhoPdf] = useState(null);
  const [importando, setImportando] = useState(false);
  const pdfRef = useRef(null);

  // O aninhado traz só ids, para o cartão poder mostrar "2 dias, 11
  // exercícios" sem uma query por linha. São poucas linhas por paciente.
  async function carregar() {
    const { data } = await supabase
      .from('treinos_prescritos')
      .select('*, treinos_dias(id, treinos_exercicios(id))')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    setTreinos(data ?? []);
  }

  useEffect(() => { carregar(); }, [pacienteId]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDia = dia => setForm(f => ({
    ...f,
    dias_semana: f.dias_semana.includes(dia)
      ? f.dias_semana.filter(d => d !== dia)
      : [...f.dias_semana, dia],
  }));

  // O PDF preenche o CABEÇALHO (o form abaixo) e guarda os dias para depois:
  // eles só existem quando houver um treino_id, e o treino só nasce no
  // Publicar. É o mesmo fluxo de dois passos do formulário manual.
  async function importarTreinoPdf(file) {
    setImportando(true);
    setFeedbackPdf(null);
    try {
      const base64 = await lerPdfBase64(file);
      const { plano, dias } = await chamarTreinoPdf(base64);
      const limpos = normalizarDias(dias);
      setForm(f => ({ ...f, ...mapPlanoParaForm(plano) }));
      setRascunhoPdf(limpos);
      const nEx = limpos.reduce((n, d) => n + d.exercicios.length, 0);
      setFeedbackPdf({
        tipo: 'ok',
        msg: `Plano lido: ${limpos.length} dia(s), ${nEx} exercício(s). Confira o cabeçalho e publique — os dias abrem para conferência em seguida.`,
      });
    } catch (err) {
      console.error('[importarTreinoPdf]', err);
      setFeedbackPdf({ tipo: 'erro', msg: 'Erro ao ler o PDF: ' + (err?.message ?? 'tente novamente') });
    } finally {
      setImportando(false);
      if (pdfRef.current) pdfRef.current.value = '';
    }
  }

  // Publicar aposenta os planos anteriores desta paciente. A ordem é
  // deliberada: INSERT primeiro, desativação depois.
  //
  // Se desativasse antes e o insert falhasse, ela ficaria sem NENHUM plano
  // ativo — a tela de treinos dela esvaziaria. Nesta ordem, um update que
  // falhe deixa dois ativos, e paciente/Treinos.jsx pega o mais recente, que é
  // justamente o novo. Por isso o erro do update avisa e não aborta.
  async function publicar() {
    setFeedback(null);
    // Limpa o retorno do import junto: nesse momento o rascunho do PDF foi
    // consumido, e "Plano lido: 3 dia(s)" ficaria pendurado lá em cima
    // descrevendo algo que já virou treino publicado.
    setFeedbackPdf(null);
    setBusy(true);
    const { data: novo, error } = await supabase.from('treinos_prescritos').insert({
      paciente_id:      pacienteId,
      nutri_id:         nutriId,
      tipo:             form.tipo,
      intensidade:      form.intensidade,
      frequencia_semanal: form.frequencia_semanal,
      duracao_minutos:  form.duracao_minutos,
      fase_tratamento:  form.fase_tratamento || null,
      dias_semana:      form.dias_semana.length ? form.dias_semana : null,
      contexto_clinico:   form.contexto_clinico.trim() || null,
      local_equipamentos: form.local_equipamentos.trim() || null,
      divisao:            form.divisao.trim() || null,
      objetivo_treino:  form.objetivo_treino.trim() || null,
      precaucoes:       form.precaucoes.trim() || null,
      progressao:       form.progressao.trim() || null,
      observacoes:      form.observacoes.trim() || null,
      video_url:             form.video_url.trim() || null,
      data_liberacao_video:  form.data_liberacao_video || null,
      ativo: true,
    }).select().single();

    if (error) { setBusy(false); setFeedback({ tipo: 'erro', msg: error.message }); return; }

    // O .neq é obrigatório: sem ele o update desativaria o que acabou de
    // nascer. O filtro por ativo evita reescrever linhas já inativas.
    const { error: erroDesativar } = await supabase
      .from('treinos_prescritos')
      .update({ ativo: false })
      .eq('paciente_id', pacienteId)
      .eq('ativo', true)
      .neq('id', novo.id);

    setBusy(false);
    setForm(form0());
    await carregar();
    setFeedback(erroDesativar
      ? { tipo: 'aviso', msg: 'Treino publicado, mas o plano anterior continua ativo — desative pela lista.' }
      : { tipo: 'ok', msg: `Treino publicado para ${pacienteNome.split(' ')[0]}!` });
    // Abre o editor já no treino novo: é o momento em que ela tem o plano na
    // frente para cadastrar os dias. Vindo de PDF, abre pré-populado.
    setEditorTreino(novo);
    setEditorRascunho(rascunhoPdf);
    setRascunhoPdf(null);
  }

  async function desativar(id) {
    if (!window.confirm('Desativar este treino?')) return;
    await supabase.from('treinos_prescritos').update({ ativo: false }).eq('id', id);
    carregar();
  }

  // Exclusão é delete de verdade, e a FK treinos_registros.treino_id é ON DELETE
  // CASCADE no banco (confirmado por pg_constraint, 2026-08-06 — a migration
  // 2026-06-05b diz 'set null' e está desatualizada). Ou seja: apagar o treino
  // apaga junto o histórico de adesão da paciente. Por isso a contagem de
  // sessões vem ANTES do confirm, e um erro na contagem aborta — avisar "sem
  // sessões" quando na verdade não deu para contar seria mentir no único
  // momento em que a nutri decide.
  async function excluir(t) {
    setErroLista(null);

    const { count, error: erroContagem } = await supabase
      .from('treinos_registros')
      .select('id', { count: 'exact', head: true })
      .eq('treino_id', t.id);

    if (erroContagem) {
      setErroLista('Não foi possível verificar o histórico deste treino, então a exclusão foi cancelada. ' + erroContagem.message);
      return;
    }

    const primeiro = pacienteNome.split(' ')[0];
    const aviso = count > 0
      ? `Excluir o treino "${t.tipo}"?\n\nEste treino tem ${count} ${count === 1 ? 'sessão registrada' : 'sessões registradas'} por ${primeiro}. Excluir vai apagar esse histórico junto, e não pode ser desfeito.`
      : `Excluir o treino "${t.tipo}"?\n\nEsta ação não pode ser desfeita.`;
    if (!window.confirm(aviso)) return;

    // O .select() devolve as linhas efetivamente apagadas. Sem ele, um delete
    // barrado pela RLS volta como sucesso com zero linhas, e a tela recarregaria
    // com o treino ainda lá, sem explicação.
    const { data, error } = await supabase
      .from('treinos_prescritos')
      .delete()
      .eq('id', t.id)
      .select();

    if (error) { setErroLista('Erro ao excluir: ' + error.message); return; }
    if (!data?.length) {
      setErroLista('Não foi possível excluir este treino — sem permissão no banco.');
      return;
    }
    carregar();
  }

  const embedPreview = youtubeEmbedUrl(form.video_url);

  return (
    <>
      {/* Diretrizes ASCO 2022 | Atualização 2026 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <button
          onClick={() => setAscoOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--font-sans)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: 'var(--green-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: 18, color: 'var(--green)' }} aria-hidden="true" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Diretrizes ASCO 2022 | Atualização 2026</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Exercício durante e após o tratamento oncológico</div>
            </div>
          </div>
          <i className={`ti ti-chevron-${ascoOpen ? 'up' : 'down'}`} style={{ color: 'var(--text3)', fontSize: 16 }} aria-hidden="true" />
        </button>
        {ascoOpen && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: '0.5px solid var(--hair)',
            fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
          }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <li>150–300 min/semana de exercício aeróbico moderado</li>
              <li>Treino de resistência muscular 2×/semana</li>
              <li>Exercício é seguro durante tratamento ativo com intenção curativa</li>
              <li>Reduz fadiga, ansiedade, depressão e risco de recidiva</li>
              <li>Preserva capacidade cardiorrespiratória e força muscular</li>
              <li>Baixo risco de eventos adversos quando supervisionado</li>
              <li>Recomendado antes, durante e após o tratamento oncológico</li>
              <li>Início gradual: começar com 10–15 min e progredir semanalmente</li>
              <li>Priorizar exercício supervisionado por profissional capacitado</li>
              <li>Adaptar intensidade conforme hemograma, fadiga e fase do tratamento</li>
            </ul>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              Fonte: Ligibel et al. ASCO Guideline 2022. J Clin Oncol 40:2491-2507
            </div>
          </div>
        )}
      </div>

      {/* Formulário de prescrição */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Recomendar treino</div>
            <div className="card-sub">Visível para {pacienteNome.split(' ')[0]} no portal Essentia</div>
          </div>
        </div>
        <div className="card-body">

          {/* Importar de PDF — antes do formulário porque é ele que o preenche */}
          <div style={{ marginBottom: 16 }}>
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) importarTreinoPdf(f); }}
            />
            <button
              type="button"
              onClick={() => pdfRef.current?.click()}
              disabled={importando || busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 8,
                border: '1px dashed var(--border)',
                background: 'var(--bg2)', color: 'var(--text2)',
                fontSize: 13, cursor: (importando || busy) ? 'default' : 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              {importando
                ? <><i className="ti ti-loader-2" style={{ fontSize: 15 }} aria-hidden="true" /> Lendo o plano…</>
                : <>📄 Importar treino de PDF</>
              }
            </button>
            {rascunhoPdf && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>
                {rascunhoPdf.length} dia(s) lido(s) do PDF, esperando o Publicar.
              </div>
            )}
            {/* Junto do botão que disparou a leitura, e não no rodapé do
                formulário: é aqui que a nutri está olhando quando o PDF volta. */}
            {feedbackPdf && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: feedbackPdf.tipo === 'ok' ? 'var(--green-bg)'
                  : feedbackPdf.tipo === 'aviso' ? 'var(--orange-bg)' : 'var(--red-bg)',
                color: feedbackPdf.tipo === 'ok' ? 'var(--green)'
                  : feedbackPdf.tipo === 'aviso' ? 'var(--orange)' : 'var(--red)',
              }}>{feedbackPdf.msg}</div>
            )}
          </div>

          {/* Tipo */}
          <label className="field-label">Tipo de treino</label>
          <select value={form.tipo} onChange={set('tipo')}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Intensidade / Frequência / Duração */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label className="field-label">Intensidade</label>
              <select value={form.intensidade} onChange={set('intensidade')}>
                {INTENSIDADES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Frequência/semana</label>
              <select value={form.frequencia_semanal} onChange={e => setVal('frequencia_semanal', Number(e.target.value))}>
                {FREQUENCIAS.map(f => <option key={f} value={f}>{f}×/sem</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Duração</label>
              <select value={form.duracao_minutos} onChange={e => setVal('duracao_minutos', Number(e.target.value))}>
                {DURACOES.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>

          {/* Fase do tratamento */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Fase do tratamento (opcional)</label>
            <select value={form.fase_tratamento} onChange={set('fase_tratamento')}>
              <option value="">Não especificada</option>
              {FASES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Dias da semana */}
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Dias da semana — resumo do plano (opcional)</label>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>
              Se você cadastrar dias (Treino A/B), os dias de cada um têm prioridade sobre este campo.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {DIAS.map(dia => {
                const ativo = form.dias_semana.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDia(dia)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12,
                      fontFamily: 'var(--font-sans)', cursor: 'pointer',
                      border: ativo ? 'none' : '0.5px solid var(--border)',
                      background: ativo ? 'var(--dark)' : 'var(--bg2)',
                      color: ativo ? 'var(--white)' : 'var(--text2)',
                      fontWeight: ativo ? 600 : 400,
                    }}>
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contexto clínico / local e equipamentos / divisão */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Contexto clínico (opcional)</label>
            <input
              type="text"
              placeholder="ex: Em quimioterapia, linfedema no braço direito"
              value={form.contexto_clinico}
              onChange={set('contexto_clinico')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label className="field-label">Local e equipamentos (opcional)</label>
              <input
                type="text"
                placeholder="ex: Casa, elástico e halter de 2kg"
                value={form.local_equipamentos}
                onChange={set('local_equipamentos')}
              />
            </div>
            <div>
              <label className="field-label">Divisão (opcional)</label>
              <input
                type="text"
                placeholder="ex: A/B"
                value={form.divisao}
                onChange={set('divisao')}
              />
            </div>
          </div>

          {/* Objetivo do treino */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Objetivo do treino (opcional)</label>
            <input
              type="text"
              placeholder="ex: Reduzir fadiga, preservar massa muscular"
              value={form.objetivo_treino}
              onChange={set('objetivo_treino')}
            />
          </div>

          {/* Precauções */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: 'var(--orange)' }} aria-hidden="true" />
              Precauções clínicas (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="ex: Evitar exercícios com braço operado. Não fazer se plaquetas < 50.000."
              value={form.precaucoes}
              onChange={set('precaucoes')}
            />
          </div>

          {/* Progressão */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Progressão (opcional)</label>
            <textarea
              rows={2}
              placeholder="ex: Semana 1-2: 10 min. Semana 3-4: 15 min. Aumentar 5 min a cada 2 semanas."
              value={form.progressao}
              onChange={set('progressao')}
            />
          </div>

          {/* Observações */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Observações clínicas (opcional)</label>
            <textarea
              rows={2}
              placeholder="ex: Iniciar com 10 min e progredir conforme tolerância. Evitar durante nadir."
              value={form.observacoes}
              onChange={set('observacoes')}
            />
          </div>

          {/* Vídeo */}
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Vídeo do YouTube (opcional)</label>
            <input
              type="url"
              placeholder="Cole o link do YouTube aqui"
              value={form.video_url}
              onChange={set('video_url')}
            />
            <div style={{ marginTop: 10 }}>
              <label className="field-label">Data de liberação do vídeo (opcional)</label>
              <input
                type="date"
                value={form.data_liberacao_video}
                onChange={set('data_liberacao_video')}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Deixe em branco para liberar o vídeo imediatamente.
              </div>
            </div>
            {embedPreview && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
                <iframe
                  src={embedPreview}
                  title="Preview do vídeo"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>

          {/* Vídeos sugeridos */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 7, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Buscar vídeos sugeridos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {VIDEOS_SUGERIDOS.map(v => (
                <a
                  key={v.label}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--bg2)', border: '0.5px solid var(--border)',
                    fontSize: 12, color: 'var(--text2)', textDecoration: 'none',
                  }}>
                  <i className="ti ti-brand-youtube" style={{ color: '#FF0000', fontSize: 14 }} aria-hidden="true" />
                  {v.label}
                </a>
              ))}
            </div>
          </div>

          {feedback && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: feedback.tipo === 'ok' ? 'var(--green-bg)'
                : feedback.tipo === 'aviso' ? 'var(--orange-bg)' : 'var(--red-bg)',
              color: feedback.tipo === 'ok' ? 'var(--green)'
                : feedback.tipo === 'aviso' ? 'var(--orange)' : 'var(--red)',
            }}>{feedback.msg}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={publicar} disabled={busy}>
              <i className="ti ti-player-play" aria-hidden="true" />
              {busy ? 'Publicando...' : 'Publicar treino'}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de treinos prescritos */}
      <div className="section-label">Treinos recomendados ({treinos?.length ?? 0})</div>

      {erroLista && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
          background: 'var(--red-bg)', color: 'var(--red)',
        }}>{erroLista}</div>
      )}

      {treinos === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : treinos.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum treino recomendado ainda.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {treinos.map(t => {
            const nDias = t.treinos_dias?.length ?? 0;
            const nEx = (t.treinos_dias ?? []).reduce((n, d) => n + (d.treinos_exercicios?.length ?? 0), 0);
            return (
            <div key={t.id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: t.ativo ? 'var(--green-bg)' : 'var(--bg2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-run" style={{ fontSize: 18, color: t.ativo ? 'var(--green)' : 'var(--text3)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                    {t.tipo}
                    {!t.ativo && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>inativo</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {t.intensidade} · {t.frequencia_semanal}×/semana · {t.duracao_minutos} min
                    {t.dias_semana?.length ? ` · ${t.dias_semana.join(', ')}` : ''}
                    {nDias > 0 && ` · ${nDias} dia${nDias > 1 ? 's' : ''}, ${nEx} exercício${nEx === 1 ? '' : 's'}`}
                  </div>
                  {t.fase_tratamento && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.fase_tratamento}</div>}
                  {t.objetivo_treino && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                      🎯 {t.objetivo_treino}
                    </div>
                  )}
                  {t.precaucoes && (
                    <div style={{ fontSize: 12, color: 'var(--orange)', marginTop: 3 }}>
                      ⚠️ {t.precaucoes}
                    </div>
                  )}
                  {t.observacoes && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.4 }}>{t.observacoes}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                    Publicado em {dataBR(t.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => setEditorTreino(t)}
                    title="Dias e exercícios"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
                    <i className="ti ti-list-details" style={{ fontSize: 15 }} aria-hidden="true" />
                  </button>

                  {t.ativo && (
                    <button
                      onClick={() => desativar(t.id)}
                      title="Desativar treino"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
                      <i className="ti ti-x" style={{ fontSize: 15 }} aria-hidden="true" />
                    </button>
                  )}

                  <button
                    onClick={() => excluir(t)}
                    title="Excluir treino"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {editorTreino && (
        <TreinoDias
          treino={editorTreino}
          rascunhoInicial={editorRascunho}
          onClose={() => { setEditorTreino(null); setEditorRascunho(null); }}
          onSaved={async () => { setEditorTreino(null); setEditorRascunho(null); await carregar(); }}
        />
      )}
    </>
  );
}
