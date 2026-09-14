/**
 * Normalização do campo de substitutos para exibição.
 *
 * Planos antigos guardam esse campo de três jeitos — texto único, array de
 * strings, ou array de objetos com `.nome` — e as duas funções abaixo toleram os
 * três. Um plano de 2024 não pode quebrar o documento.
 *
 * Estavam DUPLICADAS entre o PlanoImpressao (`src/app/paciente/Plano.jsx`) e o
 * `src/lib/pdfPlano.js`, cópias idênticas, o que já constava nos dois arquivos
 * como dívida anotada. Os dois documentos precisam concordar no desenho, e
 * manter duas cópias era a forma mais fácil de deixarem de concordar.
 *
 * Aqui NÃO há saneamento de símbolo, de propósito: cada renderizador sanea para
 * o seu meio. O PDF pelo `sanear()` do `pdfBase.js`, que precisa cobrir o
 * documento inteiro porque o jsPDF quebra a string toda num caractere fora do
 * WinAnsi; o HTML pelo `til()` do `Plano.jsx`, que só troca "≈" por "~" e existe
 * porque HTML não tem esse problema de codificação. Trazer um dos dois para cá
 * faria este módulo carregar uma regra que é do meio, não do dado.
 *
 * O `dividirSubs()` também mora aqui, mas é OUTRO serviço: ele quebra uma string
 * em itens respeitando parênteses, enquanto as duas funções de baixo normalizam
 * as formas de armazenamento. Estão no mesmo módulo por serem o mesmo domínio,
 * não por fazerem a mesma coisa.
 *
 * O `listaSubs()` divide com o `dividirSubs()` — a MESMA divisão que o editor
 * usa para gravar. Antes era um `split(',')` solto, que partia a opção no
 * decimal da medida caseira: "(~ 35 g · 1,5 colher de sopa)" virava duas opções
 * sem sentido. Só alcança `al.subs` gravado como STRING; quando é array, não há
 * divisão nenhuma a fazer.
 *
 * Um caso muda de mão nessa troca, e é deliberado: duas opções que carreguem
 * cada uma metade de um par de parênteses ("Arroz (integral" e "branco)") agora
 * são juntadas numa só. O decimal aparece em todo plano com equivalência; o
 * outro exige digitar o parêntese aberto numa opção e o fechado em outra.
 */

// Divide a lista de substitutos por vírgula, ignorando as vírgulas que estão
// dentro de parênteses: a equivalência que o app grava pode trazer decimal
// ("~ 35 g · 1,5 colher de sopa"), e quebrar ali partiria a opção ao meio.
//
// Existe UMA versão disto. O buildDados grava a partir dela e o parseSubs lê a
// partir dela, então escrita e leitura não podem divergir.
export function dividirSubs(texto) {
  const items = [];
  let depth = 0, cur = '';
  for (const ch of String(texto ?? '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { if (cur.trim()) items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

// As opções de substituição vêm como texto único ("A — 1 un, B — 2 col"), mas
// planos antigos podem trazer array de strings ou de objetos. Junta tudo numa
// linha só, para a seção global.
export function textoSubs(subs) {
  if (Array.isArray(subs)) {
    return subs
      .map(s => (s && typeof s === 'object' ? (s.nome ?? '') : String(s ?? '')))
      .filter(Boolean)
      .join(', ');
  }
  return String(subs ?? '');
}

// Opções de substituição DE UM ALIMENTO, como lista. Irmão do textoSubs(): mesma
// tolerância de formato, saída em itens em vez de linha corrida.
export function listaSubs(subs) {
  if (Array.isArray(subs)) {
    return subs
      .map(s => (s && typeof s === 'object' ? (s.nome ?? '') : String(s ?? '')))
      .filter(Boolean);
  }
  return dividirSubs(subs);
}
