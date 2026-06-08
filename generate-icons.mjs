import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(__dir, 'public/icon-source.svg'));

const icons = [
  { out: 'public/favicon.png',          size: 32  },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/icon-192.png',         size: 192 },
  { out: 'public/icon-512.png',         size: 512 },
];

for (const { out, size } of icons) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(__dir, out));
  console.log(`✓ ${out} (${size}x${size})`);
}
console.log('Pronto!');
