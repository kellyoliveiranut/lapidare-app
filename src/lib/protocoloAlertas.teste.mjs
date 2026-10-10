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
  'Dor de cabeça intensa.',
];
const TITULO_TMZ = 'Procure atendimento médico imediatamente se apresentar:';
const RODAPE_TMZ = 'Não espere o próximo atendimento nutricional para comunicar esses sintomas. Procure a equipe oncológica ou um serviço de urgência.';
const DURACAO_NOVA = 'A duração do tratamento será definida conforme o planejamento da sua equipe oncológica.';

// "(duração a confirmar)" (decisão da Kelly, 10/10/2026): o aviso no fim da
// conduta_base vira a frase padrão em todas as fichas. A conduta_base sai na
// Lâmina impressa, e o aviso nunca pode chegar a ela. Em Paclitaxel e
// Sunitinibe 50mg o número junto do aviso é intervalo/esquema de tomada, não
// duração do tratamento, então também foram trocados (bloco-76).
const AVISO = '(duração a confirmar)';
const PENDENTES_B = [];
const comFrasePadrao = texto => {
  let antes = texto.slice(0, texto.lastIndexOf(AVISO)).trimEnd();
  if (!/[.!?]$/.test(antes)) antes += '.';
  return `${antes} ${DURACAO_NOVA}`;
};
const COM_AVISO_NO_BASE = base.protocolos.filter(p => p.conduta_base?.includes(AVISO)).map(p => p.nome);
const TROCADAS = COM_AVISO_NO_BASE.filter(n => !PENDENTES_B.includes(n));

// Textos da Kelly (10/10/2026): a Lâmina não imprime anotação administrativa.
// A pendência continua visível só para a nutri, no nota_interna (Card).
const SUNI_FRASE = 'Siga os dias de uso e de pausa indicados na sua prescrição médica.';
const TMZ150_FRASE = 'Tome a medicação somente nos dias indicados na sua prescrição médica. Não altere o esquema por conta própria.';
const CAPE_TMZ_FRASE = 'Utilize cada medicamento somente nos dias e horários indicados na sua prescrição médica. Não altere o calendário por conta própria.';
const PCV_FRASE_A = 'Durante o tratamento com PCV, confirme com sua equipe oncológica quais alimentos, bebidas alcoólicas e suplementos devem ser evitados. Não faça mudanças por conta própria.';
const PCV_FRASE_B = 'Antes de iniciar dietas restritivas, suplementos ou produtos naturais, converse com sua equipe oncológica.';
const TMZ150_JEJUM = 'Siga a orientação da equipe médica sobre tomar a temozolomida em jejum e sobre os horários dos medicamentos contra náuseas.';
const TROCAS_ADMIN = {
  'Sunitinibe 37,5mg': ['Esquema pode ser contínuo ou intermitente; VERIFICAR prescrição.', `Esquema pode ser contínuo ou intermitente. ${SUNI_FRASE}`],
  'Sunitinibe 50mg': ['Esquema 4 semanas on/2 off é comum, mas VERIFICAR prescrição.', `Esquema 4 semanas on/2 off é comum. ${SUNI_FRASE}`],
  'Temozolomida 150mg Isolado': ['Confirmar dias de tomada na prescrição.', TMZ150_FRASE],
  // bloco-81 (decisão da Kelly, 10/10/2026): itens 1 a 4.
  'Capecitabina + Temozolomida': ['Confirmar dias exatos de uso de cada medicação.', CAPE_TMZ_FRASE],
  'PCV': ['Confirmar restrições do serviço. ', ''],
  'Vorsidenibe': ['VERIFICAR protocolo e perfil institucional. ', ''],
  'Lenalidomida': [' — vale confirmar com a equipe médica se é o caso da paciente.', '.'],
};
// bloco-81: trocas no manejo de um efeito, [nome, efeito, trecho antigo, texto novo].
// Itens 7 (antiemese) e 8 (analgésico do BEP) ficaram parados: não mudam.
const TROCAS_MANEJO = [
  ['PCV', 'Interações alimentares', 'VERIFICAR orientação institucional sobre alimentos ricos em tiramina e álcool.', PCV_FRASE_A],
  ['PCV', 'Interações alimentares', 'Não liberar dietas ou suplementos sem checar protocolo.', PCV_FRASE_B],
  ['Temozolomida 150mg Isolado', 'Náuseas', 'Quando prescrito em jejum, alinhar horários com antiemético e tolerância.', TMZ150_JEJUM],
];
const SUNITINIBES = ['Sunitinibe 37,5mg', 'Sunitinibe 50mg'];
const PENDENCIA_SUNI = 'Pendente: confirmar na prescrição os dias de uso e de pausa. Enquanto não confirmados, não indicar calendário à paciente.';
const PENDENCIA_TMZ150 = ' Pendente: confirmar na prescrição os dias de tomada. Enquanto não confirmados, não indicar calendário à paciente.';
// bloco-81: pendências que saíram da Lâmina, criadas como último campo.
const NOTAS_ADMIN = {
  'PCV': 'Pendente: confirmar as restrições do serviço. Verificar orientação institucional sobre alimentos ricos em tiramina e álcool. Pendente: conferir a orientação alimentar completa do PCV (evitar bebidas alcoólicas e alimentos ricos em tiramina, como queijos maturados e embutidos, no período indicado pela equipe) e confirmar a duração das restrições, que pode se estender após o término da procarbazina. A Lâmina traz apenas a orientação geral de confirmar com a equipe oncológica.',
  'Vorsidenibe': 'Pendente: verificar protocolo e perfil institucional.',
  'Lenalidomida': 'Pendente: confirmar com a equipe médica se é o caso da paciente. Trecho retirado da Lâmina: "Frequentemente combinado com dexametasona, o que pode adicionar efeitos próprios do corticoide (aumento de apetite, retenção de líquido) — vale confirmar com a equipe médica se é o caso da paciente."',
};
// conduta_base esperada hoje, gerada a partir do 2ef22d0: frase padrão da
// duração e, nas fichas acima, a troca exata do texto administrativo.
const condutaEsperada = (nome, texto) => {
  let c = TROCADAS.includes(nome) ? comFrasePadrao(texto) : texto;
  if (TROCAS_ADMIN[nome]) c = c.replace(...TROCAS_ADMIN[nome]);
  return c;
};
const efeitosEsperados = (nome, efeitos) => efeitos.map(e => {
  let m = e.manejo;
  for (const [n, ef, velho, novo] of TROCAS_MANEJO) if (n === nome && ef === e.efeito) m = m.replace(velho, novo);
  return m === e.manejo ? e : { ...e, manejo: m };
});

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
  for (const campo of Object.keys(b).filter(k => k !== 'sinais_alerta' && k !== 'conduta_base' && k !== 'efeitos')) {
    t(`${nome}: ${campo} idêntico ao 2ef22d0`, a[campo], b[campo]);
  }
  t(`${nome}: efeitos = 2ef22d0${TROCAS_MANEJO.some(([n]) => n === nome) ? ' com a troca do manejo da Kelly' : ''}`,
    a.efeitos, efeitosEsperados(nome, b.efeitos));
  t(`${nome}: conduta_base = 2ef22d0 com a frase padrão da duração${TROCAS_ADMIN[nome] ? ' e o texto da Kelly no lugar da anotação' : ''}`,
    a.conduta_base, condutaEsperada(nome, b.conduta_base));
  t(`${nome}: sinais_alerta = lista consolidada da Kelly, literal`, a.sinais_alerta, ALERTAS_TMZ);
  t(`${nome}: "Dor de cabeça intensa." (com ponto) é o último alerta, vindo do antigo sem ponto`,
    [b.sinais_alerta.includes('Dor de cabeça intensa'), a.sinais_alerta.at(-1)], [true, 'Dor de cabeça intensa.']);
  t(`${nome}: alerta_titulo literal`, a.alerta_titulo, TITULO_TMZ);
  t(`${nome}: alerta_rodape literal`, a.alerta_rodape, RODAPE_TMZ);
  t(`${nome}: equipe_medica literal`, a.equipe_medica,
    'Hemograma e profilaxia para pneumonia por Pneumocystis: responsabilidade da equipe médica, conforme o esquema prescrito.');
  t(`${nome}: nota_interna literal`, a.nota_interna, nome === 'Temozolomida 150mg Isolado' ? NOTA_TMZ + PENDENCIA_TMZ150 : NOTA_TMZ);
  t(`${nome}: sem monitoramento_periodico`, a.monitoramento_periodico, undefined);
  t(`${nome}: ordem dos campos`, Object.keys(a),
    [...Object.keys(b), 'alerta_titulo', 'alerta_rodape', 'equipe_medica', 'nota_interna']);
}

// Duração: frase padrão em todas as 47, aviso em lugar nenhum.
t('47 fichas tinham o aviso no 2ef22d0, todas na conduta_base', COM_AVISO_NO_BASE.length, 47);
t('47 trocadas (44 no bloco-75 + 2 no bloco-76 + a Temozolomida 75mg + RDT do bloco-72)', TROCADAS.length, 47);
t('aviso não existe em nenhum outro campo no 2ef22d0',
  base.protocolos.filter(p => Object.entries(p).some(([k, v]) => k !== 'conduta_base' && JSON.stringify(v).includes(AVISO))).map(p => p.nome), []);
t('47 fichas trocadas = conduta_base do 2ef22d0 com a frase padrão',
  TROCADAS.filter(n => agora(n)?.conduta_base !== condutaEsperada(n, antes(n).conduta_base)), []);
t('frase padrão aparece exatamente nas 47 trocadas',
  catalogo.protocolos.filter(p => JSON.stringify(p).includes(DURACAO_NOVA)).map(p => p.nome), TROCADAS);
t('nenhuma ficha com "(duração a confirmar)" em nenhum campo',
  catalogo.protocolos.filter(p => JSON.stringify(p).includes(AVISO)).map(p => p.nome), []);
t('"Dor de cabeça intensa." só muda nas 2 de temozolomida',
  catalogo.protocolos.filter(p => (p.sinais_alerta ?? []).includes('Dor de cabeça intensa.')).map(p => p.nome), TMZ);

const ar = agora(AROMATASE);
t('aromatase: 4 alertas', ar?.sinais_alerta?.length, 4);
t('aromatase: monitoramento_periodico literal', ar?.monitoramento_periodico, ['Saúde óssea', 'Perfil lipídico', 'Peso e composição corporal']);
t('aromatase: nota_interna literal', ar?.nota_interna,
  'Dores articulares habituais e alterações isoladas do colesterol não são classificadas como emergência. ' + NOTA_TMZ);
t('aromatase: sem equipe_medica', ar?.equipe_medica, undefined);
t('"Febre de 38 °C" em bytes (espaço comum, ° U+00B0)',
  Buffer.from('Febre de 38 °C').toString('hex'), '466562726520646520333820c2b043');

t('campos monitoramento/equipe só nas 3 fichas',
  catalogo.protocolos.filter(p => CAMPOS_NOVOS.filter(k => k !== 'nota_interna').some(k => k in p)).map(p => p.nome), TRES);
t('nota_interna só nas 3 fichas, nos 2 Sunitinibes e em PCV, Vorsidenibe e Lenalidomida',
  catalogo.protocolos.filter(p => 'nota_interna' in p).map(p => p.nome).sort(), [...TRES, ...SUNITINIBES, ...Object.keys(NOTAS_ADMIN)].sort());
t('alerta_titulo e alerta_rodape só nas 2 de temozolomida',
  catalogo.protocolos.filter(p => 'alerta_titulo' in p || 'alerta_rodape' in p).map(p => p.nome), TMZ);
t('nenhuma ficha com rascunho_revisao ou rascunho',
  catalogo.protocolos.filter(p => 'rascunho_revisao' in p || 'rascunho' in p).map(p => p.nome), []);

t('meta idêntico ao 2ef22d0', catalogo.meta, base.meta);
t('catálogo com 80 protocolos', catalogo.protocolos.length, 80);
t('mesma ordem de nomes do 2ef22d0', catalogo.protocolos.map(p => p.nome), base.protocolos.map(p => p.nome));
// R-CHOP (decisão da Kelly, 10/10/2026, provisória): janela de risco do Dia 8
// ao Dia 15 com a aplicação como Dia 1 — marco guardado 6/13 vira 7/14 e o
// texto "D+7 a D+14" da conduta_base vira "Dia 8 ao Dia 15". Nada mais muda nele.
const rchopEsperado = p => ({
  ...p,
  marcosEfeito: p.marcosEfeito.map(m => (m.fase === 'risco' && m.de === 6 && m.ate === 13 ? { ...m, de: 7, ate: 14 } : m)),
  conduta_base: p.conduta_base.replace('D+7 a D+14', 'Dia 8 ao Dia 15'),
});
const esperadoAgora = p => {
  let e = (TROCADAS.includes(p.nome) || TROCAS_ADMIN[p.nome]) ? { ...p, conduta_base: condutaEsperada(p.nome, p.conduta_base) } : p;
  if (TROCAS_MANEJO.some(([n]) => n === p.nome)) e = { ...e, efeitos: efeitosEsperados(p.nome, p.efeitos) };
  if (p.nome === 'R-CHOP') e = rchopEsperado(e);
  if (SUNITINIBES.includes(p.nome)) e = { ...e, nota_interna: PENDENCIA_SUNI };
  if (NOTAS_ADMIN[p.nome]) e = { ...e, nota_interna: NOTAS_ADMIN[p.nome] };
  return e;
};
t('as outras 77 fichas idênticas ao 2ef22d0 (exceto conduta_base das trocadas, manejo do PCV, R-CHOP e nota_interna novas), inclusive a ordem dos campos',
  catalogo.protocolos.filter(p => !TRES.includes(p.nome)).map(p => [Object.keys(p), p]),
  base.protocolos.filter(p => !TRES.includes(p.nome)).map(esperadoAgora).map(p => [Object.keys(p), p]));
t('R-CHOP = 2ef22d0 com só o marco de risco 7/14 e "Dia 8 ao Dia 15" na conduta_base', agora('R-CHOP'), rchopEsperado(antes('R-CHOP')));
t('R-CHOP: "D+7 a D+14" não existe mais no catálogo', JSON.stringify(catalogo).includes('D+7 a D+14'), false);
for (const nome of ['Kisqali (ribociclibe)', 'Kisqali + Femara (ribociclibe + letrozol)']) {
  t(`${nome} idêntica ao 2ef22d0`, agora(nome), antes(nome));
}
t('Capecitabina + Temozolomida = 2ef22d0 com só a troca da conduta_base',
  agora('Capecitabina + Temozolomida'), { ...antes('Capecitabina + Temozolomida'), conduta_base: condutaEsperada('Capecitabina + Temozolomida', antes('Capecitabina + Temozolomida').conduta_base) });

// Anotação administrativa fora da Lâmina (textos da Kelly, 10/10/2026).
const txtCat = JSON.stringify(catalogo);
const vezes = s => txtCat.split(s).length - 1;
t('"VERIFICAR prescrição" e "Confirmar dias de tomada na prescrição" = 0 no catálogo',
  [vezes('VERIFICAR prescrição'), vezes('Confirmar dias de tomada na prescrição')], [0, 0]);
t('frase do Sunitinibe 2 vezes, ambas na conduta_base dos 2 Sunitinibes',
  [vezes(SUNI_FRASE), catalogo.protocolos.filter(p => p.conduta_base?.includes(SUNI_FRASE)).map(p => p.nome)], [2, SUNITINIBES]);
t('frase da Temozolomida 150mg 1 vez, na conduta_base dela',
  [vezes(TMZ150_FRASE), catalogo.protocolos.filter(p => p.conduta_base?.includes(TMZ150_FRASE)).map(p => p.nome)], [1, ['Temozolomida 150mg Isolado']]);
for (const nome of SUNITINIBES) {
  t(`${nome}: nota_interna literal e último campo; ordem = 2ef22d0 + nota_interna`,
    [agora(nome)?.nota_interna, Object.keys(agora(nome) ?? {})], [PENDENCIA_SUNI, [...Object.keys(antes(nome)), 'nota_interna']]);
}
// Campos que a Lâmina lê (LaminaProtocolo.jsx); nota_interna não está entre eles.
const CAMPOS_LAMINA = ['nome', 'conduta_base', 'efeitos', 'sinais_alerta', 'alerta_titulo', 'alerta_rodape', 'monitoramento_periodico', 'equipe_medica'];
t('"Pendente: confirmar na prescrição" em nenhum campo que a Lâmina lê',
  catalogo.protocolos.filter(p => CAMPOS_LAMINA.some(k => JSON.stringify(p[k] ?? '').includes('Pendente: confirmar na prescrição'))).map(p => p.nome), []);
const anteriorCommit = JSON.parse(execSync('git show 01c2901:src/data/protocolos_efeitos.json', { maxBuffer: 1e8 }).toString('utf8'));
t('R-mini-CHOP idêntico ao 01c2901 (marcos incluídos; continua Dia 7 ao Dia 14)',
  agora('R-mini-CHOP'), anteriorCommit.protocolos.find(p => p.nome === 'R-mini-CHOP'));

// bloco-81 (decisão da Kelly, 10/10/2026): anotações retiradas da Lâmina.
const RETIRADOS = ['Confirmar dias exatos de uso de cada medicação', 'Confirmar restrições do serviço',
  'VERIFICAR protocolo e perfil institucional', 'vale confirmar com a equipe médica se é o caso da paciente',
  'VERIFICAR orientação institucional', 'Não liberar dietas ou suplementos sem checar protocolo',
  'Quando prescrito em jejum, alinhar horários com antiemético e tolerância'];
const emCampoLamina = s => catalogo.protocolos.filter(p => CAMPOS_LAMINA.some(k => JSON.stringify(p[k] ?? '').toLowerCase().includes(s.toLowerCase()))).map(p => p.nome);
for (const s of RETIRADOS) t(`"${s}" fora de todo campo que a Lâmina lê`, emCampoLamina(s), []);
t('trechos retirados: só "vale confirmar…" sobra, 1 vez, citado na nota_interna da Lenalidomida',
  [RETIRADOS.map(vezes), catalogo.protocolos.filter(p => p.nota_interna?.includes(RETIRADOS[3])).map(p => p.nome)],
  [[0, 0, 0, 1, 0, 0, 0], ['Lenalidomida']]);
// Itens 7 e 8 parados (pontuação da lista com ";" e frase do BEP com outras orientações): seguem como no 2ef22d0.
t('itens parados: "Antiemese conforme prescricao" 2 vezes (AC e Cisplatina) e "Manejo com analgésico prescrito/liberado" 1 vez (BEP)',
  [vezes('Antiemese conforme prescricao'), vezes('Manejo com analgésico prescrito/liberado')], [2, 1]);
for (const [frase, nome] of [[CAPE_TMZ_FRASE, 'Capecitabina + Temozolomida'], [PCV_FRASE_A, 'PCV'], [PCV_FRASE_B, 'PCV'], [TMZ150_JEJUM, 'Temozolomida 150mg Isolado']]) {
  t(`frase nova 1 vez, em ${nome}: "${frase.slice(0, 40)}…"`,
    [vezes(frase), catalogo.protocolos.filter(p => JSON.stringify(p).includes(frase)).map(p => p.nome)], [1, [nome]]);
}
t('nenhuma pendência ("Pendente:" ou "Verificar orientação institucional") em campo que a Lâmina lê',
  [emCampoLamina('Pendente:'), emCampoLamina('Verificar orientação institucional')], [[], []]);
t('PCV: nenhuma lista de alimentos em campo da Lâmina ("queijo", "embutido" só na nota_interna)',
  CAMPOS_LAMINA.filter(k => /queijo|embutido/i.test(JSON.stringify(agora('PCV')?.[k] ?? ''))), []);
for (const nome of Object.keys(NOTAS_ADMIN)) {
  t(`${nome}: nota_interna literal e último campo; ordem = 2ef22d0 + nota_interna`,
    [agora(nome)?.nota_interna, Object.keys(agora(nome) ?? {})], [NOTAS_ADMIN[nome], [...Object.keys(antes(nome)), 'nota_interna']]);
}
t('todos os marcos idênticos ao 01c2901',
  catalogo.protocolos.map(p => [p.nome, p.marcosEfeito]), anteriorCommit.protocolos.map(p => [p.nome, p.marcosEfeito]));

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
