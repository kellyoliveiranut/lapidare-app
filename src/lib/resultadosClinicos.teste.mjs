/**
 * Teste standalone de resultadosClinicos.js. Roda com
 * `node src/lib/resultadosClinicos.teste.mjs`. As funções são puras e só usam
 * strings 'YYYY-MM-DD', então o resultado não pode mudar com o fuso do aparelho.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const R = await import('./resultadosClinicos.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : (falhou++, console.log('FALHOU:', nome, '\n  obtido  :', JSON.stringify(obtido), '\n  esperado:', JSON.stringify(esperado)));
}
const HOJE = '2026-10-23';

// ── datas ──
t('somaDias -30', R.somaDias(HOJE, -30), '2026-09-23');
t('somaDias vira o mês', R.somaDias('2026-10-30', 3), '2026-11-02');
t('somaDias vira o ano', R.somaDias('2026-12-30', 5), '2027-01-04');
t('diasEntre', R.diasEntre('2026-10-01', HOJE), 22);
t('diasEntre atravessa horário de verão (março)', R.diasEntre('2026-03-01', '2026-04-01'), 31);

// ── peso: desde o início ──
const reg = (...pares) => pares.map(([data, kg]) => ({ data, kg }));
t('início: perdeu', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-10-20', 74]), HOJE),
  { deltaKg: -6, pct: -7.5, dias: 111, status: 'perdeu' });
t('início: um registro só', R.progressaoPeso(reg(['2026-10-20', 74]), HOJE), null);
t('início: sem registros', R.progressaoPeso([], HOJE), null);
t('início: manteve (−0,05 kg)', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-10-01', 79.95]), HOJE).status, 'manteve');
t('início: ganhou', R.progressaoPeso(reg(['2026-07-01', 70], ['2026-10-01', 72]), HOJE).status, 'ganhou');
t('início: ordem embaralhada', R.progressaoPeso(reg(['2026-10-01', 74], ['2026-07-01', 80]), HOJE).deltaKg, -6);
t('início: ignora data futura', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-11-01', 50]), HOJE), null);
t('início: kg inválido é ignorado', R.progressaoPeso([{ data: '2026-07-01', kg: 80 }, { data: '2026-08-01', kg: 'x' }, { data: '2026-09-01', kg: 78 }], HOJE).deltaKg, -2);
t('início: dois no mesmo dia, o último vence', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-07-01', 79], ['2026-09-01', 77]), HOJE).deltaKg, -2);

// ── peso: 30 dias (corte = 2026-09-23) ──
t('30d: base = último até o corte', R.progressaoPeso(reg(['2026-09-01', 80], ['2026-09-20', 79], ['2026-10-20', 77]), HOJE, 30),
  { deltaKg: -2, pct: -2.5, dias: 30, status: 'perdeu' });
t('30d: sem registro até o corte usa o primeiro da janela', R.progressaoPeso(reg(['2026-09-28', 80], ['2026-10-20', 78]), HOJE, 30).deltaKg, -2);
t('30d: nada na janela', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-08-01', 78]), HOJE, 30), null);
t('30d: só um registro na janela e nenhum antes', R.progressaoPeso(reg(['2026-10-20', 78]), HOJE, 30), null);
t('30d: base antiga + um atual', R.progressaoPeso(reg(['2026-07-01', 80], ['2026-10-20', 78]), HOJE, 30).dias, 111);
t('30d: dia do corte conta como base', R.progressaoPeso(reg(['2026-09-23', 80], ['2026-10-23', 79]), HOJE, 30).deltaKg, -1);

// ── agregação do peso ──
const pacs = [
  { id: 'a', objetivo: 'Emagrecimento' }, { id: 'b', objetivo: ' Emagrecimento ' },
  { id: 'c', objetivo: 'Emagrecimento' }, { id: 'd', objetivo: 'Emagrecimento' },
  { id: 'onco', objetivo: 'Oncologia' }, { id: 'ra', objetivo: 'Reeducação alimentar' },
];
const pesos = new Map([
  ['a', reg(['2026-09-01', 80], ['2026-10-20', 76])],      // −4
  ['b', reg(['2026-09-01', 70], ['2026-10-20', 71])],      // +1
  ['c', reg(['2026-10-20', 60])],                          // sem dados
  ['onco', reg(['2026-09-01', 70], ['2026-10-20', 60])],   // fora do grupo
]);
const r = R.resumirPeso(pacs, pesos, HOJE);
t('agrega 30d', r.trinta, { total: 4, comDados: 2, semDados: 2, perdendo: 1, mantendo: 0, ganhando: 1, mediaKg: -1.5, mediaPct: -1.8 });
t('agrega início', r.inicio.perdendo, 1);
t('oncologia fora do grupo', r.inicio.total, 4);

// ── adesão ──
const P = (id, extra = {}) => ({ id, nome: id.toUpperCase(), user_id: 'u-' + id, created_at: '2026-06-01', ...extra });
const dias = (...ds) => new Set(ds);
const d7 = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const map = new Map([
  ['bem', dias(...d7.slice(0, 4))],                    // 4 dias → aderindo
  ['quase', dias(...d7.slice(0, 3))],                  // 3 dias → não
  ['fora', dias('2026-10-16', '2026-10-10')],          // fora da janela de 7 dias
  ['zero', dias()],
]);
const a = R.resumirAdesao([P('bem'), P('quase'), P('fora'), P('zero'), P('sem-acesso', { user_id: null }), P('nova', { created_at: '2026-10-20' }), P('limite', { created_at: '2026-10-16' })], map, HOJE);
t('adesão: base (sem acesso e nova ficam fora; 7 dias exatos entra)', a.base, 5);
t('adesão: aderindo', a.aderindo, 1);
t('adesão: pct', a.pct, 20);
t('adesão: semRegistro ordenado (sem nenhum registro primeiro, empate por nome)', a.semRegistro.map((x) => [x.id, x.diasDesde]), [["limite", null], ["zero", null], ["fora", 7]]);
t('adesão: 7 dias exatos — dia 16 está fora da janela (17 a 23)', R.resumirAdesao([P('x')], new Map([['x', dias('2026-10-16')]]), HOJE).aderindo, 0);
t('adesão: base vazia', R.resumirAdesao([], new Map(), HOJE).pct, null);
t('adesão: dia futuro não conta', R.resumirAdesao([P('x')], new Map([['x', dias('2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27')]]), HOJE).aderindo, 0);

// ── check-ins ──
const c = R.resumirCheckins([
  { enviadoDia: '2026-10-01', respondido: true },
  { enviadoDia: '2026-10-05', respondido: false },
  { enviadoDia: '2026-10-22', respondido: false },   // ainda no prazo: fora
  { enviadoDia: '2026-10-22', respondido: true },    // respondido: entra
  { enviadoDia: '2026-08-01', respondido: false },   // fora dos 30 dias
  { enviadoDia: '2026-10-21', respondido: false },   // 2 dias: entra
], HOJE);
t('check-ins', c, { enviados: 4, respondidos: 2, pct: 50 });
t('check-ins vazio', R.resumirCheckins([], HOJE).pct, null);

// ── novas no mês ──
t('novas no mês', R.novasNoMes([{ created_at: '2026-10-01' }, { created_at: '2026-09-30' }, { created_at: '2026-10-22' }, {}], HOJE), 2);

// ── nome curto ──
t('nome: maiúsculas viram título e tiram conectores', R.nomeCurto('ADRIANA MARIA MONTEIRO DO CARMO'), 'Adriana Carmo');
t('nome: mantém caixa de nome já bem escrito', R.nomeCurto('Ana Larissa Guimarães Dias'), 'Ana Dias');
t('nome: um nome só', R.nomeCurto('Katia'), 'Katia');
t('nome: dois nomes', R.nomeCurto('Rayssa Nascimento'), 'Rayssa Nascimento');
t('nome: conector antes do sobrenome', R.nomeCurto('Maria de Nasare Ramos Sosinho'), 'Maria Sosinho');
t('nome: espaços sobrando', R.nomeCurto('  JOSE   DA SILVA  '), 'Jose Silva');
t('nome: vazio', R.nomeCurto(null), '');

console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
