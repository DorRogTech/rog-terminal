// Generate SVG-based PNG icons for PWA
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(__dirname, '..', 'frontend', 'public', 'icons');

fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const fontSize = Math.round(size * 0.42);
  const subFontSize = Math.round(size * 0.15);
  const subY = Math.round(size * 0.82);
  const mainY = Math.round(size * 0.52);
  const r = Math.round(size * 0.18);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#0a0e17"/>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)" opacity="0.3"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <text x="50%" y="${mainY}" text-anchor="middle" dominant-baseline="middle"
        font-family="Courier New, monospace" font-weight="bold" font-size="${fontSize}" fill="#3b82f6">&gt;_</text>
  <text x="50%" y="${subY}" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, sans-serif" font-weight="bold" font-size="${subFontSize}" fill="#e2e8f0">ROG</text>
</svg>`;

  fs.writeFileSync(path.join(outDir, `icon-${size}.svg`), svg);
  console.log(`Generated icon-${size}.svg`);
}

// Also create favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0a0e17"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Courier New, monospace" font-weight="bold" font-size="14" fill="#3b82f6">&gt;_</text>
</svg>`;
fs.writeFileSync(path.join(outDir, '..', 'favicon.svg'), faviconSvg);
console.log('Generated favicon.svg');

console.log('\nDone! Note: For production PNG icons, convert SVGs using a tool like sharp or an online converter.');
console.log('SVG icons work directly in modern browsers and PWA manifests.');
