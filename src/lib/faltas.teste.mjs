/** node src/lib/faltas.teste.mjs — sem framework. */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const { fimDaConsulta, precisaResolver, confirmouAntes, filaParaResolver, contarFaltas, PARA_RESOLVER_DESDE } = await import('./faltas.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  if (!passou) console.log('FALHOU:', nome, '\n  esperado', JSON.stringify(esperado), '\n  obtido  ', JSON.stringify(obtido));
}

const AGORA = new Date('2026-11-12T20:00:00Z');
const base = { status: 'agendada', duracao_min: 60 };
const passada = { ...base, id: 'a', data_hora: '2026-11-12T15:00:00+00:00' };

t('passada agendada precisa resolver', precisaResolver(passada, AGORA), true);
t('ainda em andamento não', precisaResolver({ ...base, data_hora: '2026-11-12T19:30:00+00:00' }, AGORA), false);
t('termina exatamente agora conta', precisaResolver({ ...base, data_hora: '2026-11-12T19:00:00+00:00' }, AGORA), true);
t('futura não', precisaResolver({ ...base, data_hora: '2026-11-13T15:00:00+00:00' }, AGORA), false);
t('sem data (a definir) não', precisaResolver({ ...base, data_hora: null }, AGORA), false);
t('realizada não', precisaResolver({ ...passada, status: 'realizada' }, AGORA), false);
t('cancelada não', precisaResolver({ ...passada, status: 'cancelada' }, AGORA), false);
t('já marcada faltou não', precisaResolver({ ...passada, faltou_em: '2026-11-12T21:00:00Z' }, AGORA), false);
t('duração ausente usa 60 min', fimDaConsulta({ data_hora: '2026-11-12T15:00:00+00:00' }), new Date('2026-11-12T16:00:00Z').getTime());
t('data inválida', fimDaConsulta({ data_hora: 'xx' }), null);
t('null seguro', precisaResolver(null, AGORA), false);

t('confirmou antes', confirmouAntes({ confirmada_em: '2026-11-11T10:00:00Z' }), true);
t('confirmou e depois disse que não vem', confirmouAntes({ confirmada_em: 'x', nao_confirmada_em: 'y' }), false);
t('sem confirmação', confirmouAntes({}), false);

const c1 = { ...passada, id: 'c1', data_hora: '2026-11-12T11:00:00+00:00' };
const c2 = { ...passada, id: 'c2', data_hora: '2026-11-12T13:00:00+00:00', confirmada_em: 'x' };
const c3 = { ...passada, id: 'c3', data_hora: '2026-11-12T10:00:00+00:00', confirmada_em: 'x' };
const futura = { ...base, id: 'f', data_hora: '2026-11-20T15:00:00+00:00' };
t('fila: confirmadas primeiro, depois mais antigas', filaParaResolver([c1, futura, c2, c3], AGORA).map(c => c.id), ['c3', 'c2', 'c1']);
const antiga = { ...base, id: 'ant', data_hora: '2026-08-03T17:30:00+00:00', confirmada_em: 'x' };
t('consulta anterior ao corte não entra na fila', filaParaResolver([antiga, c2], AGORA).map(c => c.id), ['c2']);
t('corte configurável', filaParaResolver([antiga, c2], AGORA, '2026-01-01T00:00:00-03:00').map(c => c.id), ['ant', 'c2']);
t('corte é 12/11/2026 em Belém', PARA_RESOLVER_DESDE, '2026-11-12T00:00:00-03:00');
t('fila vazia', filaParaResolver(null, AGORA), []);

t('contar faltas', contarFaltas([
  { faltou_em: 'a', confirmada_em: 'x' }, { faltou_em: 'b' }, { status: 'realizada' },
]), { faltas: 2, confirmouENaoVeio: 1 });
t('contar vazio', contarFaltas(undefined), { faltas: 0, confirmouENaoVeio: 0 });

console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
