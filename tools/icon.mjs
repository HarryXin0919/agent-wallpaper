// The icon: a lit bulb with rays around it, some lit and some dim: an idea taking shape while you watch its progress.
// Writes build/icon.svg, build/icon.png (1024) and the tray images in assets/. Small sizes get a simpler drawing
// (fewer, thicker rays; one base bar) on a tile that fills the whole image.
// usage: node tools/icon.mjs   (needs playwright-core: npm i -D playwright-core, or PW_FROM=<a package.json that has it>; CHROME=path)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const f1 = (x) => +x.toFixed(1);
const P = (cx, cy, r, a) => [f1(cx + r * Math.cos((a * Math.PI) / 180)), f1(cy - r * Math.sin((a * Math.PI) / 180))];
const TILE = ['#182040', '#0d1124'], LIGHT = ['#fff0dc', '#ffc396'], DIM = '#3d3c52', BASE = '#e2a67f';

// the glass: a round globe that leaves its circle along the tangent and flows into a short, wide neck
function glass(cx, cy, r) {
  const theta = 46, nw = 0.56, len = 1.16, t1 = 0.3, t2 = 0.24;
  const th = (theta * Math.PI) / 180, s = Math.sin(th), c = Math.cos(th);
  const rx = cx + r * c, ry = cy + r * s, lx = cx - r * c, ny = cy + len * r, n = nw * r;
  const c1 = [rx - t1 * r * s, ry + t1 * r * c], c2y = ny - t2 * r;
  return { n, ny, d: `M${f1(cx - n)} ${f1(ny)} C${f1(cx - n)} ${f1(c2y)} ${f1(2 * cx - c1[0])} ${f1(c1[1])} ${f1(lx)} ${f1(ry)} A${r} ${r} 0 1 1 ${f1(rx)} ${f1(ry)} C${f1(c1[0])} ${f1(c1[1])} ${f1(cx + n)} ${f1(c2y)} ${f1(cx + n)} ${f1(ny)} Z` };
}
// n rays from angle `from` round to its mirror image, the first k lit; gap/len/w: distance from the glass, length, width
const FULL = { n: 15, k: 10, from: 213, gap: 34, len: 36, w: 12, r: 72 };
const SMALL = { n: 7, k: 5, from: 206, gap: 36, len: 40, w: 26, r: 78 };

// small: the simpler drawing; bleed: the tile fills the image (tray), else it keeps a margin (app icon)
// even: the lit rays are the middle ones (the light spreads from the top to both sides) instead of the first ones
export function icon({ small = false, bleed = false, even = false } = {}) {
  const C = 256, A = small ? SMALL : FULL, bar = small ? 26 : 17, gap = small ? 0 : 6;
  // the whole mark is centred in the tile: from the tip of the top ray to the bottom of the base
  const up = A.r + A.gap + A.len + A.w / 2;
  const down = glass(C, 0, A.r).ny + (small ? bar / 2 + 5 + bar / 2 : bar / 2 + gap + (bar + gap) * 2 - 3 + bar * 0.375);
  const cy = 256 - (down - up) / 2, g = glass(C, cy, A.r), half = g.n - bar / 2 + 1, top = g.ny + bar / 2 + (small ? 5 : gap);
  const line = (y, h, w, col) => `<line x1="${f1(C - h)}" y1="${f1(y)}" x2="${f1(C + h)}" y2="${f1(y)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const base = small ? line(top, half, bar, BASE) : line(top, half, bar, BASE) + line(top + bar + gap, half, bar, BASE) + line(top + (bar + gap) * 2 - 3, half * 0.4, bar * 0.75, BASE);
  const step = (A.from * 2 - 180) / (A.n - 1);
  let rays = '';
  const lo = Math.floor((A.n - A.k) / 2), on = (i) => (even ? i >= lo && i < lo + A.k : i < A.k);
  for (let i = 0; i < A.n; i++) {
    const a = A.from - i * step, [x1, y1] = P(C, cy, A.r + A.gap, a), [x2, y2] = P(C, cy, A.r + A.gap + A.len, a);
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on(i) ? LIGHT[0] : DIM}" stroke-width="${A.w}" stroke-linecap="round"/>`;
  }
  const tile = bleed ? '<rect width="512" height="512" rx="118" fill="url(#t)"/>' : '<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#t)"/><rect x="17" y="17" width="478" height="478" rx="111" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="2"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TILE[0]}"/><stop offset="1" stop-color="${TILE[1]}"/></linearGradient>
<linearGradient id="m" x1="0" y1="${f1(cy - 80)}" x2="0" y2="${f1(cy + 100)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${LIGHT[0]}"/><stop offset="1" stop-color="${LIGHT[1]}"/></linearGradient></defs>
${tile}
${rays}
<path d="${g.d}" fill="url(#m)"/>${base}
</svg>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(root, 'build', 'icon.svg'), icon());
  const { chromium } = createRequire(process.env.PW_FROM || import.meta.url)('playwright-core');
  const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const pg = await b.newPage({ deviceScaleFactor: 1 });
  const png = async (file, size, opts) => {
    await pg.setViewportSize({ width: size, height: size });
    await pg.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${icon(opts).replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
    await pg.screenshot({ path: path.join(root, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(file, size);
  };
  await png('build/icon.png', 1024, {});
  await png('assets/tray-64.png', 64, { bleed: true });
  await png('assets/tray.png', 32, { small: true, bleed: true });
  await png('assets/tray-16.png', 16, { small: true, bleed: true });
  await b.close();
}
