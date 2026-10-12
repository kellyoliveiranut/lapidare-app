/**
 * Conferência da confirmação do registro (bloco-94, regra da Kelly de 12/10/2026).
 *
 * Cada confirmação exige conferência documental, identificação de quem
 * conferiu e data. A conta de login é compartilhada, então "quem conferiu" é
 * DIGITADO, nunca tirado da sessão. A data/hora é gravada pelo gatilho do
 * banco (trat_onco_registro_auditoria): o app nunca envia
 * registro_confirmado_em.
 *
 * Módulo puro: sem React e sem Supabase, para o teste rodar no Node.
 */
import { registroPendente } from './protocoloCiclo.js';

/** Mesmos limites do check trat_onco_registro_conferencia_chk no banco. */
export const LIMITES_CONFERENCIA = { por: { min: 5, max: 120 }, fonte: { min: 5, max: 300 } };

const MSG = {
  por: {
    min: 'Informe nome e registro profissional (mín. 5 caracteres).',
    max: 'Nome e registro profissional: máx. 120 caracteres.',
  },
  fonte: {
    min: 'Informe a fonte da conferência (mín. 5 caracteres).',
    max: 'Fonte da conferência: máx. 300 caracteres.',
  },
};

// Tamanho em pontos de código, como o char_length do banco ("🩺" conta 1).
const tamanho = s => [...s].length;
const limpo = v => (v == null ? '' : String(v)).trim();

/**
 * { ok, erros: { por?, fonte? }, valores: { por, fonte } }. `valores` já vem
 * sem espaços nas pontas; undefined, null e só espaços contam como vazio.
 */
export function validarConferencia({ por, fonte } = {}) {
  const valores = { por: limpo(por), fonte: limpo(fonte) };
  const erros = {};
  for (const campo of ['por', 'fonte']) {
    const n = tamanho(valores[campo]);
    if (n < LIMITES_CONFERENCIA[campo].min) erros[campo] = MSG[campo].min;
    else if (n > LIMITES_CONFERENCIA[campo].max) erros[campo] = MSG[campo].max;
  }
  return { ok: Object.keys(erros).length === 0, erros, valores };
}

/** Objeto do update de confirmação. Lança se a conferência não passar. */
export function gravacaoConfirmar({ por, fonte } = {}) {
  const v = validarConferencia({ por, fonte });
  if (!v.ok) throw new Error(Object.values(v.erros).join(' '));
  return {
    registro_pendente: false,
    registro_confirmado_por: v.valores.por,
    registro_confirmado_fonte: v.valores.fonte,
  };
}

/** Objeto do update que volta o registro a pendente e apaga a conferência. */
export function gravacaoPendente() {
  return {
    registro_pendente: true,
    registro_confirmado_em: null,
    registro_confirmado_por: null,
    registro_confirmado_fonte: null,
  };
}

// Fuso fixo: o texto não pode depender do fuso da máquina de quem abre a tela.
const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Belem',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function dataHoraBelem(instante) {
  const p = Object.fromEntries(FORMATO.formatToParts(new Date(instante)).map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/**
 * Texto da confirmação registrada, ou null se o registro está pendente
 * (mesma regra de registroPendente(): só `false` exato é confirmado).
 */
export function textoConfirmacao(trat) {
  if (registroPendente(trat)) return null;
  if (!trat?.registro_confirmado_em) return 'Registro confirmado (sem registro de quem conferiu).';
  return `Registro confirmado em ${dataHoraBelem(trat.registro_confirmado_em)} por ${trat.registro_confirmado_por} · fonte: ${trat.registro_confirmado_fonte}`;
}
