/**
 * Listas canônicas de tipo de plano e modalidade da paciente.
 *
 * Mesma razão de existir de lib/objetivos.js: estas listas nasceram copiadas
 * em cada tela que precisava do select. Quando o cadastro rápido pela Agenda
 * pediu uma quarta cópia, elas viraram arquivo — antes que a história de
 * OBJETIVOS se repetisse (três cópias, uma defasada, objetivo da paciente
 * apagado em silêncio ao salvar o perfil).
 *
 * OBJETIVOS mora em lib/objetivos.js e continua lá: aquele módulo carrega
 * também a normalização de texto livre, que só o importador de CSV usa.
 *
 * NÃO confundir MODALIDADES (da paciente, capitalizada, aceita 'Híbrido') com
 * a modalidade da CONSULTA, que é minúscula e só aceita online|presencial —
 * essa vive em Agenda.jsx e é travada pelo check consultas_modalidade_check.
 */

/** Tipo de plano contratado. O valor gravado é minúsculo: o gate do plano
 *  avulso compara com 'avulsa' estrito. */
export const PLANOS = [
  { v: 'avulsa',   l: 'Avulsa' },
  { v: 'essentia', l: 'Essentia' },
];

/** Modalidade do acompanhamento, como gravada em pacientes.modalidade. */
export const MODALIDADES = ['Presencial', 'Online', 'Híbrido'];
