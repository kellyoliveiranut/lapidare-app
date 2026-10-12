/**
 * Teste standalone de alertaOncologico.js. Roda com `node src/lib/alertaOncologico.teste.mjs`.
 * Sem banco. Também confere que o vermelho do semáforo da nutri só ganhou a
 * febre: a função antiga vai copiada aqui dentro, só para a comparação.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { alertaOncologicoCheckin: alerta } = await import('./alertaOncologico.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const NULO = { febre: null, nausea: null, diarreia: null, apetite: null, hidratacao: null, suplemento: null };
t('tudo nulo → falso', alerta(NULO), false);
t('objeto vazio → falso', alerta({}), false);
t('null/undefined → falso', [alerta(null), alerta(undefined)], [false, false]);

// cada gatilho sozinho
t('febre true → verdadeiro', alerta({ ...NULO, febre: true }), true);
t('náusea 7 → verdadeiro', alerta({ ...NULO, nausea: 7 }), true);
t('náusea 10 → verdadeiro', alerta({ ...NULO, nausea: 10 }), true);
t('diarreia 7 → verdadeiro', alerta({ ...NULO, diarreia: 7 }), true);
t('apetite 2 → verdadeiro', alerta({ ...NULO, apetite: 2 }), true);
t('apetite 1 e 0 → verdadeiro', [alerta({ ...NULO, apetite: 1 }), alerta({ ...NULO, apetite: 0 })], [true, true]);
t('hidratação 0 → verdadeiro', alerta({ ...NULO, hidratacao: 0 }), true);
t("suplemento 'nao' → verdadeiro", alerta({ ...NULO, suplemento: 'nao' }), true);

// logo abaixo dos limiares
t('febre false → falso', alerta({ ...NULO, febre: false }), false);
t('náusea 6 → falso', alerta({ ...NULO, nausea: 6 }), false);
t('diarreia 6 → falso', alerta({ ...NULO, diarreia: 6 }), false);
t('apetite 3 → falso', alerta({ ...NULO, apetite: 3 }), false);
t('hidratação 1, 2, 3 → falso', [1, 2, 3].map(h => alerta({ ...NULO, hidratacao: h })), [false, false, false]);
t("suplemento 'parcialmente' e 'todos' → falso", [alerta({ ...NULO, suplemento: 'parcialmente' }), alerta({ ...NULO, suplemento: 'todos' })], [false, false]);
t('apetite nulo NÃO dispara (null <= 2 seria true em JS)', [alerta({ ...NULO, apetite: null }), alerta({ febre: false })], [false, false]);
t('valores em texto não disparam (o banco grava número)', [alerta({ nausea: '7' }), alerta({ apetite: '0' }), alerta({ hidratacao: '0' })], [false, false, false]);
t("febre 'true' (texto) não dispara", alerta({ febre: 'true' }), false);

// Semáforo da nutri: vermelho antigo (cópia do MonitoramentoOncologico.jsx do 008676f) x alerta novo
const vermelhoAntigo = r => (r.nausea != null && r.nausea >= 7) || (r.diarreia != null && r.diarreia >= 7) ||
  (r.apetite != null && r.apetite <= 2) || r.hidratacao === 0 || r.suplemento === 'nao';
const V = { nausea: [null, 0, 4, 6, 7, 10], diarreia: [null, 0, 6, 7], apetite: [null, 0, 2, 3, 10], hidratacao: [null, 0, 1, 3], suplemento: [null, 'nao', 'parcialmente', 'todos'] };
let casos = 0, iguais = 0, febreDispara = 0;
for (const nausea of V.nausea) for (const diarreia of V.diarreia) for (const apetite of V.apetite)
  for (const hidratacao of V.hidratacao) for (const suplemento of V.suplemento) {
    const r = { nausea, diarreia, apetite, hidratacao, suplemento };
    for (const febre of [null, false]) { casos++; if (alerta({ ...r, febre }) === vermelhoAntigo(r)) iguais++; }
    if (alerta({ ...r, febre: true })) febreDispara++;
  }
t(`grade sem febre: vermelho novo = vermelho antigo em todos os ${casos} casos`, iguais, casos);
t('grade com febre: o alerta dispara em todos os casos', febreDispara, casos / 2);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
