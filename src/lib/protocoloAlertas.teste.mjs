/**
 * Teste standalone dos alertas aprovados nas fichas de inibidores de
 * aromatase e de temozolomida (decisão do operador em 10/10/2026).
 * Roda com `node src/lib/protocoloAlertas.teste.mjs`, sem framework, na raiz do repo.
 *
 * Só ACRÉSCIMOS: o que já existia nas 3 fichas fica idêntico, os sinais
 * antigos ficam na frente e na mesma ordem, e as outras 77 fichas não mudam.
 * A comparação é com o catálogo do commit 2ef22d0 (anterior à mudança), e não
 * com HEAD, para o teste continuar fazendo sentido depois do commit.
 *
 * `nota_interna` é só da nutri: lida pelo CardProtocoloEfeitos, nunca pela
 * Lâmina nem pelas telas da paciente.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

const catalogo = JSON.parse(readFileSync(new URL('../data/protocolos_efeitos.json', import.meta.url), 'utf8'));
const base = JSON.parse(execSync('git show 2ef22d0:src/data/protocolos_efeitos.json', { maxBuffer: 1e8 }).toString('utf8'));

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const AROMATASE = 'Inibidores de aromatase (Anastrozol / Letrozol)';
const TMZ = ['Temozolomida 150mg Isolado', 'Temozolomida 75mg + RDT'];
const TRES = [AROMATASE, ...TMZ];
const CAMPOS_NOVOS = ['monitoramento_periodico', 'equipe_medica', 'nota_interna'];

const NOVOS_AROMATASE = ['Dor óssea nova e intensa', 'Piora funcional importante', 'Suspeita de fratura', 'Reação alérgica grave'];
const NOVOS_TMZ = ['Febre ≥ 38 °C', 'Calafrios', 'Sangramento incomum', 'Vômitos persistentes',
  'Incapacidade de hidratação', 'Desidratação', 'Falta de ar', 'Alterações neurológicas importantes, incluindo convulsões'];
const NOTA_TMZ = 'Não vincular a dias fixos da timeline. Não recomendar suspensão ou alteração de medicamento por iniciativa da paciente.';

const agora = nome => catalogo.protocolos.find(p => p.nome === nome);
const antes = nome => base.protocolos.find(p => p.nome === nome);

for (const nome of TRES) {
  const a = agora(nome), b = antes(nome);
  t(`${nome}: existe`, !!a && !!b, true);
  if (!a || !b) continue;

  // Todo campo que já existia, exceto sinais_alerta, idêntico.
  for (const campo of Object.keys(b).filter(k => k !== 'sinais_alerta')) {
    t(`${nome}: ${campo} idêntico ao 2ef22d0`, a[campo], b[campo]);
  }
  const velhos = b.sinais_alerta ?? [];
  t(`${nome}: sinais antigos na frente e na mesma ordem`, a.sinais_alerta.slice(0, velhos.length), velhos);
  const novos = nome === AROMATASE ? NOVOS_AROMATASE : NOVOS_TMZ;
  t(`${nome}: todos os sinais novos presentes, literais`, novos.filter(s => !a.sinais_alerta.includes(s)), []);
  t(`${nome}: sem duplicata exata em sinais_alerta`, a.sinais_alerta.length, new Set(a.sinais_alerta).size);
  t(`${nome}: acrescentados = novos que não existiam, na ordem`,
    a.sinais_alerta.slice(velhos.length), novos.filter(s => !velhos.includes(s)));
}

const ar = agora(AROMATASE);
t('aromatase: monitoramento_periodico literal', ar?.monitoramento_periodico, ['Saúde óssea', 'Perfil lipídico', 'Peso e composição corporal']);
t('aromatase: nota_interna literal', ar?.nota_interna,
  'Dores articulares habituais e alterações isoladas do colesterol não são classificadas como emergência. ' + NOTA_TMZ);
t('aromatase: sem equipe_medica', ar?.equipe_medica, undefined);
for (const nome of TMZ) {
  const p = agora(nome);
  t(`${nome}: equipe_medica literal`, p?.equipe_medica,
    'Hemograma e profilaxia para pneumonia por Pneumocystis: responsabilidade da equipe médica, conforme o esquema prescrito.');
  t(`${nome}: nota_interna literal`, p?.nota_interna, NOTA_TMZ);
  t(`${nome}: sem monitoramento_periodico`, p?.monitoramento_periodico, undefined);
}
t('"Febre ≥ 38 °C" em bytes (≥ U+2265, espaço comum, ° U+00B0)',
  Buffer.from('Febre ≥ 38 °C').toString('hex'), '466562726520e289a520333820c2b043');

t('campos novos só nas 3 fichas',
  catalogo.protocolos.filter(p => CAMPOS_NOVOS.some(k => k in p)).map(p => p.nome), TRES);
t('nenhuma ficha com rascunho_revisao ou rascunho',
  catalogo.protocolos.filter(p => 'rascunho_revisao' in p || 'rascunho' in p).map(p => p.nome), []);

t('meta idêntico ao 2ef22d0', catalogo.meta, base.meta);
t('catálogo com 80 protocolos', catalogo.protocolos.length, 80);
t('mesma ordem de nomes do 2ef22d0', catalogo.protocolos.map(p => p.nome), base.protocolos.map(p => p.nome));
t('as outras 77 fichas idênticas ao 2ef22d0',
  catalogo.protocolos.filter(p => !TRES.includes(p.nome)),
  base.protocolos.filter(p => !TRES.includes(p.nome)));
for (const nome of ['R-CHOP', 'Kisqali (ribociclibe)', 'Kisqali + Femara (ribociclibe + letrozol)', 'Capecitabina + Temozolomida']) {
  t(`${nome} idêntica ao 2ef22d0`, agora(nome), antes(nome));
}

// Quem lê os campos.
const src = new URL('../', import.meta.url);
const ler = rel => readFileSync(new URL(rel, src), 'utf8');
const lamina = ler('app/nutri/LaminaProtocolo.jsx');
t('CardProtocoloEfeitos lê nota_interna', ler('components/CardProtocoloEfeitos.jsx').includes('nota_interna'), true);
t('LaminaProtocolo NÃO lê nota_interna', lamina.includes('nota_interna'), false);
t('LaminaProtocolo lê monitoramento_periodico e equipe_medica',
  [lamina.includes('monitoramento_periodico'), lamina.includes('equipe_medica')], [true, true]);
const paciente = readdirSync(new URL('app/paciente/', src)).filter(f => /\.(jsx?|mjs)$/.test(f));
t('nenhum arquivo de src/app/paciente lê nota_interna',
  paciente.filter(f => ler(`app/paciente/${f}`).includes('nota_interna')), []);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
