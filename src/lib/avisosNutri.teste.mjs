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

console.log(`\n${ok} passaram, ${falhou} falharam, ${ok + falhou} no total`);
if (falhou) process.exit(1);
