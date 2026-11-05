/**
 * Apoio para "baixar todos os PDFs" (nada de rede aqui, só regras puras).
 */

// Pausa entre downloads seguidos: sem ela, alguns navegadores descartam todos
// menos o primeiro.
export const PAUSA_ENTRE_DOWNLOADS_MS = 600;

export const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function semAcentoSlug(txt) {
  return String(txt ?? '')
    .normalize('NFD')
    .split('')
    .filter(c => c.charCodeAt(0) < 128)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extensão do arquivo guardado no storage ('pdf' quando não houver). */
export function extensaoDoArquivo(storagePath) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(storagePath ?? '').split('?')[0]);
  return m ? m[1].toLowerCase() : 'pdf';
}

/** Nome do arquivo baixado: título do e-book + extensão original. */
export function nomeArquivoEbook(titulo, storagePath) {
  const slug = semAcentoSlug(titulo) || 'material';
  return `${slug}.${extensaoDoArquivo(storagePath)}`;
}

/** Evita dois arquivos com o mesmo nome na sequência (a-1, a-2…). */
export function nomesUnicos(nomes) {
  const vistos = new Map();
  return nomes.map(n => {
    const k = vistos.get(n) ?? 0;
    vistos.set(n, k + 1);
    if (k === 0) return n;
    const i = n.lastIndexOf('.');
    return i < 0 ? `${n}-${k + 1}` : `${n.slice(0, i)}-${k + 1}${n.slice(i)}`;
  });
}
