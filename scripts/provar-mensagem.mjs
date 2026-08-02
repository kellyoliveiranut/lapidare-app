/**
 * PROVA DA MENSAGEM DE ACESSO DA PACIENTE
 *
 * O que faz
 *   Renderiza src/lib/mensagemAcesso.js em cinco combinações reais e imprime
 *   o texto completo de cada uma, para ser LIDO antes de ir para produção.
 *   Depois roda uma tabela-verdade sobre 14 valores de `objetivo`.
 *
 * Por que existe
 *   Aqui o produto é o texto, não o código: conferir o diff não prova nada
 *   sobre o que a paciente recebe no WhatsApp. Este script transforma a
 *   redação final em algo que dá para ler e aprovar.
 *
 *   A tabela-verdade guarda uma regra crítica: a orientação de tratamento sai
 *   por `objetivo === 'Oncologia'` EXPLÍCITO. Nunca "diferente de
 *   Emagrecimento" — foi esse padrão que fez uma paciente de 'Reeducação
 *   alimentar' receber texto de quimioterapia. O script falha visivelmente se
 *   alguém afrouxar a comparação.
 *
 * Como rodar
 *   node scripts/provar-mensagem.mjs
 *
 *   Sem dependências e sem rede: mensagemAcesso.js não importa nada. Não toca
 *   no banco, não envia mensagem, não escreve arquivo — só imprime.
 *
 * Quando rodar
 *   Sempre que a redação de mensagemAcesso.js mudar. Cole a saída na conversa
 *   e leia os cinco textos antes de aprovar.
 *
 * O link é um marcador (https://SEU-APP/...). Em produção entra a origem real
 * do app e, no caso sem conta, /signup-paciente/{nutri_id}/{token}.
 */
import { mensagemAcesso } from '../src/lib/mensagemAcesso.js';

const LINK_SIGNUP = 'https://SEU-APP/signup-paciente/NUTRI-ID/TOKEN123';
const LINK_LOGIN = 'https://SEU-APP';

const CASOS = [
  { n: 1, rotulo: 'Oncologia · SEM conta (Cadastrar e PacientePerfil caso A)',
    args: { primeiroNome: 'Marina', objetivo: 'Oncologia', link: LINK_SIGNUP, temConta: false } },
  { n: 2, rotulo: 'Oncologia · COM conta (PacientePerfil caso B)',
    args: { primeiroNome: 'Marina', objetivo: 'Oncologia', link: LINK_LOGIN, temConta: true } },
  { n: 3, rotulo: 'Reeducação alimentar · SEM conta',
    args: { primeiroNome: 'Rayssa', objetivo: 'Reeducação alimentar', link: LINK_SIGNUP, temConta: false } },
  { n: 4, rotulo: 'Reeducação alimentar · COM conta',
    args: { primeiroNome: 'Rayssa', objetivo: 'Reeducação alimentar', link: LINK_LOGIN, temConta: true } },
  { n: 5, rotulo: 'objetivo NULL · SEM conta (cadastro sem o campo)',
    args: { primeiroNome: 'Beatriz', objetivo: null, link: LINK_SIGNUP, temConta: false } },
];

for (const c of CASOS) {
  console.log('\n' + '='.repeat(72));
  console.log(`CASO ${c.n} — ${c.rotulo}`);
  console.log('='.repeat(72));
  console.log(mensagemAcesso(c.args));
}

// ── Tabela-verdade da regra crítica ────────────────────────────────────────
// A marca é a frase "check-in na aba Tratamento", que só existe na orientação
// de oncologia. Se algum valor fora de 'Oncologia' passar a recebê-la, aqui
// aparece FALHA e o script sai com código 1.
console.log('\n' + '='.repeat(72));
console.log('TABELA-VERDADE — qual orientação cada objetivo recebe');
console.log('='.repeat(72));

const VALORES = [
  'Oncologia', 'Emagrecimento', 'Reeducação alimentar', 'Hipertrofia',
  'Saúde geral', 'Performance esportiva', 'Preparo pré-cirúrgico', 'Outro',
  '', null, undefined, 'oncologia', 'ONCOLOGIA', ' Oncologia ',
];

let falhas = 0;
for (const v of VALORES) {
  const txt = mensagemAcesso({ primeiroNome: 'X', objetivo: v, link: 'L', temConta: false });
  const ehOncologia = txt.includes('check-in na aba Tratamento');
  const esperado = v === 'Oncologia';
  const ok = ehOncologia === esperado;
  if (!ok) falhas++;
  const mostra = v === null ? 'null' : v === undefined ? 'undefined' : `'${v}'`;
  console.log(
    `  ${ok ? 'OK  ' : 'FALHA'}  ${mostra.padEnd(24)} -> ${ehOncologia ? 'ORIENTAÇÃO DE TRATAMENTO' : 'orientação padrão'}`
  );
}

console.log('\n' + (falhas === 0
  ? "RESULTADO: todas OK. Só o literal 'Oncologia' recebe o texto de tratamento."
  : `RESULTADO: ${falhas} FALHA(S).`));

// Prova adicional: o rodapé de instalação é byte-idêntico nos cinco casos.
// Foi divergência de rodapé entre cópias que motivou centralizar o texto.
const rodapes = CASOS.map(c => mensagemAcesso(c.args).split('---\n\n')[1]);
const rodapeIgual = rodapes.every(r => r === rodapes[0]);
console.log(`RODAPÉ idêntico nos 5 casos: ${rodapeIgual ? 'SIM' : 'NÃO'}`);

if (falhas > 0 || !rodapeIgual) process.exit(1);
