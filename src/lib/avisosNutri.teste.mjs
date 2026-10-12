/**
 * Teste standalone de avisosNutri.js. Roda com `node src/lib/avisosNutri.teste.mjs`.
 * Sem banco.
 */
const { montarAvisos, linkDoAviso, ROTULO_AVISO, LIMITE_AVISOS } = await import('./avisosNutri.js');

let ok = 0, falhou = 0;
function t(grupo, nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`  ${passou ? 'PASS ' : 'FALHA'} [${grupo}] ${nome}`);
  if (!passou) console.log(`        esperado: ${JSON.stringify(esperado)}\n        obtido:   ${JSON.stringify(obtido)}`);
}

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';

// rótulos
t('rotulo', 'contrato', ROTULO_AVISO.contrato_assinado, 'Assinou o contrato');
t('rotulo', 'foto', ROTULO_AVISO.foto_prato, 'Enviou foto do prato');

// links
t('link', 'contrato → ficha', linkDoAviso({ tipo: 'contrato_assinado', paciente_id: P1 }),
  { to: `/nutri/pacientes/${P1}`, texto: 'Abrir ficha' });
t('link', 'foto → feed', linkDoAviso({ tipo: 'foto_prato', paciente_id: P1 }),
  { to: '/nutri/feed', texto: 'Ver no feed' });
t('link', 'contrato sem paciente → sem link', linkDoAviso({ tipo: 'contrato_assinado' }), null);
t('link', 'tipo desconhecido → sem link', linkDoAviso({ tipo: 'outro', paciente_id: P1 }), null);

// montagem
const linhas = [
  { id: 'a', paciente_id: P1, tipo: 'contrato_assinado', criado_em: '2026-10-08T12:00:00Z', visto_em: null },
  { id: 'b', paciente_id: P2, tipo: 'foto_prato',        criado_em: '2026-10-09T09:00:00Z', visto_em: '2026-10-09T10:00:00Z' },
  { id: 'c', paciente_id: 'sem-nome', tipo: 'xyz',       criado_em: '2026-10-07T08:00:00Z', visto_em: null },
];
const r = montarAvisos(linhas, { [P1]: 'Ana', [P2]: 'Bia' });
t('montar', 'mais recente primeiro', r.map(x => x.id), ['b', 'a', 'c']);
t('montar', 'nome da paciente', r.map(x => x.paciente), ['Bia', 'Ana', '—']);
t('montar', 'rótulo, desconhecido vira —', r.map(x => x.rotulo), ['Enviou foto do prato', 'Assinou o contrato', '—']);
t('montar', 'visto', r.map(x => x.visto), [true, false, false]);
t('montar', 'não muda a entrada', linhas.map(x => x.id), ['a', 'b', 'c']);
t('montar', 'lista vazia', montarAvisos([], {}), []);
t('montar', 'null vira lista vazia', montarAvisos(null), []);

// limite
const muitas = Array.from({ length: 130 }, (_, i) => ({
  id: String(i), paciente_id: P1, tipo: 'contrato_assinado',
  criado_em: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString(), visto_em: null,
}));
const lim = montarAvisos(muitas, { [P1]: 'Ana' });
t('limite', `corta em ${LIMITE_AVISOS}`, lim.length, 100);
t('limite', 'fica com os mais recentes', [lim[0].id, lim[99].id], ['129', '30']);

// bloco-100: tipos novos (check-in diário, alerta oncológico, formulário respondido)
const { TIPOS_AVISOS_LISTA, ROTA_ONCOLOGIA_NUTRI } = await import('./avisosNutri.js');
const CINCO = ['contrato_assinado', 'foto_prato', 'checkin_diario', 'alerta_oncologico', 'checkin_respondido'];
t('novos', 'rótulo para os 5 tipos', CINCO.map(k => typeof ROTULO_AVISO[k] === 'string' && ROTULO_AVISO[k].length > 0), [true, true, true, true, true]);
t('novos', 'rótulos literais dos 3 tipos novos',
  [ROTULO_AVISO.checkin_diario, ROTULO_AVISO.alerta_oncologico, ROTULO_AVISO.checkin_respondido],
  ['Respondeu o check-in de hoje', 'Alerta no check-in: confira', 'Respondeu um formulário de check-in']);
t('novos', 'link para os 5 tipos (com paciente)', CINCO.map(k => linkDoAviso({ tipo: k, paciente_id: P1 }) != null), [true, true, true, true, true]);
t('novos', 'todo link começa com "/"', CINCO.map(k => linkDoAviso({ tipo: k, paciente_id: P1 }).to.startsWith('/')), [true, true, true, true, true]);
t('novos', 'checkin_respondido → /nutri/checkins', linkDoAviso({ tipo: 'checkin_respondido', paciente_id: P1 })?.to, '/nutri/checkins');
t('novos', 'check-in diário e alerta → tela de oncologia da nutri',
  [linkDoAviso({ tipo: 'checkin_diario' })?.to, linkDoAviso({ tipo: 'alerta_oncologico' })?.to, ROTA_ONCOLOGIA_NUTRI],
  ['/nutri/monitoramento-oncologico', '/nutri/monitoramento-oncologico', '/nutri/monitoramento-oncologico']);
t('novos', 'contrato continua na ficha como hoje', linkDoAviso({ tipo: 'contrato_assinado', paciente_id: P1 })?.to, `/nutri/pacientes/${P1}`);
t('novos', 'tipo desconhecido e aviso nulo não quebram', [linkDoAviso({ tipo: 'outro' }), linkDoAviso(null), linkDoAviso(undefined)], [null, null, null]);
t('novos', 'lista da página e do menu: 4 tipos, sem foto_prato',
  [TIPOS_AVISOS_LISTA, TIPOS_AVISOS_LISTA.includes('foto_prato')],
  [['contrato_assinado', 'checkin_diario', 'alerta_oncologico', 'checkin_respondido'], false]);
const mist = montarAvisos([
  { id: 'x', paciente_id: P1, tipo: 'checkin_diario',    criado_em: '2026-10-12T10:00:00Z', visto_em: null },
  { id: 'y', paciente_id: P1, tipo: 'alerta_oncologico', criado_em: '2026-10-12T09:00:00Z', visto_em: null },
  { id: 'z', paciente_id: P2, tipo: 'checkin_respondido', criado_em: '2026-10-12T11:00:00Z', visto_em: null },
], { [P1]: 'Ana', [P2]: 'Bia' });
t('novos', 'alerta destacado, mas na ordem cronológica', mist.map(x => [x.id, x.alerta]), [['z', false], ['x', false], ['y', true]]);

console.log(`\n${ok} passaram, ${falhou} falharam, ${ok + falhou} no total`);
if (falhou) process.exit(1);
