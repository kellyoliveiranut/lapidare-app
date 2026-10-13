/**
 * "Sem consulta há 30 dias ou mais" (Agenda da nutri, bloco-106). Puro, sem
 * React e sem banco. Só uma lista para a nutri olhar: não gera aviso, selo,
 * push nem agendamento.
 *
 * Entra: paciente com status_paciente 'ativo' e plano essentia (qualquer
 * objetivo), SEM consulta futura (status 'agendada' com data_hora depois de
 * agora) e cuja última consulta 'realizada' está a `limiteDias` dias de
 * calendário ou mais de hoje. 'cancelada' nunca conta; 'agendada' que já
 * passou nunca conta como realizada nem como futura.
 * Também NÃO entra quem tem 'agendada' no passado a menos de `limiteDias` dias
 * de calendário (bloco-107): provavelmente foi atendida e falta o registro —
 * não é "paciente sem consulta". Agendada passada há `limiteDias` dias ou mais
 * continua ignorada. Vale também para quem não tem nenhuma realizada.
 * Sem nenhuma realizada: entra se o cadastro (created_at) tem `limiteDias` ou
 * mais — linha "Nenhuma consulta realizada ainda".
 *
 * Dias de CALENDÁRIO no fuso `tz` (meia-noite local), não blocos de 24 h; a
 * conta não usa o fuso da máquina, então dá o mesmo resultado em qualquer TZ.
 */
const fmtCache = new Map();
function chaveDia(instante, tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  const p = Object.fromEntries(fmtCache.get(tz).formatToParts(instante).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const diaUTC = chave => { const [a, m, d] = chave.split('-').map(Number); return Date.UTC(a, m - 1, d); };

/** Instante válido (Date) ou null. */
function instante(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dias de calendário (no fuso tz) entre dois instantes: b − a. */
export function diasDeCalendario(a, b, tz = 'America/Belem') {
  return Math.round((diaUTC(chaveDia(b, tz)) - diaUTC(chaveDia(a, tz))) / 86_400_000);
}

/** "dd/mm/aaaa" do instante, no fuso tz. */
export function dataNoFuso(v, tz = 'America/Belem') {
  const d = instante(v);
  if (!d) return '';
  const [a, m, dia] = chaveDia(d, tz).split('-');
  return `${dia}/${m}/${a}`;
}

const ehEssentia = p => String(p?.tipo_plano ?? '').trim().toLowerCase() === 'essentia';

export function pacientesSemConsulta({ pacientes, consultas, agora = new Date(), limiteDias = 30, tz = 'America/Belem' } = {}) {
  const hoje = instante(agora);
  if (!hoje) return [];

  const porPaciente = new Map();
  for (const c of Array.isArray(consultas) ? consultas : []) {
    if (!c?.paciente_id) continue;
    const quando = instante(c.data_hora);
    if (!quando) continue;
    const r = porPaciente.get(c.paciente_id) ?? { futura: false, ultima: null, semRegistro: false };
    if (c.status === 'agendada' && quando > hoje) r.futura = true;
    if (c.status === 'agendada' && quando <= hoje && diasDeCalendario(quando, hoje, tz) < limiteDias) r.semRegistro = true;
    if (c.status === 'realizada' && (!r.ultima || quando > r.ultima)) r.ultima = quando;
    porPaciente.set(c.paciente_id, r);
  }

  const saida = [];
  for (const p of Array.isArray(pacientes) ? pacientes : []) {
    if (!p?.id || p.status_paciente !== 'ativo' || !ehEssentia(p)) continue;
    const r = porPaciente.get(p.id) ?? { futura: false, ultima: null, semRegistro: false };
    if (r.futura || r.semRegistro) continue;
    if (r.ultima) {
      const dias = diasDeCalendario(r.ultima, hoje, tz);
      if (dias >= limiteDias) saida.push({ pacienteId: p.id, nome: p.nome ?? '', ultimaConsulta: r.ultima.toISOString(), diasSemConsulta: dias, semNenhuma: false });
    } else {
      const cadastro = instante(p.created_at);
      if (!cadastro) continue;               // sem data de cadastro não dá para medir os 30 dias
      const dias = diasDeCalendario(cadastro, hoje, tz);
      if (dias >= limiteDias) saida.push({ pacienteId: p.id, nome: p.nome ?? '', ultimaConsulta: null, diasSemConsulta: dias, semNenhuma: true });
    }
  }
  return saida.sort((a, b) => b.diasSemConsulta - a.diasSemConsulta
    || a.nome.localeCompare(b.nome, 'pt-BR') || String(a.pacienteId).localeCompare(String(b.pacienteId)));
}

/** Texto da segunda linha de cada paciente. */
export function linhaSemConsulta(item, tz = 'America/Belem') {
  const dias = `${item.diasSemConsulta} dia${item.diasSemConsulta === 1 ? '' : 's'}`;
  return item.semNenhuma
    ? `Nenhuma consulta realizada ainda · cadastrada há ${dias}`
    : `Última consulta em ${dataNoFuso(item.ultimaConsulta, tz)} · há ${dias}`;
}
