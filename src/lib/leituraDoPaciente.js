// Traduz o exame de uma paciente (Emagrecimento ou Oncologia) para os marcadores do
// leitor funcional. Só entra o que tem unidade compatível; onde a unidade difere, converte.
// O que não tem correspondência segura (ex.: SHBG em nmol/L, PCR convencional) fica de fora.
import { numeroDe } from './examesEmagrecimento.js';

// [id do leitor, fator]. Fator multiplica o valor do Essentia para chegar à unidade do leitor.
const EMAGRECIMENTO = {
  glicemia_jejum: ['glic'], hba1c: ['hba1c'], insulina_jejum: ['ins'], acido_urico: ['au'],
  colesterol_total: ['ct'], hdl: ['hdl'], ldl: ['ldl'], triglicerideos: ['tg'],
  apoa1: ['apoa'], apob: ['apob'], lipoproteina_a: ['lpa'],
  hemacias: ['hem'], hemoglobina: ['hb'], hematocrito: ['ht'], vcm: ['vcm'], hcm: ['hcm'], chcm: ['chcm'], rdw: ['rdw'],
  leucocitos: ['leuco'], neutrofilos_pct: ['neut'], linfocitos_pct: ['linf'], monocitos_pct: ['mono'],
  eosinofilos_pct: ['eos'], basofilos_pct: ['baso'], plaquetas: ['plaq'],
  ferro_serico: ['fe'], ferritina: ['ferr'], ctlf: ['ctlf'], sat_transferrina: ['sat'],
  tgo: ['tgo'], tgp: ['tgp'], ggt: ['ggt'], fosfatase_alcalina: ['fa'],
  ureia: ['ur'], creatinina: ['cr'], etfg: ['tfg'], calcio_total: ['ca'], calcio_ionizado: ['cai'],
  tsh: ['tsh'], t4_livre: ['t4l'], t3_livre: ['t3l'], anti_tpo: ['tpo'], anti_tireoglobulina: ['atg'], tireoglobulina: ['tg_tir'],
  vitamina_b12: ['b12'], folato: ['fol'], vitamina_d: ['vitd'], vitamina_c: ['vitc'], magnesio: ['mg'], zinco: ['zn'],
  vitamina_a: ['ret', 0.0349],           // µg/dL → µmol/L
  vitamina_e: ['vite', 2.322],           // mg/L → µmol/L
  folato_eritrocitario: ['folE', 2.266], // ng/mL → nmol/L
  pcr_us: ['pcr'], vhs: ['vhs'], fibrinogenio: ['fib'], homocisteina: ['hcy'],
  testosterona_total: ['testo'], lh: ['lh'], fsh: ['fsh'], estradiol: ['e2', 0.1], // pg/mL → ng/dL
  progesterona: ['prog'], prolactina: ['prl'], dhea_s: ['sdhea'], pth: ['pth'],
};

// Oncologia: contagens vêm em /mm³; o leitor trabalha em % (calculado sobre os leucócitos).
const ONCO_DIRETO = {
  hemoglobina: 'hb', plaquetas: 'plaq', glicemia: 'glic', leucocitos: 'leuco',
  hematocrito: 'ht', hemacias: 'hem', vcm: 'vcm', hcm: 'hcm', chcm: 'chcm', rdw: 'rdw',
  ureia: 'ur', creatinina: 'cr', tfg: 'tfg', tgo: 'tgo', tgp: 'tgp', vitamina_b12: 'b12', vitamina_d: 'vitd',
};
const ONCO_PCT = { neutrofilos: 'neut', linfocitos: 'linf', monocitos: 'mono', eosinofilos: 'eos', basofilos: 'baso' };

const arred = (n) => Math.round(n * 1000) / 1000;

/** origem: 'emagrecimento' | 'oncologia'. linha: exame da paciente (plano; oncologia pode ter valores_extra). */
export function valoresParaLeitor(origem, linha) {
  const flat = { ...(linha ?? {}), ...((linha && linha.valores_extra) || {}) };
  const saida = {};
  if (origem === 'emagrecimento') {
    for (const [chave, [id, fator]] of Object.entries(EMAGRECIMENTO)) {
      const n = numeroDe(flat[chave]);
      if (n != null) saida[id] = arred(n * (fator ?? 1));
    }
    return saida;
  }
  for (const [chave, id] of Object.entries(ONCO_DIRETO)) {
    const n = numeroDe(flat[chave]);
    if (n != null) saida[id] = n;
  }
  const leuco = numeroDe(flat.leucocitos);
  if (leuco) {
    for (const [chave, id] of Object.entries(ONCO_PCT)) {
      const n = numeroDe(flat[chave]);
      if (n != null) saida[id] = arred(n / leuco * 100);
    }
  }
  return saida;
}

/** 'feminino' | 'masculino' | null → 'F' | 'M' (sem informação cai em F, como no resto do app). */
export const sexoDoLeitor = (sexo) => (sexo === 'masculino' ? 'M' : 'F');
