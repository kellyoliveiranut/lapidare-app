/**
 * Teste standalone das funções puras de agendaConflitos.js.
 * Roda com `node`, sem framework. O módulo não importa supabase no topo,
 * justamente para isto ser possível.
 *
 * O fuso é fixado em process.env.TZ ANTES de qualquer import, porque
 * montarDataHoraISO usa offset -03:00 fixo mas as comparações passam por
 * Date. Fixar aqui prova que o resultado não depende do fuso da máquina.
 */
process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

// Import DINAMICO, e nao estatico: os imports de ESM sao avaliados ANTES
// de qualquer linha do corpo, e o process.env.TZ acima precisa valer antes
// de o modulo (e o utils.js) carregarem.
const M = await import('./agendaConflitos.js');
const { intervalosSeCruzam, bloqueioCobre, horaMais, intervaloConsulta, hhmm } = M;

let ok = 0, falhou = 0;
const casos = [];

function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  casos.push({ grupo, nome, esperado, obtido, passou });
}

// ─── intervalosSeCruzam ──────────────────────────────────────────────
const iv = (d, h, m) => intervaloConsulta(d, h, m);
const D = '2026-09-21';   // segunda-feira comum

t('cruzam', 'idênticos 14:00+45 vs 14:00+45',
  intervalosSeCruzam(iv(D, '14:00', 45), iv(D, '14:00', 45)), true);
t('cruzam', 'ENCOSTAM 14:00+45 vs 14:45+45 (não cruza)',
  intervalosSeCruzam(iv(D, '14:00', 45), iv(D, '14:45', 45)), false);
t('cruzam', 'encavala por 15min: 14:00+60 vs 14:45+45',
  intervalosSeCruzam(iv(D, '14:00', 60), iv(D, '14:45', 45)), true);
t('cruzam', 'longa engole curta: 14:00+120 vs 15:00+30',
  intervalosSeCruzam(iv(D, '14:00', 120), iv(D, '15:00', 30)), true);
t('cruzam', 'ordem inversa dá o mesmo: 15:00+30 vs 14:00+120',
  intervalosSeCruzam(iv(D, '15:00', 30), iv(D, '14:00', 120)), true);
t('cruzam', 'dias diferentes, mesma hora',
  intervalosSeCruzam(iv('2026-09-21', '14:00', 45), iv('2026-09-22', '14:00', 45)), false);
t('cruzam', 'duração zero não cruza nada',
  intervalosSeCruzam(iv(D, '14:00', 0), iv(D, '14:00', 45)), false);
t('cruzam', 'distantes no mesmo dia: 08:00+30 vs 17:00+30',
  intervalosSeCruzam(iv(D, '08:00', 30), iv(D, '17:00', 30)), false);

// ─── bloqueioCobre ───────────────────────────────────────────────────
const diaInteiro = { data: D, hora_inicio: null, hora_fim: null };
const faixa      = { data: D, hora_inicio: '14:00:00', hora_fim: '16:00:00' };
const item = (h, m = 45) => ({ data: D, hora: h, duracaoMin: m });

t('bloqueio', 'dia inteiro pega 08:00',  bloqueioCobre(diaInteiro, item('08:00')), true);
t('bloqueio', 'dia inteiro pega 17:30',  bloqueioCobre(diaInteiro, item('17:30')), true);
t('bloqueio', 'dia inteiro de OUTRA data não pega',
  bloqueioCobre({ ...diaInteiro, data: '2026-09-22' }, item('08:00')), false);
t('bloqueio', 'faixa 14-16 pega 14:00',  bloqueioCobre(faixa, item('14:00')), true);
t('bloqueio', 'faixa 14-16 pega 15:30',  bloqueioCobre(faixa, item('15:30')), true);
t('bloqueio', 'faixa 14-16 NÃO pega 16:00 (fim exclusivo)',
  bloqueioCobre(faixa, item('16:00')), false);
t('bloqueio', 'faixa 14-16 NÃO pega 13:00+45 (termina 13:45)',
  bloqueioCobre(faixa, item('13:00', 45)), false);
t('bloqueio', 'faixa 14-16 PEGA 13:30+45 (entra às 14:15)',
  bloqueioCobre(faixa, item('13:30', 45)), true);
t('bloqueio', 'aceita HH:MM sem segundos',
  bloqueioCobre({ data: D, hora_inicio: '14:00', hora_fim: '16:00' }, item('15:00')), true);
t('bloqueio', 'bloqueio nulo não cobre', bloqueioCobre(null, item('14:00')), false);

// ─── horaMais ────────────────────────────────────────────────────────
t('horaMais', '14:00 + 45',   horaMais('14:00', 45), '14:45');
t('horaMais', '14:30 + 30',   horaMais('14:30', 30), '15:00');
t('horaMais', '17:30 + 60',   horaMais('17:30', 60), '18:30');
t('horaMais', '08:00 + 0',    horaMais('08:00', 0), '08:00');
t('horaMais', '09:05 + 55',   horaMais('09:05', 55), '10:00');
t('horaMais', 'aceita HH:MM:SS na entrada', horaMais('14:00:00', 45), '14:45');
t('horaMais', 'duração nula vira 0',        horaMais('14:00', null), '14:00');
t('horaMais', 'LIMITE CONHECIDO: 23:30+60 passa de 24h', horaMais('23:30', 60), '24:30');

// ─── hhmm ────────────────────────────────────────────────────────────
t('hhmm', 'corta segundos', hhmm('14:00:00'), '14:00');
t('hhmm', 'já curto passa',  hhmm('14:00'), '14:00');
t('hhmm', 'null vira null',  hhmm(null), null);

// ─── verificarAgenda (banco falso) ───────────────────────────────────
// Devolve linhas fixas por tabela e IGNORA os filtros: testa a classificação,
// não a query. O .neq('status','cancelada') fica sem cobertura aqui.
const { verificarAgenda, impedimentosQueTravam } = M;
const { montarDataHoraISO } = await import('./utils.js');
function bancoFalso({ consultas = [], bloqueios = [] } = {}) {
  const q = rows => {
    const o = { select: () => o, eq: () => o, in: () => o, neq: () => o,
                not: () => o, gte: () => o, lte: () => o,
                then: r => r({ data: rows, error: null }) };
    return o;
  };
  return { from: t => q(t === 'consultas' ? consultas : t === 'bloqueios_agenda' ? bloqueios : []) };
}
const DV = '2026-10-06', SAB = '2026-10-03';          // terça comum; sábado
const EU = 'pac-eu', ANA = 'pac-ana';
const cons = (id, pac, hora, dur = 45, nome = 'Ana') =>
  ({ id, paciente_id: pac, data_hora: montarDataHoraISO(DV, hora), duracao_min: dur, paciente: { nome } });
const va = (banco, itens, extra = {}) =>
  verificarAgenda(bancoFalso(banco), { nutriId: 'n', pacienteId: EU, itens, ...extra });
const tipos = r => r.impedimentos.map(i => i.tipo);
const it = (hora, dur = 45, data = DV) => ({ data, hora, duracaoMin: dur });
const resumo = r => [tipos(r), r.avisos.length];
let r;

r = await va({ consultas: [cons('a', ANA, '14:00')] }, [it('14:00')]);
t('verificar', 'OUTRA paciente no mesmo horário TRAVA', resumo(r), [['conflito'], 0]);
r = await va({ consultas: [cons('a', ANA, '14:00')] }, [it('14:45')]);
t('verificar', 'outra paciente, só encosta (14:45): nada', resumo(r), [[], 0]);
r = await va({ consultas: [cons('a', ANA, '14:00')] }, [it('14:30', 30)]);
t('verificar', 'outra paciente, sobreposição parcial TRAVA', resumo(r), [['conflito'], 0]);
r = await va({ consultas: [cons('a', ANA, '14:00')] }, [it('14:00')], { ignorarIds: ['a'] });
t('verificar', 'a própria consulta em ignorarIds: nada', resumo(r), [[], 0]);
r = await va({}, [it('10:00', 30), it('10:00', 30)]);
t('verificar', 'pacote: duas iguais entre si AVISA, não trava', resumo(r), [[], 1]);
r = await va({ consultas: [cons('b', EU, '14:00')] }, [it('14:00')]);
t('verificar', 'MESMA paciente, consulta já gravada: AVISA', resumo(r), [[], 1]);
r = await va({ consultas: [cons('b', EU, '14:00')] }, [it('14:00')], { pacienteId: null });
t('verificar', 'sem pacienteId: conta como outra e TRAVA', resumo(r), [['conflito'], 0]);
r = await va({ consultas: [cons('a', ANA, '14:00')],
               bloqueios: [{ data: DV, hora_inicio: null, hora_fim: null, motivo: null }] }, [it('14:00')]);
t('verificar', 'bloqueio + conflito: os dois travam', tipos(r), ['bloqueio', 'conflito']);
r = await va({}, [it('10:00', 45, SAB)]);
t('verificar', 'sábado sem conflito: só fds', resumo(r), [['fds'], 0]);
r = await va({}, [it('10:00')]);
t('verificar', 'retorno mantém as duas chaves', Object.keys(r).sort(), ['avisos', 'impedimentos']);

// ─── duração ─────────────────────────────────────────────────────────
// Item montado à mão: it('10:00', undefined) cairia no default dur = 45.
r = await va({}, [{ data: DV, hora: '10:00', duracaoMin: undefined }]);
t('duracao', 'vazia trava', tipos(r), ['duracao']);
r = await va({}, [it('10:00', 0)]);
t('duracao', 'zero trava', tipos(r), ['duracao']);
r = await va({}, [it('10:00', -30)]);
t('duracao', 'negativa trava', tipos(r), ['duracao']);
r = await va({}, [it('10:00', '45')]);
t('duracao', "texto '45' (vem do <select>) passa", tipos(r), []);
r = await va({ consultas: [cons('a', ANA, '14:00')] }, [it('14:00', 0)]);
t('duracao', 'zero em cima de outra paciente: trava garantida pela duração',
  tipos(r).includes('duracao'), true);

// ─── impedimentosQueTravam (modal da Agenda) ─────────────────────────
const INI = { data: DV, hora: '14:00', duracao: 45, status: 'agendada' };
const imp = (...ts) => ts.map(tipo => ({ tipo, texto: tipo }));
const tv = (lista, isEdit, mudanca = {}, inicial = INI) =>
  impedimentosQueTravam(lista, { isEdit, inicial, atual: { ...inicial, ...mudanca } }).map(i => i.tipo);

t('travas', 'consulta nova com conflito trava',           tv(imp('conflito'), false), ['conflito']);
t('travas', 'editar sem mudar nada, conflito legado: não', tv(imp('conflito'), true), []);
t('travas', 'editar só a duração trava',                  tv(imp('conflito'), true, { duracao: 60 }), ['conflito']);
t('travas', 'editar a hora trava',                        tv(imp('conflito'), true, { hora: '14:30' }), ['conflito']);
t('travas', 'salvar como cancelada: conflito não trava',  tv(imp('conflito'), true, { status: 'cancelada' }), []);
t('travas', 'reativar cancelada no mesmo horário trava',
  tv(imp('conflito'), true, { status: 'agendada' }, { ...INI, status: 'cancelada' }), ['conflito']);
t('travas', 'editar sem mudar a data: fds perdoado',      tv(imp('fds'), true, { hora: '15:00' }), []);
t('travas', 'editar sem mudar a data: bloqueio trava',    tv(imp('bloqueio'), true), ['bloqueio']);
t('travas', 'editar mudando a data para sábado trava',    tv(imp('fds'), true, { data: SAB }), ['fds']);
t('travas', 'duração inválida trava mesmo sem mudar nada', tv(imp('duracao'), true), ['duracao']);

// ─── feriado vira aviso (pedido 7, 2026-10-08) ───────────────────────
const { avisosQueConfirmam, textoConfirmacao } = M;
const FERIADO = '2026-12-08';   // terça, Nossa Senhora da Conceição
const CIRIO = '2026-10-11';     // domingo, Círio de Nazaré
const tiposAviso = r => r.avisos.map(a => a.tipo);

r = await va({}, [it('10:00', 45, FERIADO)]);
t('feriado', '08/12/2026 ao criar: AVISO feriado e zero impedimentos', [tipos(r), tiposAviso(r)], [[], ['feriado']]);
t('feriado', 'texto do aviso: data, nome, sem "Ajuste a data."',
  r.avisos[0].texto, '08/12/2026 é feriado (Nossa Senhora da Conceição).');
t('feriado', 'impedimentos nunca trazem mais o tipo feriado', tipos(r).includes('feriado'), false);
r = await va({}, [it('10:00', 45, SAB)]);
t('feriado', 'sábado continua só fds, sem aviso', [tipos(r), tiposAviso(r)], [['fds'], []]);
r = await va({}, [it('10:00', 45, CIRIO)]);
t('feriado', 'domingo de feriado (Círio): aviso feriado E impedimento fds', [tipos(r), tiposAviso(r)], [['fds'], ['feriado']]);
r = await va({}, [it('10:00', 45, CIRIO)], { permitirFds: true });
t('feriado', 'Círio com permitirFds: só o aviso', [tipos(r), tiposAviso(r)], [[], ['feriado']]);
r = await va({ consultas: [cons('b', EU, '14:00')] }, [it('14:00')]);
t('feriado', 'aviso de conflito da mesma paciente segue com tipo conflito', tiposAviso(r), ['conflito']);
r = await va({}, [it('10:00', 45, FERIADO), it('10:00', 45, '2026-12-25')]);
t('feriado', 'pacote com dois feriados à mão: um aviso por data', r.avisos.map(a => a.texto),
  ['08/12/2026 é feriado (Nossa Senhora da Conceição).', '25/12/2026 é feriado (Natal).']);

// avisosQueConfirmam (modal da Agenda)
const avs = (...ts) => ts.map(tipo => ({ tipo, texto: tipo }));
const INIF = { ...INI, data: FERIADO };
const ac = (lista, isEdit, mudanca = {}, inicial = INIF) =>
  avisosQueConfirmam(lista, { isEdit, inicial, atual: { ...inicial, ...mudanca } }).map(a => a.tipo);
t('feriado', 'editar consulta em feriado sem mudar a data: nada a confirmar', ac(avs('feriado'), true, { hora: '15:00' }), []);
t('feriado', 'editar mudando a data para um feriado: confirma', ac(avs('feriado'), true, { data: FERIADO }, INI), ['feriado']);
t('feriado', 'criar em feriado: confirma', ac(avs('feriado'), false), ['feriado']);
t('feriado', 'conflito não é afetado pela edição sem mudar a data', ac(avs('conflito', 'feriado'), true), ['conflito']);

// textoConfirmacao: um aviso sai sozinho; vários, um por linha
t('feriado', 'confirm com só o feriado',
  textoConfirmacao([{ tipo: 'feriado', texto: '08/12/2026 é feriado (Nossa Senhora da Conceição).' }]),
  '08/12/2026 é feriado (Nossa Senhora da Conceição).\n\nAgendar mesmo assim?');
t('feriado', 'confirm com feriado + conflito: título "avisos", um por linha',
  textoConfirmacao([{ tipo: 'feriado', texto: 'F.' }, { tipo: 'conflito', texto: 'C.' }]),
  '2 avisos:\n\n• F.\n• C.\n\nAgendar mesmo assim?');
t('feriado', 'confirm só com conflitos: título de antes',
  textoConfirmacao([{ tipo: 'conflito', texto: 'A.' }, { tipo: 'conflito', texto: 'B.' }]),
  '2 conflitos de horário:\n\n• A.\n• B.\n\nAgendar mesmo assim?');

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
