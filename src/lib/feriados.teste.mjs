/**
 * Teste standalone de feriados.js.
 * Roda com `node src/lib/feriados.teste.mjs`, sem framework.
 *
 * O fuso é fixado em process.env.TZ ANTES do import, como nos outros testes:
 * as datas do arquivo são construídas em horário LOCAL, e rodar com TZ_TESTE
 * em outros fusos prova que nenhuma escorrega um dia.
 *
 * As datas móveis de 2026 abaixo foram conferidas em 2026-10-08 contra um
 * cálculo independente da Páscoa (algoritmo de Oudin, script à parte, sem as
 * funções deste arquivo): Páscoa 05/04, Carnaval 16 e 17/02, Sexta-feira Santa
 * 03/04, Corpus Christi 04/06, Círio 11/10, Recírio 26/10.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO: o TZ acima precisa valer antes de o módulo carregar.
const { feriadoDe, ehFeriado, validarDiaConsulta, pascoa, segundoDomingoDeOutubro } = await import('./feriados.js');

let ok = 0, falhou = 0;
const casos = [];
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── móveis de 2026 ──────────────────────────────────────────────────
t('móveis', 'Páscoa 2026 é 05/04', iso(pascoa(2026)), '2026-04-05');
t('móveis', 'Carnaval segunda 16/02/2026', feriadoDe('2026-02-16'), 'Carnaval (segunda)');
t('móveis', 'Carnaval terça 17/02/2026', feriadoDe('2026-02-17'), 'Carnaval (terça)');
t('móveis', 'Quarta de Cinzas 18/02/2026 NÃO é feriado (decisão da Kelly)', ehFeriado('2026-02-18'), false);
t('móveis', 'Sexta-feira Santa 03/04/2026', feriadoDe('2026-04-03'), 'Sexta-feira Santa');
t('móveis', 'Corpus Christi 04/06/2026', feriadoDe('2026-06-04'), 'Corpus Christi');

// ─── Belém ───────────────────────────────────────────────────────────
t('Belém', '2º domingo de outubro de 2026 é 11/10', iso(segundoDomingoDeOutubro(2026)), '2026-10-11');
t('Belém', 'Círio 11/10/2026', feriadoDe('2026-10-11'), 'Círio de Nazaré');
t('Belém', 'Recírio 26/10/2026 (segunda, +15)', feriadoDe('2026-10-26'), 'Recírio');
for (const ano of [2026, 2027, 2030]) {
  t('Belém', `08/12/${ano} Nossa Senhora da Conceição`, feriadoDe(`${ano}-12-08`), 'Nossa Senhora da Conceição');
  t('Belém', `15/08/${ano} Adesão do Pará`, feriadoDe(`${ano}-08-15`), 'Adesão do Pará à Independência');
}

// ─── nacionais ───────────────────────────────────────────────────────
for (const ano of [2026, 2027]) {
  t('nacionais', `25/12/${ano} Natal`, feriadoDe(`${ano}-12-25`), 'Natal');
}
t('nacionais', '20/11/2026 Consciência Negra', feriadoDe('2026-11-20'), 'Consciência Negra');

// ─── dia comum ───────────────────────────────────────────────────────
t('comum', 'terça 06/10/2026 não é feriado', [feriadoDe('2026-10-06'), ehFeriado('2026-10-06')], [null, false]);
t('comum', 'entrada inválida: null', [feriadoDe(''), feriadoDe(null), feriadoDe('2026')], [null, null, null]);

// ─── validarDiaConsulta ──────────────────────────────────────────────
t('validar', 'feriado, padrão: mensagem de feriado (comportamento de antes)',
  validarDiaConsulta('2026-12-08'), '08/12/2026 é feriado (Nossa Senhora da Conceição). Ajuste a data.');
t('validar', 'feriado em dia útil com ignorarFeriado: null',
  validarDiaConsulta('2026-12-08', { ignorarFeriado: true }), null);
t('validar', 'Círio (domingo), padrão: o nome do feriado vem primeiro',
  validarDiaConsulta('2026-10-11'), '11/10/2026 é feriado (Círio de Nazaré). Ajuste a data.');
t('validar', 'Círio com ignorarFeriado: sobra o domingo',
  validarDiaConsulta('2026-10-11', { ignorarFeriado: true }), '11/10/2026 cai num domingo. Ajuste a data.');
t('validar', 'Círio com ignorarFeriado e permitirFds: null',
  validarDiaConsulta('2026-10-11', { ignorarFeriado: true, permitirFds: true }), null);
t('validar', 'sábado comum: fds, com e sem ignorarFeriado',
  [validarDiaConsulta('2026-10-03'), validarDiaConsulta('2026-10-03', { ignorarFeriado: true })],
  ['03/10/2026 cai num sábado. Ajuste a data.', '03/10/2026 cai num sábado. Ajuste a data.']);
t('validar', 'dia útil comum: null', validarDiaConsulta('2026-10-06'), null);
t('validar', 'dicaFds vai só na mensagem de fim de semana',
  validarDiaConsulta('2026-10-03', { dicaFds: ' X' }), '03/10/2026 cai num sábado. Ajuste a data. X');
t('validar', 'data vazia: null', validarDiaConsulta(''), null);

// ─── saída ───────────────────────────────────────────────────────────
let grupoAtual = '';
for (const c of casos) {
  if (c.grupo !== grupoAtual) { grupoAtual = c.grupo; console.log(`\n── ${grupoAtual} ──`); }
  const marca = c.passou ? 'PASS' : 'FALHA';
  const det = c.passou ? '' : `   (esperado ${JSON.stringify(c.esperado)}, obteve ${JSON.stringify(c.obtido)})`;
  console.log(`  ${marca}  ${c.nome}${det}`);
}
console.log(`\nTZ = ${process.env.TZ} | offset real = ${new Date().getTimezoneOffset()}`);
console.log(`${ok} passaram, ${falhou} falharam, ${casos.length} no total`);
process.exit(falhou ? 1 : 0);
