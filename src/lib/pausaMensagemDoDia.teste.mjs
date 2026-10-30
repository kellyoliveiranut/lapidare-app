/**
 * Teste standalone: pausa da "mensagem do dia" no Início da paciente (bloco-128).
 * Roda com `node src/lib/pausaMensagemDoDia.teste.mjs`, sem framework.
 * Sem rede, sem banco: lê a fonte e compara com o b388ea4 (último commit antes
 * da pausa) via `git show`.
 *
 * Regra: com MENSAGEM_DO_DIA_PAUSADA = true o cartão não é desenhado e as
 * leituras que só o alimentam não são feitas. Nada mais do Início muda: tirando
 * as linhas da pausa, o arquivo é o mesmo do b388ea4. Alertas, próxima
 * consulta, jornada, material novo, check-in e convite de notificação não
 * passam pelo interruptor.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MENSAGEM_DO_DIA_PAUSADA } from './pausas.js';

process.env.TZ = process.env.TZ_TESTE || 'America/Belem';

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const lerRaiz = rel => readFileSync(join(RAIZ, rel), 'utf8').replace(/\r/g, '');
const ANTES = 'b388ea4';
const fonteAntes = arq => execSync(`git show ${ANTES}:${arq}`, { cwd: RAIZ, maxBuffer: 1e8 }).toString('utf8').replace(/\r/g, '');

const inicio = lerRaiz('src/app/paciente/Inicio.jsx');
const inicioAntes = fonteAntes('src/app/paciente/Inicio.jsx');
const pausas = lerRaiz('src/lib/pausas.js');

// ── O interruptor ──
t('MENSAGEM_DO_DIA_PAUSADA é true (booleano)', MENSAGEM_DO_DIA_PAUSADA, true);
t('pausas.js: só o comentário e o export',
  pausas.trim().split('\n'),
  ['// true = o cartao "mensagem do dia" nao aparece no Inicio da paciente. Nada e apagado; voltar a false e publicar de novo reativa.',
   'export const MENSAGEM_DO_DIA_PAUSADA = true;']);

// ── Início usa o interruptor nos dois pontos, e só neles ──
const IMPORT = "import { MENSAGEM_DO_DIA_PAUSADA } from '../../lib/pausas.js';";
const GUARDA_EFEITO = '    if (MENSAGEM_DO_DIA_PAUSADA || !profile?.nutri_id) return;';
const GUARDA_CARTAO = '      {!MENSAGEM_DO_DIA_PAUSADA && mensagemCiclo && (';
const usos = inicio.split('\n').filter(l => l.includes('MENSAGEM_DO_DIA_PAUSADA'));
t('Início: importa o interruptor', inicio.includes(IMPORT), true);
t('Início: 3 linhas citam o interruptor (import, efeito da mensagem, cartão)',
  usos, [IMPORT, GUARDA_EFEITO, GUARDA_CARTAO]);
t('Início: a guarda do efeito é a do efeito que lê mensagens_emagrecimento/mensagens_ciclo',
  (() => {
    const i = inicio.indexOf(GUARDA_EFEITO);
    const fim = inicio.indexOf('}, [profile?.nutri_id, profile?.objetivo, pacienteId]);', i);
    const corpo = inicio.slice(i, fim);
    return [i > 0, fim > i, corpo.includes("from('mensagens_emagrecimento')"), corpo.includes("from('mensagens_ciclo')"),
      corpo.includes('faseDoDiaPaciente('), corpo.includes('setMensagemCiclo(')];
  })(), [true, true, true, true, true, true]);
t('Início: a guarda do cartão é a do bloco que desenha {mensagemCiclo.texto}',
  (() => {
    const i = inicio.indexOf(GUARDA_CARTAO);
    const fim = inicio.indexOf('\n      )}\n', i);
    const bloco = inicio.slice(i, fim);
    return [i > 0, bloco.includes('{mensagemCiclo.texto}'),
      /proximaConsulta|CardJornadaResumo|avaliacaoPendente|materiaisNovos|checkinPendente|iniciarTokenPush|janela|alerta|febre/i.test(bloco)];
  })(), [true, true, false]);
t('Início: mensagemCiclo só é desenhado dentro do bloco guardado',
  (inicio.match(/mensagemCiclo\.texto/g) ?? []).length, 1);

// Removidas em 29/10/2026: duas conferências que comparavam o Início inteiro com
// o b388ea4 ("tirando as linhas da pausa, idêntico" e "linhas novas = import e
// guardas"). Deixaram de valer quando o Início ganhou, de propósito, a
// confirmação de presença, o aviso de ausência e o local da consulta. O que
// importa da pausa continua conferido acima (guardas e leituras) e abaixo.

t('pausas.js: nenhuma string (nenhum texto para a paciente)', /['"`]/.test(pausas.split('\n').slice(1).join('\n')), false);

// ── A origem da mensagem continua intacta ──
// Fora da lista desde 30/10/2026: _MensagemEmagrecimento.jsx e _MensagemPorFase.jsx, que só trocaram
// window.confirm pela janela do app (confirmar).
const ORIGEM = [
  'src/lib/rotacaoMensagens.js',
  'src/app/nutri/MensagemMotivacional.jsx',
  'src/app/nutri/_MensagemOncologia.jsx',
  'supabase/migrations/2026-07-02_mensagens_emagrecimento.sql',
  'supabase/migrations/2026-07-07_mensagens_emag_fixar.sql',
  'supabase/migrations/2026-07-31_mensagens_ciclo_baseline.sql',
  'supabase/migrations/2026-08-20_mensagens_ciclo_lista_e_grupo.sql',
];
t('origem da mensagem (rotação, telas da nutri, migrations) igual ao b388ea4',
  ORIGEM.map(f => lerRaiz(f) === fonteAntes(f)), ORIGEM.map(() => true));

console.log(`\nTZ = ${process.env.TZ}`);
console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
