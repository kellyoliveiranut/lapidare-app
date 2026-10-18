/**
 * Teste standalone da parte pura da geração automática do plano
 * (src/lib/planoAutomatico.js). Roda com `node src/lib/planoAutomatico.teste.mjs`,
 * na raiz do repo. Sem rede e sem banco. Dados fictícios.
 */
import {
  motivoBloqueio, faltaMeta, lerRespostaPlano, alimentosForaDaTaco, avisoKcal, MODELO_PLANO,
} from './planoAutomatico.js';

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

// bloqueio oncológico
t('emagrecimento sem histórico → liberado', motivoBloqueio({ objetivo: 'Emagrecimento', tipoPlano: 'avulsa', qtdTratamentosOnco: 0 }), null);
t('objetivo Oncologia → bloqueado (qualquer caixa/espaço)', [' oncologia ', 'ONCOLOGIA', 'Oncologia'].map((o) => motivoBloqueio({ objetivo: o }) !== null), [true, true, true]);
t('plano Essentia → bloqueado', motivoBloqueio({ objetivo: 'Emagrecimento', tipoPlano: 'Essentia' }) !== null, true);
t('histórico oncológico cadastrado → bloqueado', motivoBloqueio({ objetivo: 'Emagrecimento', tipoPlano: 'avulsa', qtdTratamentosOnco: 1 }) !== null, true);
t('sem dados → liberado (o chamador sempre passa os dados)', motivoBloqueio(), null);

// metas
t('metas completas → null', faltaMeta({ kcal: '1800', prot: '120', carbo: '200', gord: '60' }), null);
t('falta tudo', faltaMeta({}) !== null, true);
t('"—" conta como vazio e lista só o que falta',
  faltaMeta({ kcal: '1800', prot: '—', carbo: '200', gord: '' }),
  'Preencha antes proteínas, gorduras (ou importe da aba Cálculos): a IA só distribui as metas, não define os números.');

// resposta da IA
const plano = { macros: { kcal: 1800, proteinas_g: 120 }, refeicoes: [{ nome: 'Café da manhã', alimentos: [{ nome: 'Pão integral', quantidade: '50g' }] }], obs: 'x' };
const json = JSON.stringify(plano);
t('JSON puro', lerRespostaPlano(json).ok, true);
t('com cerca de markdown', lerRespostaPlano('```json\n' + json + '\n```').ok, true);
t('com texto antes e depois', lerRespostaPlano('Aqui está o plano:\n' + json + '\nQualquer ajuste me avise.').ok, true);
t('texto devolvido é JSON limpo', JSON.parse(lerRespostaPlano('```json\n' + json + '\n```').texto), plano);
t('sem JSON → erro', lerRespostaPlano('Desculpe, não consigo.').ok, false);
t('JSON cortado no meio → erro', lerRespostaPlano(json.slice(0, 60)).ok, false);
t('vazio/null → erro', [lerRespostaPlano('').ok, lerRespostaPlano(null).ok], [false, false]);
t('JSON sem refeições → erro de validação', lerRespostaPlano('{"macros":{"kcal":1}}').ok, false);

// TACO
const taco = (n) => (n === 'Arroz' ? { nome: 'Arroz' } : null);
t('alimentos fora da TACO listados com a refeição',
  alimentosForaDaTaco({ refeicoes: [{ nome: 'Almoço', alimentos: [{ nome: 'Arroz' }, { nome: 'Receita da vovó' }] }, { nome: 'Ceia', alimentos: [{ nome: 'Suco misterioso' }] }] }, taco),
  ['Almoço: Receita da vovó', 'Ceia: Suco misterioso']);
t('tudo na TACO → lista vazia', alimentosForaDaTaco({ refeicoes: [{ nome: 'Almoço', alimentos: [{ nome: 'Arroz' }] }] }, taco), []);
t('sem refeições → lista vazia', alimentosForaDaTaco({}, taco), []);

// calorias
t('dentro da tolerância → null', avisoKcal(1850, '1800'), null);
t('fora da tolerância → aviso', avisoKcal(2200, '1800'), 'As calorias do plano (2200 kcal) diferem da meta (1800 kcal) em 22%.');
t('vírgula decimal e valores inválidos', [avisoKcal('1800,5', '1800'), avisoKcal(null, '1800'), avisoKcal(1800, '')], [null, null, null]);

t('modelo está na allowlist do proxy', ['claude-sonnet-4-6', 'claude-haiku-4-5'].includes(MODELO_PLANO), true);

console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
