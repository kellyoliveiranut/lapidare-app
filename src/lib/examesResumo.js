// Resumo dos exames (Emagrecimento e Oncologia): situação, aviso de exame antigo e
// dados do relatório. Funções puras (rodam no node; testadas).
//
// Vocabulário: o app diz só "fora da referência". Nunca "crítico"/"deficiência" em texto
// livre — a interpretação clínica é da nutricionista.
import { refDoCampo, nivelExame, textoRef, fmtNumExame } from '../data/exames_referencia.js';
import { numeroDe } from './examesEmagrecimento.js';

const UM_DIA = 86400000;

/** Dias entre duas datas ISO (YYYY-MM-DD): b - a. null se alguma for inválida. */
export function diasEntre(a, b) {
  const re = /^(\d{4})-(\d{2})-(\d{2})/;
  const ma = re.exec(String(a ?? '')), mb = re.exec(String(b ?? ''));
  if (!ma || !mb) return null;
  const da = Date.UTC(+ma[1], +ma[2] - 1, +ma[3]), db = Date.UTC(+mb[1], +mb[2] - 1, +mb[3]);
  return Math.round((db - da) / UM_DIA);
}

/** 'normal' | 'atencao' | 'critico' | null (sem valor ou sem faixa). Funciona para os dois catálogos. */
export function situacaoValor(campo, valor, sexo) {
  if (valor == null || valor === '') return null;
  if (typeof campo?.nivel === 'function') return campo.nivel(campo.tipo === 'texto' ? valor : numeroDe(valor), sexo);
  const n = numeroDe(valor);
  if (n == null) return null;
  const faixa = refDoCampo(campo, sexo);
  const alerta = nivelExame(campo, n);
  const fora = faixa && ((faixa.min != null && n < faixa.min) || (faixa.max != null && n > faixa.max));
  if (alerta === 'normal' && fora) return 'atencao';
  if (alerta === 'normal' && !faixa && !campo?.alerta) return null;
  return alerta;
}

const ehFora = (n) => n === 'atencao' || n === 'critico';

/** Texto do valor para exibição. */
export function textoValor(campo, valor) {
  if (valor == null || valor === '') return '—';
  if (campo?.tipo === 'texto') return String(valor);
  const n = numeroDe(valor);
  return n == null ? '—' : fmtNumExame(n, campo?.dec ?? 0);
}

/** Faixa como texto, ou '—'. */
export function textoFaixa(campo, sexo) {
  return textoRef(campo, sexo) ?? campo?.refTexto ?? '—';
}

/**
 * Resumo de UM exame (objeto plano {chave: valor}).
 * `campos` = marcadores a avaliar (os acompanhados). Só conta quem tem valor E faixa.
 */
export function resumirExame(campos, exame, sexo) {
  const fora = [];
  let avaliados = 0;
  for (const c of campos) {
    const v = exame?.[c.key];
    const n = situacaoValor(c, v, sexo);
    if (n == null) continue;
    avaliados += 1;
    if (ehFora(n)) fora.push({ campo: c, valor: v, nivel: n });
  }
  return { avaliados, fora, dentro: avaliados - fora.length };
}

/** Aviso de exame antigo/ausente. `prazoDias` vem da nutri. */
export function avisoDesatualizado(dataUltimo, hojeISO, prazoDias) {
  if (!dataUltimo) return { tipo: 'sem', dias: null };
  const dias = diasEntre(dataUltimo, hojeISO);
  if (dias == null) return { tipo: null, dias: null };
  return { tipo: dias > prazoDias ? 'antigo' : null, dias };
}

/**
 * Dados do bloco "Exames laboratoriais" do relatório.
 * `exames`: planos ({data_exame, ...valores}); qualquer ordem. Devolve null se não houver exame.
 */
export function montarResumoRelatorio({ campos, exames, sexo }) {
  const lista = [...(exames ?? [])].filter(e => e?.data_exame).sort((a, b) => String(b.data_exame).localeCompare(String(a.data_exame)));
  if (!lista.length) return null;
  const ultimo = lista[0], anterior = lista[1] ?? null;
  const linhas = campos
    .filter(c => ultimo[c.key] != null && ultimo[c.key] !== '')
    .map(c => {
      const n = situacaoValor(c, ultimo[c.key], sexo);
      return {
        rotulo: c.label, unidade: c.unidade || '', valor: textoValor(c, ultimo[c.key]),
        faixa: textoFaixa(c, sexo),
        situacao: n == null ? '—' : (ehFora(n) ? 'fora da referência' : 'dentro da referência'),
      };
    });
  const comparacao = anterior ? campos
    .filter(c => c.tipo !== 'texto')
    .map(c => {
      const a = numeroDe(anterior[c.key]), b = numeroDe(ultimo[c.key]);
      if (a == null || b == null) return null;
      const dif = Math.round((b - a) * 1000) / 1000;
      return { rotulo: c.label, unidade: c.unidade || '', a: fmtNumExame(a, c.dec ?? 0), b: fmtNumExame(b, c.dec ?? 0),
        dif: `${dif > 0 ? '+' : ''}${fmtNumExame(dif, c.dec ?? 0)}` };
    }).filter(Boolean) : [];
  return {
    dataUltimo: ultimo.data_exame, linhas,
    dataAnterior: anterior?.data_exame ?? null, comparacao,
    resumo: resumirExame(campos, ultimo, sexo),
  };
}
