/**
 * Teste standalone de pdfContrato.js. Roda com `node src/lib/pdfContrato.teste.mjs`.
 *
 * O snapshot "real" é o template 1.2 lido DA MIGRATION (entre os $html$) com os
 * quatro marcadores trocados do jeito que montar_contrato_html() troca: valores
 * passam por escapar_html. O nome da fixture tem apóstrofo e & de propósito,
 * para exercitar &#39; e &amp; no caminho inteiro até o PDF.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extrairBlocos, hashTexto, formatarAceite, gerarPdfContrato } from './pdfContrato.js';

let ok = 0, falhou = 0;

function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) {
    console.log(`      esperado ${JSON.stringify(esperado)}`);
    console.log(`      obtido   ${JSON.stringify(obtido)}`);
  }
}

// Espera que fn lance e que a mensagem contenha `pedaco`.
function lanca(nome, fn, pedaco) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  t(nome, msg !== null && msg.includes(pedaco), true);
  if (msg === null) console.log('      não lançou');
  else if (!msg.includes(pedaco)) console.log(`      mensagem: ${msg}`);
}

async function lancaAsync(nome, fn, pedaco) {
  let msg = null;
  try { await fn(); } catch (e) { msg = e.message; }
  t(nome, msg !== null && msg.includes(pedaco), true);
  if (msg === null) console.log('      não lançou');
  else if (!msg.includes(pedaco)) console.log(`      mensagem: ${msg}`);
}

// ─── Parser ─────────────────────────────────────────────────────────
t('h2/h3/p na ordem, espaços colapsados',
  extrairBlocos('<h2>Título</h2>\n  <h3>Cláusula 1</h3>\n<p>Texto   com\n quebra</p>'),
  [{ tipo: 'h2', texto: 'Título' }, { tipo: 'h3', texto: 'Cláusula 1' }, { tipo: 'p', texto: 'Texto com quebra' }]);
t('entidades do escapar_html voltam ao caractere',
  extrairBlocos('<p>D&#39;Ávila &amp; Filhos &lt;x&gt; &quot;y&quot;</p>')[0].texto,
  `D'Ávila & Filhos <x> "y"`);
t('entidade numérica decimal e hex',
  extrairBlocos('<p>&#233;&#xE7;</p>')[0].texto, 'éç');
t('tag com atributo e caixa alta',
  extrairBlocos('<P class="a">x</P><H3 style="b">y</H3>'),
  [{ tipo: 'p', texto: 'x' }, { tipo: 'h3', texto: 'y' }]);
t('parágrafo vazio é pulado',
  extrairBlocos('<p> </p><p>a</p>'), [{ tipo: 'p', texto: 'a' }]);

lanca('GUARDA: texto solto entre blocos', () => extrairBlocos('<p>a</p> cláusula perdida <p>b</p>'), 'cláusula perdida');
lanca('GUARDA: texto antes do primeiro bloco', () => extrairBlocos('Preâmbulo<p>a</p>'), 'Preâmbulo');
lanca('GUARDA: lista <ul><li>', () => extrairBlocos('<p>a</p><ul><li>item</li></ul>'), 'fora de h2/h3/p');
lanca('GUARDA: <strong> dentro de parágrafo', () => extrairBlocos('<p>a <strong>b</strong></p>'), 'marcação dentro de <p>');
lanca('GUARDA: <br> dentro de parágrafo', () => extrairBlocos('<p>a<br>b</p>'), 'marcação dentro de <p>');
lanca('GUARDA: parágrafo sem fechamento', () => extrairBlocos('<p>a</p><p>b'), 'fora de h2/h3/p');
lanca('GUARDA: entidade nomeada desconhecida', () => extrairBlocos('<p>&eacute;</p>'), '&eacute;');
lanca('GUARDA: nulo', () => extrairBlocos(null), 'sem texto');
lanca('GUARDA: só parágrafos vazios', () => extrairBlocos('<p></p>'), 'sem texto');

// ─── Template real 1.2 ───────────────────────────────────────────────
const mig = readFileSync(new URL('../../supabase/migrations/2026-09-18_contrato_essentia_v12.sql', import.meta.url), 'utf8');
const corpo = mig.split('$html$')[1];
const escapar = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const NOME = "Maria D'Ávila & Filhos";
const SNAPSHOT = corpo
  .replaceAll('{{NOME}}', escapar(NOME))
  .replaceAll('{{IDENTIFICACAO}}', escapar('portador do CPF nº 123.456.789-09'))
  .replaceAll('{{VALOR}}', escapar('2.700,00'))
  .replaceAll('{{DATA_EXTENSO}}', escapar('22 de setembro de 2026'));

t('template 1.2: nenhum marcador sobrando na fixture', /\{\{/.test(SNAPSHOT), false);
const blocos = extrairBlocos(SNAPSHOT);
const conta = tipo => blocos.filter(b => b.tipo === tipo).length;
// Tags de ABERTURA contadas na migration: 1 <h2>, 8 <h3>, 22 <p>.
t('template 1.2: 1 h2, 8 h3, 22 p (a contagem da migration)', [conta('h2'), conta('h3'), conta('p')], [1, 8, 22]);
// Prova de que nada se perdeu: o texto dos blocos, juntado, é o HTML sem as
// tags, decodificado e com espaços colapsados — letra por letra.
const semTags = SNAPSHOT.replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();
t('template 1.2: texto dos blocos == HTML sem tags (nada perdido)',
  blocos.map(b => b.texto).join(' '), semTags);
t('template 1.2: nome decodificado aparece no corpo',
  blocos.some(b => b.texto.includes(NOME)), true);

// ─── Hash ────────────────────────────────────────────────────────────
t('SHA-256 de "abc" (vetor FIPS 180-2)', await hashTexto('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
t('SHA-256 de "" (vetor)', await hashTexto(''),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const hashSnap = await hashTexto(SNAPSHOT);
t('hash do snapshot == node:crypto sobre os bytes UTF-8',
  hashSnap, createHash('sha256').update(SNAPSHOT, 'utf8').digest('hex'));
t('um caractere a mais muda o hash', (await hashTexto(SNAPSHOT + ' ')) === hashSnap, false);
t('CRLF e LF dão hashes diferentes (hash é do texto EXATO)',
  (await hashTexto('<p>a</p>\r\n')) === (await hashTexto('<p>a</p>\n')), false);

// ─── Data do aceite no fuso da clínica ───────────────────────────────
t('17:05Z vira 14:05 em Belém', formatarAceite('2026-09-22T17:05:00Z'), { data: '22/09/2026', hora: '14:05' });
t('02:30Z vira dia anterior em Belém', formatarAceite('2026-09-23T02:30:00+00:00'), { data: '22/09/2026', hora: '23:30' });
t('meia-noite sai 00, não 24', formatarAceite('2026-09-23T03:00:00Z'), { data: '23/09/2026', hora: '00:00' });
lanca('data inválida lança', () => formatarAceite('ontem'), 'inválida');

// ─── PDF ─────────────────────────────────────────────────────────────
await lancaAsync('PDF: sem texto_html recusa',
  () => gerarPdfContrato({ textoHtml: null, aceitoEm: '2026-09-22T17:05:00Z' }), 'não aceito');
await lancaAsync('PDF: sem aceito_em recusa',
  () => gerarPdfContrato({ textoHtml: SNAPSHOT, aceitoEm: null }), 'não aceito');
await lancaAsync('PDF: texto que não passa na guarda recusa antes de desenhar',
  () => gerarPdfContrato({ textoHtml: '<p>a</p>solto', aceitoEm: '2026-09-22T17:05:00Z' }), 'solto');

const CONTRATO_ID = '3f2a9c1e-0000-4000-8000-000000000001';
const r = await gerarPdfContrato({
  textoHtml: SNAPSHOT, aceitoEm: '2026-09-22T17:05:00Z',
  pacienteNome: NOME, contratoId: CONTRATO_ID, dataEmissao: '27/09/2026',
});
const bytes = Buffer.from(await r.blob.arrayBuffer());
// windows-1252 e não latin1: o stream é WinAnsi, e o travessão "–" sai como o
// byte 0x96, que em latin1 é um caractere de controle.
const pdf = new TextDecoder('windows-1252').decode(bytes);

t('PDF: começa com %PDF-', pdf.slice(0, 5), '%PDF-');
t('PDF: hash devolvido == hash do snapshot', r.hash, hashSnap);
t('PDF: nome do arquivo sem acento', r.nomeArquivo, 'contrato-essentia-maria-d-avila-filhos.pdf');
const paginas = (pdf.match(/\/Type \/Page[^s]/g) || []).length;
t('PDF: mais de uma página', paginas > 1, true);
console.log(`      (${paginas} páginas, ${bytes.length} bytes)`);

// Texto desenhado: toda string literal do stream, desescapada e juntada.
const desenhado = [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
  .map(m => m[1].replace(/\\([()\\])/g, '$1'))
  .join(' ').replace(/\s+/g, ' ');
t('PDF: há texto extraível do stream', desenhado.length > 1000, true);
t('PDF: hash impresso no bloco de aceite', desenhado.includes(hashSnap), true);
t('PDF: registro do contrato impresso', desenhado.includes(CONTRATO_ID), true);
t('PDF: data e hora do aceite impressas', desenhado.includes('em 22/09/2026 às 14:05 (horário de Belém)'), true);
t('PDF: título do bloco de aceite', desenhado.includes('ACEITE ELETRÔNICO'), true);
const faltando = blocos.filter(b => !desenhado.includes(b.texto));
t(`PDF: TODOS os ${blocos.length} blocos desenhados por inteiro`, faltando.length, 0);
faltando.slice(0, 3).forEach(b => console.log(`      falta: ${b.tipo} "${b.texto.slice(0, 70)}"`));

console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exit(falhou ? 1 : 0);
