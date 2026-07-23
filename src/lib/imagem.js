import { supabase } from './supabase.js';

/**
 * Comprime uma imagem no cliente antes do upload: reduz o maior lado para
 * <= maxLado e reencoda em JPEG. Uma foto de celular de ~8MB vira ~200-500KB.
 * Respeita a orientação EXIF. Se algo falhar, devolve o arquivo original
 * (o upload continua funcionando, só sem otimização).
 */
export async function comprimirImagem(file, { maxLado = 1600, quality = 0.8 } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file; // fallback: sobe o original
  }
}

// Cache de signed URLs do bucket chat_anexos (bucket privado). TTL ~1h.
const _cache = new Map();

export async function getAnexoUrl(path) {
  if (!path) return null;
  const now = Date.now();
  const c = _cache.get(path);
  if (c && c.exp > now) return c.url;
  for (const [k, v] of _cache) { if (v.exp <= now) _cache.delete(k); }
  const { data, error } = await supabase.storage.from('chat_anexos').createSignedUrl(path, 3600);
  if (error || !data) return null;
  _cache.set(path, { url: data.signedUrl, exp: now + 3_400_000 });
  return data.signedUrl;
}
