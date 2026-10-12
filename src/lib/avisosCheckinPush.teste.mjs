/**
 * Teste standalone da parte pura do push de check-in para a nutri
 * (netlify/functions/avisos-checkin-push/montar.js, CommonJS).
 * Roda com `node src/lib/avisosCheckinPush.teste.mjs`, na raiz do repo. Sem rede e sem banco.
 * Nomes do teste são fictícios.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
const require = createRequire(import.meta.url);
const { primeiroNome, montarPayload, agruparPorNutri, ROTA_ONCOLOGIA_NUTRI, ICONE } =
  require('../../netlify/functions/avisos-checkin-push/montar.js');
const { ROTA_ONCOLOGIA_NUTRI: ROTA_APP } = await import('./avisosNutri.js');

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// primeiro nome
t('nome com sobrenome → primeiro nome', primeiroNome('Fulana de Tal'), 'Fulana');
t('nome sem sobrenome', primeiroNome('Fulana'), 'Fulana');
t('espaços nas pontas e duplos', primeiroNome('   Fulana   Tal  '), 'Fulana');
t('vazio, só espaço, null e undefined → "Sua paciente"', [primeiroNome(''), primeiroNome('   '), primeiroNome(null), primeiroNome(undefined)],
  ['Sua paciente', 'Sua paciente', 'Sua paciente', 'Sua paciente']);

// payloads
const N1 = '11111111-1111-1111-1111-111111111111', N2 = '22222222-2222-2222-2222-222222222222';
const aviso = (tipo, nome, nutri = N1) => ({ aviso_id: 'a', aviso_nutri_id: nutri, aviso_paciente_id: 'p', aviso_tipo: tipo, paciente_nome: nome, aviso_criado_em: '2026-10-12T12:00:00Z' });
t('checkin_diario → título e corpo literais', montarPayload(aviso('checkin_diario', 'Fulana de Tal')),
  { title: 'Check-in respondido', body: 'Fulana respondeu o check-in de hoje.', icon: '/icon-192.png', url: '/nutri/monitoramento-oncologico' });
t('alerta_oncologico → título e corpo literais', montarPayload(aviso('alerta_oncologico', 'Fulana')),
  { title: 'Alerta no check-in', body: 'Fulana registrou sinais que merecem sua atenção. Abra para conferir.', icon: '/icon-192.png', url: '/nutri/monitoramento-oncologico' });
t('sem nome → "Sua paciente"', montarPayload(aviso('checkin_diario', null)).body, 'Sua paciente respondeu o check-in de hoje.');
t('tipos fora desta função → ignorados (null)',
  ['checkin_respondido', 'contrato_assinado', 'foto_prato', 'xyz', undefined].map(k => montarPayload(aviso(k, 'Fulana'))), [null, null, null, null, null]);
t('aviso nulo → null', [montarPayload(null), montarPayload(undefined)], [null, null]);
t('url = a mesma rota do link do aviso no app', [ROTA_ONCOLOGIA_NUTRI, ROTA_APP], ['/nutri/monitoramento-oncologico', '/nutri/monitoramento-oncologico']);
t('ícone = o padrão do sw.js', [ICONE, readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8').includes(`data.icon || '${ICONE}'`)], ['/icon-192.png', true]);

// agrupamento
const lista = [aviso('checkin_diario', 'Fulana', N1), aviso('alerta_oncologico', 'Beltrana', N2), aviso('xyz', 'Ciclana', N1),
  aviso('alerta_oncologico', 'Ciclana', N1), { ...aviso('checkin_diario', 'Sem Nutri'), aviso_nutri_id: null }];
const g = agruparPorNutri(lista);
t('agrupa por nutri, ignora tipo desconhecido e aviso sem nutri',
  Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map(p => p.title)])),
  { [N1]: ['Check-in respondido', 'Alerta no check-in'], [N2]: ['Alerta no check-in'] });
t('lista vazia/nula → {}', [agruparPorNutri([]), agruparPorNutri(null)], [{}, {}]);

// todo payload: url com "/" e nenhum número (de sintoma ou qualquer outro) no texto
const todos = Object.values(g).flat().concat(['checkin_diario', 'alerta_oncologico'].map(k => montarPayload(aviso(k, 'Fulana 7 de Tal'))));
t('url sempre começa com "/"', todos.every(p => p.url.startsWith('/')), true);
t('nenhum texto do push contém número (nem quando o nome traz um depois do primeiro)', todos.filter(p => /\d/.test(p.title + p.body)).map(p => p.body), []);
t('nenhum texto cita sintoma', todos.filter(p => /febre|náusea|nausea|diarreia|apetite|hidrata|suplemento|vômito/i.test(p.title + p.body)).length, 0);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
