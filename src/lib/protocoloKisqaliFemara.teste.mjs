/**
 * Teste standalone da ficha combinada "Kisqali + Femara" do catálogo.
 * Roda com `node src/lib/protocoloKisqaliFemara.teste.mjs`, sem framework.
 *
 * A combinada COPIA o conteúdo do Kisqali (decisão da Kelly em 06/10/2026:
 * cópia no JSON, revisável como texto, em vez de montar a união no código).
 * O risco da cópia é divergir em silêncio quando o Kisqali for editado. Este
 * teste falha nesse caso: os 12 efeitos e os 8 sinais da combinada têm de ser
 * iguais aos do Kisqali, exceto os dois relacionado_a que a Kelly reescreveu
 * só na combinada. Os 5 efeitos do letrozol têm de ser iguais aos de
 * "Inibidores de aromatase", com relacionado_a "Letrozol (Femara)".
 */
import { readFileSync } from 'node:fs';

const catalogo = JSON.parse(readFileSync(new URL('../data/protocolos_efeitos.json', import.meta.url), 'utf8'));
const P = catalogo.protocolos;

let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  console.log(`${passou ? 'PASS ' : 'FALHA'} ${nome}`);
  if (!passou) console.log(`      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`);
}

const iK = P.findIndex(p => p.nome === 'Kisqali (ribociclibe)');
const K = P[iK];
const C = P.find(p => p.nome === 'Kisqali + Femara (ribociclibe + letrozol)');
const IA = P.find(p => p.nome === 'Inibidores de aromatase (Anastrozol / Letrozol)');

t('as três entradas existem', [!!K, !!C, !!IA], [true, true, true]);
if (!K || !C || !IA) { console.log(`\n${ok} PASS, ${falhou} FALHA`); process.exit(1); }

t('combinada vem logo depois do Kisqali', P[iK + 1]?.nome, C.nome);

// Únicos relacionado_a que podem diferir do Kisqali, e para quê.
const RELAC_COMBINADA = {
  'Alterações de função hepática': 'Ribociclibe (hepatotoxicidade: ALT/AST)',
  'Alterações de eletrólitos': 'Ribociclibe (risco de QT longo)',
};

t('combinada tem 17 efeitos (12 + 5)', C.efeitos.length, 17);
t('Kisqali tem 12 efeitos', K.efeitos.length, 12);

K.efeitos.forEach((ek, i) => {
  const ec = C.efeitos[i] ?? {};
  const esperado = RELAC_COMBINADA[ek.efeito]
    ? { ...ek, relacionado_a: RELAC_COMBINADA[ek.efeito] }
    : ek;
  t(`efeito ${i + 1} igual ao do Kisqali: ${ek.efeito}`, ec, esperado);
});

// O Kisqali sozinho NÃO muda: o texto é da Kelly.
t('Kisqali mantém o relacionado_a original (hepático)',
  K.efeitos.find(e => e.efeito === 'Alterações de função hepática')?.relacionado_a, 'Hepatotoxicidade (ALT/AST)');
t('Kisqali mantém o relacionado_a original (eletrólitos)',
  K.efeitos.find(e => e.efeito === 'Alterações de eletrólitos')?.relacionado_a, 'Risco de prolongamento do QT');

IA.efeitos.forEach((ea, i) => {
  t(`efeito ${13 + i} igual ao de aromatase: ${ea.efeito}`,
    C.efeitos[12 + i], { efeito: ea.efeito, relacionado_a: 'Letrozol (Femara)', manejo: ea.manejo });
});

t('8 sinais de alerta, iguais aos do Kisqali e na mesma ordem', C.sinais_alerta, K.sinais_alerta);
t('conduta_base igual à do Kisqali', C.conduta_base, K.conduta_base);
t('duracaoCiclo igual à do Kisqali', C.duracaoCiclo, K.duracaoCiclo);
t('indicacao igual à do Kisqali', C.indicacao, K.indicacao);

t('aliases do Kisqali: só Kisqali e ribociclibe', K.aliases, ['Kisqali', 'ribociclibe']);
t('aliases de aromatase incluem Femara e Letrozole',
  ['Femara', 'Letrozole'].every(a => IA.aliases.includes(a)), true);

console.log(`\n${ok} PASS, ${falhou} FALHA`);
process.exitCode = falhou ? 1 : 0;
