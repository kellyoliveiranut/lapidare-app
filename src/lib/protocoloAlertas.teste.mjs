/**
 * Teste standalone dos alertas aprovados nas fichas de inibidores de
 * aromatase e de temozolomida (decisões de 10/10/2026).
 * Roda com `node src/lib/protocoloAlertas.teste.mjs`, sem framework, na raiz do repo.
 *
 * Aromatase: só ACRÉSCIMOS, o que já existia fica idêntico.
 * Temozolomida (150mg e 75mg + RDT): a lista de alertas foi CONSOLIDADA pela
 * Kelly (texto literal dela, com "Dor de cabeça intensa" mantida por último),
 * com título e frase final próprios da caixa; na 75mg + RDT, o
 * "(duração a confirmar)" da conduta_base virou frase para a paciente.
 * As outras 77 fichas não mudam. A comparação é com o catálogo do commit
 * 2ef22d0 (anterior às mudanças), e não com HEAD, para o teste continuar
 * fazendo sentido depois do commit.
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
const NOTA_TMZ = 'Não vincular a dias fixos da timeline. Não recomendar suspensão ou alteração de medicamento por iniciativa da paciente.';

// Lista consolidada da Kelly (10/10/2026), literal e nesta ordem.
const ALERTAS_TMZ = [
  'Febre de 38 °C ou mais, ou calafrios.',
  'Sangramento incomum, sangramento que não para ou manchas roxas sem causa aparente.',
  'Convulsões.',
  'Sonolência excessiva, confusão ou dificuldade para despertar.',
  'Fraqueza nova em um lado do corpo, dificuldade para falar ou andar.',
  'Falta de ar ou dificuldade para respirar.',
  'Vômitos persistentes ou incapacidade de manter líquidos.',
  'Sinais de desidratação, como urina muito reduzida, tontura intensa ou fraqueza importante.',
  'Dor de cabeça intensa',
];
const TITULO_TMZ = 'Procure atendimento médico imediatamente se apresentar:';
const RODAPE_TMZ = 'Não espere o próximo atendimento nutricional para comunicar esses sintomas. Procure a equipe oncológica ou um serviço de urgência.';
const DURACAO_NOVA = 'A duração do tratamento será definida conforme o planejamento da sua equipe oncológica.';

const agora = nome => catalogo.protocolos.find(p => p.nome === nome);
const antes = nome => base.protocolos.find(p => p.nome === nome);

// Aromatase: só acréscimos.
{
  const a = agora(AROMATASE), b = antes(AROMATASE);
  t(`${AROMATASE}: existe`, !!a && !!b, true);
  if (a && b) {
    for (const campo of Object.keys(b).filter(k => k !== 'sinais_alerta')) {
      t(`${AROMATASE}: ${campo} idêntico ao 2ef22d0`, a[campo], b[campo]);
    }
    const velhos = b.sinais_alerta ?? [];
    t(`${AROMATASE}: sinais antigos na frente e na mesma ordem`, a.sinais_alerta.slice(0, velhos.length), velhos);
    t(`${AROMATASE}: todos os sinais novos presentes, literais`, NOVOS_AROMATASE.filter(s => !a.sinais_alerta.includes(s)), []);
    t(`${AROMATASE}: sem duplicata exata em sinais_alerta`, a.sinais_alerta.length, new Set(a.sinais_alerta).size);
    t(`${AROMATASE}: acrescentados = novos que não existiam, na ordem`,
      a.sinais_alerta.slice(velhos.length), NOVOS_AROMATASE.filter(s => !velhos.includes(s)));
  }
}

// Temozolomida: lista consolidada, título e frase final; resto idêntico.
for (const nome of TMZ) {
  const a = agora(nome), b = antes(nome);
  t(`${nome}: existe`, !!a && !!b, true);
  if (!a || !b) continue;
  for (const campo of Object.keys(b).filter(k => k !== 'sinais_alerta' && k !== 'conduta_base')) {
    t(`${nome}: ${campo} idêntico ao 2ef22d0`, a[campo], b[campo]);
  }
  const condutaEsperada = nome === 'Temozolomida 75mg + RDT'
    ? b.conduta_base.replace('(duração a confirmar)', DURACAO_NOVA)
    : b.conduta_base;
  t(`${nome}: conduta_base ${nome.includes('RDT') ? '= 2ef22d0 com a frase da duração' : 'idêntico ao 2ef22d0'}`, a.conduta_base, condutaEsperada);
  t(`${nome}: sinais_alerta = lista consolidada da Kelly, literal`, a.sinais_alerta, ALERTAS_TMZ);
  t(`${nome}: "Dor de cabeça intensa" presente com o texto antigo`,
    [b.sinais_alerta.includes('Dor de cabeça intensa'), a.sinais_alerta.includes('Dor de cabeça intensa')], [true, true]);
  t(`${nome}: alerta_titulo literal`, a.alerta_titulo, TITULO_TMZ);
  t(`${nome}: alerta_rodape literal`, a.alerta_rodape, RODAPE_TMZ);
  t(`${nome}: equipe_medica literal`, a.equipe_medica,
    'Hemograma e profilaxia para pneumonia por Pneumocystis: responsabilidade da equipe médica, conforme o esquema prescrito.');
  t(`${nome}: nota_interna literal`, a.nota_interna, NOTA_TMZ);
  t(`${nome}: sem monitoramento_periodico`, a.monitoramento_periodico, undefined);
  t(`${nome}: ordem dos campos`, Object.keys(a),
    [...Object.keys(b), 'alerta_titulo', 'alerta_rodape', 'equipe_medica', 'nota_interna']);
}
t('a 150mg mantém o "(duração a confirmar)"', agora(TMZ[0])?.conduta_base.includes('(duração a confirmar)'), true);

const ar = agora(AROMATASE);
t('aromatase: 4 alertas', ar?.sinais_alerta?.length, 4);
t('aromatase: monitoramento_periodico literal', ar?.monitoramento_periodico, ['Saúde óssea', 'Perfil lipídico', 'Peso e composição corporal']);
t('aromatase: nota_interna literal', ar?.nota_interna,
  'Dores articulares habituais e alterações isoladas do colesterol não são classificadas como emergência. ' + NOTA_TMZ);
t('aromatase: sem equipe_medica', ar?.equipe_medica, undefined);
t('"Febre de 38 °C" em bytes (espaço comum, ° U+00B0)',
  Buffer.from('Febre de 38 °C').toString('hex'), '466562726520646520333820c2b043');

t('campos monitoramento/equipe/nota só nas 3 fichas',
  catalogo.protocolos.filter(p => CAMPOS_NOVOS.some(k => k in p)).map(p => p.nome), TRES);
t('alerta_titulo e alerta_rodape só nas 2 de temozolomida',
  catalogo.protocolos.filter(p => 'alerta_titulo' in p || 'alerta_rodape' in p).map(p => p.nome), TMZ);
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
const card = ler('components/CardProtocoloEfeitos.jsx');
t('CardProtocoloEfeitos lê alerta_titulo, alerta_rodape e nota_interna',
  ['alerta_titulo', 'alerta_rodape', 'nota_interna'].map(k => card.includes(k)), [true, true, true]);
t('LaminaProtocolo lê alerta_titulo e alerta_rodape',
  [lamina.includes('alerta_titulo'), lamina.includes('alerta_rodape')], [true, true]);
t('LaminaProtocolo NÃO lê nota_interna', lamina.includes('nota_interna'), false);
t('LaminaProtocolo lê monitoramento_periodico e equipe_medica',
  [lamina.includes('monitoramento_periodico'), lamina.includes('equipe_medica')], [true, true]);
const paciente = readdirSync(new URL('app/paciente/', src)).filter(f => /\.(jsx?|mjs)$/.test(f));
t('nenhum arquivo de src/app/paciente lê nota_interna, alerta_titulo ou alerta_rodape',
  paciente.filter(f => /nota_interna|alerta_titulo|alerta_rodape/.test(ler(`app/paciente/${f}`))), []);

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
