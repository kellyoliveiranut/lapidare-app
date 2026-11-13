/** node src/lib/emailPdfs.teste.mjs — sem framework. */
const { blobParaBase64, cabeNoEmail, textoConfirmacaoEmail, emailPlausivel, LIMITE_BYTES_EMAIL } = await import('./emailPdfs.js');
let ok = 0, falhou = 0;
function t(nome, obtido, esperado) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  passou ? ok++ : falhou++;
  if (!passou) console.log('FALHOU:', nome, '\n  esperado', JSON.stringify(esperado), '\n  obtido  ', JSON.stringify(obtido));
}
t('base64 de %PDF-', await blobParaBase64(new Blob(['%PDF-1.4'])), Buffer.from('%PDF-1.4').toString('base64'));
const grande = new Uint8Array(200000).map((_, i) => i % 256);
t('base64 de blob grande confere', await blobParaBase64(new Blob([grande])), Buffer.from(grande).toString('base64'));
t('cabe: pequeno', cabeNoEmail([{ blob: new Blob(['a']) }]).cabe, true);
t('não cabe: acima do limite', cabeNoEmail([{ blob: { size: LIMITE_BYTES_EMAIL + 1 } }]).cabe, false);
t('soma os PDFs', cabeNoEmail([{ blob: { size: 3 * 1024 * 1024 } }, { blob: { size: 2 * 1024 * 1024 } }]).cabe, false);
t('lista nula', cabeNoEmail(null), { cabe: true, total: 0 });
t('confirmação traz o endereço e os nomes', textoConfirmacaoEmail('a@b.com', ['p.pdf', 'q.pdf']), 'Enviar 2 PDFs para a@b.com?\n\np.pdf\nq.pdf\n\nConfira o endereço antes de enviar.');
t('singular', textoConfirmacaoEmail('a@b.com', ['p.pdf']).startsWith('Enviar 1 PDF para'), true);
t('email plausível', [emailPlausivel('a@b.com'), emailPlausivel('a@b'), emailPlausivel(' '), emailPlausivel(null)], [true, false, false, false]);
console.log(`${ok} ok, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
