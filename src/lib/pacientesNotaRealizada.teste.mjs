/** node src/lib/pacientesNotaRealizada.teste.mjs — sem framework. */
const { pacientesComConsultaRealizada } = await import('./dadosNotaFiscal.js');
let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  if (!passou) console.log('FALHOU:', nome, '\n  esperado', JSON.stringify(esperado), '\n  obtido  ', JSON.stringify(obtido));
}
const ps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
t('só quem tem consulta realizada', pacientesComConsultaRealizada(ps, new Set(['a', 'c'])).map(p => p.id), ['a', 'c']);
t('ninguém realizou: lista vazia', pacientesComConsultaRealizada(ps, new Set()), []);
t('sem informação (erro) não esconde ninguém', pacientesComConsultaRealizada(ps, null).map(p => p.id), ['a', 'b', 'c']);
t('lista nula', pacientesComConsultaRealizada(null, new Set(['a'])), []);
console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
