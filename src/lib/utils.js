/** Iniciais a partir do nome — "Daniela Soares" → "DS" */
export function iniciais(nome) {
  if (!nome) return '··';
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '··';
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** "Maio 2026" */
export function mesAno(date = new Date()) {
  return `${MESES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "09/05/2026" */
export function dataBR(value) {
  if (!value) return '—';
  // "YYYY-MM-DD" (coluna date) → interpreta como LOCAL; senão new Date() joga
  // pra UTC e em fuso negativo (Belém −3) a data recua um dia.
  const d = (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    ? new Date(value + 'T12:00:00')
    : (typeof value === 'string' ? new Date(value) : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** "R$ 1.500,00" */
export function brl(value) {
  if (value == null) return 'R$ 0,00';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Normaliza telefone BR pra formato E.164 sem "+": só dígitos, com DDI 55.
 * Ex.: "(11) 99999-9999" → "5511999999999". Usado nos links wa.me.
 */
export function normalizarTelefone(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith('55') && n.length >= 12) return n;
  return '55' + n;
}

/** true se o telefone normalizado tem 12 (fixo) ou 13 (celular) dígitos. */
export function telefoneValido(raw) {
  const n = normalizarTelefone(raw);
  return n.length === 12 || n.length === 13;
}

/**
 * Conta dias entre hoje (00:00) e a data informada (00:00).
 * Retorna número inteiro: 0 = hoje, 1 = amanhã, negativo = passado.
 */
export function diasAte(iso) {
  if (!iso) return null;
  const alvo = new Date(iso);
  if (Number.isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  const a = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** "hoje" / "amanhã" / "em 5 dias" */
export function textoDias(iso) {
  const n = diasAte(iso);
  if (n == null) return '—';
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n < 0) return `há ${-n} dia${n === -1 ? '' : 's'}`;
  return `em ${n} dias`;
}

/**
 * Fuso da clínica. Consulta é sempre exibida e agendada no horário de Belém,
 * independente do aparelho de quem olha — a paciente pode estar em Manaus,
 * no Acre ou viajando, e o horário combinado não muda.
 * Belém é UTC-3 fixo, sem horário de verão (mesma premissa de
 * netlify/functions/lembretes-consulta.js).
 */
export const TZ_CLINICA = 'America/Belem';
const TZ_CLINICA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "Quinta, 15/05 às 14:00" — no fuso da clínica */
export function dataConsultaBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dia = d.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA, weekday: 'short' }).replace('.', '');
  const data = d.toLocaleDateString('pt-BR', { timeZone: TZ_CLINICA, day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: TZ_CLINICA, hour: '2-digit', minute: '2-digit' });
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${cap}, ${data} às ${hora}`;
}

/** "14:30" — hora da consulta no fuso da clínica */
export function horaConsultaBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { timeZone: TZ_CLINICA, hour: '2-digit', minute: '2-digit' });
}

// ─── Validadores de JSON (Skill 6 e Skill 7) ───

/**
 * Estrutura esperada do plano (Skill 6):
 * {
 *   macros: { kcal, prot_g, cho_g, lip_g, agua_l?, fibras_g? },
 *   refeicoes: [
 *     { nome, horario?, emoji?, kcal?, alimentos: [{ nome, qty?, prot_g?, kcal?, subs?: string[] }], obs?, feita? }
 *   ],
 *   validade?: 'YYYY-MM-DD'
 * }
 */
export function validarPlano(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'JSON inválido — esperado objeto.' };
  if (!obj.macros || typeof obj.macros !== 'object') {
    return { ok: false, erro: 'Faltou o campo "macros" (objeto com kcal, prot_g, cho_g, lip_g).' };
  }
  if (!Array.isArray(obj.refeicoes) || obj.refeicoes.length === 0) {
    return { ok: false, erro: 'Faltou o campo "refeicoes" (array com pelo menos uma refeição).' };
  }
  for (let i = 0; i < obj.refeicoes.length; i++) {
    const r = obj.refeicoes[i];
    if (!r?.nome) return { ok: false, erro: `Refeição #${i + 1} precisa do campo "nome".` };
    if (r.alimentos && !Array.isArray(r.alimentos)) {
      return { ok: false, erro: `"alimentos" da refeição #${i + 1} precisa ser um array.` };
    }
  }
  return { ok: true };
}

/**
 * Estrutura esperada da lista de compras (Skill 7):
 * {
 *   lista: [ { categoria, emoji?, itens: string[] } ],
 *   paciente?: '...'
 * }
 */
export function validarLista(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'JSON inválido — esperado objeto.' };
  if (!Array.isArray(obj.lista) || obj.lista.length === 0) {
    return { ok: false, erro: 'Faltou o campo "lista" (array de categorias).' };
  }
  for (let i = 0; i < obj.lista.length; i++) {
    const cat = obj.lista[i];
    if (!cat?.categoria) return { ok: false, erro: `Categoria #${i + 1} precisa do campo "categoria".` };
    if (!Array.isArray(cat.itens)) return { ok: false, erro: `"itens" da categoria "${cat.categoria}" precisa ser um array.` };
  }
  return { ok: true };
}

/** Conta itens totais numa lista de compras */
export function contarItensLista(dados) {
  return dados?.lista?.reduce((a, c) => a + (c.itens?.length ?? 0), 0) ?? 0;
}

/**
 * Gera as parcelas a partir de uma venda. Retorna array de
 * { numero, valor, vencimento (YYYY-MM-DD) }.
 *
 *  pix/credito1x/dinheiro → 1 parcela única (vencimento = data_venda)
 *  parcelado              → N parcelas mensais (1ª na data, demais +1 mês cada)
 *  asaas (recorrente)     → N meses, vencimento no dia escolhido
 */
export function gerarParcelas({ forma_pgto, valor_total, data_venda, n_parcelas, dia_venc }) {
  const valor = Number(valor_total);
  const dv = new Date(data_venda + 'T00:00:00');

  const addMonths = (date, m) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + m);
    return d;
  };
  const fmtDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  if (['pix', 'dinheiro'].includes(forma_pgto)) {
    const n = Math.max(1, Number(n_parcelas) || 1);
    const base = Math.floor((valor * 100) / n) / 100;
    return Array.from({ length: n }, (_, i) => ({
      numero: i + 1,
      valor: i === n - 1 ? Number((valor - base * (n - 1)).toFixed(2)) : base,
      vencimento: fmtDate(addMonths(dv, i)),
      status: i === 0 ? 'pago' : 'pendente',
      ...(i === 0 && { data_pgto: fmtDate(dv) }),
    }));
  }

  if (forma_pgto === 'credito1x') {
    return [{ numero: 1, valor, vencimento: fmtDate(dv) }];
  }

  if (forma_pgto === 'parcelado') {
    const n = Math.max(2, Math.min(12, Number(n_parcelas) || 2));
    const base = Math.floor((valor * 100) / n) / 100;
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? Number((valor - base * (n - 1)).toFixed(2)) : base;
      out.push({ numero: i + 1, valor: v, vencimento: fmtDate(addMonths(dv, i)) });
    }
    return out;
  }

  if (forma_pgto === 'asaas') {
    const n = Math.max(1, Math.min(12, Number(n_parcelas) || 3));
    const dia = Number(dia_venc) || 15;
    const base = Math.floor((valor * 100) / n) / 100;
    const out = [];
    for (let i = 0; i < n; i++) {
      const venc = addMonths(dv, i);
      venc.setDate(Math.min(dia, 28));
      const v = i === n - 1 ? Number((valor - base * (n - 1)).toFixed(2)) : base;
      out.push({ numero: i + 1, valor: v, vencimento: fmtDate(venc) });
    }
    return out;
  }

  return [{ numero: 1, valor, vencimento: fmtDate(dv) }];
}

/**
 * Calcula status "efetivo" de uma parcela:
 *  - pago        → 'pago'
 *  - pendente + vencimento < hoje → 'atrasado'
 *  - resto → próprio status
 */
export function statusParcela(p) {
  if (p.status === 'pago') return 'pago';
  if (p.status === 'atrasado') return 'atrasado';
  if (p.vencimento) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const v = new Date(p.vencimento + 'T00:00:00');
    if (v < hoje) return 'atrasado';
  }
  return 'pendente';
}

const FORMAS_PGTO = {
  pix:       { label: 'Pix',                 icon: 'qrcode' },
  credito1x: { label: 'Crédito 1x',          icon: 'credit-card' },
  parcelado: { label: 'Parcelado cartão',    icon: 'credit-card' },
  asaas:     { label: 'Recorrente Asaas',    icon: 'refresh' },
  dinheiro:  { label: 'Dinheiro',            icon: 'cash' },
};
export function labelFormaPgto(f) { return FORMAS_PGTO[f]?.label ?? f; }
export function iconFormaPgto(f) { return FORMAS_PGTO[f]?.icon ?? 'cash'; }
export const FORMAS_PGTO_LIST = Object.entries(FORMAS_PGTO).map(([k, v]) => ({ id: k, ...v }));

// ─── Formas de pagamento para SAÍDAS (gastos) ───
const FORMAS_PGTO_GASTO = {
  pix:               { label: 'Pix',                icon: 'qrcode' },
  credito1x:         { label: 'Crédito 1x',         icon: 'credit-card' },
  parcelado:         { label: 'Parcelado cartão',   icon: 'credit-card' },
  debito_automatico: { label: 'Débito automático',  icon: 'refresh' },
  boleto:            { label: 'Boleto',             icon: 'receipt' },
  dinheiro:          { label: 'Dinheiro',           icon: 'cash' },
};
export function labelFormaPgtoGasto(f) { return FORMAS_PGTO_GASTO[f]?.label ?? f; }
export function iconFormaPgtoGasto(f) { return FORMAS_PGTO_GASTO[f]?.icon ?? 'cash'; }
export const FORMAS_PGTO_GASTO_LIST = Object.entries(FORMAS_PGTO_GASTO).map(([k, v]) => ({ id: k, ...v }));

// ─── Categorias de gasto ───
export const CATEGORIAS_GASTO = [
  { id: 'estrutura',    label: 'Estrutura',     emoji: '🏠', color: '#1a5a8c' },
  { id: 'software',     label: 'Software',      emoji: '💻', color: '#a08456' },
  { id: 'marketing',    label: 'Marketing',     emoji: '📣', color: '#c0651c' },
  { id: 'educacao',     label: 'Educação',      emoji: '📚', color: '#3a6b1a' },
  { id: 'profissional', label: 'Profissional',  emoji: '💼', color: '#6b6058' },
  { id: 'impostos',     label: 'Impostos',      emoji: '🧾', color: '#8c1a1a' },
  { id: 'materiais',    label: 'Materiais',     emoji: '🛒', color: '#c4a882' },
  { id: 'alimentacao',  label: 'Alimentação',   emoji: '🍴', color: '#3a6b1a' },
  { id: 'transporte',   label: 'Transporte',    emoji: '🚗', color: '#1a5a8c' },
  { id: 'outros',       label: 'Outros',        emoji: '✨', color: '#8c7b6b' },
];
export function infoCategoria(id) {
  return CATEGORIAS_GASTO.find(c => c.id === id) ?? CATEGORIAS_GASTO[CATEGORIAS_GASTO.length - 1];
}

// ─── Integração com videochamada e Google Calendar ───

/**
 * Gera link Jitsi único e estável para uma consulta.
 * Mesma consulta_id → mesmo link (Jitsi cria sala on-demand).
 */
export function gerarLinkJitsi(consultaId) {
  return `https://meet.jit.si/lapidare-${consultaId}`;
}

/**
 * Link efetivo de uma consulta: o customizado se existir, senão o Jitsi auto-gerado.
 */
export function linkCall(consulta) {
  if (!consulta) return null;
  if (consulta.meet_link) return consulta.meet_link;
  if (consulta.id) return gerarLinkJitsi(consulta.id);
  return null;
}

/**
 * URL do Google Calendar para adicionar evento pré-preenchido.
 */
export function gerarGoogleCalendarUrl({ titulo, dataHoraInicio, duracaoMin = 45, descricao = '', local = 'Online' }) {
  if (!dataHoraInicio) return '#';
  const ini = new Date(dataHoraInicio);
  const fim = new Date(ini.getTime() + duracaoMin * 60_000);
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo ?? 'Consulta',
    dates: `${fmt(ini)}/${fmt(fim)}`,
    details: descricao,
    location: local,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Minutos até a consulta (negativo = já passou). */
export function minutosAteConsulta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 60_000);
}

/** "Em breve" = entre 30min antes e 60min depois do horário. */
export function consultaEmBreve(iso) {
  const m = minutosAteConsulta(iso);
  if (m == null) return false;
  return m <= 30 && m >= -60;
}

// ─── Horários de agendamento de consulta (lista fixa, horário LOCAL) ───

/** As 21 opções de horário permitidas para agendar consulta (manhã e tarde). */
export const HORARIOS_CONSULTA = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00',
];

/** Horário sugerido por padrão ao abrir um agendamento. */
export const HORARIO_CONSULTA_PADRAO = '14:00';

/** true se a hora ("HH:mm") é uma das 21 opções válidas. */
export function horaConsultaValida(hora) {
  return HORARIOS_CONSULTA.includes(hora);
}

/** Data LOCAL "YYYY-MM-DD" para hoje + daysAhead. Nunca usa toISOString → sem bug de fuso. */
export function dataLocalISO(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Combina data "YYYY-MM-DD" + hora "HH:mm" DA CLÍNICA em ISO UTC para gravar
 * em consultas.data_hora. O offset é explícito: "14:00" significa 14:00 em
 * Belém, não no fuso do aparelho de quem agenda.
 */
export function montarDataHoraISO(dataLocal, hora) {
  return new Date(`${dataLocal}T${hora}:00-03:00`).toISOString();
}

/** Extrai { data, hora } no fuso da CLÍNICA (para semear/editar a partir de uma consulta existente). */
export function partesLocaisISO(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  if (Number.isNaN(d.getTime())) return { data: '', hora: HORARIO_CONSULTA_PADRAO };
  // Desloca pra Belém e lê em UTC — mesmo truque de lembretes-consulta.js:65
  const b = new Date(d.getTime() - TZ_CLINICA_OFFSET_MS);
  return {
    data: `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}`,
    hora: `${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`,
  };
}

// ─── Helpers de calendário (vista mensal) ───

const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function nomeMes(date = new Date()) { return MES_NOME[date.getMonth()]; }
export function mesAnoExtenso(date = new Date()) {
  return `${MES_NOME[date.getMonth()]} ${date.getFullYear()}`;
}

/** Matriz de 42 dias (6 semanas) para o mês informado. */
export function gerarDiasCalendario(mes) {
  const ano = mes.getFullYear();
  const m = mes.getMonth();
  const primeiroDia = new Date(ano, m, 1);
  const ultimoDia = new Date(ano, m + 1, 0);
  const diasNoMes = ultimoDia.getDate();
  const diaSemanaInicio = primeiroDia.getDay();

  const dias = [];
  for (let i = diaSemanaInicio; i > 0; i--) {
    dias.push({ data: new Date(ano, m, 1 - i), foraDoMes: true });
  }
  for (let i = 1; i <= diasNoMes; i++) {
    dias.push({ data: new Date(ano, m, i), foraDoMes: false });
  }
  while (dias.length < 42) {
    const ult = dias[dias.length - 1].data;
    dias.push({ data: new Date(ult.getFullYear(), ult.getMonth(), ult.getDate() + 1), foraDoMes: true });
  }
  return dias;
}

export function ehMesmoDia(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}
