// Leitor funcional de exames (apoio da nutricionista). Funções puras, rodam no node.
// Cálculos e padrões vêm do MayLab Intelligence (Mayara Della Costa). A interpretação
// e a conduta continuam sendo da Kelly: aqui só se compara valor com faixa e se aponta
// onde olhar com mais atenção.
import { numeroDe } from './examesEmagrecimento.js';

/** Arredonda para exibir ("1,23"). */
export function fmt(n, casas = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

/** Classifica um valor frente ao exame: { classe: ok|ok2|lo|hi|na, texto }. */
export function statusDoExame(ex, valor) {
  if (valor == null || !Number.isFinite(valor)) return { classe: 'na', texto: '' };
  if (ex.tiers) {
    const t = ex.tiers.find(([lim]) => lim == null || valor <= lim);
    return t ? { classe: t[1], texto: t[2] } : { classe: 'na', texto: '' };
  }
  const r = ex.r;
  if (!r) return { classe: 'na', texto: 'faixa varia (ciclo, idade ou sexo)' };
  const [min, max] = r;
  if ((min == null || valor >= min) && (max == null || valor <= max)) return { classe: 'ok', texto: 'dentro do ótimo' };
  const b = ex.b;
  if (b && (b[0] == null || valor >= b[0]) && (b[1] == null || valor <= b[1])) return { classe: 'ok2', texto: 'bom, mas fora do ótimo' };
  if (min != null && valor < min) return { classe: 'lo', texto: 'abaixo do ideal' };
  return { classe: 'hi', texto: 'acima do ideal' };
}

/** Lê os valores digitados ({id: "texto"}) e devolve getter numérico. */
export function leitorDe(valores) {
  const mapa = {};
  for (const [id, v] of Object.entries(valores ?? {})) {
    const n = numeroDe(v);
    if (n != null) mapa[id] = n;
  }
  return (id) => (mapa[id] ?? null);
}

/** Cálculos que dependem de mais de um exame. sexo: 'F' | 'M'. */
export function calculos(g, sexo = 'F') {
  const C = [];
  const add = (n, v, s, fx) => C.push({ n, v, s: { classe: s[0], texto: s[1] }, fx });
  const hb = g('hb'), ht = g('ht');
  if (hb != null && ht != null) {
    const x = hb * 3;
    add('Hemoconcentração ou hemodiluição', `${fmt(x, 1)} vs ${fmt(ht, 1)}`,
      x > ht ? ['hi', 'hemoconcentração'] : x < ht ? ['lo', 'hemodiluição'] : ['ok', 'normovolemia'], 'Hemoglobina × 3 comparada ao hematócrito');
  }
  const t3l = g('t3l'), t3r = g('t3r'), t4l = g('t4l');
  if (t3l != null && t3r) {
    const r = t3l / t3r * 100;
    add('Razão T3 livre / T3 reverso', fmt(r, 1), r >= 15 && r <= 22 ? ['ok', 'ok (15 a 22)'] : ['hi', 'possível hipofunção tireoidiana'], 'T3L (pg) ÷ T3R (ng) × 100 · ideal 15 a 22');
  }
  if (t3l != null && t4l) {
    const r = (t3l / 10) / t4l;
    add('Razão T3 livre / T4 livre', fmt(r, 3), r >= 0.27 && r <= 0.37 ? ['ok', 'ok (0,27 a 0,37)'] : ['hi', r < 0.27 ? 'dificuldade de converter T4 em T3' : 'fora de 0,27 a 0,37: possível hipofunção'], 'T3L convertido para ng/dL (÷10) ÷ T4L · ideal 0,27 a 0,37');
  }
  const ins = g('ins'), gl = g('glic');
  if (ins != null && gl) {
    const mm = gl * 0.0555, h = ins * mm / 22.5, b = 20 * ins / (mm - 3.5);
    add('HOMA1-IR', fmt(h), h < 1.21 ? ['ok2', 'abaixo de 1,21'] : h <= 1.45 ? ['ok', 'normal (1,21 a 1,45)'] : h <= 2.6 ? ['hi', 'limítrofe para resistência à insulina'] : ['hi', 'resistência à insulina'], 'Insulina × glicose (mmol/L) ÷ 22,5');
    const bOk = Number.isFinite(b) && b > 0;
    add('HOMA1 %B', bOk ? `${fmt(b, 0)}%` : '—', !bOk ? ['na', 'glicose muito baixa para o cálculo'] : b < 65 ? ['lo', 'baixa função pancreática'] : b <= 100 ? ['ok', 'normal (65 a 100%)'] : b <= 173 ? ['hi', 'limítrofe (101 a 173%)'] : ['hi', 'resistência à insulina (> 173%)'], '20 × insulina ÷ (glicose mmol/L − 3,5)');
  }
  const ct = g('ct'), hdl = g('hdl'), ldl = g('ldl'), tg = g('tg'), apob = g('apob'), apoa = g('apoa');
  if (ct != null && hdl) { const r = ct / hdl; add('Índice de Castelli I', fmt(r), r < 4.4 ? ['ok', 'baixo risco para doença arterial coronária'] : ['hi', 'alto risco para doença arterial coronária'], 'CT ÷ HDL · meta < 4,4'); }
  if (ldl != null && hdl) { const r = ldl / hdl; add('Índice de Castelli II', fmt(r), r < 3.3 ? ['ok', 'baixo risco para doença arterial coronária'] : ['hi', 'alto risco para doença arterial coronária'], 'LDL ÷ HDL · meta < 3,3'); }
  if (ct != null && hdl != null) { const r = ct - hdl; add('Colesterol não-HDL', `${fmt(r, 0)} mg/dL`, r < 100 ? ['ok', 'abaixo de 100 (meta de risco muito alto)'] : r < 130 ? ['ok2', 'abaixo de 130 (meta de alto risco)'] : r < 145 ? ['ok2', 'abaixo de 145 (meta de risco moderado)'] : ['hi', 'acima de 145'], 'CT − HDL · meta conforme o risco cardiovascular'); }
  if (ldl != null && apob) { const r = ldl / apob; add('Razão LDL / ApoB', fmt(r), r < 1.2 ? ['hi', 'alta aterogenicidade (partículas pequenas e densas)'] : ['ok', 'baixa aterogenicidade'], 'LDL ÷ ApoB · < 1,2 = alto risco'); }
  if (apob != null && apoa) { const r = apob / apoa, lim = sexo === 'M' ? 0.6 : 0.5; add('Razão ApoB / ApoA1', fmt(r), r < lim ? ['ok', 'ok'] : ['hi', 'alto risco cardiovascular'], `ApoB ÷ ApoA1 · ${sexo === 'M' ? 'homem < 0,6' : 'mulher < 0,5'}`); }
  if (tg != null && hdl) { const rm = (tg / 88.57) / (hdl / 38.67), r = tg / hdl; add('Razão TG / HDL (mmol/L)', fmt(rm), rm <= 1.4 ? ['ok', 'baixo risco para doença coronária'] : ['hi', 'alto risco: LDL pequena e densa'], `Em mmol/L: ≤ 1,4 · em mg/dL deu ${fmt(r)}`); }
  const tgo = g('tgo'), tgp = g('tgp');
  if (tgo != null && tgp) { const r = tgo / tgp; add('Razão TGO / TGP', fmt(r), r > 1.5 ? ['hi', 'possível disfunção hepática'] : r > 1 ? ['ok2', 'acima de 1,0: investigar lesão hepática'] : ['ok', 'avaliar outros marcadores de função hepática'], 'TGO ÷ TGP · > 1,5 = possível disfunção hepática'); }
  const ggt = g('ggt'), fa = g('fa');
  if (ggt != null && fa) { const r = ggt / fa; add('Razão GGT / fosfatase alcalina', fmt(r), r > 2.5 ? ['hi', 'alteração hepática ou álcool em excesso'] : ['ok', 'até 2,5'], 'GGT ÷ FA · > 2,5 = alerta'); }
  const ne = g('neut'), li = g('linf');
  if (ne != null && li) { const r = ne / li; add('Razão neutrófilos / linfócitos', fmt(r), r > 3 ? ['hi', 'processo inflamatório'] : r > 1.5 ? ['ok2', 'tendência para inflamação'] : ['ok', 'normal (≤ 1,5)'], 'Neutrófilos ÷ linfócitos · ótimo < 1,5'); }
  const lh = g('lh'), fsh = g('fsh');
  if (lh != null && fsh) { const r = lh / fsh; add('Razão LH / FSH', fmt(r), r < 2 ? ['ok', 'normal'] : ['hi', 'hipótese de SOMP'], 'LH ÷ FSH · > 2 = hipótese de SOMP'); }
  const leu = g('leuco'), mo = g('mono');
  if (leu != null && mo != null && hdl) { const abs = leu * mo / 100, r = abs / hdl; add('Razão monócitos / HDL', fmt(r, 1), r > 10.5 ? ['hi', 'alto risco cardiovascular'] : r > 8.1 ? ['hi', 'médio risco cardiovascular'] : ['ok', 'baixo risco cardiovascular'], `Monócitos absolutos (${fmt(abs, 0)}/mm³, calculado de leucócitos × %) ÷ HDL`); }
  const vcm = g('vcm'), rdw = g('rdw'), he = g('hem');
  if (vcm != null && rdw != null && he) { const r = vcm * rdw / he; add('Possibilidade de talassemia (RDWI)', fmt(r, 0), (rdw < 14 && r < 220) ? ['hi', 'sugere talassemia beta'] : ['lo', 'padrão de deficiência de ferro'], `VCM × RDW ÷ eritrócitos · RDW < 14 e RDWI < 220 = talassemia beta${vcm >= 80 ? ' · VCM normal: valorize pouco esse cálculo' : ''}`); }
  return C;
}

/** Padrões que merecem atenção. Cada item: { t, d }. */
export function padroes(g) {
  const P = [];
  const p = (t, d) => P.push({ t, d });
  const lo = (id, x) => g(id) != null && g(id) < x;
  const hi = (id, x) => g(id) != null && g(id) > x;
  if (lo('vcm', 80) || lo('hcm', 26) || lo('chcm', 31)) {
    if (hi('rdw', 13.5)) p('Sinais de deficiência de ferro', 'VCM/HCM/CHCM baixos com RDW subindo indicam deficiência de ferro, mesmo antes de a hemoglobina cair. Confirmar com ferritina.');
    else p('Índices hematimétricos baixos', 'Correlacionar com ferritina, saturação de transferrina e capacidade de ligação do ferro.');
  }
  if (hi('vcm', 100) && hi('rdw', 14.5)) p('Padrão de B12 / folato', 'VCM e RDW altos sugerem deficiência de B12 ou B9. Avaliar B12, folato e homocisteína.');
  if (lo('hb', 12) && g('vcm') != null && g('vcm') >= 80 && g('vcm') <= 100 && g('rdw') != null && g('rdw') <= 14.5) p('Hemoglobina baixa com índices normais', 'Verificar hemodiluição (Hb × 3 vs hematócrito) e confirmar o ferro pela ferritina.');
  if (hi('eos', 2) && hi('baso', 0.5)) p('Eosinófilos e basófilos altos', 'Sugere alergia imediata ou parasitose. Confirmar com parasitológico de fezes.');
  else if (hi('eos', 2)) p('Eosinófilos altos com basófilos normais', 'Sugere alergia tardia (alimentar) ou parasitose.');
  if (hi('mono', 8)) p(hi('eos', 2) ? 'Monócitos e eosinófilos altos' : 'Monócitos altos isolados', hi('eos', 2) ? 'Pensar em parasitose ou alergia tardia.' : 'Sugere disbiose / infecção intestinal crônica.');
  if (g('hcy') != null && g('hcy') >= 12) {
    if (g('b12') != null && g('b12') < 350) p('Homocisteína alta + B12 baixa', 'Indicativo de deficiência de B12.');
    else if (g('b12') != null) p('Homocisteína alta com B12 normal', 'Indicativo de deficiência de folato. Considerar MTHFR: se suplementar, metilfolato.');
    else p('Homocisteína alta', 'Pedir B12 e folato junto.');
  }
  if (hi('ferr', 100)) {
    const inf = ['pcr', 'vhs', 'fib'].filter(x => g(x) != null);
    p('Ferritina acima do ideal', `Pode estar refletindo inflamação, não reserva de ferro.${inf.length ? '' : ' Solicitar PCR-us, VHS e fibrinogênio para correlacionar.'}`);
  }
  if (hi('tsh', 2.5)) p('TSH acima de 2,5', 'Pode ser o início de uma hipofunção tireoidiana. Correlacionar com sinais e sintomas, T3 livre, T3 reverso e anticorpos.');
  if (hi('tpo', 5.61) || hi('atg', 4.11)) p('Anticorpos tireoidianos positivos', 'Doença autoimune instalada. Acompanhar a função tireoidiana a cada 6 meses e dar suporte com zinco, selênio, ferro, iodo, vitamina D e microbiota.');
  if (g('t4l') != null && g('t3l') != null && g('t4l') < 3 * (g('t3l') / 10)) p('T4 menor que 3× o T3 livre', 'Para uma boa conversão, o T4 precisa ser pelo menos 3× o T3 livre.');
  if (hi('glic', 92)) p('Glicose acima de 92', 'Possível resistência à insulina: correlacionar com insulina, HOMA e glicada.');
  if (g('hdl') != null && g('hdl') >= 60 && lo('apoa', 120)) p('HDL alto com ApoA1 baixa', 'Sugere HDL disfuncional.');
  if (hi('lpa', 30)) p('Lipoproteína (a) elevada', 'Fator de risco cardiovascular mesmo com LDL normal (genético).');
  if (lo('zn', 96) && (lo('ferr', 40) || lo('hb', 12))) p('Zinco e ferro baixos juntos', 'A deficiência de zinco agrava a anemia ferropriva.');
  if (hi('pth', 65) && lo('vitd', 40)) p('PTH alto com vitamina D baixa', 'Compatível com deficiência de vitamina D. O PTH pode guiar o ajuste da dose.');
  return P;
}

/** Busca por nome, grupo ou associação (sem acento, sem caixa). */
export function buscarExames(lista, termo) {
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(termo).trim();
  if (!t) return lista;
  return lista.filter(e => norm([e.n, e.g, e.v, e.cor, e.con, ...(e.a ?? [])].join(' ')).includes(t));
}

const CHAVE_FASE = { fol: 'folicular', ovu: 'ovulatório', lut: 'lútea', meno: 'menopausa', g1: '1º tri', g2: '2º tri' };

/** Para progesterona/estradiol: devolve só o trecho da fase escolhida (ou null). */
export function faixaDaFase(ex, fase) {
  const chave = CHAVE_FASE[fase];
  if (!chave || !['prog', 'e2'].includes(ex.id)) return null;
  const parte = ex.v.split(' · ').find(p => p.toLowerCase().includes(chave));
  return parte ? parte.replace(/^Mulheres:\s*/, '') : null;
}
