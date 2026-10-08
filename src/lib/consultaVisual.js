/* ============================================================
   APARÊNCIA DA CONSULTA — cor por tipo e rótulo de modalidade

   Saiu de dentro de Agenda.jsx quando a régua do dia (_ReguaDoDia.jsx)
   passou a precisar das mesmas cores e do mesmo ícone. Importar da Agenda
   criaria ciclo (Agenda → Régua → Agenda), então as três coisas puras
   vieram para cá.

   Nada de estado, nada de React: só a tradução de um valor do banco para
   o que aparece na tela.
   ============================================================ */

/** Cor do tipo de consulta. É a mesma da bolinha do calendário e da legenda. */
export function tipoColor(tipo) {
  if (tipo === 'primeira') return 'var(--blue)';
  if (tipo === 'avaliacao') return 'var(--orange)';
  return 'var(--green)';
}

/**
 * Versão clara da cor do tipo, para fundo de linha. Mesmo mapa do tipoColor,
 * com os tokens *-soft do tokens.css — e não alpha concatenado na custom
 * property, que é CSS inválido.
 */
export function tipoColorSoft(tipo) {
  if (tipo === 'primeira') return 'var(--blue-soft)';
  if (tipo === 'avaliacao') return 'var(--orange-soft)';
  return 'var(--green-soft)';
}

// Modalidade da consulta. O banco só aceita 'online' | 'presencial'
// (check consultas_modalidade_check). Híbrido não existe aqui — segue só em
// pacientes.modalidade, no perfil da paciente.
export const MODALIDADES_CONSULTA = [
  { value: 'online',     label: 'Online',     icone: 'ti-video'   },
  { value: 'presencial', label: 'Presencial', icone: 'ti-map-pin' },
];

export function modalidadeInfo(modalidade) {
  return MODALIDADES_CONSULTA.find(m => m.value === modalidade) ?? MODALIDADES_CONSULTA[0];
}
