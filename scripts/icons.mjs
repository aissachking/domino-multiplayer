// يولّد أيقونات التطبيق من الشعار (يتطلب حزمة sharp: npm i -D sharp)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const mark = (pad, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
${bg ? `<rect width="64" height="64" fill="${bg}"/>` : '<rect width="64" height="64" rx="14" fill="#0B1210"/>'}
<g transform="translate(${pad} ${pad}) scale(${(64 - pad * 2) / 64})">
<clipPath id="s"><path d="M32 4 54 13.5 52 40C48 51 41 57 32 60 23 57 16 51 12 40L10 13.5Z"/></clipPath>
<g clip-path="url(#s)"><rect x="32" width="32" height="64" fill="#D7263D"/><rect width="32" height="64" fill="#1B7FE0"/></g>
<path d="M32 4 54 13.5 52 40C48 51 41 57 32 60 23 57 16 51 12 40L10 13.5Z" fill="none" stroke="#F2B84B" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M17 26h30" stroke="#F2B84B" stroke-width="3.4" stroke-linecap="round"/>
<path d="M32 26 38.5 44h-13Z" fill="#F2B84B"/>
<circle cx="32" cy="26" r="3.2" fill="#0B1210" stroke="#F2B84B" stroke-width="2"/>
</g></svg>`;

mkdirSync('public/icons', { recursive: true });
const out = [
  ['icon-192.png', 192, mark(6)],
  ['icon-512.png', 512, mark(6)],
  ['apple-touch-icon.png', 180, mark(8, '#0B1210')],
  ['icon-maskable-512.png', 512, mark(14, '#0B1210')],
];
for (const [name, size, svg] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log('✓', name);
}
