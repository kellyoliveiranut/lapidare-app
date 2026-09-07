/* ============================================================
   CATÁLOGO DOS EXAMES LABORATORIAIS — fonte única

   Antes deste arquivo, os 8 campos estavam escritos em três lugares que
   podiam discordar: o formulário da nutri, a tabela de histórico dela e a
   lista da paciente. Quem incluir um exame novo agora mexe SÓ aqui.

   Dois conceitos diferentes convivem em cada campo, e não devem ser
   confundidos:

     `ref`    — a FAIXA DE NORMALIDADE, mostrada como número na tela e
                desenhada como banda no gráfico. É o que responde "este
                valor está dentro do esperado?".

     `alerta` — os limiares de COR (verde / âmbar / vermelho). São os
                limiares oncológicos que já rodavam no ExamVal antes deste
                arquivo, copiados sem mudar um número, para nenhuma cor
                mudar sozinha na tela da Kelly.

   As duas coisas não coincidem de propósito: albumina 3,4 está fora da
   faixa (3,5–5,0) e já pinta de âmbar, enquanto hemoglobina 11,5 está fora
   da faixa mas ainda não é alerta clínico.

   O SENTIDO DO ALERTA está escrito nas chaves, não num booleano `reverse`:
     { baixo, critico }               → só piso  (Hb, Leuco, Neutro, Linfo, Plaq, Alb)
     { alto, criticoAlto }            → só teto  (PCR)
     { baixo, critico, alto, criticoAlto } → dois lados (Glicemia)
   Foi essa mudança que tornou a glicemia expressável: ela era o único campo
   sem cor nenhuma, porque o `reverse` antigo não sabia dizer "fora dos dois
   lados".
   ============================================================ */

export const CAMPOS_EXAME = [
  {
    key: 'hemoglobina', label: 'Hemoglobina', curto: 'Hb',
    unidade: 'g/dL', dec: 1, ph: '12,5',
    // Única faixa que varia por sexo. `pacientes.sexo` é 'feminino' |
    // 'masculino' | NULL (migration 2026-08-28); NULL cai no feminino, que
    // descreve a quase totalidade das pacientes. Os limiares de ALERTA
    // abaixo são os mesmos para os dois — são oncológicos, não de referência.
    ref: {
      feminino:  { min: 12, max: 16 },
      masculino: { min: 13, max: 17 },
    },
    alerta: { baixo: 11, critico: 8 },
  },
  {
    key: 'leucocitos', label: 'Leucócitos', curto: 'Leuco',
    unidade: '/mm³', dec: 0, ph: '6500',
    ref: { min: 4000, max: 11000 },
    alerta: { baixo: 3500, critico: 1000 },
  },
  {
    key: 'neutrofilos', label: 'Neutrófilos', curto: 'Neutro',
    unidade: '/mm³', dec: 0, ph: '3200',
    ref: { min: 1800, max: 7000 },
    alerta: { baixo: 1500, critico: 500 },
  },
  {
    key: 'linfocitos', label: 'Linfócitos', curto: 'Linfo',
    unidade: '/mm³', dec: 0, ph: '1800',
    ref: { min: 1000, max: 4000 },
    alerta: { baixo: 800, critico: 300 },
  },
  {
    key: 'plaquetas', label: 'Plaquetas', curto: 'Plaq',
    unidade: '/mm³', dec: 0, ph: '220000',
    ref: { min: 150000, max: 400000 },
    alerta: { baixo: 100000, critico: 50000 },
  },
  {
    key: 'pcr', label: 'PCR', curto: 'PCR',
    unidade: 'mg/L', dec: 1, ph: '5,0',
    // Só teto: PCR baixo não é achado. `max` sem `min` vira "< 5" na tela.
    ref: { max: 5 },
    alerta: { alto: 10, criticoAlto: 50 },
  },
  {
    key: 'albumina', label: 'Albumina', curto: 'Alb',
    unidade: 'g/dL', dec: 1, ph: '3,8',
    ref: { min: 3.5, max: 5.0 },
    alerta: { baixo: 3.5, critico: 3 },
  },
  {
    key: 'glicemia', label: 'Glicemia', curto: 'Gli',
    unidade: 'mg/dL', dec: 0, ph: '95',
    ref: { min: 70, max: 99 },
    alerta: { baixo: 70, critico: 50, alto: 100, criticoAlto: 126 },
  },
];

/** As 8 chaves, na ordem do catálogo. Usada pelo formulário e pelo insert. */
export const CHAVES_EXAME = CAMPOS_EXAME.map(c => c.key);

/**
 * A faixa de referência que vale para esta paciente.
 * Aceita tanto `{ min, max }` (faixa única) quanto
 * `{ feminino: {...}, masculino: {...} }`, e cai no feminino quando o sexo
 * não foi preenchido — que é o caso da maioria do cadastro.
 */
export function refDoCampo(campo, sexo) {
  const r = campo?.ref;
  if (!r) return null;
  if (r.min != null || r.max != null) return r;
  return r[sexo] ?? r.feminino ?? null;
}

/* ------------------------------------------------------------
   Lógica pura de leitura dos valores. Mora aqui, e não no
   componente, por dois motivos: é sobre o SIGNIFICADO dos números
   (que é o assunto deste arquivo), e assim roda no node — um .jsx
   não roda direto, e estas três funções são as que precisam de
   conferência de verdade.
   O componente ValorExame.jsx reexporta as três, então quem importa
   de lá continua funcionando.
   ------------------------------------------------------------ */

/** Formata o valor com as casas decimais do campo, em pt-BR. */
export function fmtNumExame(v, dec = 0) {
  if (v == null) return null;
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

/**
 * 'critico' | 'atencao' | 'normal', ou null quando não há valor.
 * O sentido vem das chaves do `alerta`, não de um flag: um campo pode ter
 * só piso, só teto, ou os dois.
 */
export function nivelExame(campo, v) {
  if (v == null) return null;
  const a = campo?.alerta ?? {};
  const n = Number(v);
  if ((a.critico != null && n <= a.critico) || (a.criticoAlto != null && n >= a.criticoAlto)) return 'critico';
  if ((a.baixo   != null && n <= a.baixo)   || (a.alto        != null && n >= a.alto))        return 'atencao';
  return 'normal';
}

/**
 * A faixa como texto: "12–16", "< 5", "> 1.800".
 * Devolve null quando o campo não tem faixa — aí a tela não escreve nada,
 * em vez de escrever um traço que pareceria dado faltando.
 */
export function textoRef(campo, sexo) {
  const r = refDoCampo(campo, sexo);
  if (!r) return null;
  // As casas decimais aqui saem dos LIMITES, não do `dec` do campo: com `dec`
  // a hemoglobina virava "12,0–16,0" e o PCR "< 5,0". Se algum limite tem
  // fração, os dois a mostram ("3,5–5,0"); se nenhum tem, nenhum mostra
  // ("12–16"). Assim a faixa nunca fica torta nem inventa precisão.
  const limites = [r.min, r.max].filter(v => v != null);
  const casas = limites.some(v => v % 1 !== 0) ? (campo.dec ?? 0) : 0;
  const f = (v) => fmtNumExame(v, casas);
  if (r.min != null && r.max != null) return `${f(r.min)}–${f(r.max)}`;
  if (r.max != null) return `< ${f(r.max)}`;
  if (r.min != null) return `> ${f(r.min)}`;
  return null;
}
