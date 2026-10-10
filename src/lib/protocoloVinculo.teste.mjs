/**
 * Teste standalone do vínculo de protocolo (decisões da Kelly em 10/10/2026).
 * Roda com `node src/lib/protocoloVinculo.teste.mjs`, sem framework.
 *
 * 'T—AC DD'/'T-AC DD', 'Ac DD' e '(T-ddAC),'/'T-ddAC' não se vinculam sozinhos
 * a nenhuma ficha até a prescrição ser conferida; a ficha "AC-T dose densa"
 * continua acessível pelo nome exato e pelos outros aliases. FOLFIRINOX segue
 * vinculado, só marcado como pendente de conferência da prescrição.
 *
 * protocoloCiclo.js importa o catálogo JSON sem `with { type: 'json' }` (o
 * Vite resolve); no Node isso falha. O hook abaixo só acrescenta o atributo
 * aos .json. O fuso é fixado ANTES do import, como nos outros testes.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const {
  getProtocolo, marcosDoProtocolo, rotuloJanelaRisco,
  protocoloAguardandoConferencia, protocoloPendentePrescricao,
} = await import('./protocoloCiclo.js');

const catalogo = JSON.parse(readFileSync(new URL('../data/protocolos_efeitos.json', import.meta.url), 'utf8'));

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const resumo = p => p && {
  nome: p.nome,
  duracaoCiclo: p.duracaoCiclo,
  marcos: marcosDoProtocolo(p).map(m => `${m.label} ${m.fase}`),
  janela: rotuloJanelaRisco(p),
};

// 1. Aguardando conferência: sem ficha.
for (const s of ['T—AC DD', 'T-AC DD', 't-ac dd', 'Ac DD', 'AC DD', '(T-ddAC),', 'T-ddAC']) {
  t(`${JSON.stringify(s)} -> getProtocolo null`, getProtocolo(s), null);
  t(`${JSON.stringify(s)} -> aguardando conferência`, protocoloAguardandoConferencia(s), true);
}

// 2. Nome exato continua resolvendo, com os mesmos marcos de antes.
const ACT = {
  nome: 'AC-T dose densa', duracaoCiclo: 14,
  marcos: ['D2–D5 alerta', 'D3–D7 alerta', 'D7–D10 risco'], janela: 'D7–D10',
};
t('"AC-T dose densa" (nome exato) -> ficha, marcos e janela D7–D10', resumo(getProtocolo('AC-T dose densa')), ACT);
t('"AC-T dose densa" não está aguardando conferência', protocoloAguardandoConferencia('AC-T dose densa'), false);

// 3. Aliases fora do conjunto continuam resolvendo.
t('"ddAC-T" (alias) -> AC-T dose densa', getProtocolo('ddAC-T')?.nome, 'AC-T dose densa');
t('"T-AC dose densa" (alias) -> AC-T dose densa', getProtocolo('T-AC dose densa')?.nome, 'AC-T dose densa');

// 4. FOLFIRINOX: ficha sem mudança, marcado como pendente.
t('FOLFIRINOX -> ficha, janela D7–D12, duração 14', resumo(getProtocolo('FOLFIRINOX')), {
  nome: 'FOLFIRINOX', duracaoCiclo: 14,
  marcos: ['D1–D3 alerta', 'D4–D7 alerta', 'D7–D12 risco'], janela: 'D7–D12',
});
t('FOLFIRINOX pendente de prescrição', protocoloPendentePrescricao('FOLFIRINOX'), true);
t('FOLFIRINOX não está aguardando conferência', protocoloAguardandoConferencia('FOLFIRINOX'), false);
for (const s of ['R-CHOP', 'R-MINI-CHOP', 'AC-T dose densa']) {
  t(`${s} não está pendente de prescrição`, protocoloPendentePrescricao(s), false);
}

// 5. R-mini-CHOP sem mudança. R-CHOP: janela de risco passou de D7–D14 para
// D8–D15 (decisão da Kelly em 10/10/2026, provisória; não valida o nadir).
t('R-MINI-CHOP -> R-mini-CHOP, sem mudança', resumo(getProtocolo('R-MINI-CHOP')), {
  nome: 'R-mini-CHOP', duracaoCiclo: 21,
  marcos: ['D1–D5 alerta', 'D2–D4 alerta', 'D7–D14 risco'], janela: 'D7–D14',
});
t('R-CHOP -> R-CHOP, janela D8–D15', resumo(getProtocolo('R-CHOP')), {
  nome: 'R-CHOP', duracaoCiclo: 21,
  marcos: ['D1–D5 alerta', 'D2–D4 alerta', 'D8–D15 risco'], janela: 'D8–D15',
});
t('R-CHOP longo continua sem ficha', getProtocolo('PROTOCOLO R- CHOP A CADA 21 DIAS POR 6 CICLOS'), null);

// 6. Entradas vazias.
for (const [rotulo, v] of [['null', null], ['undefined', undefined], ["''", '']]) {
  let r;
  try {
    r = [getProtocolo(v), protocoloAguardandoConferencia(v), protocoloPendentePrescricao(v)];
  } catch (e) {
    r = `exceção: ${e.message}`;
  }
  t(`${rotulo} -> null, false, false (sem exceção)`, r, [null, false, false]);
}

// 7. Catálogo: 80 protocolos e as contagens de campo do bloco-66. A única
// diferença é sinais_alerta 67 -> 68: a ficha de inibidores de aromatase não
// tinha o campo e ganhou os alertas aprovados (ver protocoloAlertas.teste.mjs).
const contagem = {};
for (const p of catalogo.protocolos) for (const k of Object.keys(p)) contagem[k] = (contagem[k] || 0) + 1;
t('catálogo com 80 protocolos', catalogo.protocolos.length, 80);
t('contagens de campo iguais às do bloco-66 (sinais_alerta +1 pela aromatase)',
  ['nome', 'aliases', 'indicacao', 'efeitos', 'duracaoCiclo', 'marcosEfeito', 'conduta_base', 'fases_ciclo', 'sinais_alerta']
    .map(k => [k, contagem[k]]),
  [['nome', 80], ['aliases', 26], ['indicacao', 80], ['efeitos', 80], ['duracaoCiclo', 66],
   ['marcosEfeito', 9], ['conduta_base', 66], ['fases_ciclo', 1], ['sinais_alerta', 68]]);
t('alias "T-AC DD" continua no catálogo',
  catalogo.protocolos.find(p => p.nome === 'AC-T dose densa')?.aliases.includes('T-AC DD'), true);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
