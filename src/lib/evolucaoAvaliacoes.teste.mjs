/**
 * Teste standalone de evolucaoAvaliacoes.js:
 * `node src/lib/evolucaoAvaliacoes.teste.mjs` (TZ_TESTE muda o fuso).
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const E = await import('./evolucaoAvaliacoes.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : (falhou++, console.log('FALHOU:', nome, '\n  obtido  :', JSON.stringify(obtido), '\n  esperado:', JSON.stringify(esperado)));
}

// ── formatação ──
t('fmtNum', E.fmtNum(100.5), '100,5');
t('fmtNum string do banco', E.fmtNum('46.20'), '46,2');
t('fmtNum vazio', E.fmtNum(null), '—');
t('fmtValor cm', E.fmtValor('cintura_cm', 100.5), '100,5 cm');
t('fmtValor %', E.fmtValor('pgc', 46.2), '46,2%');
t('fmtValor kg inteiro', E.fmtValor('kg', 80), '80,0 kg');
t('fmtDelta queda', E.fmtDelta('kg', -3.25), '−3,3 kg'.replace('3,3', (3.25).toFixed(1).replace('.', ',')));
t('fmtDelta alta %', E.fmtDelta('pgc', 0.44), '+0,4%');
t('fmtDelta zero', E.fmtDelta('kg', 0.02), '0,0 kg');

// ── série e comparação ──
const av = [
  { id: 1, data: '2026-06-01', kg: 90, cintura_cm: null, pgc: null },
  { id: 2, data: '2026-07-01', kg: 88, cintura_cm: 100, pgc: 40 },
  { id: 3, data: '2026-09-01', kg: 85, cintura_cm: 96, pgc: 38 },
  { id: 4, data: '2026-10-01', kg: 84, cintura_cm: 95, pgc: 37 },
];
const sKg = E.serieDaMetrica(av, 'kg');
t('série kg tem 4', sKg.length, 4);
t('início do peso = 1ª avaliação', E.comparar(sKg, 'inicio').base.data, '2026-06-01');
t('início da cintura = 1ª que tem cintura', E.comparar(E.serieDaMetrica(av, 'cintura_cm'), 'inicio').base.data, '2026-07-01');
t('início: dif e dias', [E.comparar(sKg, 'inicio').dif, E.comparar(sKg, 'inicio').dias], [-6, 122]);
t('última: usa a anterior', E.comparar(sKg, 'ultima').base.data, '2026-09-01');
t('30d: último registro até 30 dias antes', E.comparar(sKg, '30d').base.data, '2026-09-01');
t('30d sem registro antigo: cai no primeiro', E.comparar(E.serieDaMetrica(av.slice(2), 'kg'), '30d').base.data, '2026-09-01');
t('uma só avaliação → null', E.comparar(E.serieDaMetrica(av.slice(0, 1), 'kg'), 'inicio'), null);
t('ignorada sai da conta', E.comparar(E.serieDaMetrica(av, 'kg', new Set([1])), 'inicio').base.data, '2026-07-01');
t('mesmo dia: última vence', E.serieDaMetrica([{ id: 1, data: '2026-01-01', kg: 70 }, { id: 2, data: '2026-01-01', kg: 71 }], 'kg').map((x) => x.id), [2]);
t('zero e texto ignorados', E.serieDaMetrica([{ id: 1, data: '2026-01-01', kg: 0 }, { id: 2, data: '2026-01-02', kg: 'x' }], 'kg'), []);

// ── sentido ──
t('peso cai = bom (emagrecimento)', E.sentidoDaVariacao('kg', -2), 'bom');
t('peso cai = neutro (oncologia)', E.sentidoDaVariacao('kg', -2, { pesoNeutro: true }), 'neutro');
t('cintura sobe = ruim', E.sentidoDaVariacao('cintura_cm', 2), 'ruim');
t('massa magra sobe = bom', E.sentidoDaVariacao('mm_kg', 1), 'bom');
t('quadril = neutro', E.sentidoDaVariacao('quadril_cm', 3), 'neutro');
t('variação ínfima = neutro', E.sentidoDaVariacao('kg', -0.04), 'neutro');

// ── suspeitas ──
const normal = E.detectarSuspeitas(av);
t('série normal: nada suspeito', normal.size, 0);
const salto = E.detectarSuspeitas([
  { id: 1, data: '2026-10-01', kg: 100 },
  { id: 2, data: '2026-10-10', kg: 82 },   // −18 kg em 9 dias
  { id: 3, data: '2026-10-20', kg: 81 },
]);
t('salto marca a mais recente do par', [...salto.keys()], [2]);
t('salto informa de onde veio', [salto.get(2).deId, salto.get(2).dias], [1, 9]);
const pico = E.detectarSuspeitas([
  { id: 1, data: '2026-10-01', kg: 80 },
  { id: 2, data: '2026-10-05', kg: 98 },   // digitou errado
  { id: 3, data: '2026-10-10', kg: 79 },
]);
t('pico isolado: só o pico', [...pico.keys()], [2]);
t('ignorar o pico limpa o aviso', E.detectarSuspeitas([
  { id: 1, data: '2026-10-01', kg: 80 }, { id: 2, data: '2026-10-05', kg: 98 }, { id: 3, data: '2026-10-10', kg: 79 },
], new Set([2])).size, 0);
t('perda grande em muito tempo não é suspeita', E.detectarSuspeitas([
  { id: 1, data: '2026-01-01', kg: 100 }, { id: 2, data: '2026-07-01', kg: 80 },
]).size, 0);

// ── composição ──
const comp = [
  { id: 1, data: '2026-07-01', gordura_kg: 40, mm_kg: 50 },
  { id: 2, data: '2026-08-01', gordura_kg: null, mm_kg: 51 },
  { id: 3, data: '2026-10-01', gordura_kg: 37.9, mm_kg: 50.1 },
];
const c = E.composicaoCorporal(comp, 'inicio');
t('composição usa só avaliações completas', [c.deData, c.ateData], ['2026-07-01', '2026-10-01']);
t('composição: gordura −2,1 e massa magra mantida', [c.gorduraDif, c.statusGordura, c.statusMassaMagra], [-2.1, 'perdeu', 'manteve']);
t('frase', E.fraseComposicao(c), 'Perdeu 2,1 kg de gordura e manteve a massa magra.');
t('frase perdeu os dois', E.fraseComposicao({ statusGordura: 'perdeu', gorduraDif: -2, statusMassaMagra: 'perdeu', massaMagraDif: -1.5 }),
  'Perdeu 2,0 kg de gordura e também perdeu 1,5 kg de massa magra.');
t('frase manteve gordura e perdeu massa magra', E.fraseComposicao({ statusGordura: 'manteve', gorduraDif: 0, statusMassaMagra: 'perdeu', massaMagraDif: -1 }),
  'Manteve a gordura, mas perdeu 1,0 kg de massa magra.');
t('composição sem dados', E.composicaoCorporal([{ id: 1, data: '2026-01-01', kg: 70 }], 'inicio'), null);
t('frase null', E.fraseComposicao(null), null);

// ── textos ──
t('tipo primeira', E.rotuloTipoConsulta('primeira'), 'Primeira consulta');
t('tipo consulta_3', E.rotuloTipoConsulta('consulta_3'), 'Consulta 03');
t('tipo desconhecido', E.rotuloTipoConsulta('xyz'), 'Consulta realizada');
t('descrição avaliação', E.descricaoAvaliacao({ kg: 80, cintura_cm: 100.5, pgc: 46.2 }), '80,0 kg · cintura 100,5 cm · 46,2% de gordura');
t('descrição avaliação vazia', E.descricaoAvaliacao({}), 'Registrada');
t('plano com kcal', E.descricaoPlano({ macros: { kcal: 1800 }, refeicoes: [1, 2, 3] }), '1.800 kcal · 3 refeições');
t('plano sem kcal', E.descricaoPlano({ refeicoes: [1] }), 'kcal não informada · 1 refeição');
t('plano vazio', E.descricaoPlano(null), 'kcal não informada');

const fmt = (p, v) => String(v);
t('check-in resumo', E.resumoCheckin({
  perguntas: [{ id: 'a', tipo: 'slider', secao: 'Energia' }, { id: 'b', tipo: 'texto' }, { id: 'c', tipo: 'multi' }],
  respostas: { a: 7, b: '', c: [] },
}, fmt), '1 de 3 perguntas respondidas · Energia: 7');
t('check-in sem perguntas', E.resumoCheckin({}, fmt), 'Respondido');

// ── Shaped grava braço/coxa em *_dir_cm ──
const norm = E.normalizarAvaliacoes([
  { id: 1, data: '2026-01-01', braco_dir_cm: 31.2, braco_cm: null, coxa_dir_cm: null, coxa_cm: 55 },
  { id: 2, data: '2026-02-01', braco_dir_cm: 30.8, braco_cm: 33, coxa_dir_cm: 54, coxa_cm: 56 },
]);
t('braço: usa dir quando existe', norm.map((a) => a.braco_cm), [31.2, 30.8]);
t('coxa: cai na coluna antiga sem dir', norm.map((a) => a.coxa_cm), [55, 54]);
t('série de braço vem do Shaped', E.comparar(E.serieDaMetrica(norm, 'braco_cm'), 'inicio').dif, -0.4);
t('normalizar lista vazia', E.normalizarAvaliacoes(null), []);
t('abdome e panturrilha existem', [E.METRICAS.abdome_cm.rotulo, E.METRICAS.panturrilha_cm.rotulo], ['Abdome', 'Panturrilha']);

console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
