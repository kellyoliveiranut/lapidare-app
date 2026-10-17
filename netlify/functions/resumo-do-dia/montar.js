// Parte pura do resumo do dia da nutri (sem rede, sem banco): recebe linhas já
// lidas e devolve o payload do push. Testada por src/lib/resumoDoDia.teste.mjs.
//
// Tudo que depende de data usa aritmética em UTC com o deslocamento fixo de
// Belém (UTC-3, sem horário de verão), como lembretes-consulta.js — o resultado
// não depende do fuso do servidor.

const BELEM_OFFSET_MS = 3 * 60 * 60 * 1000;
const ICONE = '/icon-192.png';
const ROTA = '/nutri/visao';
const MAX_CONSULTAS = 8;
const MAX_LEMBRETES = 5;
const MAX_TEXTO_LEMBRETE = 100;

const pad = (n) => String(n).padStart(2, '0');

// "Hoje" em Belém para um instante (ms UTC): data ISO e limites [início, fim)
// em UTC. Meia-noite de Belém = 03:00 UTC.
function limitesDoDia(agoraMs) {
  const b = new Date(agoraMs - BELEM_OFFSET_MS);
  const y = b.getUTCFullYear(), m = b.getUTCMonth(), d = b.getUTCDate();
  return {
    hojeISO: `${y}-${pad(m + 1)}-${pad(d)}`,
    inicioUTC: new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString(),
    fimUTC: new Date(Date.UTC(y, m, d + 1, 3, 0, 0)).toISOString(),
  };
}

// Data (YYYY-MM-DD) e hora (HH:MM) de Belém para um timestamptz.
function belem(iso) {
  const d = new Date(new Date(iso).getTime() - BELEM_OFFSET_MS);
  return {
    data: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hora: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

// Primeiro nome, pulando tratamento ("Dra.", "Nutri"…). Vazio se não houver.
function primeiroNome(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  const i = partes.findIndex((p) => !/^(dra?|nut|nutri|prof|profa)\.?$/i.test(p));
  return i === -1 ? '' : partes[i];
}

// PostgREST devolve `time` como "HH:MM:SS".
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

// Só a primeira linha do lembrete, cortada: o corpo do push aparece na tela
// de bloqueio e o lembrete é texto livre.
function resumirTexto(texto) {
  const linha = String(texto ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? '';
  return linha.length > MAX_TEXTO_LEMBRETE ? `${linha.slice(0, MAX_TEXTO_LEMBRETE - 1).trimEnd()}…` : linha;
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

/**
 * @param {object} p
 * @param {string} p.nutriNome
 * @param {string} p.hojeISO   YYYY-MM-DD de Belém
 * @param {Array}  p.consultas {data_hora, status, modalidade, local:{nome}, paciente:{nome}}
 * @param {Array}  p.bloqueios {data, hora_inicio, hora_fim, motivo}
 * @param {Array}  p.lembretes {texto, data, hora, concluido_em}
 */
function montarResumo({ nutriNome, hojeISO, consultas, bloqueios, lembretes }) {
  const nome = primeiroNome(nutriNome);
  const title = nome ? `Bom dia, ${nome}` : 'Bom dia';
  const linhas = [];

  // Consultas: só 'agendada' e só do dia de hoje em Belém, por horário.
  const doDia = (consultas ?? [])
    .filter((c) => c && c.status === 'agendada' && c.data_hora && belem(c.data_hora).data === hojeISO)
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  if (doDia.length === 0) {
    linhas.push('Hoje você não tem consultas.');
  } else {
    linhas.push(`Hoje você tem ${doDia.length} ${plural(doDia.length, 'consulta', 'consultas')}:`);
    for (const c of doDia.slice(0, MAX_CONSULTAS)) {
      const pac = String(c.paciente?.nome ?? '').trim() || 'Paciente';
      const presencial = c.modalidade === 'presencial';
      const local = presencial ? c.local?.nome : null; // mesma regra do lembrete da paciente
      const onde = presencial ? (local ? `presencial, ${local}` : 'presencial') : 'online';
      linhas.push(`${belem(c.data_hora).hora} ${pac} (${onde})`);
    }
    if (doDia.length > MAX_CONSULTAS) linhas.push(`+ ${doDia.length - MAX_CONSULTAS} ${plural(doDia.length - MAX_CONSULTAS, 'consulta', 'consultas')}`);
  }

  // Bloqueios de hoje. hora_inicio/hora_fim nulos = dia inteiro.
  const blq = (bloqueios ?? []).filter((b) => b && b.data === hojeISO);
  const diaInteiro = blq.find((b) => !b.hora_inicio && !b.hora_fim);
  if (diaInteiro) {
    const motivo = String(diaInteiro.motivo ?? '').trim();
    linhas.push(motivo ? `Hoje está bloqueado (${motivo}).` : 'Hoje está bloqueado.');
  } else {
    const faixas = blq
      .filter((b) => b.hora_inicio || b.hora_fim)
      .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)));
    for (const b of faixas) {
      const motivo = String(b.motivo ?? '').trim();
      linhas.push(`Bloqueado ${hhmm(b.hora_inicio)}–${hhmm(b.hora_fim)}${motivo ? ` (${motivo})` : ''}`);
    }
  }

  // Lembretes pendentes: os de hoje listados; atrasados e sem data só em número.
  const pend = (lembretes ?? []).filter((l) => l && !l.concluido_em);
  const deHoje = pend
    .filter((l) => l.data === hojeISO)
    // com hora primeiro (por horário), sem hora depois
    .sort((a, b) => (hhmm(a.hora) || '99:99').localeCompare(hhmm(b.hora) || '99:99'));
  const atrasados = pend.filter((l) => l.data && l.data < hojeISO).length;
  const semData = pend.filter((l) => !l.data).length;

  if (deHoje.length) {
    linhas.push(`${plural(deHoje.length, 'Lembrete', 'Lembretes')} de hoje:`);
    for (const l of deHoje.slice(0, MAX_LEMBRETES)) {
      const h = hhmm(l.hora);
      linhas.push(`• ${h ? `${h} ` : ''}${resumirTexto(l.texto)}`);
    }
    if (deHoje.length > MAX_LEMBRETES) linhas.push(`+ ${deHoje.length - MAX_LEMBRETES} ${plural(deHoje.length - MAX_LEMBRETES, 'lembrete', 'lembretes')}`);
  }
  const extras = [];
  if (atrasados) extras.push(`${atrasados} ${plural(atrasados, 'lembrete atrasado', 'lembretes atrasados')}`);
  if (semData) extras.push(`${semData} ${plural(semData, 'lembrete sem data', 'lembretes sem data')}`);
  if (extras.length) linhas.push(extras.join(' · '));

  return { title, body: linhas.join('\n'), url: ROTA, icon: ICONE };
}

module.exports = { montarResumo, limitesDoDia, belem, primeiroNome, resumirTexto, ROTA, ICONE, BELEM_OFFSET_MS };
