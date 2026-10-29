/* ============================================================
   CATÁLOGO DOS EXAMES DO EMAGRECIMENTO

   Só NOMES e UNIDADES de laudo. As faixas de referência e os limites de
   alerta NÃO moram aqui de propósito: são conteúdo clínico da Kelly, que
   digita uma vez na própria tela (tabela exames_emag_referencias). Sem
   faixa preenchida, o valor aparece sem cor e sem "ref." — o app nunca
   assume um limite por conta própria.

   `unidade` é a unidade em que o laudo costuma vir; a leitura por IA só
   aceita o valor quando o laudo estiver nessa unidade (senão deixa vazio
   para a nutri digitar).
   ============================================================ */

export const GRUPOS_EXAME_EMAG = [
  { id: 'glicemia', label: 'Glicemia e insulina' },
  { id: 'lipidios', label: 'Lipídios' },
  { id: 'tireoide', label: 'Tireoide e vitaminas' },
  { id: 'outros',   label: 'Outros' },
];

export const CAMPOS_EMAG = [
  { key: 'glicemia_jejum',  grupo: 'glicemia', label: 'Glicemia de jejum',    curto: 'Glic',  unidade: 'mg/dL',   dec: 0 },
  { key: 'insulina_jejum',  grupo: 'glicemia', label: 'Insulina de jejum',    curto: 'Ins',   unidade: 'µUI/mL',  dec: 1 },
  { key: 'homa_ir',         grupo: 'glicemia', label: 'HOMA-IR',              curto: 'HOMA',  unidade: '',        dec: 2, calculado: true },
  { key: 'hba1c',           grupo: 'glicemia', label: 'Hemoglobina glicada',  curto: 'HbA1c', unidade: '%',       dec: 1 },
  { key: 'colesterol_total', grupo: 'lipidios', label: 'Colesterol total',    curto: 'CT',    unidade: 'mg/dL',   dec: 0 },
  { key: 'ldl',             grupo: 'lipidios', label: 'LDL',                  curto: 'LDL',   unidade: 'mg/dL',   dec: 0 },
  { key: 'hdl',             grupo: 'lipidios', label: 'HDL',                  curto: 'HDL',   unidade: 'mg/dL',   dec: 0 },
  { key: 'triglicerideos',  grupo: 'lipidios', label: 'Triglicerídeos',       curto: 'TG',    unidade: 'mg/dL',   dec: 0 },
  { key: 'tsh',             grupo: 'tireoide', label: 'TSH',                  curto: 'TSH',   unidade: 'µUI/mL',  dec: 2 },
  { key: 't4_livre',        grupo: 'tireoide', label: 'T4 livre',             curto: 'T4L',   unidade: 'ng/dL',   dec: 2 },
  { key: 'vitamina_d',      grupo: 'tireoide', label: 'Vitamina D (25-OH)',   curto: 'Vit D', unidade: 'ng/mL',   dec: 0 },
  { key: 'vitamina_b12',    grupo: 'tireoide', label: 'Vitamina B12',         curto: 'B12',   unidade: 'pg/mL',   dec: 0 },
  { key: 'ferritina',       grupo: 'outros',   label: 'Ferritina',            curto: 'Ferr',  unidade: 'ng/mL',   dec: 0 },
  { key: 'pcr_us',          grupo: 'outros',   label: 'PCR ultrassensível',   curto: 'PCR-us', unidade: 'mg/L',   dec: 1 },
  { key: 'tgo',             grupo: 'outros',   label: 'TGO (AST)',            curto: 'TGO',   unidade: 'U/L',     dec: 0 },
  { key: 'tgp',             grupo: 'outros',   label: 'TGP (ALT)',            curto: 'TGP',   unidade: 'U/L',     dec: 0 },
];

export const CHAVES_EMAG = CAMPOS_EMAG.map(c => c.key);

/** Pré-seleção do pedido de exames de emagrecimento (itens do catálogo de solicitação). */
export const PEDIDO_EMAGRECIMENTO = [
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Insulina de jejum e HOMA-IR',
  'Perfil lipídico completo (colesterol total, HDL, LDL, triglicerídeos)',
  'Hepático (TGO/AST, TGP/ALT, gama-GT, fosfatase alcalina, bilirrubinas)',
  'TSH',
  'T4 livre',
  'Vitamina D (25-OH)',
  'Vitamina B12',
  'Ferritina',
  'PCR ultrassensível',
];
