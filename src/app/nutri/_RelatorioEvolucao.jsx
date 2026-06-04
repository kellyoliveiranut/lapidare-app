import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { callAnthropic } from '../../lib/anthropic.js';
import { dataBR } from '../../lib/utils.js';

export default function RelatorioEvolucao({ pacienteId, paciente, nutriId }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [analise, setAnalise] = useState('');
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => { buscarDados(); }, [pacienteId]);

  async function buscarDados() {
    setCarregando(true);
    const trintaDiasAtras = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

    const [pesosRes, supsRes, supLogsRes, habitosRes, habitoLogsRes,
           checkinsRes, followupsRes, planosRes, consultasRes] = await Promise.all([
      supabase.from('peso_registros').select('*').eq('paciente_id', pacienteId).order('data'),
      supabase.from('suplementos').select('*').eq('paciente_id', pacienteId).eq('ativo', true).order('ordem'),
      supabase.from('suplementos_logs').select('*').eq('paciente_id', pacienteId).gte('data', trintaDiasAtras),
      supabase.from('habitos').select('*').eq('paciente_id', pacienteId).eq('ativo', true).order('ordem'),
      supabase.from('habitos_logs').select('*').eq('paciente_id', pacienteId).gte('data', trintaDiasAtras),
      supabase.from('checkin_envios').select('*').eq('paciente_id', pacienteId)
        .not('respondido_em', 'is', null).order('respondido_em', { ascending: false }).limit(5),
      supabase.from('followups').select('*').eq('paciente_id', pacienteId)
        .order('data', { ascending: false }).limit(8),
      supabase.from('planos').select('*').eq('paciente_id', pacienteId)
        .order('publicado_em', { ascending: false }).limit(1),
      supabase.from('consultas').select('*').eq('paciente_id', pacienteId)
        .eq('status', 'realizada').order('data_hora'),
    ]);

    setDados({
      pesos:         pesosRes.data       ?? [],
      suplementos:   supsRes.data        ?? [],
      supLogs:       supLogsRes.data     ?? [],
      habitos:       habitosRes.data     ?? [],
      habitoLogs:    habitoLogsRes.data  ?? [],
      checkins:      checkinsRes.data    ?? [],
      followups:     followupsRes.data   ?? [],
      plano:         planosRes.data?.[0] ?? null,
      consultas:     consultasRes.data   ?? [],
    });
    setCarregando(false);
  }

  function calcIdade() {
    if (!paciente?.nascimento) return null;
    const hoje = new Date();
    const nasc = new Date(paciente.nascimento + 'T00:00:00');
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  }

  function aderenciaSup(supId) {
    if (!dados) return null;
    const logs = dados.supLogs.filter(l => l.suplemento_id === supId);
    if (!logs.length) return null;
    return Math.round(logs.filter(l => l.tomado).length / logs.length * 100);
  }

  function aderenciaHabito(habitoId) {
    if (!dados) return null;
    const logs = dados.habitoLogs.filter(l => l.habito_id === habitoId);
    if (!logs.length) return null;
    return Math.round(logs.filter(l => (l.valor ?? 0) > 0).length / logs.length * 100);
  }

  function buildPrompt() {
    const { pesos, suplementos, supLogs, habitos, habitoLogs, checkins, followups, plano } = dados;

    const pesosStr = pesos.length
      ? pesos.map(p =>
          `${dataBR(p.data)}: ${p.kg}kg` +
          (p.pgc   ? `, ${p.pgc}% gordura`          : '') +
          (p.mm_kg ? `, ${p.mm_kg}kg massa magra`   : '') +
          (p.cintura_cm ? `, cintura ${p.cintura_cm}cm` : '')
        ).join('\n')
      : 'Sem registros de peso';

    const variacaoPeso = pesos.length >= 2
      ? (pesos[pesos.length - 1].kg - pesos[0].kg).toFixed(1)
      : null;

    const supsStr = suplementos.length
      ? suplementos.map(s => {
          const ad = aderenciaSup(s.id);
          return `- ${s.nome} (${s.dose || '—'}, ${s.horario || '—'})` +
                 (ad !== null ? ` — aderência: ${ad}%` : '');
        }).join('\n')
      : 'Sem suplementos cadastrados';

    const habitosStr = habitos.length
      ? habitos.map(h => {
          const ad = aderenciaHabito(h.id);
          return `- ${h.nome}` +
                 (h.meta ? ` (meta: ${h.meta}${h.unidade || ''})` : '') +
                 (ad !== null ? ` — aderência: ${ad}%` : '');
        }).join('\n')
      : 'Sem hábitos cadastrados';

    const followupsStr = followups.slice(0, 5).map(f =>
      `[${dataBR(f.data)}] ${f.titulo || 'Anotação'}\n${(f.conteudo || '').slice(0, 500)}`
    ).join('\n\n') || 'Sem anotações clínicas';

    const checkinsStr = checkins.slice(0, 3).map(c => {
      const perguntas = Array.isArray(c.perguntas) ? c.perguntas : [];
      const respostas = c.respostas ?? {};
      const pares = perguntas
        .map(p => {
          const r = respostas[p.id];
          if (r === undefined || r === null || r === '') return null;
          return `  ${p.texto || p.pergunta || p.label || p.id}: ${r}`;
        })
        .filter(Boolean)
        .join('\n');
      return `[${dataBR(c.respondido_em)}] ${c.nome || 'Check-in'}\n${pares || '  (sem respostas detalhadas)'}`;
    }).join('\n\n') || 'Sem check-ins respondidos';

    const macros = plano?.dados?.macros;
    const planoStr = macros
      ? `Calorias alvo: ${macros.kcal || '—'} kcal — Proteína: ${macros.proteina || '—'}g`
      : 'Plano alimentar não cadastrado';

    return `Você é um assistente de nutrição clínica oncológica. Analise os dados desta paciente e gere a seção "Análise e Conclusão" do relatório de evolução nutricional.

Use linguagem clínica, objetiva e empática em português. Estruture em três parágrafos com subtítulos:
**Progressos observados**, **Pontos de atenção**, **Recomendações para os próximos meses**.
Máximo 350 palavras. Não invente dados não fornecidos.

IDENTIFICAÇÃO
Nome: ${paciente.nome}
Idade: ${calcIdade() ?? '—'} anos
Objetivo: ${paciente.objetivo || '—'}
Tipo de plano: ${paciente.tipo_plano || '—'}

METAS NUTRICIONAIS
${planoStr}

EVOLUÇÃO ANTROPOMÉTRICA
${pesosStr}${variacaoPeso !== null ? `\nVariação total: ${Number(variacaoPeso) > 0 ? '+' : ''}${variacaoPeso}kg` : ''}

SUPLEMENTAÇÃO — últimos 30 dias
${supsStr}

HÁBITOS — últimos 30 dias
${habitosStr}

ANOTAÇÕES CLÍNICAS (mais recentes)
${followupsStr}

CHECK-INS RESPONDIDOS (mais recentes)
${checkinsStr}`;
  }

  async function gerarAnalise() {
    if (!dados) return;
    setGerando(true);
    setErro(null);
    try {
      const texto = await callAnthropic(
        [{ role: 'user', content: buildPrompt() }],
        { maxTokens: 1024 }
      );
      setAnalise(texto);
    } catch (e) {
      setErro('Erro ao gerar análise: ' + e.message);
    }
    setGerando(false);
  }

  function gerarTextoPlano() {
    if (!dados) return '';
    const { pesos, suplementos, habitos, checkins, followups, plano, consultas } = dados;
    const pesoI = pesos[0];
    const pesoA = pesos[pesos.length - 1];

    const linhas = [
      `RELATÓRIO DE EVOLUÇÃO NUTRICIONAL`,
      `Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
      '',
      `── IDENTIFICAÇÃO ──────────────────────`,
      `Nome: ${paciente.nome}`,
      `Idade: ${calcIdade() ?? '—'} anos`,
      '',
      `── EVOLUÇÃO ANTROPOMÉTRICA ──────────`,
    ];

    if (pesos.length) {
      pesos.forEach(p => {
        linhas.push(`${dataBR(p.data)}: ${p.kg}kg` +
          (p.pgc ? ` | ${p.pgc}% gordura` : '') +
          (p.mm_kg ? ` | ${p.mm_kg}kg MM` : '') +
          (p.cintura_cm ? ` | cintura ${p.cintura_cm}cm` : ''));
      });
      if (pesoI && pesoA && pesoI !== pesoA) {
        const v = (pesoA.kg - pesoI.kg).toFixed(1);
        linhas.push(`Variação total: ${Number(v) > 0 ? '+' : ''}${v}kg`);
      }
    } else {
      linhas.push('Sem registros');
    }

    linhas.push('', `── SUPLEMENTAÇÃO ────────────────────`);
    if (suplementos.length) {
      suplementos.forEach(s => {
        const ad = aderenciaSup(s.id);
        linhas.push(`• ${s.nome} — ${s.dose || ''} ${s.horario || ''}` +
          (ad !== null ? ` (aderência 30d: ${ad}%)` : ''));
      });
    } else linhas.push('Sem suplementos');

    linhas.push('', `── HÁBITOS ──────────────────────────`);
    if (habitos.length) {
      habitos.forEach(h => {
        const ad = aderenciaHabito(h.id);
        linhas.push(`• ${h.nome}` + (ad !== null ? ` (aderência 30d: ${ad}%)` : ''));
      });
    } else linhas.push('Sem hábitos');

    if (followups.length) {
      linhas.push('', `── ANOTAÇÕES CLÍNICAS ───────────────`);
      followups.forEach(f => {
        linhas.push(`[${dataBR(f.data)}] ${f.titulo || ''}`);
        if (f.conteudo) linhas.push(f.conteudo.slice(0, 500));
        linhas.push('');
      });
    }

    if (analise) {
      linhas.push(`── ANÁLISE E CONCLUSÃO (IA) ─────────`);
      linhas.push(analise);
    }

    return linhas.join('\n');
  }

  async function copiarTexto() {
    await navigator.clipboard.writeText(gerarTextoPlano());
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  function exportarPDF() {
    if (!dados) return;
    const { pesos, suplementos, habitos, followups, plano, consultas } = dados;
    const pesoI = pesos[0];
    const pesoA = pesos[pesos.length - 1];
    const macros = plano?.dados?.macros;
    const chartSvg = pesos.length >= 2 ? buildChartSVG(pesos) : '';

    const secao = (titulo, conteudo) => `
      <section>
        <h2>${titulo}</h2>
        ${conteudo}
      </section>`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Evolução — ${escapeHtml(paciente.nome)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #F5F0EB;
      color: #1c1712;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      line-height: 1.65;
      padding: 52px 60px 40px;
      max-width: 840px;
      margin: 0 auto;
    }

    /* ── Cabeçalho ── */
    .header {
      display: flex; align-items: flex-start; gap: 18px;
      padding-bottom: 24px;
      border-bottom: 2px solid #B8956A;
      margin-bottom: 36px;
    }
    .monogram {
      width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #B8956A 0%, #8c6a3f 100%);
      color: #fff; font-family: Georgia, serif;
      font-size: 24px; font-weight: bold; letter-spacing: -1px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(184,149,106,.35);
    }
    .header-center { flex: 1; }
    .brand {
      font-family: 'Inter', sans-serif; font-size: 10px; letter-spacing: 3px;
      text-transform: uppercase; color: #B8956A; font-weight: 600; margin-bottom: 6px;
    }
    h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 26px; font-weight: normal; font-style: italic;
      color: #1c1712; line-height: 1.25;
    }
    h1 strong { font-style: normal; font-weight: 600; }
    .header-meta {
      font-size: 11px; color: #6b5c3e; text-align: right; line-height: 1.7;
      flex-shrink: 0; padding-top: 4px;
    }
    .header-date { font-size: 10px; color: #9a8570; margin-top: 4px; }

    /* ── Seções ── */
    section {
      margin-bottom: 32px;
      padding-bottom: 28px;
      border-bottom: 1px solid #ddd5c8;
      page-break-inside: avoid;
    }
    section:last-of-type { border-bottom: none; }
    h2 {
      font-family: Georgia, serif; font-size: 13px; font-weight: 600;
      color: #B8956A; letter-spacing: 2px; text-transform: uppercase;
      margin-bottom: 16px;
      padding-bottom: 6px;
      border-bottom: 0.5px solid #e0d4c4;
      display: flex; align-items: center; gap: 8px;
    }
    h2::before {
      content: ''; display: inline-block;
      width: 3px; height: 14px; border-radius: 2px;
      background: linear-gradient(to bottom, #B8956A, #d4a96a);
    }

    /* ── Grid de campos ── */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px 24px; }
    .field-label {
      font-size: 9px; color: #9a8570; letter-spacing: 1.5px;
      text-transform: uppercase; font-weight: 600; margin-bottom: 3px;
    }
    .field-value { font-size: 13px; color: #1c1712; font-weight: 500; }

    /* ── Tabelas ── */
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #ede5d8; }
    th {
      text-align: left; font-size: 9.5px; color: #7a6248; letter-spacing: 1px;
      text-transform: uppercase; font-weight: 600;
      padding: 7px 10px; border-bottom: 1px solid #d4c4b0;
    }
    td { padding: 8px 10px; border-bottom: 0.5px solid #ede5d8; color: #1c1712; }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #faf5ef; }

    /* ── Badges ── */
    .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-ok  { background: #e6f4ea; color: #2e7d32; }
    .badge-med { background: #fff8e1; color: #e65100; }
    .badge-low { background: #fce8e8; color: #b71c1c; }

    /* ── Análise IA ── */
    .analise {
      background: #fff9f3;
      border-left: 3px solid #B8956A;
      padding: 18px 20px; border-radius: 0 10px 10px 0;
      font-size: 13px; line-height: 1.8; color: #2a1f14;
      white-space: pre-line;
    }
    .analise strong { color: #8c6a3f; font-weight: 600; }

    /* ── Notas e SVG ── */
    svg { display: block; margin: 14px 0; }
    .note { font-size: 11px; color: #9a8570; font-style: italic; margin-top: 8px; }

    /* ── Anotações clínicas ── */
    .followup-item {
      padding: 10px 14px; border-radius: 6px;
      background: #fff; border: 0.5px solid #ddd5c8;
      margin-bottom: 10px;
    }
    .followup-date { font-size: 10px; color: #9a8570; margin-bottom: 4px; font-weight: 500; }
    .followup-text { font-size: 13px; color: #1c1712; white-space: pre-line; line-height: 1.6; }

    /* ── Rodapé ── */
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #ddd5c8;
      display: flex; justify-content: space-between; align-items: flex-end;
      font-size: 10px; color: #9a8570; line-height: 1.6;
    }
    footer .nutri { font-weight: 600; color: #6b5c3e; font-size: 11px; }
    footer .lgpd { font-style: italic; }

    /* ── Print ── */
    @media print {
      body { padding: 24px 32px 20px; background: #F5F0EB; }
      @page { margin: 1.2cm; size: A4; background: #F5F0EB; }
      section { page-break-inside: avoid; }
      footer { position: running(footer); }
    }
  </style>
</head>
<body>

  <!-- Cabeçalho -->
  <div class="header">
    <div class="monogram">E</div>
    <div class="header-center">
      <div class="brand">Essentia · Nutrição em Oncologia</div>
      <h1><strong>Relatório de Evolução</strong><br>${escapeHtml(paciente.nome)}</h1>
      <div class="header-date">Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
    <div class="header-meta">
      Nut. Kelly Oliveira<br>
      Mestre em Oncologia<br>
      CRN 3801
    </div>
  </div>

  ${secao('1. Identificação', `
    <div class="grid-3">
      <div><div class="field-label">Nome</div><div class="field-value">${escapeHtml(paciente.nome)}</div></div>
      <div><div class="field-label">Idade</div><div class="field-value">${calcIdade() != null ? calcIdade() + ' anos' : '—'}</div></div>
      <div><div class="field-label">Consultas realizadas</div><div class="field-value">${consultas.length}</div></div>
      ${macros?.kcal     ? `<div><div class="field-label">Calorias alvo</div><div class="field-value">${macros.kcal} kcal</div></div>` : ''}
      ${macros?.proteinas_g ? `<div><div class="field-label">Proteína alvo</div><div class="field-value">${macros.proteinas_g} g</div></div>` : ''}
    </div>
  `)}

  ${secao('2. Evolução Antropométrica', pesos.length ? `
    ${chartSvg}
    <table>
      <thead><tr>
        <th>Data</th><th>Peso</th><th>% Gordura</th><th>M. Magra</th><th>Cintura</th><th>Quadril</th>
      </tr></thead>
      <tbody>
        ${pesos.map(p => `<tr>
          <td>${dataBR(p.data)}</td>
          <td>${p.kg != null ? p.kg + ' kg' : '—'}</td>
          <td>${p.pgc != null ? p.pgc + '%' : '—'}</td>
          <td>${p.mm_kg != null ? p.mm_kg + ' kg' : '—'}</td>
          <td>${p.cintura_cm != null ? p.cintura_cm + ' cm' : '—'}</td>
          <td>${p.quadril_cm != null ? p.quadril_cm + ' cm' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${pesoI && pesoA && pesos.length >= 2 ? `
      <p class="note">Variação total: ${Number((pesoA.kg - pesoI.kg).toFixed(1)) > 0 ? '+' : ''}${(pesoA.kg - pesoI.kg).toFixed(1)} kg
      (${dataBR(pesoI.data)} → ${dataBR(pesoA.data)})</p>` : ''}
  ` : '<p class="note">Sem registros antropométricos.</p>')}

  ${secao('3. Suplementação', suplementos.length ? `
    <table>
      <thead><tr><th>Suplemento</th><th>Dose</th><th>Horário</th><th>Aderência 30d</th></tr></thead>
      <tbody>
        ${suplementos.map(s => {
          const ad = aderenciaSup(s.id);
          const badge = ad === null ? '—' : ad >= 80
            ? `<span class="badge badge-ok">${ad}%</span>`
            : ad >= 50 ? `<span class="badge badge-med">${ad}%</span>`
                       : `<span class="badge badge-low">${ad}%</span>`;
          return `<tr>
            <td>${escapeHtml(s.nome)}</td>
            <td>${escapeHtml(s.dose || '—')}</td>
            <td>${escapeHtml(s.horario || '—')}</td>
            <td>${badge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<p class="note">Sem suplementos cadastrados.</p>')}

  ${secao('4. Hábitos', habitos.length ? `
    <table>
      <thead><tr><th>Hábito</th><th>Meta</th><th>Aderência 30d</th></tr></thead>
      <tbody>
        ${habitos.map(h => {
          const ad = aderenciaHabito(h.id);
          const badge = ad === null ? '—' : ad >= 80
            ? `<span class="badge badge-ok">${ad}%</span>`
            : ad >= 50 ? `<span class="badge badge-med">${ad}%</span>`
                       : `<span class="badge badge-low">${ad}%</span>`;
          return `<tr>
            <td>${h.emoji ? escapeHtml(h.emoji) + ' ' : ''}${escapeHtml(h.nome)}</td>
            <td>${h.meta != null ? h.meta + (h.unidade || '') : '—'}</td>
            <td>${badge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<p class="note">Sem hábitos cadastrados.</p>')}

  ${followups.length ? secao('5. Anotações Clínicas', `
    ${followups.slice(0, 6).map(f => `
      <div class="followup-item">
        <div class="followup-date">${dataBR(f.data)}${f.titulo ? ' · ' + escapeHtml(f.titulo) : ''}</div>
        <div class="followup-text">${escapeHtml((f.conteudo || '').slice(0, 600))}</div>
      </div>
    `).join('')}
  `) : ''}

  ${analise ? secao('6. Análise e Conclusão', `
    <div class="analise">${escapeHtml(analise).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</div>
    <p class="note">Análise gerada por IA (Claude) com base nos dados clínicos registrados.</p>
  `) : ''}

  <!-- Rodapé -->
  <footer>
    <div>
      <div class="nutri">Nut. Kelly Oliveira · Mestre em Oncologia · CRN 3801</div>
      <div>Essentia · Nutrição em Oncologia</div>
    </div>
    <div class="lgpd">🔒 Seus dados estão protegidos pela LGPD.</div>
  </footer>

</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permita pop-ups para gerar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  if (carregando) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 24, animation: 'lapidare-spin .75s linear infinite' }} />
        <div style={{ marginTop: 10, fontSize: 13 }}>Carregando dados...</div>
      </div>
    );
  }

  const { pesos, suplementos, habitos, followups, checkins } = dados;
  const pesoI = pesos[0];
  const pesoA = pesos[pesos.length - 1];
  const macros = dados.plano?.dados?.macros;

  return (
    <div>
      {/* Barra de ações */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        padding: '12px 0', borderBottom: '0.5px solid var(--border)',
      }}>
        <button
          className="btn"
          onClick={gerarAnalise}
          disabled={gerando}
          style={{ gap: 6 }}
        >
          <i className={`ti ti-${gerando ? 'loader-2' : 'sparkles'}`}
             style={gerando ? { animation: 'lapidare-spin .75s linear infinite' } : {}}
             aria-hidden="true" />
          {gerando ? 'Gerando análise...' : 'Gerar análise IA'}
        </button>
        <button className="btn-outline" onClick={exportarPDF} style={{ gap: 6 }}>
          <i className="ti ti-file-type-pdf" aria-hidden="true" />
          Exportar PDF
        </button>
        <button className="btn-outline" onClick={copiarTexto} style={{ gap: 6 }}>
          <i className={`ti ti-${copiado ? 'check' : 'clipboard'}`} aria-hidden="true" />
          {copiado ? 'Copiado!' : 'Copiar texto'}
        </button>
      </div>

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 16,
        }}>{erro}</div>
      )}

      {/* Relatório */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 1. Identificação */}
        <Secao titulo="1. Identificação">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 20px' }}>
            <Campo label="Nome"               value={paciente.nome} />
            <Campo label="Idade"              value={calcIdade() != null ? `${calcIdade()} anos` : '—'} />
            <Campo label="Consultas realizadas" value={String(dados.consultas.length)} />
            {macros?.kcal        && <Campo label="Cal. alvo"      value={`${macros.kcal} kcal`} />}
            {macros?.proteinas_g && <Campo label="Proteína alvo"  value={`${macros.proteinas_g}g`} />}
          </div>
        </Secao>

        {/* 2. Evolução Antropométrica */}
        <Secao titulo="2. Evolução Antropométrica">
          {pesos.length >= 2 && <PesoChart pesos={pesos} />}
          {pesos.length > 0 ? (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Data', 'Peso', '%Gordura', 'M. Magra', 'Cintura', 'Quadril'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pesos.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px' }}>{dataBR(p.data)}</td>
                      <td style={{ padding: '5px 8px' }}>{p.kg != null ? `${p.kg} kg` : '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{p.pgc != null ? `${p.pgc}%` : '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{p.mm_kg != null ? `${p.mm_kg} kg` : '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{p.cintura_cm != null ? `${p.cintura_cm} cm` : '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{p.quadril_cm != null ? `${p.quadril_cm} cm` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pesoI && pesoA && pesos.length >= 2 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                  Variação total: {Number((pesoA.kg - pesoI.kg).toFixed(1)) > 0 ? '+' : ''}{(pesoA.kg - pesoI.kg).toFixed(1)} kg
                  &nbsp;({dataBR(pesoI.data)} → {dataBR(pesoA.data)})
                </div>
              )}
            </>
          ) : (
            <Vazio>Sem registros antropométricos.</Vazio>
          )}
        </Secao>

        {/* 3. Suplementação */}
        <Secao titulo="3. Suplementação">
          {suplementos.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Suplemento', 'Dose', 'Horário', 'Aderência 30d'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suplementos.map(s => {
                  const ad = aderenciaSup(s.id);
                  return (
                    <tr key={s.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 500 }}>{s.nome}</td>
                      <td style={{ padding: '5px 8px' }}>{s.dose || '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{s.horario || '—'}</td>
                      <td style={{ padding: '5px 8px' }}>
                        {ad !== null ? <AderenciaBadge valor={ad} /> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Vazio>Sem suplementos cadastrados.</Vazio>}
        </Secao>

        {/* 4. Hábitos */}
        <Secao titulo="4. Hábitos">
          {habitos.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Hábito', 'Meta', 'Aderência 30d'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {habitos.map(h => {
                  const ad = aderenciaHabito(h.id);
                  return (
                    <tr key={h.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px' }}>{h.emoji ? `${h.emoji} ` : ''}{h.nome}</td>
                      <td style={{ padding: '5px 8px' }}>{h.meta != null ? `${h.meta}${h.unidade || ''}` : '—'}</td>
                      <td style={{ padding: '5px 8px' }}>
                        {ad !== null ? <AderenciaBadge valor={ad} /> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Vazio>Sem hábitos cadastrados.</Vazio>}
        </Secao>

        {/* 5. Anotações clínicas */}
        {followups.length > 0 && (
          <Secao titulo="5. Anotações Clínicas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {followups.map(f => (
                <div key={f.id} style={{
                  borderLeft: '2px solid var(--amber)', paddingLeft: 10,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                    {dataBR(f.data)}{f.titulo ? ` · ${f.titulo}` : ''}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--dark)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {(f.conteudo || '').slice(0, 600)}
                  </div>
                </div>
              ))}
            </div>
          </Secao>
        )}

        {/* 6. Check-ins */}
        {checkins.length > 0 && (
          <Secao titulo="6. Check-ins Respondidos">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checkins.map(c => {
                const perguntas = Array.isArray(c.perguntas) ? c.perguntas : [];
                const respostas = c.respostas ?? {};
                const pares = perguntas
                  .map(p => ({ q: p.texto || p.pergunta || p.label || '', r: respostas[p.id] }))
                  .filter(x => x.r !== undefined && x.r !== null && x.r !== '');
                return (
                  <div key={c.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                      {dataBR(c.respondido_em)} · {c.nome || 'Check-in'}
                    </div>
                    {pares.map((x, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: 'var(--text3)' }}>{x.q}:</span>{' '}
                        <span style={{ fontWeight: 500 }}>{String(x.r)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Secao>
        )}

        {/* 7. Análise IA */}
        <Secao titulo="7. Análise e Conclusão">
          {analise ? (
            <>
              <div style={{
                background: 'var(--bg2)', borderLeft: '3px solid var(--amber)',
                padding: '14px 16px', borderRadius: '0 8px 8px 0',
                fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-line', color: 'var(--dark)',
              }}>
                {analise.replace(/\*\*(.+?)\*\*/g, (_, t) => t).split('\n').map((linha, i) =>
                  linha.startsWith('**') || linha.match(/^\*\*.*\*\*$/)
                    ? <div key={i} style={{ fontWeight: 600, color: 'var(--amber)', marginTop: i > 0 ? 10 : 0 }}>{linha.replace(/\*\*/g, '')}</div>
                    : <div key={i}>{linha}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Análise gerada por IA com base nos dados clínicos registrados.
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                Clique em "Gerar análise IA" para que o Claude analise os dados e gere
                progressos, pontos de atenção e recomendações para esta paciente.
              </div>
              <button className="btn" onClick={gerarAnalise} disabled={gerando}>
                <i className="ti ti-sparkles" aria-hidden="true" />
                {gerando ? 'Gerando...' : 'Gerar análise IA'}
              </button>
            </div>
          )}
        </Secao>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────

function Secao({ titulo, children }) {
  return (
    <div style={{ paddingBottom: 20, borderBottom: '0.5px solid var(--border)' }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--amber)',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
      }}>{titulo}</div>
      {children}
    </div>
  );
}

function Campo({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--dark)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Vazio({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>{children}</div>;
}

function AderenciaBadge({ valor }) {
  const cor = valor >= 80 ? { bg: '#e8f5e9', text: '#2e7d32' }
            : valor >= 50 ? { bg: '#fff8e1', text: '#f57f17' }
            : { bg: '#fce4ec', text: '#c62828' };
  return (
    <span style={{
      background: cor.bg, color: cor.text,
      padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    }}>{valor}%</span>
  );
}

function PesoChart({ pesos }) {
  const sorted = [...pesos].sort((a, b) => a.data.localeCompare(b.data));
  const weights = sorted.map(p => Number(p.kg));
  const W = 500, H = 160;
  const PAD = { top: 12, right: 16, bottom: 28, left: 42 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const minW = Math.floor(Math.min(...weights) - 0.5);
  const maxW = Math.ceil(Math.max(...weights) + 0.5);
  const range = maxW - minW || 1;

  const xOf = i => PAD.left + (sorted.length > 1 ? (i / (sorted.length - 1)) * plotW : plotW / 2);
  const yOf = w => PAD.top + plotH - ((w - minW) / range) * plotH;
  const pts = sorted.map((p, i) => `${xOf(i)},${yOf(Number(p.kg))}`).join(' ');
  const yLabels = [minW, Math.round((minW + maxW) / 2), maxW];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 480, display: 'block' }}>
      {yLabels.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
          <text x={PAD.left - 4} y={yOf(v)} textAnchor="end" dominantBaseline="middle"
            fontSize="9" fill="var(--text3)">{v}kg</text>
        </g>
      ))}
      {sorted.length >= 2 && (
        <polyline points={pts} fill="none" stroke="var(--amber)" strokeWidth="2" />
      )}
      {sorted.map((p, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(Number(p.kg))} r="4"
          fill="var(--amber)" stroke="var(--white)" strokeWidth="1.5" />
      ))}
      {sorted.length >= 2 && (
        <>
          <text x={xOf(0)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text3)">
            {dataBR(sorted[0].data)}
          </text>
          <text x={xOf(sorted.length - 1)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text3)">
            {dataBR(sorted[sorted.length - 1].data)}
          </text>
        </>
      )}
    </svg>
  );
}

function buildChartSVG(pesos) {
  const sorted = [...pesos].sort((a, b) => a.data.localeCompare(b.data));
  const weights = sorted.map(p => Number(p.kg));
  const W = 500, H = 160;
  const PAD = { top: 12, right: 16, bottom: 28, left: 42 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const minW = Math.floor(Math.min(...weights) - 0.5);
  const maxW = Math.ceil(Math.max(...weights) + 0.5);
  const range = maxW - minW || 1;
  const xOf = i => PAD.left + (sorted.length > 1 ? (i / (sorted.length - 1)) * plotW : plotW / 2);
  const yOf = w => PAD.top + plotH - ((w - minW) / range) * plotH;
  const pts = sorted.map((p, i) => `${xOf(i)},${yOf(Number(p.kg))}`).join(' ');
  const yLabels = [minW, Math.round((minW + maxW) / 2), maxW];

  const gridLines = yLabels.map(v =>
    `<line x1="${PAD.left}" y1="${yOf(v)}" x2="${W - PAD.right}" y2="${yOf(v)}"
      stroke="#e5ddd0" stroke-width="0.5" stroke-dasharray="3,3"/>
    <text x="${PAD.left - 4}" y="${yOf(v)}" text-anchor="end" dominant-baseline="middle"
      font-size="9" fill="#8c7355">${v}kg</text>`
  ).join('');

  const dots = sorted.map((p, i) =>
    `<circle cx="${xOf(i)}" cy="${yOf(Number(p.kg))}" r="4"
      fill="#a08456" stroke="white" stroke-width="1.5"/>`
  ).join('');

  const xLabels = sorted.length >= 2 ? `
    <text x="${xOf(0)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#8c7355">${dataBR(sorted[0].data)}</text>
    <text x="${xOf(sorted.length-1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#8c7355">${dataBR(sorted[sorted.length-1].data)}</text>
  ` : '';

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:480px;display:block;margin:12px 0">
    ${gridLines}
    <polyline points="${pts}" fill="none" stroke="#a08456" stroke-width="2"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
